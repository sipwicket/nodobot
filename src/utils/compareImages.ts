import pixelmatch from 'pixelmatch'

export const compareImages = (img1: Buffer, img2: Buffer) => {
  const result = pixelmatch(img1, img2, null, 30, 30, { threshold: 0.5 })

  return result
}
