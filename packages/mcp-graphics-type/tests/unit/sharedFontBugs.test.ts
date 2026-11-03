import { describe, test, expect } from '@jest/globals';
import { loadFontTool } from '../../src/tools/loadFont.js';
import { measureTextTool } from '../../src/tools/measureText.js';
import { buildTestFont, toBuffer } from '../fixtures/buildTestFont.js';

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
