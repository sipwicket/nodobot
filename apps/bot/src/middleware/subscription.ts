import type { MiddlewareFn } from "npm:grammy@1.36.0";
import type { BotContext } from "../context.ts";
import { SubscriptionGateUseCase } from "@core/tenancy/subscriptionGate.ts";

export function subscriptionGate(opts: {
  gate: SubscriptionGateUseCase;
}): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const tenant = ctx.tenant;
    if (!tenant) return await next();

    const status = await opts.gate.getStatus(tenant.tenantId, tenant.settings.subscription.recheckTtlSeconds);
    if (status.kind === "ACTIVE") return await next();

    // Avoid expensive work; respond and exit.
    const message = tenant.settings.subscription.inactiveMessage;
    // Reply to triggering message if possible, otherwise send message.
    if (ctx.message?.message_id) {
      await ctx.reply(message);
    } else {
      await ctx.api.sendMessage(tenant.chatId, message);
    }
  };
}

