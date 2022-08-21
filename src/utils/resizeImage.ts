import sharp from 'sharp'
import { ImageCacheItem } from './imageCache'

const RESIZE_DIMENSIONS = {
  x: 30,
  y: 30,
}

export const resizeImage = async (image: Buffer) => {
  const { data, info } = await sharp(image)
    .resize(RESIZE_DIMENSIONS.x, RESIZE_DIMENSIONS.y)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  return { data, info }
}

export const bufferFromCachedImage = (cachedImage: ImageCacheItem) =>
  sharp(cachedImage.buffer, {
    raw: { ...cachedImage.info },
  })
    .png()
    .toBuffer()
