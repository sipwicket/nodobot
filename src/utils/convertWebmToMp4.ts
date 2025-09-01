import fetch from 'node-fetch';
import ffmpeg from 'fluent-ffmpeg';
import { promises as fs } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

/**
 * Internal helper to create ffmpeg command with optimized settings
 */
function createOptimizedFfmpegCommand(
  inputPath: string,
  outputPath: string,
  options: {
    audioCodec?: string;
    audioBitrate?: string;
    crf?: string;
    copyAudio?: boolean;
  } = {}
) {
  const {
    audioCodec = 'aac',
    audioBitrate = '128k',
    crf = '28',
    copyAudio = false,
  } = options;

  const command = ffmpeg(inputPath)
    .output(outputPath)
    .videoCodec('libx264')
    .audioCodec(copyAudio ? 'copy' : audioCodec)
    // Fastest encoding settings for CPU-based conversion
    .addOption('-preset', 'ultrafast') // Fastest preset
    .addOption('-crf', crf) // CRF for quality/speed balance
    .addOption('-threads', '0') // Use all available CPU cores
    .addOption('-tune', 'fastdecode') // Optimize for fast decoding
    .addOption('-movflags', '+faststart') // Move metadata to beginning for faster streaming
    .format('mp4');

  if (!copyAudio && audioBitrate) {
    command.audioBitrate(audioBitrate);
  }

  if (copyAudio) {
    command.addOption('-avoid_negative_ts', 'make_zero'); // Handle timestamp issues when copying
  }

  return command;
}

/**
 * Result type for conversion functions that includes cleanup capability
 */
export interface ConversionResult {
  buffer: Buffer;
  cleanup: () => Promise<void>;
}

/**
 * Internal helper for downloading webm and setting up file paths
 */
async function setupWebmDownload(webmUrl: string): Promise<{
  inputPath: string;
  outputPath: string;
  cleanup: () => Promise<void>;
}> {
  const tempDir = tmpdir();
  const timestamp = Date.now();
  const inputPath = join(tempDir, `input_${timestamp}.webm`);
  const outputPath = join(tempDir, `output_${timestamp}.mp4`);

  // Download the webm file
  console.log('Downloading webm file...');
  const response = await fetch(webmUrl);
  if (!response.ok) {
    throw new Error(`Failed to download webm file: ${response.statusText}`);
  }

  const webmBuffer = await response.buffer();
  await fs.writeFile(inputPath, webmBuffer);

  // Create cleanup function
  const cleanup = async (): Promise<void> => {
    await fs.unlink(inputPath).catch((err) => {
      console.error('Failed to delete input file:', err.message);
    });
    await fs.unlink(outputPath).catch((err) => {
      console.error('Failed to delete output file:', err.message);
    });
    console.log('Temporary files cleaned up');
  };

  return { inputPath, outputPath, cleanup };
}

/**
 * Downloads a webm file and converts it to mp4 with fastest possible settings
 * @param webmUrl - The URL of the webm file to convert
 * @returns Promise<Buffer> - The converted mp4 file as a buffer
 */
export async function convertWebmToMp4(webmUrl: string): Promise<Buffer> {
  const tempDir = tmpdir();
  const timestamp = Date.now();
  const inputPath = join(tempDir, `input_${timestamp}.webm`);
  const outputPath = join(tempDir, `output_${timestamp}.mp4`);

  try {
    // Download the webm file
    console.log('Downloading webm file...');
    const response = await fetch(webmUrl);
    if (!response.ok) {
      throw new Error(`Failed to download webm file: ${response.statusText}`);
    }

    const webmBuffer = await response.buffer();
    await fs.writeFile(inputPath, webmBuffer);

    // Convert to mp4 with fastest possible settings
    console.log('Converting webm to mp4...');
    await new Promise<void>((resolve, reject) => {
      createOptimizedFfmpegCommand(inputPath, outputPath, {
        audioCodec: 'aac',
        audioBitrate: '128k',
        crf: '28',
      })
        .on('end', () => {
          console.log('Conversion completed');
          resolve();
        })
        .on('error', (err) => {
          console.error('Conversion error:', err);
          reject(err);
        })
        .run();
    });

    // Read the converted file
    const mp4Buffer = await fs.readFile(outputPath);

    // Clean up temporary files
    await fs.unlink(inputPath).catch((err) => {
      console.error('Failed to delete input file:', err.message);
    });
    await fs.unlink(outputPath).catch((err) => {
      console.error('Failed to delete output file:', err.message);
    });

    return mp4Buffer;
  } catch (error) {
    // Clean up temporary files on error
    await fs.unlink(inputPath).catch((err) => {
      console.error(
        'Failed to delete input file during error cleanup:',
        err.message
      );
    });
    await fs.unlink(outputPath).catch((err) => {
      console.error(
        'Failed to delete output file during error cleanup:',
        err.message
      );
    });
    throw error;
  }
}

/**
 * Ultra-fast conversion that attempts to copy audio stream when possible
 * @param webmUrl - The URL of the webm file to convert
 * @returns Promise<Buffer> - The converted mp4 file as a buffer
 */
