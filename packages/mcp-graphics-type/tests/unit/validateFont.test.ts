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
  summary: string;
  fontFace?: string;
  metadata: {
    isWebOptimized: boolean;
    hasLicense: boolean;
    hasEmbeddingPermissions: boolean;
    embedding?: { fsType: number; usage: string; noSubsetting: boolean; bitmapOnly: boolean };
    licenseInfo: { text?: string; url?: string; vendorId?: string; type: string };
    variationAxes: Array<{ tag: string; min: number; default: number; max: number }>;
    namedInstances: Array<{ name?: string; coordinates: Record<string, number> }>;
    colorTables: string[];
    collection?: { fontCount: number; index: number };
  };
  verticalMetrics?: {
    unitsPerEm: number;
    useTypoMetrics: boolean;
    lineHeight: { macOS: number; windows: number; linux: number };
  };
  performance: { loadTime: number; parseTime: number };
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

/** A copy of an sfnt with 16-bit fields set: [tag, offset in the table, value] */
const patch = (sfnt: Buffer, ...fields: Array<[string, number, number]>) => {
  const copy = Buffer.from(sfnt);
  for (const [tag, offset, value] of fields) {
    if (value < 0) {
      copy.writeInt16BE(value, tableOffset(copy, tag) + offset);
    } else {
      copy.writeUInt16BE(value, tableOffset(copy, tag) + offset);
    }
  }
  return copy;
};

/** A copy of the fixture with OS/2 fsType set */
const withFsType = (fsType: number) => patch(toBuffer(buildTestFont()), ['OS/2', 8, fsType]);

/** A copy of an sfnt with one more table appended (checksums are not updated) */
const addTable = (sfnt: Buffer, tag: string, data: Buffer) => {
  const numTables = sfnt.readUInt16BE(4);
  const head = Buffer.from(sfnt.subarray(0, 12 + numTables * 16));
  const body = sfnt.subarray(12 + numTables * 16);
  head.writeUInt16BE(numTables + 1, 4);
  for (let i = 0; i < numTables; i++) {
    head.writeUInt32BE(head.readUInt32BE(12 + i * 16 + 8) + 16, 12 + i * 16 + 8);
  }
  const record = Buffer.alloc(16);
  record.write(tag, 0, 'latin1');
  record.writeUInt32BE(head.length + 16 + body.length, 8);
  record.writeUInt32BE(data.length, 12);
  return Buffer.concat([head, record, body, data]);
};

/** An fvar table with the given axes and one named instance (name ID 2) at the defaults */
const fvarTable = (axes: Array<[string, number, number, number]>) => {
  const header = Buffer.alloc(16);
  header.writeUInt16BE(1, 0);
  header.writeUInt16BE(16, 4);
  header.writeUInt16BE(2, 6);
  header.writeUInt16BE(axes.length, 8);
  header.writeUInt16BE(20, 10);
  header.writeUInt16BE(1, 12);
  header.writeUInt16BE(4 + axes.length * 4, 14);
  const records = axes.map(([tag, min, def, max]) => {
    const record = Buffer.alloc(20);
    record.write(tag, 0, 'latin1');
    record.writeInt32BE(min * 65536, 4);
    record.writeInt32BE(def * 65536, 8);
    record.writeInt32BE(max * 65536, 12);
    record.writeUInt16BE(2, 18);
    return record;
  });
  const instance = Buffer.alloc(4 + axes.length * 4);
  instance.writeUInt16BE(2, 0);
  axes.forEach(([, , def], i) => instance.writeInt32BE(def * 65536, 4 + i * 4));
  return Buffer.concat([header, ...records, instance]);
};

/** A TrueType collection holding the given sfnts */
const toCollection = (fonts: Buffer[]) => {
  const header = Buffer.alloc(12 + fonts.length * 4);
  header.write('ttcf', 0, 'latin1');
  header.writeUInt32BE(0x00010000, 4);
  header.writeUInt32BE(fonts.length, 8);
  let base = header.length;
  const parts = fonts.map((font, index) => {
    const copy = Buffer.from(font);
    header.writeUInt32BE(base, 12 + index * 4);
    for (let i = 0; i < copy.readUInt16BE(4); i++) {
      copy.writeUInt32BE(copy.readUInt32BE(12 + i * 16 + 8) + base, 12 + i * 16 + 8);
    }
    base += copy.length;
    return copy;
  });
  return Buffer.concat([header, ...parts]);
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

  test('bytes that start like a collection but hold no fonts are reported, not parsed', async () => {
    const collection = Buffer.alloc(16);
    collection.write('ttcf', 0, 'latin1');
    collection.writeUInt32BE(0x00010000, 4);
    collection.writeUInt32BE(1, 8);
    collection.writeUInt32BE(16, 12);
    const report = await validate(collection);
    expect(report.isValid).toBe(false);
    expect(report.format).toBe('ttc');
  });
});

