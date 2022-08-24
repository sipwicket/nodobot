import sharp from 'sharp';

const MAX_CACHE_SIZE = 50;

export type ImageCacheItem = {
  buffer: Buffer;
  info: sharp.OutputInfo;
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
  resizedImageObject: {
    data: Buffer;
    info: sharp.OutputInfo;
  },
  date: number,
  author: string
): ImageCacheItem => ({
  buffer: resizedImageObject.data,
  info: resizedImageObject.info,
  metadata: { date, author },
});
