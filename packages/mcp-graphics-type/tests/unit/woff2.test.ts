import { describe, test, expect, beforeAll } from '@jest/globals';
import wawoff2 from 'wawoff2';
import { loadFontTool } from '../../src/tools/loadFont.js';
import { measureTextTool } from '../../src/tools/measureText.js';
import { shapeTextTool } from '../../src/tools/shapeText.js';
import { validateFontTool } from '../../src/tools/validateFont.js';
import { generateFallbackTool } from '../../src/tools/generateFallback.js';
import { buildTestFont, toBuffer } from '../fixtures/buildTestFont.js';
import { parseFont } from '../../src/util/parseFont.js';
import { PERFORMANCE_LIMITS } from '../../src/types/typography.js';

type ToolResult = { content: { text: string }[]; isError?: boolean };
const resultOf = (response: unknown) => JSON.parse((response as ToolResult).content[0].text);
const asInput = (font: Buffer) => ({ type: 'buffer', data: font.toString('base64') });

describe('WOFF2 fonts are decompressed before parsing', () => {
  let woff2: Buffer;

  beforeAll(async () => {
    woff2 = Buffer.from(await wawoff2.compress(toBuffer(buildTestFont())));
    expect(woff2.toString('latin1', 0, 4)).toBe('wOF2');
  });

  test('type.loadFont reads a WOFF2 font and reports its format', async () => {
    const result = resultOf(await loadFontTool.invoke(asInput(woff2)));
    expect(result.error).toBeUndefined();
    expect(result.font.family).toBe('Test Font');
    expect(result.font.format).toBe('woff2');
    expect(result.font.fileSize).toBe(woff2.length);
  });

  test('type.measureText and type.shapeText measure a WOFF2 font', async () => {
    const measured = resultOf(await measureTextTool.invoke({ text: 'AB', font: asInput(woff2), fontSize: 1000 }));
    expect(measured.metrics.width).toBeCloseTo(1200, 5);
    const shaped = resultOf(await shapeTextTool.invoke({ text: 'AB', font: asInput(woff2), options: { fontSize: 1000 } }));
    expect(shaped.shapedText.advance.x).toBeCloseTo(1200, 5);
  });

  test('type.validateFont and type.generateFallback accept a WOFF2 font', async () => {
    const validated = resultOf(await validateFontTool.invoke({ font: asInput(woff2) }));
    expect(validated.error).toBeUndefined();
    expect(validated.validation.isValid).toBe(true);
    const fallback = resultOf(await generateFallbackTool.invoke({ primaryFont: asInput(woff2) }));
    expect(fallback.error).toBeUndefined();
  });

  test('a WOFF2 file that claims to decompress past the size limit is rejected before decompressing', async () => {
    const bomb = Buffer.from(woff2);
    bomb.writeUInt32BE(0xffffffff, 16); // totalSfntSize
    const response = await loadFontTool.invoke(asInput(bomb)) as ToolResult;
    expect(response.isError).toBe(true);
    expect(resultOf(response).message).toMatch(/decompress to more than/);
  });

  test('table sizes in the WOFF2 directory are checked, not just the header total', async () => {
    // Header says 1000 bytes; the one table (cmap, untransformed) says 2GB
    const header = Buffer.alloc(48);
    header.write('wOF2', 0, 'latin1');
    header.writeUInt32BE(0x00010000, 4); // flavor
    header.writeUInt16BE(1, 12); // numTables
    header.writeUInt32BE(1000, 16); // totalSfntSize
    const entry = Buffer.from([0x00, 0x87, 0xff, 0xff, 0xff, 0x7f]); // flags, origLength (UIntBase128)
    const bomb = Buffer.concat([header, entry, Buffer.alloc(64)]);
    header.writeUInt32BE(bomb.length, 8);
    await expect(parseFont(bomb)).rejects.toThrow(/decompress to more than/);
  });

  test('parseFont applies the file size limit to every tool', async () => {
    const huge = Buffer.alloc(PERFORMANCE_LIMITS.MAX_FONT_FILE_SIZE + 1);
    toBuffer(buildTestFont()).copy(huge);
    await expect(parseFont(huge)).rejects.toThrow(/too large/);
  });

  test('a corrupt WOFF2 file is reported as an error', async () => {
    const corrupt = Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(200, 7)]);
    const response = await loadFontTool.invoke(asInput(corrupt)) as ToolResult;
    expect(response.isError).toBe(true);
    expect(resultOf(response).message).toMatch(/WOFF2/);
  });
});
