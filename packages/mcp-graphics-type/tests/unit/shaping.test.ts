import { describe, test, expect } from '@jest/globals';
import { measureTextTool } from '../../src/tools/measureText.js';
import { shapeTextTool } from '../../src/tools/shapeText.js';
import { toSfnt } from '../../src/util/parseFont.js';
import { parseKernTable } from '../../src/util/shaping.js';
import { buildShapingFont, buildTestFont, toBuffer, toWoff } from '../fixtures/buildTestFont.js';

type ToolResult = { content: { text: string }[]; isError?: boolean };
type Glyph = { glyphId: number; name?: string; cluster: number; codepoint: number; advance: { x: number; y: number } };

const resultOf = (response: unknown) => JSON.parse((response as ToolResult).content[0].text);
const asInput = (font: Buffer) => ({ type: 'buffer', data: font.toString('base64') });
const font = asInput(buildShapingFont());

const shape = async (text: string, options: Record<string, unknown> = {}, input: unknown = font) => {
  const response = await shapeTextTool.invoke({ text, font: input, options: { fontSize: 1000, ...options } }) as ToolResult;
  expect(response.isError).toBeUndefined();
  return resultOf(response).shapedText as {
    glyphs: Glyph[];
    advance: { x: number; y: number };
    clusters: number[];
    direction: string;
    script: string;
    runs: Array<{ start: number; end: number; direction: string; script: string }>;
  };
};
const names = (glyphs: Glyph[]) => glyphs.map(glyph => glyph.name);

describe('type.shapeText shapes with HarfBuzz', () => {
  test('applies ligatures, and not with liga: false', async () => {
    const ligated = await shape('fi');
    expect(names(ligated.glyphs)).toEqual(['f_i']);
    expect(ligated.glyphs[0]).toMatchObject({ cluster: 0, codepoint: 0x66 });
    expect(ligated.advance.x).toBe(900);

    const plain = await shape('fi', { features: { liga: false } });
    expect(names(plain.glyphs)).toEqual(['f', 'i']);
    expect(plain.advance.x).toBe(1200);
  });

  test('picks Arabic joining forms and returns the glyphs in visual order', async () => {
    const shaped = await shape('ببب');
    expect(names(shaped.glyphs)).toEqual(['beh.fina', 'beh.medi', 'beh.init']);
    expect(shaped.clusters).toEqual([2, 1, 0]);
    expect(shaped.direction).toBe('rtl');
    expect(shaped.advance.x).toBe(1560);
  });

  test('reorders mixed-direction text with the bidi algorithm', async () => {
    const ltr = await shape('fi بب');
    expect(ltr.direction).toBe('ltr');
    expect(names(ltr.glyphs)).toEqual(['f_i', 'space', 'beh.fina', 'beh.init']);
    expect(ltr.clusters).toEqual([0, 2, 4, 3]);

    const rtl = await shape('بب fi');
    expect(rtl.direction).toBe('rtl');
    expect(names(rtl.glyphs)).toEqual(['f_i', 'space', 'beh.fina', 'beh.init']);
    expect(rtl.clusters).toEqual([3, 2, 1, 0]);
    expect(rtl.runs.map(run => [run.start, run.end, run.direction, run.script])).toEqual([
      [0, 3, 'rtl', 'Arab'],
      [3, 5, 'ltr', 'Latn']
    ]);
  });

  test('a forced direction sets the paragraph direction', async () => {
    const shaped = await shape('fi ب', { direction: 'rtl' });
    expect(shaped.direction).toBe('rtl');
    expect(names(shaped.glyphs)).toEqual(['beh', 'space', 'f_i']);
  });

  test('splits runs by script, so script-specific features apply to each run', async () => {
    const shaped = await shape('Жfi');
    expect(names(shaped.glyphs)).toEqual(['Zhe', 'f_i']);
    expect(shaped.runs.map(run => run.script)).toEqual(['Cyrl', 'Latn']);
  });

  test('a forced script is used for the whole text', async () => {
    const shaped = await shape('Жfi', { script: 'cyrl' });
    expect(names(shaped.glyphs)).toEqual(['Zhe', 'f', 'i']);
    expect(shaped.script).toBe('cyrl');
  });

  test('adds letter and word spacing after shaping', async () => {
    const shaped = await shape('fi fi', { letterSpacing: 10, wordSpacing: 100 });
    expect(shaped.glyphs.map(glyph => glyph.advance.x)).toEqual([910, 360, 910]);
  });

  test('scales advances to the font size', async () => {
    const shaped = await shape('fi', { fontSize: 20 });
    expect(shaped.advance.x).toBeCloseTo(18, 10);
  });

  test('shapes vertical text along y', async () => {
    const shaped = await shape('fi', { direction: 'ttb', features: { liga: false } });
    expect(shaped.direction).toBe('ttb');
    expect(shaped.advance.x).toBe(0);
    expect(shaped.advance.y).toBeLessThan(0);
  });

  test('reads WOFF fonts', async () => {
    const shaped = await shape('fi', {}, asInput(toWoff(buildShapingFont())));
    expect(names(shaped.glyphs)).toEqual(['f_i']);
  });

  test('rejects a feature tag that is not four characters', async () => {
    const response = await shapeTextTool.invoke({ text: 'fi', font, options: { features: { ligature: true } } }) as ToolResult;
    expect(response.isError).toBe(true);
  });

  test.each(['en-US', 'zh-Hant-TW', 'sr-Latn'])('accepts the BCP 47 language tag %p', async language => {
    const response = await shapeTextTool.invoke({ text: 'fi', font, options: { script: 'latn', language } }) as ToolResult;
    expect(response.isError).toBeUndefined();
    expect(resultOf(response).shapedText.language).toBe(language);
  });

  test.each(['e', 'en_US', 'en-', 'x'.repeat(40)])('rejects the malformed language tag %p, with or without a script', async language => {
    for (const options of [{ language }, { script: 'latn', language }]) {
      const response = await shapeTextTool.invoke({ text: 'fi', font, options }) as ToolResult;
      expect(response.isError).toBe(true);
    }
  });

  test('rejects a script that is not four letters, with or without a language', async () => {
    for (const options of [{ script: 'lat' }, { script: 'lat1', language: 'en' }]) {
      const response = await shapeTextTool.invoke({ text: 'fi', font, options }) as ToolResult;
      expect(response.isError).toBe(true);
    }
  });
});

