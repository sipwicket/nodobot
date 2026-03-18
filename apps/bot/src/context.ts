import type { Context } from "npm:grammy@1.36.0";
import type { TenantContext } from "@core/tenancy/tenantContext.ts";

export type BotContext = Context & {
  tenant?: TenantContext;
};

