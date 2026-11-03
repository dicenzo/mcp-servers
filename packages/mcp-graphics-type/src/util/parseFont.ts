import * as opentype from 'opentype.js';
import type { Font } from 'opentype.js';
import wawoff2 from 'wawoff2';
import { PERFORMANCE_LIMITS } from '../types/typography.js';

/**
 * Parses font data with opentype.js, decompressing WOFF2 first (opentype.js reads
 * TTF, OTF and WOFF but not WOFF2). The bytes are copied into a fresh ArrayBuffer,
 * so Buffers that are slices of Node's shared pool parse correctly.
 */
export async function parseFont(data: Buffer | Uint8Array): Promise<Font> {
  let bytes = new Uint8Array(data);
  if (bytes.length >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === 'wOF2') {
    // A small WOFF2 file can expand a lot, so check the size its header declares
    // (totalSfntSize) before decompressing, and the real output size after.
    const limit = PERFORMANCE_LIMITS.MAX_DECOMPRESSED_FONT_SIZE;
    const tooLarge = new Error(`WOFF2 font would decompress to more than ${limit / (1024 * 1024)}MB`);
    if (bytes.length < 20 || new DataView(bytes.buffer).getUint32(16) > limit) {
      throw tooLarge;
    }
    try {
      bytes = new Uint8Array(await wawoff2.decompress(bytes));
    } catch (error) {
      throw new Error(`Invalid WOFF2 font data: ${error instanceof Error ? error.message : 'decompression failed'}`);
    }
    if (bytes.length > limit) {
      throw tooLarge;
    }
  }
  return opentype.parse(bytes.buffer);
}
