import { Logger } from "@shared/logger.ts";
import type { BotContext } from "./context.ts";

// Single shared logger instance for the bot; it is tenant-aware via helpers below.
export const baseLogger = new Logger({ level: "info", includeTenantId: true });

export type TenantAwareLogger = {
  error(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  debug(msg: string, meta?: Record<string, unknown>): void;
};

// Returns a logger that automatically injects tenantId (and lets the shared
// logger handle tenant name caching/formatting) based on the current context.
export function loggerFor(ctx: BotContext): TenantAwareLogger {
  const tenantId = ctx.tenant?.tenantId;

  const withTenant = (meta?: Record<string, unknown>): Record<string, unknown> | undefined => {
    if (!tenantId) return meta;
    return { tenantId, ...(meta ?? {}) };
  };

  return {
    error(msg, meta) {
      baseLogger.error(msg, withTenant(meta));
    },
    warn(msg, meta) {
      baseLogger.warn(msg, withTenant(meta));
    },
    info(msg, meta) {
      baseLogger.info(msg, withTenant(meta));
    },
    debug(msg, meta) {
      baseLogger.debug(msg, withTenant(meta));
    },
  };
}

