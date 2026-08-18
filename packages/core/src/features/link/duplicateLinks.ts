import type { LinkCachePort } from "../../contracts/cachePorts.ts";
import type { TenantId } from "../../types.ts";
import { normalizeLinkKey } from "./normalizers.ts";

export type DuplicateLinkHit = { duplicateOf: { author: string; dateMs: number } };

export async function findDuplicateLink(opts: {
  tenantId: TenantId;
  url: string;
  cache: LinkCachePort;
}): Promise<DuplicateLinkHit | null> {
  const key = normalizeLinkKey(opts.url);
  const hit = await opts.cache.get(opts.tenantId, key);
  if (!hit) return null;
  return { duplicateOf: { author: hit.metadata.author, dateMs: hit.metadata.dateMs } };
}

export async function storeLink(opts: {
  tenantId: TenantId;
  url: string;
  author: string;
  dateMs: number;
  cache: LinkCachePort;
  cacheSize: number;
}): Promise<void> {
  await opts.cache.put(opts.tenantId, {
    key: normalizeLinkKey(opts.url),
    url: opts.url,
    metadata: { author: opts.author, dateMs: opts.dateMs },
  }, opts.cacheSize);
}

export async function checkAndStoreLink(opts: {
  tenantId: TenantId;
  url: string;
  author: string;
  dateMs: number;
  cache: LinkCachePort;
  cacheSize: number;
}): Promise<DuplicateLinkHit | null> {
  const hit = await findDuplicateLink(opts);
  if (hit) return hit;
  await storeLink(opts);
  return null;
}

