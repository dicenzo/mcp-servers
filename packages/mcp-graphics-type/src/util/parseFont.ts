import * as opentype from 'opentype.js';
import type { Font } from 'opentype.js';
import wawoff2 from 'wawoff2';

/**
 * Parses font data with opentype.js, decompressing WOFF2 first (opentype.js reads
 * TTF, OTF and WOFF but not WOFF2). The bytes are copied into a fresh ArrayBuffer,
 * so Buffers that are slices of Node's shared pool parse correctly.
 */
export async function parseFont(data: Buffer | Uint8Array): Promise<Font> {
  let bytes = new Uint8Array(data);
  if (bytes.length >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === 'wOF2') {
    try {
      bytes = new Uint8Array(await wawoff2.decompress(bytes));
    } catch (error) {
      throw new Error(`Invalid WOFF2 font data: ${error instanceof Error ? error.message : 'decompression failed'}`);
    }
  }
  return opentype.parse(bytes.buffer);
}
