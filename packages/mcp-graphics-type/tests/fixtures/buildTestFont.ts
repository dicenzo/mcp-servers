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