export async function convertWebmToMp4UltraFast(
  webmUrl: string
): Promise<Buffer> {
  const tempDir = tmpdir();
  const timestamp = Date.now();
  const inputPath = join(tempDir, `input_${timestamp}.webm`);
  const outputPath = join(tempDir, `output_${timestamp}.mp4`);

  try {
    // Download the webm file
    console.log('Downloading webm file...');
    const response = await fetch(webmUrl);
    if (!response.ok) {
      throw new Error(`Failed to download webm file: ${response.statusText}`);
    }

    const webmBuffer = await response.buffer();
    await fs.writeFile(inputPath, webmBuffer);

    // Convert to mp4 with ultra-fast settings - copy audio if compatible
    console.log('Converting webm to mp4 (ultra-fast mode)...');
    await new Promise<void>((resolve, reject) => {
      // First attempt: try copying audio (fastest)
      createOptimizedFfmpegCommand(inputPath, outputPath, {
        copyAudio: true,
        crf: '30', // Even higher CRF for maximum speed
      })
        .on('end', () => {
          console.log('Ultra-fast conversion completed (audio copied)');
          resolve();
        })
        .on('error', (err) => {
          console.error(
            'Audio copy failed, falling back to re-encoding:',
            err.message
          );

          // Fallback: re-encode audio
          createOptimizedFfmpegCommand(inputPath, outputPath, {
            audioCodec: 'aac',
            audioBitrate: '128k',
            crf: '28',
          })
            .on('end', () => {
              console.log('Fallback conversion completed');
              resolve();
            })
            .on('error', (fallbackErr) => {
              console.error('Conversion error:', fallbackErr);
              reject(fallbackErr);
            })
            .run();
        })
        .run();
    });

    // Read the converted file
    const mp4Buffer = await fs.readFile(outputPath);

    // Clean up temporary files
    await fs.unlink(inputPath).catch((err) => {
      console.error('Failed to delete input file:', err.message);
    });
    await fs.unlink(outputPath).catch((err) => {
      console.error('Failed to delete output file:', err.message);
    });

    return mp4Buffer;
  } catch (error) {
    // Clean up temporary files on error
    await fs.unlink(inputPath).catch((err) => {
      console.error(
        'Failed to delete input file during error cleanup:',
        err.message
      );
    });
    await fs.unlink(outputPath).catch((err) => {
      console.error(
        'Failed to delete output file during error cleanup:',
        err.message
      );
    });
    throw error;
  }
}

/**
 * Downloads a webm file and converts it to mp4 with deferred cleanup
 * @param webmUrl - The URL of the webm file to convert
 * @returns Promise<ConversionResult> - The converted mp4 buffer and cleanup function
 */
export async function convertWebmToMp4WithCleanup(
  webmUrl: string
): Promise<ConversionResult> {
  const { inputPath, outputPath, cleanup } = await setupWebmDownload(webmUrl);

  try {
    // Convert to mp4 with fastest possible settings
    console.log('Converting webm to mp4...');
    await new Promise<void>((resolve, reject) => {
      createOptimizedFfmpegCommand(inputPath, outputPath, {
        audioCodec: 'aac',
        audioBitrate: '128k',
        crf: '28',
      })
        .on('end', () => {
          console.log('Conversion completed');
          resolve();
        })
        .on('error', (err) => {
          console.error('Conversion error:', err);
          reject(err);
        })
        .run();
    });

    // Read the converted file but don't delete yet
    const mp4Buffer = await fs.readFile(outputPath);

    return { buffer: mp4Buffer, cleanup };
  } catch (error) {
    // Clean up immediately on error
    await cleanup();
    throw error;
  }
}

/**
 * Ultra-fast conversion with deferred cleanup
 * @param webmUrl - The URL of the webm file to convert
 * @returns Promise<ConversionResult> - The converted mp4 buffer and cleanup function
 */
export async function convertWebmToMp4UltraFastWithCleanup(
  webmUrl: string
): Promise<ConversionResult> {
  const { inputPath, outputPath, cleanup } = await setupWebmDownload(webmUrl);

  try {
    // Convert to mp4 with ultra-fast settings - copy audio if compatible
    console.log('Converting webm to mp4 (ultra-fast mode)...');
    await new Promise<void>((resolve, reject) => {
      // First attempt: try copying audio (fastest)
      createOptimizedFfmpegCommand(inputPath, outputPath, {
        copyAudio: true,
        crf: '30', // Even higher CRF for maximum speed
      })
        .on('end', () => {
          console.log('Ultra-fast conversion completed (audio copied)');
          resolve();
        })
        .on('error', (err) => {
          console.error(
            'Audio copy failed, falling back to re-encoding:',
            err.message
          );

          // Fallback: re-encode audio
          createOptimizedFfmpegCommand(inputPath, outputPath, {
            audioCodec: 'aac',
            audioBitrate: '128k',
            crf: '28',
          })
            .on('end', () => {
              console.log('Fallback conversion completed');
              resolve();
            })
            .on('error', (fallbackErr) => {
              console.error('Conversion error:', fallbackErr);
              reject(fallbackErr);
            })
            .run();
        })
        .run();
    });

    // Read the converted file but don't delete yet
    const mp4Buffer = await fs.readFile(outputPath);

    return { buffer: mp4Buffer, cleanup };
  } catch (error) {
    // Clean up immediately on error
    await cleanup();
    throw error;
  }
}
