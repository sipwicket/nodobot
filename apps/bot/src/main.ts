import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { Bot, type MiddlewareFn } from "npm:grammy@1.36.0";
import { baseLogger } from "./logger.ts";
import type { BotContext } from "./context.ts";
import { tenantResolver } from "./middleware/tenant.ts";
import { subscriptionGate } from "./middleware/subscription.ts";
import { PlaceholderLicenseConnector, PlaceholderTenantSettingsConnector } from "@integrations/mod.ts";
import { SubscriptionGateUseCase } from "@core/tenancy/subscriptionGate.ts";
import { loadActiveTenantsFromEnv, loadTenantOverridesFromJson } from "./bootstrap/placeholderConfig.ts";
import { InMemoryLinkCache } from "@integrations/cache/inMemoryCaches.ts";
import { createEntityHandler } from "./handlers/entityHandler.ts";
import { createInstagramHandler } from "./handlers/instagramHandler.ts";
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

const bot = new Bot<BotContext>(token);

bot.catch((err) => {
  const { error, ctx } = err;

  // Log full error details to stderr for debugging.
  console.error("Unhandled bot error:", error ?? err);

  baseLogger.error("Unhandled bot error", {
    name: error?.name,
    message: error?.message,
    stack: error?.stack,
    // These are grammY-specific and may be undefined for other errors.
    method: (error as any)?.method,
    payload: (error as any)?.payload,
    update_id: ctx.update.update_id,
  });

  // Best-effort user-visible error; never throw from catch.
  ctx.reply("sipchan died lol").catch(() => {});
});

// Placeholder connectors (to be replaced later).
const overridesByTenant = await loadTenantOverridesFromJson("apps/bot/tenant_overrides.json");
const settingsRepo = new PlaceholderTenantSettingsConnector({ overridesByTenant });
const activeTenants = loadActiveTenantsFromEnv();
const licenseRepo = new PlaceholderLicenseConnector({ activeTenants });
if (activeTenants.size > 0) {
  baseLogger.info("Active subscription groups loaded", {
    count: activeTenants.size,
    tenants: Array.from(activeTenants.values()),
  });
} else {
  baseLogger.info("No active subscription groups configured (ACTIVE_TENANTS is empty).");
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

bot.on("message:text", chainMessageHandler("entityHandler", createEntityHandler({ linkCache })));
bot.on("message:text", chainMessageHandler("instagramHandler", createInstagramHandler()));
bot.on("message:text", chainMessageHandler("webmHandler", createWebmHandler()));
bot.on("message:photo", chainMessageHandler("imageHandler", createImageHandler({ imageCache })));

registerCommands(bot);

await bot.start({
  onStart: (info) => baseLogger.info(`Bot started as @${info.username}`),
});

