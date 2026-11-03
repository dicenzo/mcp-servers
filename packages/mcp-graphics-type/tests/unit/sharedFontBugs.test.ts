import { describe, test, expect } from '@jest/globals';
import { loadFontTool } from '../../src/tools/loadFont.js';
import { measureTextTool } from '../../src/tools/measureText.js';
import { shapeTextTool } from '../../src/tools/shapeText.js';
import { buildTestFont, toBuffer, withTable, kernTable } from '../fixtures/buildTestFont.js';
import * as opentypeModule from 'opentype.js';

const opentype = ((opentypeModule as any).default ?? opentypeModule) as any;

type ToolResult = { content: { text: string }[]; isError?: boolean };
const resultOf = (response: unknown) => JSON.parse((response as ToolResult).content[0].text);
const asInput = (font: Buffer) => ({ type: 'buffer', data: font.toString('base64') });

/** Returns the offset of a table in an sfnt, or throws if it isn't there. */
function tableOffset(sfnt: Buffer, tag: string): number {
  const numTables = sfnt.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    if (sfnt.toString('ascii', record, record + 4) === tag) {
      return sfnt.readUInt32BE(record + 8);
    }
  }
  throw new Error(`No ${tag} table`);
}

/** The test font with hhea.lineGap set (opentype.js always writes 0). */
function fontWithLineGap(lineGap: number): Buffer {
  const font = toBuffer(buildTestFont());
  font.writeInt16BE(lineGap, tableOffset(font, 'hhea') + 8);
  return font;
}

describe('lineGap is read from the font', () => {
  test('type.loadFont reports hhea.lineGap', async () => {
    const result = resultOf(await loadFontTool.invoke(asInput(fontWithLineGap(90))));
    expect(result.font.lineGap).toBe(90);
  });

  test('type.measureText includes the line gap in lineHeight', async () => {
    // ascender 800, descender -200, lineGap 90, at 1px per unit
    const result = resultOf(await measureTextTool.invoke({
      text: 'A', font: asInput(fontWithLineGap(90)), fontSize: 1000
    }));
    expect(result.metrics.lineHeight).toBeCloseTo(1090, 5);
  });
});

/** The test font (600-unit advances) with A/V kerned by -100 units. */
function kernedFont(): Buffer {
  const font = toBuffer(buildTestFont());
  const parsed = opentype.parse(new Uint8Array(font).buffer);
  const index = (char: string) => parsed.charToGlyph(char).index;
  return withTable(font, 'kern', kernTable([[index('A'), index('V'), -100]]));
}

describe('kerning', () => {
  test('type.measureText applies kerning between glyphs', async () => {
    const result = resultOf(await measureTextTool.invoke({ text: 'AV', font: asInput(kernedFont()), fontSize: 1000 }));
    expect(result.metrics.width).toBeCloseTo(1100, 5);
    expect(result.metrics.advances).toEqual([500, 600]);
  });

  test('type.shapeText kerns by default and not with kern: false', async () => {
    const shape = async (features?: Record<string, boolean>) => resultOf(await shapeTextTool.invoke({
      text: 'AVA', font: asInput(kernedFont()), options: { fontSize: 1000, ...(features ? { features } : {}) }
    })).shapedText;
    const kerned = await shape();
    expect(kerned.advance.x).toBeCloseTo(1700, 5);
    expect(kerned.glyphs.map((g: { advance: { x: number } }) => g.advance.x)).toEqual([500, 600, 600]);
    expect((await shape({ kern: false })).advance.x).toBeCloseTo(1800, 5);
  });
});

describe('astral characters are one character, not two surrogates', () => {
  const emoji = 'A\u{1F600}B';

  test('type.measureText gives one advance per code point', async () => {
    const result = resultOf(await measureTextTool.invoke({
      text: emoji, font: asInput(toBuffer(buildTestFont())), fontSize: 1000, options: { includeCharacterMetrics: true }
    }));
    expect(result.metrics.advances).toHaveLength(3);
    expect(result.metrics.characterMetrics.map((m: { char: string }) => m.char)).toEqual(['A', '\u{1F600}', 'B']);
  });

  test('type.shapeText gives one glyph per code point, with UTF-16 cluster offsets', async () => {
    const result = resultOf(await shapeTextTool.invoke({ text: emoji, font: asInput(toBuffer(buildTestFont())) }));
    const glyphs = result.shapedText.glyphs as { codepoint: number; cluster: number }[];
    expect(glyphs.map(g => g.codepoint)).toEqual([0x41, 0x1f600, 0x42]);
    expect(glyphs.map(g => g.cluster)).toEqual([0, 1, 3]);
    expect(result.shapedText.clusters).toEqual([0, 1, 3]);
  });
});