describe('type.measureText measures shaped text', () => {
  const measure = async (text: string, options: Record<string, unknown> = {}, input: unknown = font) => {
    const response = await measureTextTool.invoke({ text, font: input, fontSize: 1000, options }) as ToolResult;
    expect(response.isError).toBeUndefined();
    return resultOf(response).metrics;
  };

  test('measures ligatures as one glyph', async () => {
    const metrics = await measure('fi', { includeCharacterMetrics: true });
    expect(metrics.width).toBe(900);
    expect(metrics.advances).toEqual([900]);
    expect(metrics.characterMetrics).toEqual([expect.objectContaining({
      char: 'fi',
      advance: 900,
      leftSideBearing: 50,
      rightSideBearing: 450,
      bbox: { xMin: 50, yMin: 0, xMax: 450, yMax: 700 }
    })]);
  });

  test('measures Arabic with its joining forms', async () => {
    const metrics = await measure('ببب');
    expect(metrics.width).toBe(1560);
    expect(metrics.actualBoundingBoxRight).toBe(530 + 520 + 450);
  });

  test('reads WOFF fonts', async () => {
    const metrics = await measure('AB', {}, asInput(toWoff(toBuffer(buildTestFont()))));
    expect(metrics.width).toBe(1200);
  });
});

describe('font tables are bounded before they are decoded', () => {
  test('a WOFF table length near 2^32 is rejected without inflating', async () => {
    const woff = toWoff(buildShapingFont());
    woff.writeUInt32BE(0xfffffffd, 44 + 12); // first table's origLength
    const started = performance.now();
    await expect(toSfnt(woff)).rejects.toThrow(/decompress to more than/);
    expect(performance.now() - started).toBeLessThan(500);
  });

  test('overlapping kern subtables are not read past their own length', () => {
    // 2000 subtables of length 6 that each claim 65535 pairs, all of which lie inside the table
    const table = Buffer.alloc(4 + 2000 * 6 + 8 + 65535 * 6, 0xff);
    table.writeUInt16BE(0, 0);
    table.writeUInt16BE(2000, 2);
    for (let i = 0; i < 2000; i++) {
      const offset = 4 + i * 6;
      table.writeUInt16BE(6, offset + 2);
      table.writeUInt16BE(0x0001, offset + 4);
    }
    const started = performance.now();
    parseKernTable(new Uint8Array(table));
    expect(performance.now() - started).toBeLessThan(500);
  });

  test('a well-formed kern subtable still gives its pairs', () => {
    const table = Buffer.alloc(4 + 14 + 6);
    table.writeUInt16BE(1, 2);
    table.writeUInt16BE(14 + 6, 6);
    table.writeUInt16BE(0x0001, 8);
    table.writeUInt16BE(1, 10);
    table.writeUInt16BE(3, 18);
    table.writeUInt16BE(4, 20);
    table.writeInt16BE(-80, 22);
    expect([...parseKernTable(new Uint8Array(table))!]).toEqual([[3 * 0x10000 + 4, -80]]);
  });
});
