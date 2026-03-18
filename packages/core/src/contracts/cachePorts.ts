import type { TenantId } from "../types.ts";

export type CacheMetadata = {
  dateMs: number;
  author: string;
};

export type LinkCacheItem = {
  key: string;
  url: string;
  metadata: CacheMetadata;
};

export type ImageCacheItem = {
  hash: string;
  metadata: CacheMetadata;
};

export interface LinkCachePort {
  get(tenantId: TenantId, key: string): Promise<LinkCacheItem | null>;
  put(tenantId: TenantId, item: LinkCacheItem, maxSize: number): Promise<void>;
}

export interface ImageCachePort {
  get(tenantId: TenantId, hash: string): Promise<ImageCacheItem | null>;
  put(tenantId: TenantId, item: ImageCacheItem, maxSize: number): Promise<void>;
}

