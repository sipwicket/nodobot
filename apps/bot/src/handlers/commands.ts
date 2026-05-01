import type { BotContext } from "../context.ts";
import { InlineKeyboard } from 'npm:grammy@1.36.0';
import { loggerFor } from "../logger.ts";
import type { TenantSettingsRepositoryPort } from "@core/contracts/tenantSettingsRepository.ts";
import {
  defaultTenantSettingsV1,
  mergeTenantSettingsV1,
  validateTenantSettingsV1,
} from "@core/tenancy/tenantSettings.ts";
import type { TenantSettingsV1 } from "@core/tenancy/tenantSettings.ts";

type MutableTenantOverrides =
  & Omit<Partial<TenantSettingsV1>, "featureFlags">
  & {
    featureFlags?: Partial<TenantSettingsV1["featureFlags"]>;
  };
type FeatureFlagName = Extract<keyof TenantSettingsV1['featureFlags'], string>;

const FEATURE_FLAG_DESCRIPTIONS: Record<FeatureFlagName, string> = {
  duplicateLinks:
    "Warns when someone posts a link that was already shared in this chat.",
  duplicateImages:
    "Detects visually similar images and replies with your duplicate-image template.",
  twitterFix:
    "Rewrites X/Twitter links (e.g. to a fixer host) so embeds and media work better.",
  tiktokFix:
    "Rewrites TikTok links (e.g. to a fixer host) so they open or play more reliably.",
  instagramDownload:
    "Turns on Instagram link processing (download and repost media per your Instagram config).",
  instagramFallbackFix:
    "Rewrites Instagram links to your fallback fixer when native download is not used first (IG download off or not preferred).",
  threadsDownload:
    "Turns on Threads link processing (download and repost media for public Threads posts).",
  webmConversion:
    "Converts incoming WebM videos to a format that plays smoothly in Telegram.",
  directReply:
    "Replies automatically to messages using the configured random or fallback replies.",
  randomImage:
    "Turns on /randomimage, which fetches a random image from your configured endpoints.",
  helpCommand: "Allows this /help text (and your tenant help alias) to work.",
};

function parseCommandArgs(ctx: BotContext): string[] {
  const text = ctx.message?.text?.trim();
  if (!text) return [];
  const parts = text.split(/\s+/);
  return parts.slice(1);
}

async function canManageSettings(ctx: BotContext): Promise<boolean> {
  if (!ctx.chat || !ctx.from) return false;
  if (ctx.chat.type === "private") return true;
  try {
    const member = await ctx.api.getChatMember(ctx.chat.id, ctx.from.id);
    return member.status === "administrator" || member.status === "creator";
  } catch {
    return false;
  }
}

function resolveFeatureFlagName(
  input: string,
  availableFlags: FeatureFlagName[],
): FeatureFlagName | null {
  const normalizedInput = input.toLowerCase();
  return (
    availableFlags.find(flag => flag.toLowerCase() === normalizedInput) ?? null
  );
}

function topLevelOverrideKeys(overrides: Partial<TenantSettingsV1>): string[] {
  return Object.keys(overrides).filter(key => key !== 'schemaVersion');
}

function formatChatLabel(ctx: BotContext): string {
  if (!ctx.chat) return '(unknown chat)';
  if ('title' in ctx.chat && ctx.chat.title) return ctx.chat.title;
  if ('username' in ctx.chat && ctx.chat.username) {
    return `@${ctx.chat.username}`;
  }
  return '(no title)';
}

function formatFlagName(flag: FeatureFlagName): string {
  return flag.replace(/([A-Z])/g, ' $1').replace(/^./, ch => ch.toUpperCase());
}

async function setFeatureFlag(
  ctx: BotContext,
  deps: { settingsRepo: TenantSettingsRepositoryPort },
  featureFlag: FeatureFlagName,
  enabled: boolean,
): Promise<void> {
  const tenant = ctx.tenant;
  if (!tenant) return;

  const currentOverrides =
    (await deps.settingsRepo.getTenantSettings(tenant.tenantId)) ?? {};
  const nextOverrides = structuredClone(
    currentOverrides,
  ) as MutableTenantOverrides;
  nextOverrides.featureFlags = {
    ...(nextOverrides.featureFlags ?? {}),
    [featureFlag]: enabled,
  };

  const validated = validateTenantSettingsV1(
    mergeTenantSettingsV1(
      defaultTenantSettingsV1(),
      nextOverrides as Partial<TenantSettingsV1>,
    ),
  );
  await deps.settingsRepo.setTenantSettings(
    tenant.tenantId,
    nextOverrides as Partial<TenantSettingsV1>,
  );
  tenant.settings = validated;
}

