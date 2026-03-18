import type { TenantSettingsRepositoryPort } from "@core/contracts/tenantSettingsRepository.ts";
import type { TenantId } from "@core/types.ts";
import type { TenantSettingsV1 } from "@core/tenancy/tenantSettings.ts";

type PlaceholderSettingsOpts = {
  overridesByTenant: Map<TenantId, Partial<TenantSettingsV1>>;
};

export class PlaceholderTenantSettingsConnector implements TenantSettingsRepositoryPort {
  #overridesByTenant: Map<TenantId, Partial<TenantSettingsV1>>;

  constructor(opts: PlaceholderSettingsOpts) {
    this.#overridesByTenant = opts.overridesByTenant;
  }

  async getTenantSettings(tenantId: TenantId): Promise<Partial<TenantSettingsV1> | null> {
    return this.#overridesByTenant.get(tenantId) ?? null;
  }
}

