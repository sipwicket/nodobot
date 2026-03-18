// Simple perceptual hash (average hash) for tenant-scoped duplicate detection.
// Outputs hex string length (bits*bits)/4 for bits in {8,12,16}.
import { Image } from "https://deno.land/x/imagescript@1.3.0/mod.ts";

function toHex(bits: number[]): string {
  const nibbles: number[] = [];
  for (let i = 0; i < bits.length; i += 4) {
    const v = (bits[i] << 3) | (bits[i + 1] << 2) | (bits[i + 2] << 1) | bits[i + 3];
    nibbles.push(v);
  }
  return nibbles.map((n) => n.toString(16)).join("");
}

export async function averageHash(imageBytes: Uint8Array, bits: 8 | 12 | 16): Promise<string> {
  const img = await Image.decode(imageBytes);
  const resized = img.resize(bits, bits);

  const lum: number[] = [];
  for (let y = 0; y < bits; y++) {
    for (let x = 0; x < bits; x++) {
      const c = resized.getPixelAt(x, y);
      const r = (c >> 24) & 0xff;
      const g = (c >> 16) & 0xff;
      const b = (c >> 8) & 0xff;
      lum.push(0.2126 * r + 0.7152 * g + 0.0722 * b);
    }
  }
  const avg = lum.reduce((a, b) => a + b, 0) / lum.length;
  const bitsArr = lum.map((v) => (v >= avg ? 1 : 0));

  // Ensure multiple of 4.
  while (bitsArr.length % 4 !== 0) bitsArr.push(0);
  return toHex(bitsArr);
}

