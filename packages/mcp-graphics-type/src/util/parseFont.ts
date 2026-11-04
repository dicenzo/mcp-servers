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
  if (data.length > PERFORMANCE_LIMITS.MAX_FONT_FILE_SIZE) {
    throw new Error(`Font file too large: ${data.length} bytes (max: ${PERFORMANCE_LIMITS.MAX_FONT_FILE_SIZE} bytes)`);
  }
  let bytes = new Uint8Array(data);
  if (bytes.length >= 4 && String.fromCharCode(...bytes.subarray(0, 4)) === 'wOF2') {
    // A small WOFF2 file can expand a lot. Check the sizes it declares (the header
    // total and every table in its directory) before decompressing, and the real
    // output size after.
    const limit = PERFORMANCE_LIMITS.MAX_DECOMPRESSED_FONT_SIZE;
    const tooLarge = new Error(`WOFF2 font would decompress to more than ${limit / (1024 * 1024)}MB`);
    if (declaredWoff2Size(bytes) > limit) {
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

/** glyf and loca: their transform version 0 means "transformed", unlike every other table */
const GLYF_TAG_INDEX = 10;
const LOCA_TAG_INDEX = 11;

/**
 * The largest buffer a WOFF2 file says decoding needs: its header totalSfntSize, the
 * sum of the tables' origLength (the output font), or the sum of what the brotli
 * stream decompresses to (transformLength for transformed tables, else origLength).
 * Malformed directories give Infinity.
 */
function declaredWoff2Size(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 48) {
    return Infinity;
  }
  const numTables = view.getUint16(12);
  let position = 48;
  let outputSize = 0;
  let streamSize = 0;

  // UIntBase128: up to 5 bytes, 7 bits each, no leading zeros, fits in 32 bits
  const readBase128 = (): number => {
    let value = 0;
    for (let i = 0; i < 5; i++) {
      if (position >= bytes.length) {
        return Infinity;
      }
      const byte = bytes[position++];
      if (i === 0 && byte === 0x80) {
        return Infinity;
      }
      value = value * 128 + (byte & 0x7f);
      if ((byte & 0x80) === 0) {
        return value;
      }
    }
    return Infinity;
  };

  for (let i = 0; i < numTables && Number.isFinite(outputSize + streamSize); i++) {
    if (position >= bytes.length) {
      return Infinity;
    }
    const flags = bytes[position++];
    const tagIndex = flags & 0x3f;
    if (tagIndex === 0x3f) {
      position += 4; // explicit tag
    }
    const transformVersion = flags >> 6;
    const origLength = readBase128();
    const isGlyfOrLoca = tagIndex === GLYF_TAG_INDEX || tagIndex === LOCA_TAG_INDEX;
    const transformed = isGlyfOrLoca ? transformVersion === 0 : transformVersion !== 0;
    outputSize += origLength;
    streamSize += transformed ? readBase128() : origLength;
  }
  return Math.max(outputSize, streamSize, view.getUint32(16));
}
