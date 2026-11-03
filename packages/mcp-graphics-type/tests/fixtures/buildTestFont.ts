import * as opentypeModule from 'opentype.js';

// src/types/opentype.d.ts only declares the parsing API the tools use; the
// Font/Glyph/Path constructors needed to build a font are untyped there.
const opentype = ((opentypeModule as any).default ?? opentypeModule) as any;

/**
 * Builds a small, real font in memory so tests never depend on fonts installed on
 * the machine or on third-party font files. Every glyph is a simple box.
 *
 * Family "Test Font", style "Regular", glyphs for ".notdef", space, A-Z, a-z, 0-9.
 * opentype.js writes CFF outlines, so the output is an OpenType ("OTTO") font.
 */
export function buildTestFont(): ArrayBuffer {
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
    familyName: 'Test Font',
    styleName: 'Regular',
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
