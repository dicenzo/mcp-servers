import { describe, test, expect } from '@jest/globals';
import * as opentypeModule from 'opentype.js';
import { validateFontTool } from '../../src/tools/validateFont.js';
import { generateFallbackTool } from '../../src/tools/generateFallback.js';
import { buildTestFont, toBuffer } from '../fixtures/buildTestFont.js';

// src/types/opentype.d.ts only declares the parsing API the tools use; the
// Font/Glyph/Path constructors used here are untyped there.
const opentype = ((opentypeModule as any).default ?? opentypeModule) as any;

const WOFF_ADVICE = 'Consider using WOFF/WOFF2 compression for web deployment';

/** An OTF over 100KB: many distinct, named glyphs. */
function buildLargeFont(): Buffer {
  const glyphs = [new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 600, path: new opentype.Path() })];
  for (let i = 0; i < 6000; i++) {
    const p = new opentype.Path();
    // A different outline per glyph so CFF can't share them
    p.moveTo(i % 97, 0);
    p.lineTo(500, i % 89);
    p.lineTo(400 + (i % 71), 700);
    p.lineTo(i % 53, 650);
    p.close();
    glyphs.push(new opentype.Glyph({ name: `glyph${i}`, unicode: 0x4e00 + i, advanceWidth: 600, path: p }));
  }
  const font = new opentype.Font({
    familyName: 'Large Test', styleName: 'Regular', unitsPerEm: 1000, ascender: 800, descender: -200, glyphs
  });
  return toBuffer(font.toArrayBuffer());
}

/**
 * Wraps an sfnt (OTF/TTF) in a WOFF 1.0 container, storing every table uncompressed
 * (allowed by the spec when compLength == origLength).
 */
function wrapAsWoff(sfnt: Buffer): Buffer {
  const numTables = sfnt.readUInt16BE(4);
  const pad4 = (n: number) => (n + 3) & ~3;
  const tables = Array.from({ length: numTables }, (_, i) => {
    const rec = 12 + i * 16;
    return {
      tag: sfnt.readUInt32BE(rec),
      checksum: sfnt.readUInt32BE(rec + 4),
      data: sfnt.subarray(sfnt.readUInt32BE(rec + 8), sfnt.readUInt32BE(rec + 8) + sfnt.readUInt32BE(rec + 12))
    };
  });
  const headerSize = 44 + numTables * 20;
  const total = headerSize + tables.reduce((sum, t) => sum + pad4(t.data.length), 0);
  const woff = Buffer.alloc(total);
  woff.write('wOFF', 0, 'ascii');
  woff.writeUInt32BE(sfnt.readUInt32BE(0), 4); // flavor
  woff.writeUInt32BE(total, 8);
  woff.writeUInt16BE(numTables, 12);
  woff.writeUInt32BE(12 + numTables * 16 + tables.reduce((sum, t) => sum + pad4(t.data.length), 0), 16);
  let offset = headerSize;
  tables.forEach((t, i) => {
    const dir = 44 + i * 20;
    woff.writeUInt32BE(t.tag, dir);
    woff.writeUInt32BE(offset, dir + 4);
    woff.writeUInt32BE(t.data.length, dir + 8); // compLength
    woff.writeUInt32BE(t.data.length, dir + 12); // origLength
    woff.writeUInt32BE(t.checksum, dir + 16);
    t.data.copy(woff, offset);
    offset += pad4(t.data.length);
  });
  return woff;
}

async function recommendationsFor(fontBuffer: Buffer): Promise<string[]> {
  const result = await validateFontTool.invoke({ font: { type: 'buffer', data: fontBuffer.toString('base64') } });
  return JSON.parse(result.content[0].text).validation.recommendations;
}

describe('validateFont WOFF recommendation', () => {
  const largeOtf = buildLargeFont();

  test('test fonts are over the 100KB threshold', () => {
    expect(largeOtf.length).toBeGreaterThan(100 * 1024);
  });

  test('recommends WOFF compression for a large uncompressed font', async () => {
    expect(await recommendationsFor(largeOtf)).toContain(WOFF_ADVICE);
  });

  test('does not recommend WOFF compression for a font that is already WOFF', async () => {
    expect(await recommendationsFor(wrapAsWoff(largeOtf))).not.toContain(WOFF_ADVICE);
  });
});

describe('generateFallback platform', () => {
  test('reports a platform when targetPlatforms is empty', async () => {
    const result = await generateFallbackTool.invoke({
      primaryFont: { type: 'buffer', data: toBuffer(buildTestFont()).toString('base64') },
      targetPlatforms: []
    });
    const response = JSON.parse(result.content[0].text);

    expect(response.fontStack.platform).toBe('web');
    expect(response.fontStack.fallbackStack.length).toBeGreaterThan(0);
  });
});
