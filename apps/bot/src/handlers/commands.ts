import type { BotContext } from "../context.ts";
import { loggerFor } from "../logger.ts";

export function registerCommands(bot: import("npm:grammy@1.36.0").Bot<BotContext>) {
  const helpHandler = async (ctx: BotContext) => {
    const logger = loggerFor(ctx);
    const tenant = ctx.tenant;
    if (!tenant || !tenant.settings.featureFlags.helpCommand) return;
    const cmds = [
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
  bot.hears(/^\/(\w+)(@\w+)?$/, async (ctx) => {
    const logger = loggerFor(ctx);
    const tenant = ctx.tenant;
    if (!tenant) return;
    const cmd = ctx.match?.[1];
    if (!cmd) return;
    if (cmd !== tenant.settings.commands.helpCommand) return;
    logger.info("[commands] tenant alias help command invoked", {
      cmd,
    });
    await helpHandler(ctx);
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
      if (typeof url !== "string") throw new Error("endpoint did not return { url }");
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