describe('type.validateFont font collections', () => {
  const regular = toBuffer(buildTestFont());
  const bold = toBuffer(buildTestFont({ styleName: 'Bold' }));
  const collection = toCollection([regular, bold]);

  test('validates the first font by default, and says which one it read', async () => {
    const report = await validate(collection);
    expect(report.errors).toEqual([]);
    expect(report.format).toBe('ttc');
    expect(report.metadata.collection).toEqual({ fontCount: 2, index: 0 });
  });

  test('fontIndex picks another font', async () => {
    const report = await validate(collection, { fontIndex: 1 });
    expect(report.isValid).toBe(true);
    expect(report.metadata.collection).toEqual({ fontCount: 2, index: 1 });
    expect(report.summary).toMatch(/Bold/);
  });

  test('a fontIndex past the end is an error', async () => {
    const report = await validate(collection, { fontIndex: 2 });
    expect(report.isValid).toBe(false);
    expect(report.errors[0].message).toMatch(/out of range/);
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

describe('type.validateFont options and hints', () => {
  test.each([0, -1, 1.5])('maxFileSize %p is rejected', async maxFileSize => {
    const response = await validateFontTool.invoke({ font: asInput(toBuffer(buildTestFont())), options: { maxFileSize } }) as ToolResult;
    expect(response.isError).toBe(true);
  });

  test('a font over maxFileSize is invalid', async () => {
    const report = await validate(toBuffer(buildTestFont()), { maxFileSize: 100 });
    expect(report.isValid).toBe(false);
    expect(codes(report)).toEqual(['FILE_SIZE_EXCEEDED']);
  });

  test('a format hint that disagrees with the file is reported', async () => {
    const response = await validateFontTool.invoke({ font: { ...asInput(toBuffer(buildTestFont())), format: 'woff2' } }) as ToolResult;
    const report = JSON.parse(response.content[0].text).validation as Report;
    expect(report.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'FORMAT_HINT_MISMATCH' })]));
  });

  test('parse time is reported apart from load time', async () => {
    const report = await validate(toBuffer(buildTestFont()));
    expect(typeof report.performance.parseTime).toBe('number');
  });
});

describe('type.validateFont characters', () => {
  test('missing everyday punctuation is a warning', async () => {
    const report = await validate(toBuffer(buildTestFont()));
    const warning = report.warnings.find(w => w.code === 'MISSING_COMMON_CHARACTERS');
    expect(warning?.message).toContain('U+00A0');
    expect(warning?.message).toContain('U+20AC');
    expect(warning?.message).not.toContain('U+0020');
  });

  test('requiredCharacters lists the ones the font lacks, and fails the font', async () => {
    const report = await validate(toBuffer(buildTestFont()), { requiredCharacters: 'Zażółć gęślą jaźń\n' });
    expect(report.isValid).toBe(false);
    const error = report.errors.find(e => e.code === 'MISSING_REQUIRED_CHARACTERS');
    expect(error?.message).toBe('Missing 9 required characters: ż (U+017C), ó (U+00F3), ł (U+0142), ć (U+0107), ę (U+0119), ś (U+015B), ą (U+0105), ź (U+017A), ń (U+0144)');
  });

  test('requiredCharacters the font has pass', async () => {
    const report = await validate(toBuffer(buildTestFont()), { requiredCharacters: 'Hello World 2026' });
    expect(report.isValid).toBe(true);
  });
});

describe('type.validateFont vertical metrics', () => {
  // The fixture: hhea and typo 800/-200/0 at 1000 units; opentype.js sets win to the glyph bounds, 700/0
  const sfnt = toBuffer(buildTestFont());

  test('reports the line height each platform computes, and warns when they differ', async () => {
    const report = await validate(sfnt);
    expect(report.verticalMetrics).toMatchObject({ unitsPerEm: 1000, useTypoMetrics: false, lineHeight: { macOS: 1, windows: 0.7, linux: 1 } });
    expect(report.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'VERTICAL_METRICS_MISMATCH' })]));
  });

  test('matching win metrics clear the warning', async () => {
    const report = await validate(patch(sfnt, ['OS/2', 74, 800], ['OS/2', 76, 200]));
    expect(report.verticalMetrics?.lineHeight).toEqual({ macOS: 1, windows: 1, linux: 1 });
    expect(report.warnings.map(w => w.code)).not.toContain('VERTICAL_METRICS_MISMATCH');
  });

  test('USE_TYPO_METRICS makes Windows use the typo metrics', async () => {
    const report = await validate(patch(sfnt, ['OS/2', 62, 0x0040 | 0x0080]));
    expect(report.verticalMetrics).toMatchObject({ useTypoMetrics: true, lineHeight: { windows: 1 } });
  });

  test('win metrics smaller than the glyph bounds are flagged as clipping', async () => {
    const report = await validate(patch(sfnt, ['OS/2', 74, 600]));
    expect(report.warnings).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'WIN_METRICS_CLIP' })]));
  });
});

