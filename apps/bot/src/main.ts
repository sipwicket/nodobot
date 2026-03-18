import "https://deno.land/std@0.224.0/dotenv/load.ts";
import { Bot } from "npm:grammy@1.36.0";
import { Logger } from "@shared/logger.ts";
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

const logger = new Logger({ level: "info", includeTenantId: false });

const token = Deno.env.get("TELEGRAM_TOKEN");
if (!token) {
  logger.error("Missing TELEGRAM_TOKEN");
  Deno.exit(1);
}

const bot = new Bot<BotContext>(token);

bot.catch((err) => {
  logger.error("Unhandled bot error", { err });
  const ctx = err.ctx;
  // Best-effort user-visible error; never throw from catch.
  ctx.reply("sipchan died lol").catch(() => {});
});

// Placeholder connectors (to be replaced later).
const overridesByTenant = await loadTenantOverridesFromJson("apps/bot/tenant_overrides.json");
const settingsRepo = new PlaceholderTenantSettingsConnector({ overridesByTenant });
const licenseRepo = new PlaceholderLicenseConnector({ activeTenants: loadActiveTenantsFromEnv() });
const gate = new SubscriptionGateUseCase(licenseRepo);

const me = await bot.api.getMe();

bot.use(tenantResolver({ settingsRepo }));
bot.use(subscriptionGate({ gate }));
bot.use(directReplyHandler({ botUserId: me.id, botUsername: me.username }));

const linkCache = new InMemoryLinkCache();
const imageCache = new InMemoryImageCache();
bot.on("message:text", createEntityHandler({ linkCache }));
bot.on("message:text", createInstagramHandler());
bot.on("message:text", createWebmHandler());
bot.on("message:photo", createImageHandler({ imageCache }));

registerCommands(bot);

await bot.start({
  onStart: (info) => logger.info(`Bot started as @${info.username}`),
});

