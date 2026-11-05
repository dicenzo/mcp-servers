import { describe, test, expect } from '@jest/globals';
import wawoff2 from 'wawoff2';
import { validateFontTool } from '../../src/tools/validateFont.js';
import { buildTestFont, toBuffer, toWoff } from '../fixtures/buildTestFont.js';

type ToolResult = { content: { text: string }[]; isError?: boolean };
type Report = {
  isValid: boolean;
  format: string;
  errors: Array<{ code: string; message: string; severity: string }>;
  warnings: Array<{ code: string; message: string }>;
  metadata: {
    isWebOptimized: boolean;
    hasEmbeddingPermissions: boolean;
    embedding?: { fsType: number; usage: string; noSubsetting: boolean; bitmapOnly: boolean };
  };
  compatibility: {
    webBrowsers: Record<string, boolean>;
    operatingSystems: Record<string, boolean>;
    unicodeSupport: {
      version: string;
      supportedBlocks: string[];
      missingBlocks: string[];
      blocks: Array<{ name: string; covered: number; total: number; percent: number }>;
    };
  };
  recommendations: string[];
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

/** Byte offset of a table in an sfnt, from its directory record */
const tableOffset = (sfnt: Buffer, tag: string) => {
  const numTables = sfnt.readUInt16BE(4);
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    if (sfnt.toString('latin1', record, record + 4) === tag) {
      return sfnt.readUInt32BE(record + 8);
    }
  }
  throw new Error(`No ${tag} table`);
};

/** A copy of the fixture with OS/2 fsType set */
const withFsType = (fsType: number) => {
  const sfnt = Buffer.from(toBuffer(buildTestFont()));
  sfnt.writeUInt16BE(fsType, tableOffset(sfnt, 'OS/2') + 8);
  return sfnt;
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

describe('type.validateFont embedding permissions (OS/2 fsType bits)', () => {
  const warningCodes = (report: Report) => report.warnings.map(warning => warning.code).filter(code => code.startsWith('EMBEDDING_'));

  test.each([
    [0x0000, 'installable', true, []],
    [0x0002, 'restricted', false, ['EMBEDDING_RESTRICTED']],
    [0x0004, 'previewPrint', false, ['EMBEDDING_PREVIEW_PRINT']],
    [0x0008, 'editable', true, []],
    [0x0102, 'restricted', false, ['EMBEDDING_RESTRICTED', 'EMBEDDING_NO_SUBSETTING']],
    [0x0104, 'previewPrint', false, ['EMBEDDING_PREVIEW_PRINT', 'EMBEDDING_NO_SUBSETTING']],
    // Several usage bits: the least restrictive applies (OpenType OS/2 spec)
    [0x000C, 'editable', true, []],
    [0x0208, 'editable', true, ['EMBEDDING_BITMAP_ONLY']]
  ])('fsType %d', async (fsType, usage, permitted, expected) => {
    const report = await validate(withFsType(fsType as number));
    expect(report.metadata.embedding).toMatchObject({ fsType, usage });
    expect(report.metadata.hasEmbeddingPermissions).toBe(permitted);
    expect(warningCodes(report)).toEqual(expected);
  });
});

describe('type.validateFont Unicode coverage', () => {
  test('counts the code points the font maps in each block', async () => {
    const { unicodeSupport } = (await validate(toBuffer(buildTestFont()))).compatibility;
    // space, A-Z, a-z and 0-9 out of the 95 printable Basic Latin characters
    expect(unicodeSupport.blocks).toEqual([{ name: 'Basic Latin', covered: 63, total: 95, percent: 66.3 }]);
    expect(unicodeSupport.supportedBlocks).toEqual([]);
    expect(unicodeSupport.missingBlocks).toEqual(['Basic Latin']);
    expect(unicodeSupport.version).toBe('17.0.0');
  });
});

describe('type.validateFont compatibility', () => {
  test('modern browsers all load an OTF, and Internet Explorer is not listed', async () => {
    const report = await validate(toBuffer(buildTestFont()));
    expect(report.compatibility.webBrowsers).toEqual({ Chrome: true, Edge: true, Firefox: true, Safari: true });
    expect(report.recommendations.join(' ')).not.toMatch(/fallback formats/);
  });

  test('only the requested platforms are reported', async () => {
    const report = await validate(toBuffer(buildTestFont()), { targetPlatforms: ['macos', 'windows'] });
    expect(report.compatibility.webBrowsers).toEqual({});
    expect(report.compatibility.operatingSystems).toEqual({ macOS: true, Windows: true });
  });

  test('a WOFF2 loads in browsers but cannot be installed', async () => {
    const woff2 = Buffer.from(await wawoff2.compress(toBuffer(buildTestFont())));
    const report = await validate(woff2, { targetPlatforms: ['web', 'macos'] });
    expect(report.compatibility.webBrowsers.Safari).toBe(true);
    expect(report.compatibility.operatingSystems).toEqual({ macOS: false });
  });

  test('an OpenType-SVG colour font is flagged for Chrome and Edge', async () => {
    const report = await validate(renameTable(toBuffer(buildTestFont()), 'post', 'SVG ').subarray(0));
    expect(report.compatibility.webBrowsers).toMatchObject({ Chrome: false, Edge: false, Firefox: true, Safari: true });
  });

  test('an unknown platform is rejected', async () => {
    const response = await validateFontTool.invoke({ font: asInput(toBuffer(buildTestFont())), options: { targetPlatforms: ['bogus-os'] } }) as ToolResult;
    expect(response.isError).toBe(true);
  });
});

describe('type.validateFont isWebOptimized', () => {
  test('an uncompressed font is not web optimized; a WOFF2 is', async () => {
    const sfnt = toBuffer(buildTestFont());
    expect((await validate(sfnt)).metadata.isWebOptimized).toBe(false);
    expect((await validate(Buffer.from(await wawoff2.compress(sfnt)))).metadata.isWebOptimized).toBe(true);
  });

  test('a WOFF2 that keeps legacy hinting tables is not web optimized', async () => {
    const withHdmx = renameTable(toBuffer(buildTestFont()), 'post', 'hdmx');
    const report = await validate(Buffer.from(await wawoff2.compress(withHdmx)));
    expect(report.metadata.isWebOptimized).toBe(false);
    expect(report.recommendations.join(' ')).toMatch(/hdmx/);
  });
});
