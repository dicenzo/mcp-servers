import * as zlib from 'zlib';
import * as opentypeModule from 'opentype.js';

// src/types/opentype.d.ts only declares the parsing API the tools use; the
// Font/Glyph/Path constructors needed to build a font are untyped there.
const opentype = ((opentypeModule as any).default ?? opentypeModule) as any;

/**
 * Builds a small, real font in memory so tests never depend on fonts installed on
 * the machine or on third-party font files. Every glyph is a simple box.
 *
 * Family "Test Font", style "Regular" unless other names are given, glyphs for ".notdef", space, A-Z, a-z, 0-9.
 * opentype.js writes CFF outlines, so the output is an OpenType ("OTTO") font.
 */
export function buildTestFont(names: { familyName?: string; styleName?: string; postScriptName?: string } = {}): ArrayBuffer {
  const unitsPerEm = 1000;
  const advanceWidth = 600;

  const box = (x1: number, y1: number, x2: number, y2: number) => {
    const p = new opentype.Path();
    p.moveTo(x1, y1);
    p.lineTo(x2, y1);
    p.lineTo(x2, y2);
    p.lineTo(x1, y2);
    p.close();
    return p;
  };

  const glyphs: unknown[] = [
    new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth, path: box(50, 0, 550, 700) }),
    new opentype.Glyph({ name: 'space', unicode: 32, advanceWidth: 250, path: new opentype.Path() })
  ];

  const ranges: Array<[string, string]> = [['A', 'Z'], ['a', 'z'], ['0', '9']];
  for (const [first, last] of ranges) {
    for (let code = first.charCodeAt(0); code <= last.charCodeAt(0); code++) {
      const ch = String.fromCharCode(code);
      const top = ch >= 'a' && ch <= 'z' ? 500 : 700;
      glyphs.push(new opentype.Glyph({
        name: /[0-9]/.test(ch) ? `digit${ch}` : ch,
        unicode: code,
        advanceWidth,
        path: box(50, 0, 550, top)
      }));
    }
  }

  const font = new opentype.Font({
    familyName: names.familyName ?? 'Test Font',
    styleName: names.styleName ?? 'Regular',
    ...(names.postScriptName && { postScriptName: names.postScriptName }),
    unitsPerEm,
    ascender: 800,
    descender: -200,
    glyphs
  });

  return font.toArrayBuffer();
}

/** Copies a buffer into a standalone ArrayBuffer (no shared pool, offset 0). */
export function toBuffer(arrayBuffer: ArrayBuffer): Buffer {
  return Buffer.from(new Uint8Array(arrayBuffer));
}

/**
 * Returns a copy of an sfnt with one more table added (or replaced). Offsets are
 * rebuilt; checksums are left at 0 because nothing in the package verifies them.
 */
export function withTable(sfnt: Buffer, tag: string, data: Buffer): Buffer {
  const pad4 = (n: number) => (n + 3) & ~3;
  const tables = new Map<string, Buffer>();
  for (let i = 0; i < sfnt.readUInt16BE(4); i++) {
    const record = 12 + i * 16;
    const offset = sfnt.readUInt32BE(record + 8);
    tables.set(sfnt.toString('ascii', record, record + 4), sfnt.subarray(offset, offset + sfnt.readUInt32BE(record + 12)));
  }
  tables.set(tag, data);
  const tags = [...tables.keys()].sort();
  const headerSize = 12 + tags.length * 16;
  const out = Buffer.alloc(headerSize + tags.reduce((sum, t) => sum + pad4(tables.get(t)!.length), 0));
  sfnt.copy(out, 0, 0, 4);
  out.writeUInt16BE(tags.length, 4);
  let offset = headerSize;
  tags.forEach((t, i) => {
    const record = 12 + i * 16;
    const table = tables.get(t)!;
    out.write(t, record, 'ascii');
    out.writeUInt32BE(offset, record + 8);
    out.writeUInt32BE(table.length, record + 12);
    table.copy(out, offset);
    offset += pad4(table.length);
  });
  return out;
}

/** A version-0 `kern` table with one horizontal subtable of the given glyph-index pairs. */
export function kernTable(pairs: Array<[left: number, right: number, value: number]>): Buffer {
  const sorted = [...pairs].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const table = Buffer.alloc(4 + 14 + sorted.length * 6);
  table.writeUInt16BE(0, 0); // version
  table.writeUInt16BE(1, 2); // nTables
  table.writeUInt16BE(0, 4); // subtable version
  table.writeUInt16BE(14 + sorted.length * 6, 6); // subtable length
  table.writeUInt16BE(0x0001, 8); // coverage: horizontal, format 0
  table.writeUInt16BE(sorted.length, 10); // nPairs; searchRange etc. are unused by opentype.js
  sorted.forEach(([left, right, value], i) => {
    const pair = 18 + i * 6;
    table.writeUInt16BE(left, pair);
    table.writeUInt16BE(right, pair + 2);
    table.writeInt16BE(value, pair + 4);
  });
  return table;
}

