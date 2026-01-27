import fetch from 'node-fetch'
import { promises as fs } from 'fs'
import { createWriteStream } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { pipeline } from 'stream/promises'

export async function downloadToBuffer(url: string): Promise<Buffer> {
  const response = await fetch(url)

  const buffer = await response.buffer()

  return buffer
}

export interface DownloadToFileResult {
  filePath: string
  cleanup: () => Promise<void>
}

/**
 * Downloads a file from URL to a temporary file on disk using streaming (memory-efficient)
 * @param url - The URL to download from
 * @param extension - Optional file extension (e.g., 'jpg', 'mp4'). If not provided, will try to infer from URL or Content-Type
 * @returns Promise with file path and cleanup function
 */
export async function downloadToFile(
  url: string,
  extension?: string
): Promise<DownloadToFileResult> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`)
  }

  // Determine file extension
  let fileExt = extension
  if (!fileExt) {
    // Try to get from Content-Type header
    const contentType = response.headers.get('content-type')
    if (contentType) {
      if (contentType.includes('image/jpeg')) fileExt = 'jpg'
      else if (contentType.includes('image/png')) fileExt = 'png'
      else if (contentType.includes('image/webp')) fileExt = 'webp'
      else if (contentType.includes('video/mp4')) fileExt = 'mp4'
      else if (contentType.includes('video/webm')) fileExt = 'webm'
    }
    // Fallback: try to extract from URL
    if (!fileExt) {
      const urlMatch = url.match(/\.([a-z0-9]+)(?:\?|$)/i)
      if (urlMatch) {
        fileExt = urlMatch[1]
      }
    }
    // Final fallback
    if (!fileExt) {
      fileExt = 'tmp'
    }
  }

  const tempDir = tmpdir()
  const timestamp = Date.now()
  const randomId = Math.random().toString(36).substring(2, 9)
  const filePath = join(tempDir, `instagram_${timestamp}_${randomId}.${fileExt}`)

  // Stream download directly to file (memory-efficient for large files)
  const writeStream = createWriteStream(filePath)
  try {
    // Use pipeline for proper error handling and cleanup
    await pipeline(response.body as NodeJS.ReadableStream, writeStream)
  } catch (error) {
    // Clean up partial file on error
    await fs.unlink(filePath).catch(() => {})
    throw error
  }

  // Create cleanup function
  const cleanup = async (): Promise<void> => {
    try {
      await fs.unlink(filePath)
      console.log(`Deleted temporary file: ${filePath}`)
    } catch (err) {
      console.error(`Failed to delete temporary file ${filePath}:`, err)
    }
  }

  return { filePath, cleanup }
}
