import sharp from 'sharp'

const RESIZE_DIMENSIONS = {
  x: 30,
  y: 30,
}

export const resizeImage = async (image: Buffer) => {
  const result = sharp(image)
    .resize(RESIZE_DIMENSIONS.x, RESIZE_DIMENSIONS.y)
    .jpeg({ quality: 100, mozjpeg: true })
    .toBuffer()

  return result
}
