import type { ImageCacheItem, ImageCachePort, LinkCacheItem, LinkCachePort } from "@core/contracts/cachePorts.ts";
import type { TenantId } from "@core/types.ts";

function getQueue<K, V>(map: Map<K, V[]>, key: K): V[] {
  const existing = map.get(key);
  if (existing) return existing;
  const created: V[] = [];
  map.set(key, created);
  return created;
}

export class InMemoryLinkCache implements LinkCachePort {
  #byTenant = new Map<TenantId, LinkCacheItem[]>();

  async get(tenantId: TenantId, key: string): Promise<LinkCacheItem | null> {
    const q = this.#byTenant.get(tenantId);
    if (!q) return null;
    return q.find((it) => it.key === key) ?? null;
  }

  async put(tenantId: TenantId, item: LinkCacheItem, maxSize: number): Promise<void> {
    const q = getQueue(this.#byTenant, tenantId);
    q.push(item);
    while (q.length > maxSize) q.shift();
  }
}

export class InMemoryImageCache implements ImageCachePort {
  #byTenant = new Map<TenantId, ImageCacheItem[]>();

  async get(tenantId: TenantId, hash: string): Promise<ImageCacheItem | null> {
    const q = this.#byTenant.get(tenantId);
    if (!q) return null;
    return q.find((it) => it.hash === hash) ?? null;
  }

  async put(tenantId: TenantId, item: ImageCacheItem, maxSize: number): Promise<void> {
    const q = getQueue(this.#byTenant, tenantId);
    q.push(item);
    while (q.length > maxSize) q.shift();
  }
}