/** Packs sfnt fonts into a TrueType Collection (`ttcf` 1.0); tables are not shared. */
export function buildCollection(fonts: Buffer[]): Buffer {
  const pad4 = (n: number) => (n + 3) & ~3;
  const parts: Buffer[] = [];
  const headerSize = 12 + fonts.length * 4;
  const directories = fonts.map(font => 12 + font.readUInt16BE(4) * 16);
  let tableOffset = headerSize + directories.reduce((sum, size) => sum + size, 0);

  const header = Buffer.alloc(headerSize);
  header.write('ttcf', 0, 'ascii');
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt32BE(fonts.length, 8);
  parts.push(header);

  const tableData: Buffer[] = [];
  let directoryOffset = headerSize;
  fonts.forEach((font, i) => {
    header.writeUInt32BE(directoryOffset, 12 + i * 4);
    const directory = Buffer.from(font.subarray(0, directories[i]));
    for (let t = 0; t < font.readUInt16BE(4); t++) {
      const record = 12 + t * 16;
      const offset = font.readUInt32BE(record + 8);
      const length = font.readUInt32BE(record + 12);
      directory.writeUInt32BE(tableOffset, record + 8);
      const table = Buffer.alloc(pad4(length));
      font.copy(table, 0, offset, offset + length);
      tableData.push(table);
      tableOffset += table.length;
    }
    parts.push(directory);
    directoryOffset += directory.length;
  });
  return Buffer.concat([...parts, ...tableData]);
}

/**
 * A font for shaping tests (1000 units per em). Every glyph is a box; advances
 * tell the glyphs apart:
 * - Latin `f` and `i` (600 each) with an `f_i` ligature (900), registered for the
 *   `latn` script only, so it applies to text HarfBuzz shapes as Latin.
 * - Cyrillic `Ж` (700) and space (250).
 * - Arabic beh (U+0628, 500) with initial (510), medial (520) and final (530)
 *   forms in `init`, `medi` and `fina` under the `arab` script.
 */
export function buildShapingFont(): Buffer {
  const box = (top: number) => {
    const p = new opentype.Path();
    p.moveTo(50, 0);
    p.lineTo(450, 0);
    p.lineTo(450, top);
    p.lineTo(50, top);
    p.close();
    return p;
  };
  const glyph = (name: string, advanceWidth: number, unicode?: number) =>
    new opentype.Glyph({ name, unicode, advanceWidth, path: name === 'space' ? new opentype.Path() : box(700) });
  const glyphs = [
    glyph('.notdef', 600, 0),
    glyph('space', 250, 32),
    glyph('f', 600, 0x66),
    glyph('i', 600, 0x69),
    glyph('f_i', 900),
    glyph('Zhe', 700, 0x416),
    glyph('beh', 500, 0x628),
    glyph('beh.init', 510),
    glyph('beh.medi', 520),
    glyph('beh.fina', 530)
  ];
  const font = new opentype.Font({
    familyName: 'Shaping Test',
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs
  });
  // opentype.js wants features added in alphabetical order
  font.substitution.addSingle('fina', { sub: 6, by: 9 }, 'arab', 'dflt');
  font.substitution.addSingle('init', { sub: 6, by: 7 }, 'arab', 'dflt');
  font.substitution.add('liga', { sub: [2, 3], by: 4 }, 'latn', 'dflt');
  font.substitution.addSingle('medi', { sub: 6, by: 8 }, 'arab', 'dflt');
  return toBuffer(font.toArrayBuffer());
}

/** Wraps an sfnt in WOFF 1.0, zlib-compressing each table that compression makes smaller. */
export function toWoff(sfnt: Buffer): Buffer {
  const pad4 = (n: number) => (n + 3) & ~3;
  const numTables = sfnt.readUInt16BE(4);
  const tables = Array.from({ length: numTables }, (_, i) => {
    const record = 12 + i * 16;
    const offset = sfnt.readUInt32BE(record + 8);
    const data = sfnt.subarray(offset, offset + sfnt.readUInt32BE(record + 12));
    const deflated = zlib.deflateSync(data);
    return { tag: sfnt.toString('ascii', record, record + 4), checksum: sfnt.readUInt32BE(record + 4), data, compressed: deflated.length < data.length ? deflated : data };
  });
  const headerSize = 44 + numTables * 20;
  const out = Buffer.alloc(headerSize + tables.reduce((sum, t) => sum + pad4(t.compressed.length), 0));
  out.write('wOFF', 0, 'ascii');
  sfnt.copy(out, 4, 0, 4); // flavor
  out.writeUInt32BE(out.length, 8);
  out.writeUInt16BE(numTables, 12);
  out.writeUInt32BE(12 + numTables * 16 + tables.reduce((sum, t) => sum + pad4(t.data.length), 0), 16);
  let offset = headerSize;
  tables.forEach((t, i) => {
    const entry = 44 + i * 20;
    out.write(t.tag, entry, 'ascii');
    out.writeUInt32BE(offset, entry + 4);
    out.writeUInt32BE(t.compressed.length, entry + 8);
    out.writeUInt32BE(t.data.length, entry + 12);
    out.writeUInt32BE(t.checksum, entry + 16);
    t.compressed.copy(out, offset);
    offset += pad4(t.compressed.length);
  });
  return out;
}
