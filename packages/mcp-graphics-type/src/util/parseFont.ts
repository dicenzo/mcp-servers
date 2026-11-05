import * as opentype from 'opentype.js';
import type { Font } from 'opentype.js';
import wawoff2 from 'wawoff2';
import * as zlib from 'zlib';
import { PERFORMANCE_LIMITS } from '../types/typography.js';

/**
 * Parses font data with opentype.js, from the sfnt bytes `toSfnt` returns.
 */
export async function parseFont(data: Buffer | Uint8Array): Promise<Font> {
  return opentype.parse((await toSfnt(data)).buffer);
}

/**
 * Returns font data as uncompressed sfnt bytes (TTF/OTF) in a fresh ArrayBuffer,
 * which both opentype.js and HarfBuzz read: WOFF and WOFF2 are decompressed,
 * anything else is copied as is. The copy means Buffers that are slices of Node's
 * shared pool parse correctly.
 */
export async function toSfnt(data: Buffer | Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  if (data.length > PERFORMANCE_LIMITS.MAX_FONT_FILE_SIZE) {
    throw new Error(`Font file too large: ${data.length} bytes (max: ${PERFORMANCE_LIMITS.MAX_FONT_FILE_SIZE} bytes)`);
  }
  const bytes = new Uint8Array(data);
  const signature = bytes.length >= 4 ? String.fromCharCode(...bytes.subarray(0, 4)) : '';
  if (signature === 'wOF2') {
    return decodeWoff2(bytes);
  }
  if (signature === 'wOFF') {
    return decodeWoff(bytes);
  }
  return bytes;
}

const LIMIT = PERFORMANCE_LIMITS.MAX_DECOMPRESSED_FONT_SIZE;
const tooLarge = (format: string) => new Error(`${format} font would decompress to more than ${LIMIT / (1024 * 1024)}MB`);

async function decodeWoff2(bytes: Uint8Array): Promise<Uint8Array<ArrayBuffer>> {
  // A small WOFF2 file can expand a lot. Check the sizes it declares (the header
  // total and every table in its directory) before decompressing, and the real
  // output size after.
  if (declaredWoff2Size(bytes) > LIMIT) {
    throw tooLarge('WOFF2');
  }
  let sfnt: Uint8Array<ArrayBuffer>;
  try {
    sfnt = new Uint8Array(await wawoff2.decompress(bytes));
  } catch (error) {
    throw new Error(`Invalid WOFF2 font data: ${error instanceof Error ? error.message : 'decompression failed'}`);
  }
  if (sfnt.length > LIMIT) {
    throw tooLarge('WOFF2');
  }
  return sfnt;
}

/**
 * Rebuilds the sfnt from a WOFF 1.0 file: each table is stored as is or
 * zlib-compressed, and is inflated to no more than the length it declares.
 */
function decodeWoff(bytes: Uint8Array): Uint8Array<ArrayBuffer> {
  const invalid = (reason: string) => new Error(`Invalid WOFF font data: ${reason}`);
  if (bytes.length < 44) {
    throw invalid('header is truncated');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const numTables = view.getUint16(12);
  if (44 + numTables * 20 > bytes.length) {
    throw invalid('table directory is truncated');
  }
  // Plain arithmetic: `(n + 3) & ~3` is 32-bit and wraps for lengths near 2^32
  const pad4 = (n: number) => Math.ceil(n / 4) * 4;
  const tables = Array.from({ length: numTables }, (_, i) => {
    const entry = 44 + i * 20;
    return {
      tag: bytes.subarray(entry, entry + 4),
      offset: view.getUint32(entry + 4),
      compLength: view.getUint32(entry + 8),
      origLength: view.getUint32(entry + 12),
      checksum: view.getUint32(entry + 16)
    };
  });
  const headerSize = 12 + numTables * 16;
  const total = tables.reduce((sum, table) => sum + pad4(table.origLength), headerSize);
  if (total > LIMIT || tables.some(table => table.origLength > LIMIT)) {
    throw tooLarge('WOFF');
  }

  const sfnt = new Uint8Array(total);
  const out = new DataView(sfnt.buffer);
  out.setUint32(0, view.getUint32(4)); // flavor
  out.setUint16(4, numTables);
  const entrySelector = numTables > 0 ? Math.floor(Math.log2(numTables)) : 0;
  out.setUint16(6, 16 * 2 ** entrySelector);
  out.setUint16(8, entrySelector);
  out.setUint16(10, numTables * 16 - 16 * 2 ** entrySelector);

  let offset = headerSize;
  tables.forEach((table, i) => {
    if (table.offset + table.compLength > bytes.length) {
      throw invalid('a table extends past the end of the file');
    }
    if (table.compLength > table.origLength) {
      throw invalid('a table is stored larger than its uncompressed length');
    }
    const stored = bytes.subarray(table.offset, table.offset + table.compLength);
    let data: Uint8Array = stored;
    if (table.compLength < table.origLength) {
      try {
        data = zlib.inflateSync(stored, { maxOutputLength: Math.min(table.origLength, LIMIT) });
      } catch (error) {
        throw invalid(error instanceof Error ? error.message : 'a table failed to decompress');
      }
    }
    if (data.length !== table.origLength) {
      throw invalid('a table decompressed to the wrong length');
    }
    const record = 12 + i * 16;
    sfnt.set(table.tag, record);
    out.setUint32(record + 4, table.checksum);
    out.setUint32(record + 8, offset);
    out.setUint32(record + 12, table.origLength);
    sfnt.set(data, offset);
    offset += pad4(table.origLength);
  });
  return sfnt;
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
