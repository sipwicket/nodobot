import type { LinkCachePort } from "../../contracts/cachePorts.ts";
import type { TenantId } from "../../types.ts";
import { normalizeLinkKey } from "./normalizers.ts";

export async function checkAndStoreLink(opts: {
  tenantId: TenantId;
  url: string;
  author: string;
  dateMs: number;
  cache: LinkCachePort;
  cacheSize: number;
}): Promise<{ duplicateOf: { author: string; dateMs: number } } | null> {
  const key = normalizeLinkKey(opts.url);
  const hit = await opts.cache.get(opts.tenantId, key);
  if (hit) {
    return { duplicateOf: { author: hit.metadata.author, dateMs: hit.metadata.dateMs } };
  }
  await opts.cache.put(opts.tenantId, {
    key,
    url: opts.url,
    metadata: { author: opts.author, dateMs: opts.dateMs },
  }, opts.cacheSize);
  return null;
}