async function buildSettingsView(
  ctx: BotContext,
  deps: { settingsRepo: TenantSettingsRepositoryPort },
): Promise<{ text: string; replyMarkup?: InlineKeyboard }> {
  const tenant = ctx.tenant;
  if (!tenant) return { text: 'Tenant context not available.' };

  const overrides =
    (await deps.settingsRepo.getTenantSettings(tenant.tenantId)) ?? {};
  const canManage = await canManageSettings(ctx);
  const overrideKeys = topLevelOverrideKeys(overrides);
  const availableFlags = Object.keys(
    tenant.settings.featureFlags,
  ) as FeatureFlagName[];

  const flagLines = availableFlags
    .map(flag => {
      const enabled = tenant.settings.featureFlags[flag];
      return `• ${formatFlagName(flag)} (${enabled ? 'Enabled' : 'Disabled'})`;
    })
    .join('\n');

  const overrideSummary =
    overrideKeys.length > 0 ? overrideKeys.join(', ') : '(none)';

  const text = [
    '⚙️ Settings Panel',
    '',
    'Tenant',
    `• ID: ${tenant.tenantId}`,
    `• Chat: ${formatChatLabel(ctx)} (${ctx.chat?.type ?? 'unknown'})`,
    '',
    'Access',
    `• You can manage: ${canManage ? 'Yes' : 'No'}`,
    '',
    'Overrides',
    `• Sections: ${overrideSummary}`,
    '',
    'Feature Flags',
    flagLines || '• (none)',
    '',
    canManage
      ? 'Use the buttons below to toggle a flag.'
      : 'Read-only mode: only admins can toggle flags.',
  ].join('\n');

  if (!canManage) return { text };

  const keyboard = new InlineKeyboard();
  for (const [index, flag] of availableFlags.entries()) {
    const enabled = tenant.settings.featureFlags[flag];
    keyboard.text(
      `${enabled ? '🟢' : '🔴'} ${formatFlagName(flag)}`,
      `settings:toggle:${flag}`,
    );
    if (index % 2 === 1 || index === availableFlags.length - 1) {
      keyboard.row();
    }
  }

  return { text, replyMarkup: keyboard };
}

