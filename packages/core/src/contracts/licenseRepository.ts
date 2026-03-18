import type { TenantId } from "../types.ts";

export type SubscriptionStatus =
  | { kind: "ACTIVE"; plan?: string; validUntil?: string }
  | { kind: "INACTIVE"; reason?: string }
  | { kind: "MISSING" };

export interface LicenseRepositoryPort {
  getTenantSubscriptionStatus(tenantId: TenantId): Promise<SubscriptionStatus>;
}

