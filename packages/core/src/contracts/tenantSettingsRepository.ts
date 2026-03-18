import type { TenantId } from "../types.ts";
import type { TenantSettingsV1 } from "../tenancy/tenantSettings.ts";

export interface TenantSettingsRepositoryPort {
  getTenantSettings(tenantId: TenantId): Promise<Partial<TenantSettingsV1> | null>;
}

