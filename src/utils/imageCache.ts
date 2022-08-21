const MAX_CACHE_SIZE = 50

const imageCache: Buffer[] = []

export const getImageCache = () => imageCache

export const addToImageCache = (imageBuffer: Buffer) => {
  if (imageCache.length === MAX_CACHE_SIZE) {
    imageCache.shift()
  }

  imageCache.push(imageBuffer)
}
