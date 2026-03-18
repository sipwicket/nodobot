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

    // For now, log unknown / inactive tenants so operators can add them to ACTIVE_TENANTS.
    // eslint-disable-next-line no-console
    console.log(`[Subscription] Inactive tenant detected (not in ACTIVE_TENANTS): ${tenantId}`);

    return { kind: "INACTIVE", reason: "placeholder_inactive" };
  }
}

