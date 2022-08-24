import sharp from 'sharp';
import { ImageCacheItem } from './imageCache';

const MAX_IMAGE_SIZE = 100;
export const resizeDimensions = {
  x: 30,
  y: 30,
};

export const getImageDimensions = () => resizeDimensions;
export const setResizeDimensions = (size: number) => {
  if (size > MAX_IMAGE_SIZE || size === 0) {
    return false;
  }

  resizeDimensions.x = size;
  resizeDimensions.y = size;

  return true;
};

export const resizeImage = async (image: Buffer) => {
  const { data, info } = await sharp(image)
    .resize(getImageDimensions().x, getImageDimensions().y)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  return { data, info };
};

export const bufferFromCachedImage = (cachedImage: ImageCacheItem) =>
  sharp(cachedImage.buffer, {
    raw: { ...cachedImage.info },
  })
    .png()
    .toBuffer();
