import type { TenantSettingsRepositoryPort } from "@core/contracts/tenantSettingsRepository.ts";
import type { TenantId } from "@core/types.ts";
import type { TenantSettingsV1 } from "@core/tenancy/tenantSettings.ts";

type PlaceholderSettingsOpts = {
  overridesByTenant: Map<TenantId, Partial<TenantSettingsV1>>;
  persistPath?: string;
};

export class PlaceholderTenantSettingsConnector
  implements TenantSettingsRepositoryPort {
  #overridesByTenant: Map<TenantId, Partial<TenantSettingsV1>>;
  #persistPath?: string;
  #writeQueue: Promise<void> = Promise.resolve();

  constructor(opts: PlaceholderSettingsOpts) {
    this.#overridesByTenant = opts.overridesByTenant;
    this.#persistPath = opts.persistPath;
  }

  async getTenantSettings(
    tenantId: TenantId,
  ): Promise<Partial<TenantSettingsV1> | null> {
    return this.#overridesByTenant.get(tenantId) ?? null;
  }

  async setTenantSettings(
    tenantId: TenantId,
    overrides: Partial<TenantSettingsV1> | null,
  ): Promise<void> {
    if (overrides === null) {
      this.#overridesByTenant.delete(tenantId);
    } else {
      this.#overridesByTenant.set(tenantId, overrides);
    }
    await this.#persistOverrides();
  }

  async #persistOverrides(): Promise<void> {
    if (!this.#persistPath) return;
    const persistPath = this.#persistPath;
    this.#writeQueue = this.#writeQueue.then(async () => {
      const serialized = JSON.stringify(
        Object.fromEntries(this.#overridesByTenant.entries()),
        null,
        2,
      );
      await Deno.writeTextFile(persistPath, `${serialized}\n`);
    }).catch((error) => {
      // eslint-disable-next-line no-console
      console.error("[settings] failed to persist tenant overrides", error);
    });
    await this.#writeQueue;
  }
}
