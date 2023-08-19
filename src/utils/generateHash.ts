import { bmvbhash } from 'blockhash-core';
import { imageFromBuffer, getImageData } from '@canvas/image';

export async function generateHash(buffer: Uint8Array, bits?: number) {
  try {
    if (!buffer) {
      throw new Error('Buffer is required.');
    }

    bits = bits || 8;

    if (bits % 4 !== 0) {
      console.error(`Unknown bits length: [${bits}]`);
      return null;
    }

    const imageData = getImageData(await imageFromBuffer(buffer));
    if (!imageData) return null;

    let { width, height, data } = imageData;
    const hexHash = bmvbhash({ width, height, data }, bits);

    return hexHash;
  } catch (error) {
    console.error(error);
    return null;
  }
}