describe('type.validateFont names and style', () => {
  const styleCodes = (report: Report) => report.warnings.map(w => w.code).filter(code => code.startsWith('STYLE_') || code.startsWith('NAME_'));

  test('a regular font with consistent names has no style warnings', async () => {
    expect(styleCodes(await validate(toBuffer(buildTestFont())))).toEqual([]);
  });

  test('a "Bold" subfamily with weight class 400 is flagged', async () => {
    const sfnt = patch(toBuffer(buildTestFont({ styleName: 'Bold' })), ['OS/2', 4, 400]);
    expect(styleCodes(await validate(sfnt))).toContain('STYLE_WEIGHT_MISMATCH');
  });

  test('an italic bit in fsSelection that macStyle and the name disagree with is flagged', async () => {
    const sfnt = patch(toBuffer(buildTestFont()), ['OS/2', 62, 0x0001]);
    expect(styleCodes(await validate(sfnt))).toContain('STYLE_ITALIC_MISMATCH');
  });

  test('a subfamily (name ID 2) outside Regular/Italic/Bold/Bold Italic is flagged', async () => {
    const sfnt = patch(toBuffer(buildTestFont({ styleName: 'Light' })), ['OS/2', 4, 300]);
    expect(styleCodes(await validate(sfnt))).toEqual(['NAME_SUBFAMILY_NOT_RIBBI']);
  });

  test.each(['Test Font-Regular', 'T'.repeat(64)])('the PostScript name %p is flagged', async postScriptName => {
    const report = await validate(toBuffer(buildTestFont({ postScriptName })));
    expect(styleCodes(report)).toEqual(['NAME_POSTSCRIPT_INVALID']);
  });
});

describe('type.validateFont variable and colour fonts', () => {
  test('fvar axes and named instances are reported', async () => {
    const sfnt = addTable(toBuffer(buildTestFont()), 'fvar', fvarTable([['wght', 100, 400, 900], ['wdth', 75, 100, 100]]));
    const report = await validate(sfnt);
    expect(report.metadata.variationAxes).toEqual([
      { tag: 'wght', min: 100, default: 400, max: 900 },
      { tag: 'wdth', min: 75, default: 100, max: 100 }
    ]);
    expect(report.metadata.namedInstances).toEqual([{ name: 'Regular', coordinates: { wght: 400, wdth: 100 } }]);
    expect(report.fontFace).toContain('font-weight: 100 900;');
  });

  test('a wght axis off the CSS scale falls back to the OS/2 weight, and axis values are rounded', async () => {
    const sfnt = addTable(toBuffer(buildTestFont()), 'fvar', fvarTable([['wght', 0.48, 1, 3.2]]));
    const report = await validate(sfnt);
    expect(report.metadata.variationAxes).toEqual([{ tag: 'wght', min: 0.48, default: 1, max: 3.2 }]);
    expect(report.fontFace).toContain('font-weight: 500;');
  });

  test('colour tables are listed, with the COLR version', async () => {
    const colr = Buffer.alloc(14);
    colr.writeUInt16BE(1, 0);
    const sfnt = addTable(addTable(toBuffer(buildTestFont()), 'COLR', colr), 'CPAL', Buffer.alloc(12));
    expect((await validate(sfnt)).metadata.colorTables).toEqual(['COLRv1', 'CPAL']);
  });

  test('a plain font has no axes or colour tables', async () => {
    const { metadata } = await validate(toBuffer(buildTestFont()));
    expect(metadata.variationAxes).toEqual([]);
    expect(metadata.colorTables).toEqual([]);
  });
});

describe('type.validateFont licence details', () => {
  test('a font with no licence text is unknown', async () => {
    const { metadata } = await validate(toBuffer(buildTestFont()));
    expect(metadata.hasLicense).toBe(false);
    expect(metadata.licenseInfo).toMatchObject({ type: 'unknown' });
  });
});

describe('type.validateFont summary and @font-face', () => {
  test('summary names the format, size, glyph count and warnings', async () => {
    const sfnt = toBuffer(buildTestFont());
    const report = await validate(sfnt);
    expect(report.summary).toMatch(new RegExp(`^Valid OTF, ${(sfnt.length / 1024).toFixed(1)} KB, 64 glyphs, Test Font Regular; \\d+ warnings?: `));
  });

  test('summary for an invalid font leads with the first error', async () => {
    const report = await validate(Buffer.alloc(0));
    expect(report.summary).toBe('Invalid: Empty font file');
  });

  test('a ready-to-use @font-face rule with the right format() hint', async () => {
    const woff2 = Buffer.from(await wawoff2.compress(toBuffer(buildTestFont())));
    const report = await validate(woff2);
    expect(report.fontFace).toBe([
      '@font-face {',
      '  font-family: "Test Font";',
      '  src: url("TestFontRegular.woff2") format("woff2");',
      '  font-weight: 500;',
      '  font-style: normal;',
      '  font-display: swap;',
      '}'
    ].join('\n'));
  });
});
