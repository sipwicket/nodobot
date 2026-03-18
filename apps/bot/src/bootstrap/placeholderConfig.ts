import { validateTenantSettingsV1 } from "@core/tenancy/tenantSettings.ts";
import type { TenantId } from "@core/types.ts";
import type { TenantSettingsV1 } from "@core/tenancy/tenantSettings.ts";

export function loadActiveTenantsFromEnv(): Set<TenantId> {
  const raw = Deno.env.get("ACTIVE_TENANTS")?.trim();
  if (!raw) return new Set();
  return new Set(
    raw.split(",").map((s) => s.trim()).filter(Boolean),
  );
}

export async function loadTenantOverridesFromJson(path: string): Promise<Map<TenantId, Partial<TenantSettingsV1>>> {
  try {
    const txt = await Deno.readTextFile(path);
    const parsed = JSON.parse(txt) as Record<string, unknown>;
    const map = new Map<TenantId, Partial<TenantSettingsV1>>();

    for (const [tenantId, overrides] of Object.entries(parsed)) {
      // Validate by merging into defaults and re-validating; ensures tenant JSON can't break runtime.
      // We store raw overrides but only after they pass validation.
      validateTenantSettingsV1({ schemaVersion: 1, ...(overrides as object) });
      map.set(tenantId, overrides as Partial<TenantSettingsV1>);
    }

    return map;
  } catch {
    return new Map();
  }
}

