import type { MiddlewareFn } from "npm:grammy@1.36.0";
import type { BotContext } from "../context.ts";
import { renderTemplate } from "@core/tenancy/tenantSettings.ts";
import { loggerFor } from "../logger.ts";

type ReplyHandlerOpts = {
  botUserId: number;
  botUsername?: string;
};

export function directReplyHandler(opts: ReplyHandlerOpts): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const logger = loggerFor(ctx);
    const tenant = ctx.tenant;
    const msg = ctx.message;
    if (!tenant || !msg) return await next();
    if (!tenant.settings.featureFlags.directReply) return await next();

    const isReplyToBot = msg.reply_to_message?.from?.id === opts.botUserId;
    const mentionsBot = typeof msg.text === "string" && opts.botUsername
      ? msg.text.includes(`@${opts.botUsername}`)
      : false;

    if (!isReplyToBot && !mentionsBot) return await next();

    logger.info("[directReplyHandler] direct reply triggered", {
      isReplyToBot,
      mentionsBot,
    });

    const username = msg.from?.first_name ?? msg.from?.username ?? "there";
    const cfg = tenant.settings.directReply;

    let text: string;
    if (cfg.mode === "randomPool" && cfg.randomReplies.length > 0) {
      text = cfg.randomReplies[Math.floor(Math.random() * cfg.randomReplies.length)];
    } else {
      text = cfg.fallbackReply;
    }

    text = renderTemplate(text, { username });
    logger.debug("[directReplyHandler] sending direct reply", {
      mode: cfg.mode,
      hasRandomPool: cfg.randomReplies.length > 0,
    });
    await ctx.reply(text, { reply_to_message_id: msg.message_id }).catch(() => {});
  };
}

