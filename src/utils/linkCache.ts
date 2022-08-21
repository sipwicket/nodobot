const MAX_CACHE_SIZE = 50

export type LinkCacheItem = {
  url: string
  metadata: { date: number; author: string }
}
const linkCache: LinkCacheItem[] = []

export const getLinkCache = () => linkCache

export const addToLinkCache = (linkCacheItem: LinkCacheItem) => {
  if (linkCache.length === MAX_CACHE_SIZE) {
    linkCache.shift()
  }

  linkCache.push(linkCacheItem)
}

export const buildLinkCacheItem = (
  url: string,
  date: number,
  author: string
): LinkCacheItem => ({
  url,
  metadata: { date, author },
})
