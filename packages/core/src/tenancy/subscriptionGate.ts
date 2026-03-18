import type { LicenseRepositoryPort, SubscriptionStatus } from "../contracts/licenseRepository.ts";
import type { TenantId } from "../types.ts";

type Cached<T> = { value: T; expiresAtMs: number };

export class SubscriptionGateUseCase {
  #repo: LicenseRepositoryPort;
  #cache = new Map<TenantId, Cached<SubscriptionStatus>>();

  constructor(repo: LicenseRepositoryPort) {
    this.#repo = repo;
  }

  async getStatus(tenantId: TenantId, ttlSeconds: number): Promise<SubscriptionStatus> {
    const now = Date.now();
    const cached = this.#cache.get(tenantId);
    if (cached && cached.expiresAtMs > now) return cached.value;

    const value = await this.#repo.getTenantSubscriptionStatus(tenantId);
    this.#cache.set(tenantId, { value, expiresAtMs: now + ttlSeconds * 1000 });
    return value;
  }
}

