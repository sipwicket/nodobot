import fetch from 'node-fetch'

export async function downloadToBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url)

  const buffer = await response.buffer()

  return buffer
}
