import type { LicenseRepositoryPort, SubscriptionStatus } from "@core/contracts/licenseRepository.ts";
import type { TenantId } from "@core/types.ts";

type PlaceholderLicenseOpts = {
  activeTenants: Set<TenantId>;
};

export class PlaceholderLicenseConnector implements LicenseRepositoryPort {
  #activeTenants: Set<TenantId>;

  constructor(opts: PlaceholderLicenseOpts) {
    this.#activeTenants = opts.activeTenants;
  }

  async getTenantSubscriptionStatus(tenantId: TenantId): Promise<SubscriptionStatus> {
    if (this.#activeTenants.has(tenantId)) return { kind: "ACTIVE", plan: "placeholder" };
    return { kind: "INACTIVE", reason: "placeholder_inactive" };
  }
}

