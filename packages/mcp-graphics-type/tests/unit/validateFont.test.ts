import { describe, test, expect } from '@jest/globals';
import wawoff2 from 'wawoff2';
import { validateFontTool } from '../../src/tools/validateFont.js';
import { buildTestFont, toBuffer, toWoff } from '../fixtures/buildTestFont.js';

type ToolResult = { content: { text: string }[]; isError?: boolean };
type Report = {
  isValid: boolean;
  format: string;
  errors: Array<{ code: string; message: string; severity: string }>;
  compatibility: { webBrowsers: Record<string, boolean>; unicodeSupport: { supportedBlocks: string[] } };
};

const asInput = (font: Buffer) => ({ type: 'buffer', data: font.toString('base64') });
const validate = async (font: Buffer, options?: Record<string, unknown>) => {
  const response = await validateFontTool.invoke({ font: asInput(font), ...(options && { options }) }) as ToolResult;
  expect(response.isError).toBeUndefined();
  return JSON.parse(response.content[0].text).validation as Report;
};
const codes = (report: Report) => report.errors.map(error => error.code);

/** Renames a table in the sfnt directory, so the font no longer has it */
const renameTable = (sfnt: Buffer, from: string, to: string) => {
  const copy = Buffer.from(sfnt);
  const numTables = copy.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    if (copy.toString('latin1', record, record + 4) === from) {
      copy.write(to, record, 'latin1');
      return copy;
    }
  }
  throw new Error(`No ${from} table`);
};

describe('type.validateFont required tables', () => {
  const sfnt = toBuffer(buildTestFont());

  test('a well-formed font is valid', async () => {
    const report = await validate(sfnt);
    expect(report.errors).toEqual([]);
    expect(report.isValid).toBe(true);
    expect(report.format).toBe('otf');
  });

  test.each([
    ['WOFF', () => toWoff(sfnt), 'woff'],
    ['WOFF2', async () => Buffer.from(await wawoff2.compress(sfnt)), 'woff2']
  ])('a well-formed %s font is valid', async (_name, encode, format) => {
    const report = await validate(await encode());
    expect(report.errors).toEqual([]);
    expect(report.isValid).toBe(true);
    expect(report.format).toBe(format);
  });

  test('a font missing a required table is invalid, and the table is named by its tag', async () => {
    const report = await validate(renameTable(sfnt, 'post', 'zzzz'));
    expect(report.isValid).toBe(false);
    expect(report.errors).toEqual([expect.objectContaining({ code: 'MISSING_REQUIRED_TABLE', message: 'Missing required table: post' })]);
  });
});

describe('type.validateFont options', () => {
  test('leaving out options runs the checks that default to on', async () => {
    const withDefaults = await validate(toBuffer(buildTestFont()));
    const explicit = await validate(toBuffer(buildTestFont()), { checkCompatibility: true });
    expect(Object.keys(withDefaults.compatibility.webBrowsers).length).toBeGreaterThan(0);
    expect(withDefaults.compatibility).toEqual(explicit.compatibility);
  });
});

describe('type.validateFont files it cannot read', () => {
  test('an empty file is reported as empty', async () => {
    const report = await validate(Buffer.alloc(0));
    expect(report.isValid).toBe(false);
    expect(report.errors).toEqual([expect.objectContaining({ code: 'FONT_LOAD_FAILED', message: 'Empty font file' })]);
  });

  test('bytes that are not a font get format "unknown" and an unsupported-format error', async () => {
    const report = await validate(Buffer.from('this is not a font at all'));
    expect(report.isValid).toBe(false);
    expect(report.format).toBe('unknown');
    expect(codes(report)).toEqual(['UNSUPPORTED_FORMAT']);
  });

  test('a font collection is reported as unsupported, not as a broken font', async () => {
    const collection = Buffer.alloc(16);
    collection.write('ttcf', 0, 'latin1');
    collection.writeUInt32BE(0x00010000, 4);
    collection.writeUInt32BE(1, 8);
    collection.writeUInt32BE(16, 12);
    const report = await validate(collection);
    expect(report.format).toBe('ttc');
    expect(codes(report)).toEqual(['UNSUPPORTED_FORMAT']);
    expect(report.errors[0].message).toMatch(/collection/);
  });
});
