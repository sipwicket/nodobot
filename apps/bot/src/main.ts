import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { Bot, type MiddlewareFn } from "npm:grammy@1.36.0";
import { redactSecrets } from "@shared/redact.ts";
import { baseLogger } from "./logger.ts";
import type { BotContext } from "./context.ts";
import { isTransientNetworkError } from "./networkRetry.ts";
import { tenantResolver } from "./middleware/tenant.ts";
import { subscriptionGate } from "./middleware/subscription.ts";
import {
  PlaceholderLicenseConnector,
  PlaceholderTenantSettingsConnector,
} from "@integrations/mod.ts";
import { SubscriptionGateUseCase } from "@core/tenancy/subscriptionGate.ts";
import {
  loadActiveTenantsFromEnv,
  loadTenantOverridesFromJson,
} from "./bootstrap/placeholderConfig.ts";
import { InMemoryLinkCache } from "@integrations/cache/inMemoryCaches.ts";
import { createEntityHandler } from "./handlers/entityHandler.ts";
import { createInstagramHandler } from "./handlers/instagramHandler.ts";
import { createThreadsHandler } from "./handlers/threadsHandler.ts";
import { createWebmHandler } from "./handlers/webmHandler.ts";
import { InMemoryImageCache } from "@integrations/cache/inMemoryCaches.ts";
import { createImageHandler } from "./handlers/imageHandler.ts";
import { registerCommands } from "./handlers/commands.ts";
import { directReplyHandler } from "./handlers/replyHandler.ts";

const token = Deno.env.get("TELEGRAM_TOKEN");
if (!token) {
  baseLogger.error("Missing TELEGRAM_TOKEN");
  Deno.exit(1);
}

const bot = new Bot<BotContext>(token, {
  client: {
    // npm:grammy uses node-fetch; Deno's fetch handles TLS/timeouts more reliably.
    fetch: ((input, init) => globalThis.fetch(input, init)) as typeof fetch,
  },
});

bot.catch((err) => {
  const { error, ctx } = err;
  const raw = error ?? err;
  const message = redactSecrets(raw instanceof Error ? raw.message : String(raw));
  const stack = raw instanceof Error && raw.stack ? redactSecrets(raw.stack) : undefined;

  // Never print the raw error object: node-fetch includes the bot token in the URL.
  console.error("Unhandled bot error:", message);
  if (stack) console.error(stack);

  baseLogger.error("Unhandled bot error", {
    name: raw instanceof Error ? raw.name : undefined,
    message,
    stack,
    method: (error as { method?: unknown } | undefined)?.method,
    payload: (error as { payload?: unknown } | undefined)?.payload,
    update_id: ctx.update.update_id,
  });

  // Transient Telegram blips should not announce a crash in chat.
  if (isTransientNetworkError(raw)) return;
  ctx.reply("sipchan died lol").catch(() => {});
});

// Placeholder connectors (to be replaced later).
const tenantOverridesPath = "apps/bot/tenant_overrides.json";
const overridesByTenant = await loadTenantOverridesFromJson(
  tenantOverridesPath,
);
const settingsRepo = new PlaceholderTenantSettingsConnector({
  overridesByTenant,
  persistPath: tenantOverridesPath,
});
const activeTenants = loadActiveTenantsFromEnv();
const licenseRepo = new PlaceholderLicenseConnector({ activeTenants });
if (activeTenants.size > 0) {
  baseLogger.info("Active subscription groups loaded", {
    count: activeTenants.size,
    tenants: Array.from(activeTenants.values()),
  });
} else {
  baseLogger.info(
    "No active subscription groups configured (ACTIVE_TENANTS is empty).",
  );
}
const gate = new SubscriptionGateUseCase(licenseRepo);

const me = await bot.api.getMe();

bot.use(tenantResolver({ settingsRepo }));
bot.use(subscriptionGate({ gate }));
bot.use(directReplyHandler({ botUserId: me.id, botUsername: me.username }));

const linkCache = new InMemoryLinkCache();
const imageCache = new InMemoryImageCache();

function chainMessageHandler(
  name: string,
  handler: (ctx: BotContext) => Promise<void>,
): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    // Tenant is expected for chat message flows; if absent we log and keep chain alive.
    if (!ctx.tenant) {
      baseLogger.warn(`[${name}] missing tenant context; skipping`);
      return await next();
    }
    await handler(ctx);
    await next();
  };
}

bot.on(
  "message:text",
  chainMessageHandler("entityHandler", createEntityHandler({ linkCache })),
);
bot.on(
  "message:text",
  chainMessageHandler("instagramHandler", createInstagramHandler({ linkCache })),
);
bot.on(
  "message:text",
  chainMessageHandler("threadsHandler", createThreadsHandler({ linkCache })),
);
bot.on("message:text", chainMessageHandler("webmHandler", createWebmHandler()));
bot.on(
  "message:photo",
  chainMessageHandler("imageHandler", createImageHandler({ imageCache })),
);

registerCommands(bot, { settingsRepo });

await bot.start({
  onStart: (info) => baseLogger.info(`Bot started as @${info.username}`),
});
