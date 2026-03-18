import type { MiddlewareFn } from "npm:grammy@1.36.0";
import type { BotContext } from "../context.ts";
import { defaultTenantSettingsV1, mergeTenantSettingsV1, validateTenantSettingsV1 } from "@core/tenancy/tenantSettings.ts";
import type { TenantSettingsRepositoryPort } from "@core/contracts/tenantSettingsRepository.ts";
import { baseLogger } from "../logger.ts";

export function tenantResolver(opts: {
  settingsRepo: TenantSettingsRepositoryPort;
}): MiddlewareFn<BotContext> {
  return async (ctx, next) => {
    const chat = ctx.chat;
    if (!chat) return await next();

    const tenantId = String(chat.id);
    baseLogger.debug("[tenantResolver] resolving tenant settings", {
      tenantId,
    });
    const overrides = await opts.settingsRepo.getTenantSettings(tenantId);
    const merged = mergeTenantSettingsV1(defaultTenantSettingsV1(), overrides);
    const settings = validateTenantSettingsV1(merged);

    ctx.tenant = {
      tenantId,
      chatId: String(chat.id),
      settings,
    };

    baseLogger.debug("[tenantResolver] tenant context attached", {
      tenantId,
      featureFlags: settings.featureFlags,
    });

    await next();
  };
}