export function registerCommands(
  bot: import("npm:grammy@1.36.0").Bot<BotContext>,
  deps: { settingsRepo: TenantSettingsRepositoryPort },
) {
  const helpHandler = async (ctx: BotContext) => {
    const logger = loggerFor(ctx);
    const tenant = ctx.tenant;
    if (!tenant || !tenant.settings.featureFlags.helpCommand) return;
    const setTh = tenant.settings.commands.setThresholdCommand;
    const setRes = tenant.settings.commands.setResolutionCommand;
    const sens = tenant.settings.commands.increaseSensitivityCommand;
    const flagNames = Object.keys(
      tenant.settings.featureFlags,
    ) as FeatureFlagName[];
    flagNames.sort((a, b) => a.localeCompare(b));
    const flagLines = flagNames.map((flag) =>
      `• <b>${formatFlagName(flag)}</b>\n  ${FEATURE_FLAG_DESCRIPTIONS[flag]}`
    );

    const lines = [
      "<b>Commands</b>",
      "",
      "<b>/settings</b>",
      "Shows this chat’s tenant id, whether you can change settings, which config sections have overrides, and the on/off state of each feature. Chat admins get inline buttons to toggle flags.",
      "",
      "<b>/enable</b> &amp; <b>/disable</b> <code>&lt;featureFlag&gt;</code>",
      "Same toggles as the settings buttons; flag names match the labels (e.g. <code>duplicateLinks</code>). Admins only.",
      "",
      `<b>/${setTh}</b>, <b>/${setRes}</b>, <b>/${sens}</b>`,
      "Tenant-specific media or sensitivity commands (see your operator docs for exact behavior).",
      "",
      "<b>Feature flags</b> (from /settings)",
      "",
      ...flagLines,
    ];
    logger.info("[commands] /help invoked", {
      commands: lines,
    });
    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  };

  // Register default help plus tenant-configurable alias (runtime-safe even if different per tenant).
  bot.command("help", helpHandler);
  bot.on("message:text", async (ctx, next) => {
    const logger = loggerFor(ctx);
    const tenant = ctx.tenant;
    const text = ctx.message.text.trim();
    if (!tenant) return await next();
    const match = text.match(/^\/(\w+)(@\w+)?$/);
    const cmd = match?.[1];
    if (!cmd) return await next();
    if (cmd !== tenant.settings.commands.helpCommand) return await next();
    logger.info("[commands] tenant alias help command invoked", {
      cmd,
    });
    await helpHandler(ctx);
  });

  bot.command("settings", async (ctx) => {
    const tenant = ctx.tenant;
    if (!tenant) return;
    const view = await buildSettingsView(ctx, deps);
    await ctx.reply(view.text, {
      reply_markup: view.replyMarkup,
    });
  });

  const updateFeatureFlag = async (ctx: BotContext, enabled: boolean) => {
    const logger = loggerFor(ctx);
    const tenant = ctx.tenant;
    if (!tenant) return;

    if (!await canManageSettings(ctx)) {
      await ctx.reply("Only chat admins can change tenant settings.");
      return;
    }

    const [flagArg] = parseCommandArgs(ctx);
    if (!flagArg) {
      await ctx.reply("Usage: /enable <featureFlag> or /disable <featureFlag>");
      return;
    }

    const availableFlags = Object.keys(
      tenant.settings.featureFlags,
    ) as FeatureFlagName[];
    const featureFlag = resolveFeatureFlagName(flagArg, availableFlags);
    if (!featureFlag) {
      await ctx.reply(
        `Unknown feature flag "${flagArg}". Available: ${
          availableFlags.join(", ")
        }`,
      );
      return;
    }

    await setFeatureFlag(ctx, deps, featureFlag, enabled);

    logger.info("[commands] tenant feature flag updated", {
      tenantId: tenant.tenantId,
      actorId: ctx.from?.id,
      featureFlag,
      enabled,
    });
    await ctx.reply(
      `Feature flag "${featureFlag}" is now ${
        enabled ? "enabled" : "disabled"
      }.`,
    );
  };

  bot.callbackQuery(/^settings:toggle:([a-zA-Z0-9_]+)$/, async ctx => {
    const tenant = ctx.tenant;
    const logger = loggerFor(ctx);
    if (!tenant) {
      await ctx.answerCallbackQuery({
        text: 'Tenant context missing.',
        show_alert: true,
      });
      return;
    }

    if (!(await canManageSettings(ctx))) {
      await ctx.answerCallbackQuery({
        text: 'Only chat admins can change tenant settings.',
        show_alert: true,
      });
      return;
    }

    const availableFlags = Object.keys(
      tenant.settings.featureFlags,
    ) as FeatureFlagName[];
    const featureFlag = resolveFeatureFlagName(ctx.match[1], availableFlags);
    if (!featureFlag) {
      await ctx.answerCallbackQuery({
        text: 'Unknown feature flag.',
        show_alert: true,
      });
      return;
    }

    const currentEnabled = tenant.settings.featureFlags[featureFlag];
    const nextEnabled = !currentEnabled;
    await setFeatureFlag(ctx, deps, featureFlag, nextEnabled);
    logger.info('[commands] tenant feature flag toggled via button', {
      tenantId: tenant.tenantId,
      actorId: ctx.from?.id,
      featureFlag,
      enabled: nextEnabled,
    });

    const view = await buildSettingsView(ctx, deps);
    await ctx.editMessageText(view.text, {
      reply_markup: view.replyMarkup,
    });
    await ctx.answerCallbackQuery({
      text: `${formatFlagName(featureFlag)} ${
        nextEnabled ? 'enabled' : 'disabled'
      }`,
    });
  });

  bot.command("enable", async (ctx) => {
    await updateFeatureFlag(ctx, true);
  });

  bot.command("disable", async (ctx) => {
    await updateFeatureFlag(ctx, false);
  });

  bot.command("randomimage", async (ctx) => {
    const logger = loggerFor(ctx);
    const tenant = ctx.tenant;
    if (!tenant || !tenant.settings.featureFlags.randomImage) return;
    const endpoints = tenant.settings.randomImage.endpoints;
    if (!endpoints || endpoints.length === 0) {
      await ctx.reply("No random image endpoints configured.");
      return;
    }
    const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
    logger.info("[commands] /randomimage invoked", {
      endpointCount: endpoints.length,
      chosenEndpoint: endpoint,
    });
    await ctx.reply(tenant.settings.randomImage.sendingMessage);
    try {
      const res = await fetch(endpoint);
      const json = await res.json();
      const url = json?.url;
      if (typeof url !== "string") {
        throw new Error("endpoint did not return { url }");
      }
      logger.debug("[commands] random image fetched", {
        endpoint,
        url,
      });
      await ctx.reply(url);
    } catch (e) {
      const errMsg = e instanceof Error ? e.message : String(e);
      logger.error("[commands] random image fetch failed", {
        endpoint,
        error: errMsg,
      });
      await ctx.reply(`Failed to fetch random image: ${errMsg}`);
    }
  });
}
