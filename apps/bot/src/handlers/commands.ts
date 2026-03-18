import type { BotContext } from "../context.ts";
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
  availableFlags: (keyof TenantSettingsV1["featureFlags"])[],
): keyof TenantSettingsV1["featureFlags"] | null {
  const normalizedInput = input.toLowerCase();
  return availableFlags.find((flag) =>
    flag.toLowerCase() === normalizedInput
  ) ?? null;
}

export function registerCommands(
  bot: import("npm:grammy@1.36.0").Bot<BotContext>,
  deps: { settingsRepo: TenantSettingsRepositoryPort },
) {
  const helpHandler = async (ctx: BotContext) => {
    const logger = loggerFor(ctx);
    const tenant = ctx.tenant;
    if (!tenant || !tenant.settings.featureFlags.helpCommand) return;
    const cmds = [
      "/settings",
      "/enable <featureFlag>",
      "/disable <featureFlag>",
      `/${tenant.settings.commands.setThresholdCommand}`,
      `/${tenant.settings.commands.setResolutionCommand}`,
      `/${tenant.settings.commands.increaseSensitivityCommand}`,
    ];
    logger.info("[commands] /help invoked", {
      commands: cmds,
    });
    await ctx.reply(cmds.join("; "));
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
    const featureFlags = Object.entries(tenant.settings.featureFlags)
      .map(([name, enabled]) => `${name}: ${enabled ? "on" : "off"}`)
      .join("\n");
    await ctx.reply(`Current feature flags:\n${featureFlags}`);
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
    ) as (keyof TenantSettingsV1["featureFlags"])[];
    const featureFlag = resolveFeatureFlagName(flagArg, availableFlags);
    if (!featureFlag) {
      await ctx.reply(
        `Unknown feature flag "${flagArg}". Available: ${
          availableFlags.join(", ")
        }`,
      );
      return;
    }

    const currentOverrides =
      await deps.settingsRepo.getTenantSettings(tenant.tenantId) ?? {};
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
