import sharp from 'sharp';

const MAX_CACHE_SIZE = 50;

export type ImageCacheItem = {
  hash: string;
  metadata: { date: number; author: string };
};
let imageCache: ImageCacheItem[] = [];

export const getImageCache = () => imageCache;

export const addToImageCache = (imageCacheItem: ImageCacheItem) => {
  if (imageCache.length === MAX_CACHE_SIZE) {
    imageCache.shift();
  }

  imageCache.push(imageCacheItem);
};
export const clearImageCache = () => {
  imageCache = [];
};

export const buildImageCacheItem = (
  hash: string,
  date: number,
  author: string
): ImageCacheItem => ({
  hash,
  metadata: { date, author },
});
