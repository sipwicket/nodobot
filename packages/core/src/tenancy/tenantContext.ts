import type { TenantId } from "../types.ts";
import type { TenantSettingsV1 } from "./tenantSettings.ts";

export type TenantContext = {
  tenantId: TenantId;
  chatId: string;
  settings: TenantSettingsV1;
};

