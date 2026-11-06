import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { TextToolResult } from '../types/typography.js';
import type { Font, LayoutTable } from 'opentype.js';
import { TypographyValidator } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';
import {
  ValidateFontInputSchema,
  ValidateFontInput,
  FontInput,
  FontValidationReport,
  TypographyErrorCode,
  PERFORMANCE_LIMITS
} from '../types/typography.js';
import { UNICODE_BLOCKS, UNICODE_VERSION } from '../util/unicodeBlocks.js';
import { loadFontBuffer } from './loadFont.js';
import { extractFromCollection } from '../util/systemFonts.js';
import { parseFont, toSfnt } from '../util/parseFont.js';
import { toolInputSchema } from '../util/toolSchema.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<TextToolResult>;
}

/**
 * Font Validation Tool - Comprehensive font analysis and validation
 */
export const validateFontTool: ExecutableTool = {
  name: 'type.validateFont',
  description: 'Perform comprehensive font validation including format checking, performance analysis, and compatibility testing',
  inputSchema: toolInputSchema(ValidateFontInputSchema),

  async invoke(args: unknown) {
    try {
      const { result, metrics } = await PerformanceMonitor.measureOperation('type.validateFont', async () => {

        // Validate input
        const input = TypographyValidator.validateInput(ValidateFontInputSchema, args) as ValidateFontInput;

        // Load font
        const startTime = Date.now();
        const fontBuffer = await loadFontBuffer(input.font, { keepCollection: true });
        const loadTime = Date.now() - startTime;

        // Perform comprehensive font validation
        const validationReport = await performFontValidation(
          fontBuffer,
          loadTime,
          input.options,
          input.font
        );

        return {
          validation: validationReport,
          fontSize: fontBuffer.length
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...result,
            performance: {
              duration: metrics.duration,
              memoryUsed: metrics.memoryUsed
            }
          }, null, 2)
        }]
      };

    } catch (error) {
      console.error('[type.validateFont] Error:', error);

      let errorResponse;
      if (error instanceof Error) {
        try {
          const parsedError = JSON.parse(error.message);
          errorResponse = {
            error: true,
            code: parsedError.code || TypographyErrorCode.VALIDATION_FAILED,
            message: parsedError.message || error.message,
            details: parsedError.details,
            suggestions: parsedError.suggestions,
            tool: 'type.validateFont',
            timestamp: new Date().toISOString()
          };
        } catch {
          errorResponse = {
            error: true,
            code: TypographyErrorCode.VALIDATION_FAILED,
            message: error.message,
            tool: 'type.validateFont',
            timestamp: new Date().toISOString()
          };
        }
      } else {
        errorResponse = {
          error: true,
          code: TypographyErrorCode.VALIDATION_FAILED,
          message: 'Font validation failed',
          tool: 'type.validateFont',
          timestamp: new Date().toISOString()
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(errorResponse, null, 2)
        }],
        isError: true
      };
    }
  }
};

type ReportError = FontValidationReport['errors'][number];
type ReportWarning = FontValidationReport['warnings'][number];

/**
 * Performs comprehensive font validation
 */
async function performFontValidation(
  fileBuffer: Buffer,
  loadTime: number,
  options: ValidateFontInput['options'],
  source: FontInput
): Promise<FontValidationReport> {
  try {
    const errors: ReportError[] = [];
    const warnings: ReportWarning[] = [];
    const recommendations: string[] = [];
    const format = detectFontFormat(fileBuffer);
    const failed = (parseTime = 0, collection?: FontValidationReport['metadata']['collection']) =>
      createFailedValidationReport(errors, warnings, recommendations, fileBuffer, format, loadTime, parseTime, collection);

    // A collection is validated one font at a time
    let fontBuffer = fileBuffer;
    let collection: FontValidationReport['metadata']['collection'];
    if (format === 'ttc') {
      const sizeError = checkFontFile(fileBuffer, { signature: false });
      if (sizeError) {
        errors.push(sizeError);
        return failed();
      }
      const index = options.fontIndex ?? 0;
      collection = { fontCount: fileBuffer.length >= 12 ? fileBuffer.readUInt32BE(8) : 0, index };
      try {
        fontBuffer = extractFromCollection(fileBuffer, index);
      } catch (error) {
        errors.push({
          code: TypographyErrorCode.INVALID_INPUT,
          message: `Could not read font ${index} of the collection: ${error instanceof Error ? error.message : String(error)}`,
          severity: 'error',
          location: 'font-data'
        });
        return failed(0, collection);
      }
    }

    // Files the parser can't read are reported as such, not as broken fonts
    const fileError = checkFontFile(fontBuffer);
    if (fileError) {
      errors.push(fileError);
      return failed(0, collection);
    }

    // Parse font using opentype.js
    let font: Font;
    let tables: SfntTables;
    const parseStart = Date.now();

    try {
      const sfnt = await toSfnt(fontBuffer);
      tables = sfntTables(sfnt);
      font = await parseFont(sfnt);
    } catch (parseError) {
      errors.push({
        code: 'PARSE_ERROR',
        message: `Font parsing failed: ${parseError instanceof Error ? parseError.message : 'Unknown error'}`,
        severity: 'error',
        location: 'font-data'
      });

      // Return early validation report if parsing fails
      return failed(Date.now() - parseStart, collection);
    }
    const parseTime = Date.now() - parseStart;
    const version = font.names.version?.en || 'Unknown';
    const features = extractFeatures(font);

    // The source's format hint, when given, should match the file
    const hint = 'format' in source ? source.format : undefined;
    if (hint && hint !== format) {
      warnings.push({
        code: 'FORMAT_HINT_MISMATCH',
        message: `The source says ${hint.toUpperCase()}, but the file is ${format.toUpperCase()}`,
        recommendation: 'Fix the file extension or the format hint, so servers send the right Content-Type and CSS gets the right format()'
      });
    }

    // Validate font structure
    const structureValidation = validateFontStructure(font, tables);
    errors.push(...structureValidation.errors);
    warnings.push(...structureValidation.warnings);
    warnings.push(...checkCommonCharacters(font));
    warnings.push(...checkNamesAndStyle(font));

    const verticalMetrics = analyzeVerticalMetrics(font);
    if (verticalMetrics) {
      warnings.push(...checkVerticalMetrics(verticalMetrics));
    }

    // Check file size constraints
    if (options.maxFileSize !== undefined && fileBuffer.length > options.maxFileSize) {
      errors.push({
        code: 'FILE_SIZE_EXCEEDED',
        message: `Font file size (${fileBuffer.length} bytes) exceeds maximum (${options.maxFileSize} bytes)`,
        severity: 'error',
        location: 'font-data'
      });
      recommendations.push('Subset the font or serve it as WOFF2 to bring it under the size limit');
    }

    // Check required features
    if (options.requiredFeatures && options.requiredFeatures.length > 0) {
      const missingFeatures = options.requiredFeatures.filter(f => !features.includes(f));

      if (missingFeatures.length > 0) {
        errors.push({
          code: 'MISSING_REQUIRED_FEATURES',
          message: `Missing required OpenType features: ${missingFeatures.join(', ')}`,
          severity: 'error',
          location: 'gsub/gpos-tables'
        });
      }
    }

    // Check required characters
    if (options.requiredCharacters) {
      const missingCharacters = findMissingCharacters(font, options.requiredCharacters);
      if (missingCharacters.length > 0) {
        errors.push({
          code: 'MISSING_REQUIRED_CHARACTERS',
          message: describeMissingCharacters('required', missingCharacters),
          severity: 'error',
          location: 'cmap-table'
        });
      }
    }

    // Analyze font metadata
    const metadata = analyzeFontMetadata(font, format, tables, collection);

    // Performance analysis
    const performance = options.checkPerformance
      ? analyzePerformance(font, fileBuffer, features, loadTime, parseTime)
      : { loadTime, parseTime, fileSize: fileBuffer.length, glyphCount: font.numGlyphs, complexityScore: 0 };

    // Compatibility analysis
    const compatibility = options.checkCompatibility
      ? analyzeCompatibility(font, format, tables, options.targetPlatforms ?? ['web'])
      : { webBrowsers: {}, operatingSystems: {}, unicodeSupport: emptyUnicodeSupport(), notes: [] };

    // License analysis
    if (options.checkLicense) {
      const licenseAnalysis = analyzeLicense(font);
      warnings.push(...licenseAnalysis.warnings);
      recommendations.push(...licenseAnalysis.recommendations);
    }

    // Generate recommendations
    const additionalRecommendations = generateRecommendations(features, tables, format, performance, compatibility.notes);
    recommendations.push(...additionalRecommendations);

    const isValid = errors.filter(e => e.severity === 'error').length === 0;
    const validationReport: FontValidationReport = {
      isValid,
      format,
      version,
      errors,
      warnings,
      metadata,
      performance,
      compatibility: {
        webBrowsers: compatibility.webBrowsers,
        operatingSystems: compatibility.operatingSystems,
        unicodeSupport: compatibility.unicodeSupport
      },
      ...(verticalMetrics && { verticalMetrics }),
      recommendations,
      summary: summarize(font, format, fileBuffer.length, errors, warnings),
      ...(isValid && { fontFace: fontFaceRule(font, format, metadata, source) })
    };

    return validationReport;

  } catch (error) {
    throw new Error(JSON.stringify({
      code: TypographyErrorCode.VALIDATION_FAILED,
      message: `Font validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestions: [
        'Check if the font file is corrupted',
        'Verify the font format is supported',
        'Try validating with basic options only'
      ]
    }));
  }
}

/**
 * Validates font structure and required tables
 */
function validateFontStructure(font: Font, tables: SfntTables): {
  errors: Array<{ code: string; message: string; severity: 'error' | 'warning' | 'info'; location?: string }>;
  warnings: Array<{ code: string; message: string; recommendation?: string }>;
} {
  const errors: Array<{ code: string; message: string; severity: 'error' | 'warning' | 'info'; location?: string }> = [];
  const warnings: Array<{ code: string; message: string; recommendation?: string }> = [];

  // Check required tables against the font's table directory: font.tables only
  // holds what opentype.js keeps (hmtx, for one, goes straight into the glyphs)
  const requiredTables = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post'];

  for (const tableName of requiredTables) {
    if (!tables.has(tableName)) {
      errors.push({
        code: 'MISSING_REQUIRED_TABLE',
        message: `Missing required table: ${tableName}`,
        severity: 'error',
        location: `${tableName}-table`
      });
    }
  }

  // Check glyph count
  if (font.numGlyphs === 0) {
    errors.push({
      code: 'NO_GLYPHS',
      message: 'Font contains no glyphs',
      severity: 'error',
      location: 'glyf-table'
    });
  }

  // Check character mapping. opentype.js exposes the parsed mapping as
  // cmap.glyphIndexMap; it does not provide a cmap.subtables array.
  const cmap = font.tables.cmap;
  const cmapEntryCount = cmap?.subtables?.length ?? Object.keys(cmap?.glyphIndexMap ?? {}).length;
  if (cmap && cmapEntryCount === 0) {
    errors.push({
      code: 'NO_CHARACTER_MAPPING',
      message: 'Font has no character to glyph mapping',
      severity: 'error',
      location: 'cmap-table'
    });
  }

  // Check font metrics
  if (font.unitsPerEm <= 0) {
    errors.push({
      code: 'INVALID_UNITS_PER_EM',
      message: `Invalid unitsPerEm value: ${font.unitsPerEm}`,
      severity: 'error',
      location: 'head-table'
    });
  }

  // Check for common issues
  if (font.ascender === 0 && font.descender === 0) {
    warnings.push({
      code: 'MISSING_METRICS',
      message: 'Font has no ascender/descender metrics',
      recommendation: 'Set proper ascender and descender values for better line spacing'
    });
  }

  return { errors, warnings };
}

/**
 * Analyzes font metadata for completeness
 */
function analyzeFontMetadata(
  font: Font,
  format: FontFormat,
  tables: SfntTables,
  collection: FontValidationReport['metadata']['collection']
): FontValidationReport['metadata'] {
  const embedding = decodeEmbedding(font);
  const licenseInfo = analyzeLicenseInfo(font);
  const variations = readFvar(font, tables);
  return {
    hasValidTables: Boolean(font.tables.head && font.tables.hhea && font.tables.cmap),
    hasKerningInfo: Boolean(font.tables.kern || (font.tables.gpos && hasKerningInGPOS(font.tables.gpos))),
    hasOpenTypeFeatures: Boolean(font.tables.gsub || font.tables.gpos),
    hasVariationAxes: Boolean(font.tables.fvar),
    isWebOptimized: isWebOptimized(format, tables),
    hasLicense: Boolean(licenseInfo.text),
    hasEmbeddingPermissions: embedding ? embedding.usage === 'installable' || embedding.usage === 'editable' : false,
    ...(embedding && { embedding }),
    licenseInfo,
    variationAxes: variations.axes,
    namedInstances: variations.instances,
    colorTables: colorTables(tables),
    ...(collection && { collection })
  };
}

/**
 * Analyzes font performance characteristics
 */
function analyzePerformance(
  font: Font,
  fontBuffer: Buffer,
  features: string[],
  loadTime: number,
  parseTime: number
): FontValidationReport['performance'] {
  // Calculate complexity score based on various factors
  let complexityScore = 0;

  // File size factor (larger = more complex)
  const sizeScore = Math.min(fontBuffer.length / (1024 * 1024), 1); // Normalize to 1MB
  complexityScore += sizeScore * 0.3;

  // Glyph count factor
  const glyphScore = Math.min(font.numGlyphs / 65536, 1); // Normalize to max glyphs
  complexityScore += glyphScore * 0.3;

  // OpenType features factor
  const featureCount = features.length;
  const featureScore = Math.min(featureCount / 50, 1); // Normalize to reasonable feature count
  complexityScore += featureScore * 0.2;

  // Tables factor
  const tableCount = Object.keys(font.tables).length;
  const tableScore = Math.min(tableCount / 20, 1); // Normalize to typical table count
  complexityScore += tableScore * 0.2;

  return {
    loadTime,
    parseTime,
    fileSize: fontBuffer.length,
    glyphCount: font.numGlyphs,
    complexityScore: Math.min(complexityScore, 1)
  };
}

/**
 * Analyzes font compatibility across platforms and browsers
 */
type Platform = NonNullable<ValidateFontInput['options']>['targetPlatforms'][number];

const OPERATING_SYSTEMS: Record<Exclude<Platform, 'web'>, string> = {
  windows: 'Windows',
  macos: 'macOS',
  linux: 'Linux',
  ios: 'iOS',
  android: 'Android'
};

/**
 * Colour-font formats that some current browsers don't render. Container
 * formats (TTF, OTF, WOFF, WOFF2) and variable fonts load in all of them.
 */
const COLOR_FORMAT_GAPS: Array<{ format: string; present: (tables: SfntTables) => boolean; unsupported: string[] }> = [
  { format: 'OpenType-SVG (SVG table)', present: tables => tables.has('SVG '), unsupported: ['Chrome', 'Edge'] },
  { format: 'COLR version 1', present: tables => colrVersion(tables) >= 1, unsupported: ['Safari'] },
  { format: 'CBDT bitmaps', present: tables => tables.has('CBDT'), unsupported: ['Safari'] },
  { format: 'sbix bitmaps', present: tables => tables.has('sbix'), unsupported: ['Firefox'] }
];

function colrVersion(tables: SfntTables): number {
  const colr = tables.get('COLR');
  return colr && colr.length >= 2 ? colr.readUInt16BE(0) : 0;
}

function analyzeCompatibility(font: Font, format: FontFormat, tables: SfntTables, platforms: Platform[]): {
  webBrowsers: Record<string, boolean>;
  operatingSystems: Record<string, boolean>;
  unicodeSupport: FontValidationReport['compatibility']['unicodeSupport'];
  notes: string[];
} {
  const notes: string[] = [];
  const webBrowsers: Record<string, boolean> = {};
  if (platforms.includes('web')) {
    for (const browser of ['Chrome', 'Edge', 'Firefox', 'Safari']) {
      webBrowsers[browser] = format !== 'ttc' && format !== 'unknown';
    }
    for (const gap of COLOR_FORMAT_GAPS) {
      if (gap.present(tables)) {
        gap.unsupported.forEach(browser => { webBrowsers[browser] = false; });
        notes.push(`${gap.format} colour glyphs don't render in ${gap.unsupported.join(' or ')}; provide a COLR v0 or monochrome fallback`);
      }
    }
  }

  // Desktop and mobile systems install TrueType/OpenType files; WOFF/WOFF2 are web-only
  const installable = format === 'ttf' || format === 'otf' || format === 'ttc';
  const operatingSystems: Record<string, boolean> = {};
  for (const platform of platforms) {
    if (platform !== 'web') {
      operatingSystems[OPERATING_SYSTEMS[platform]] = installable;
    }
  }
  if (!installable && Object.keys(operatingSystems).length > 0) {
    notes.push(`${format.toUpperCase()} is a web format and can't be installed; ship the TTF/OTF for ${Object.keys(operatingSystems).join(', ')}`);
  }

  return { webBrowsers, operatingSystems, unicodeSupport: analyzeUnicodeSupport(font), notes };
}

/**
 * Decodes OS/2 fsType. Bits 1-3 are the usage permission (the least
 * restrictive wins when several are set, per the OpenType OS/2 spec); bit 8
 * forbids subsetting and bit 9 allows embedding bitmaps only.
 */
function decodeEmbedding(font: Font): FontValidationReport['metadata']['embedding'] {
  const fsType = font.tables.os2?.fsType;
  if (typeof fsType !== 'number') {
    return undefined;
  }
  const usage = fsType & 0x0008 ? 'editable'
    : fsType & 0x0004 ? 'previewPrint'
      : fsType & 0x0002 ? 'restricted'
        : 'installable';
  return { fsType, usage, noSubsetting: Boolean(fsType & 0x0100), bitmapOnly: Boolean(fsType & 0x0200) };
}

/**
 * Analyzes font license and embedding permissions
 */
function analyzeLicense(font: Font): {
  warnings: Array<{ code: string; message: string; recommendation?: string }>;
  recommendations: string[];
} {
  const warnings: Array<{ code: string; message: string; recommendation?: string }> = [];
  const recommendations: string[] = [];

  // Check if license information is present
  if (!analyzeLicenseInfo(font).text) {
    warnings.push({
      code: 'NO_LICENSE_INFO',
      message: 'Font does not contain license information',
      recommendation: 'Verify licensing terms separately before use'
    });
  }

  // Check embedding permissions
  const embedding = decodeEmbedding(font);
  if (embedding?.usage === 'restricted') {
    warnings.push({
      code: 'EMBEDDING_RESTRICTED',
      message: 'Font must not be embedded (fsType: restricted license)',
      recommendation: 'Get permission from the foundry before embedding it in documents or serving it on the web'
    });
  } else if (embedding?.usage === 'previewPrint') {
    warnings.push({
      code: 'EMBEDDING_PREVIEW_PRINT',
      message: 'Font may be embedded only for preview and print (read-only documents)',
      recommendation: 'May not be suitable for web use; check the license terms'
    });
  }
  if (embedding?.noSubsetting) {
    warnings.push({
      code: 'EMBEDDING_NO_SUBSETTING',
      message: 'Font must not be subset before embedding (fsType bit 8)',
      recommendation: 'Embed the whole font; type.subsetFont output would break this term'
    });
  }
  if (embedding?.bitmapOnly) {
    warnings.push({
      code: 'EMBEDDING_BITMAP_ONLY',
      message: 'Only the bitmaps in this font may be embedded (fsType bit 9)',
      recommendation: 'Outlines cannot be embedded; check the license before serving it as a web font'
    });
  }

  return { warnings, recommendations };
}

/**
 * Generates recommendations based on analysis
 */
function generateRecommendations(
  features: string[],
  tables: SfntTables,
  format: FontFormat,
  performance: FontValidationReport['performance'],
  compatibilityNotes: string[]
): string[] {
  const recommendations: string[] = [];

  // File size recommendations
  if (performance.fileSize > 1024 * 1024) {
    recommendations.push('Consider font subsetting to reduce file size for web use');
  }

  if (performance.fileSize > 100 * 1024 && format !== 'woff' && format !== 'woff2') {
    recommendations.push('Consider using WOFF/WOFF2 compression for web deployment');
  }

  // Performance recommendations
  if (performance.glyphCount > 10000) {
    recommendations.push('Large glyph count detected - consider subsetting for better performance');
  }

  if (performance.complexityScore > 0.8) {
    recommendations.push('High complexity font - test loading performance on target devices');
  }

  const legacyTables = LEGACY_HINTING_TABLES.filter(tag => tables.has(tag));
  if (legacyTables.length > 0) {
    recommendations.push(`Remove the legacy hinting tables browsers ignore (${legacyTables.join(', ')}) before serving it on the web`);
  }

  // Compatibility recommendations
  recommendations.push(...compatibilityNotes);

  // Feature recommendations
  if (features.length === 0) {
    recommendations.push('Font has no OpenType features - consider adding ligatures or kerning for better typography');
  }

  return recommendations;
}

/**
 * Helper functions
 */
type FontFormat = NonNullable<FontValidationReport['format']>;

function detectFontFormat(buffer: Buffer): FontFormat {
  switch (buffer.toString('latin1', 0, 4)) {
    case 'wOFF': return 'woff';
    case 'wOF2': return 'woff2';
    case 'OTTO': return 'otf';
    case 'ttcf': return 'ttc';
    case '\x00\x01\x00\x00':
    case 'true':
      return 'ttf';
    default:
      return 'unknown';
  }
}

/**
 * The checks type.loadFont makes before parsing (empty, size cap, signature),
 * as a report error rather than a thrown one
 */
function checkFontFile(buffer: Buffer, { signature = true } = {}): ReportError | undefined {
  try {
    // A collection's own signature (ttcf) isn't a font signature, so only its size is checked; each font is checked in full
    if (signature || buffer.length > PERFORMANCE_LIMITS.MAX_FONT_FILE_SIZE) {
      TypographyValidator.validateFontFile(buffer);
    }
    return undefined;
  } catch (error) {
    let parsed: { code?: string; message?: string } = {};
    try {
      parsed = JSON.parse(error instanceof Error ? error.message : String(error));
    } catch {
      parsed = { message: error instanceof Error ? error.message : String(error) };
    }
    return {
      code: parsed.code ?? TypographyErrorCode.FONT_LOAD_FAILED,
      message: parsed.message ?? 'Font file could not be read',
      severity: 'error',
      location: 'font-data'
    };
  }
}

/** An sfnt's tables by tag */
type SfntTables = Map<string, Buffer>;

/**
 * Reads an sfnt's table directory. Records whose data runs past the end of
 * the file are left out.
 */
function sfntTables(sfnt: Uint8Array): SfntTables {
  const data = Buffer.from(sfnt.buffer, sfnt.byteOffset, sfnt.byteLength);
  const tables: SfntTables = new Map();
  if (data.length < 12) {
    return tables;
  }
  const numTables = Math.min(data.readUInt16BE(4), Math.floor((data.length - 12) / 16));
  for (let i = 0; i < numTables; i++) {
    const record = 12 + i * 16;
    const offset = data.readUInt32BE(record + 8);
    const length = data.readUInt32BE(record + 12);
    if (offset + length <= data.length) {
      tables.set(data.toString('latin1', record, record + 4), data.subarray(offset, offset + length));
    }
  }
  return tables;
}

function extractFeatures(font: Font): string[] {
  const features = new Set<string>();

  if (font.tables?.gsub?.features) {
    for (const record of font.tables.gsub.features) {
      features.add(record.tag);
    }
  }

  if (font.tables?.gpos?.features) {
    for (const record of font.tables.gpos.features) {
      features.add(record.tag);
    }
  }

  return Array.from(features);
}

function hasKerningInGPOS(gposTable: LayoutTable): boolean {
  return Boolean(gposTable.features?.some(record => record.tag === 'kern'));
}

/** Device-specific hinting tables that browsers don't use */
const LEGACY_HINTING_TABLES = ['hdmx', 'VDMX', 'LTSH'];

function isWebOptimized(format: FontFormat, tables: SfntTables): boolean {
  return (format === 'woff' || format === 'woff2') && !LEGACY_HINTING_TABLES.some(tag => tables.has(tag));
}

const BLOCK_STARTS = UNICODE_BLOCKS.map(([, start]) => start);
const COUNTABLE = /[^\p{Cc}\p{Cs}\p{Co}\p{Cn}]/u;

/** The UNICODE_BLOCKS index whose range holds a code point, or -1 */
function blockIndex(codePoint: number): number {
  let low = 0;
  let high = BLOCK_STARTS.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (BLOCK_STARTS[mid] <= codePoint) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return high >= 0 && codePoint <= UNICODE_BLOCKS[high][2] ? high : -1;
}

function emptyUnicodeSupport(): FontValidationReport['compatibility']['unicodeSupport'] {
  return { version: UNICODE_VERSION, supportedBlocks: [], missingBlocks: [], blocks: [] };
}

/**
 * Counts the characters the cmap maps in each Unicode block. Controls,
 * private use and unassigned code points are not counted.
 */
function analyzeUnicodeSupport(font: Font): FontValidationReport['compatibility']['unicodeSupport'] {
  const covered = new Map<number, number>();
  for (const key of Object.keys(font.tables.cmap?.glyphIndexMap ?? {})) {
    const codePoint = Number(key);
    if (codePoint > 0x10FFFF || !COUNTABLE.test(String.fromCodePoint(codePoint))) {
      continue;
    }
    const index = blockIndex(codePoint);
    if (index >= 0) {
      covered.set(index, (covered.get(index) ?? 0) + 1);
    }
  }

  const blocks = [...covered.entries()]
    .sort(([a], [b]) => a - b)
    .map(([index, count]) => {
      const [name, , , total] = UNICODE_BLOCKS[index];
      const mapped = Math.min(count, total);
      return { name, covered: mapped, total, percent: Math.round((mapped / total) * 1000) / 10 };
    });

  return {
    version: UNICODE_VERSION,
    supportedBlocks: blocks.filter(block => block.covered === block.total).map(block => block.name),
    missingBlocks: blocks.filter(block => block.covered < block.total).map(block => block.name),
    blocks
  };
}

function createFailedValidationReport(
  errors: FontValidationReport['errors'],
  warnings: FontValidationReport['warnings'],
  recommendations: string[],
  fontBuffer: Buffer,
  format: FontFormat,
  loadTime: number,
  parseTime: number,
  collection?: FontValidationReport['metadata']['collection']
): FontValidationReport {
  return {
    isValid: false,
    format,
    errors,
    warnings,
    metadata: {
      hasValidTables: false,
      hasKerningInfo: false,
      hasOpenTypeFeatures: false,
      hasVariationAxes: false,
      isWebOptimized: false,
      hasLicense: false,
      hasEmbeddingPermissions: false,
      licenseInfo: { type: 'unknown' },
      variationAxes: [],
      namedInstances: [],
      colorTables: [],
      ...(collection && { collection })
    },
    performance: {
      loadTime,
      parseTime,
      fileSize: fontBuffer.length,
      glyphCount: 0,
      complexityScore: 0
    },
    compatibility: {
      webBrowsers: {},
      operatingSystems: {},
      unicodeSupport: emptyUnicodeSupport()
    },
    recommendations,
    summary: summarize(undefined, format, fontBuffer.length, errors, warnings)
  };
}

/** Characters nearly all text needs beyond A-Z and digits */
const COMMON_CHARACTERS = [0x0020, 0x00A0, 0x2018, 0x2019, 0x201C, 0x201D, 0x2013, 0x2014, 0x2026, 0x20AC];

function hasCodePoint(font: Font, codePoint: number): boolean {
  return font.tables.cmap?.glyphIndexMap?.[codePoint] !== undefined;
}

const describeCodePoint = (codePoint: number) => {
  const hex = `U+${codePoint.toString(16).toUpperCase().padStart(4, '0')}`;
  return /\p{White_Space}/u.test(String.fromCodePoint(codePoint)) ? hex : `${String.fromCodePoint(codePoint)} (${hex})`;
};

function describeMissingCharacters(kind: 'required' | 'common', codePoints: number[]): string {
  const shown = codePoints.slice(0, 50).map(describeCodePoint).join(', ');
  const more = codePoints.length > 50 ? `, and ${codePoints.length - 50} more` : '';
  return `Missing ${codePoints.length} ${kind} character${codePoints.length === 1 ? '' : 's'}: ${shown}${more}`;
}

/** Distinct code points of the text, in order, that the font has no glyph for. Controls such as newlines are skipped. */
function findMissingCharacters(font: Font, text: string): number[] {
  const missing = new Set<number>();
  for (const char of text) {
    const codePoint = char.codePointAt(0) as number;
    if (!/\p{Cc}/u.test(char) && !hasCodePoint(font, codePoint)) {
      missing.add(codePoint);
    }
  }
  return [...missing];
}

function checkCommonCharacters(font: Font): ReportWarning[] {
  const warnings: ReportWarning[] = [];
  const firstGlyph = font.glyphs.get(0)?.name;
  if (firstGlyph && firstGlyph !== '.notdef') {
    warnings.push({
      code: 'NOTDEF_NOT_FIRST',
      message: `Glyph 0 is "${firstGlyph}", not .notdef`,
      recommendation: 'Make .notdef glyph 0: renderers show glyph 0 for characters the font lacks'
    });
  }
  const missing = COMMON_CHARACTERS.filter(codePoint => !hasCodePoint(font, codePoint));
  if (missing.length > 0) {
    warnings.push({
      code: 'MISSING_COMMON_CHARACTERS',
      message: describeMissingCharacters('common', missing),
      recommendation: 'Text with these characters will fall back to another font mid-line'
    });
  }
  return warnings;
}

/** Weight words in style names, longest first so "SemiBold" isn't read as "Bold" */
const WEIGHT_WORDS: Array<[string, number]> = [
  ['extralight', 200], ['ultralight', 200], ['extrabold', 800], ['ultrabold', 800],
  ['semibold', 600], ['demibold', 600], ['hairline', 100], ['regular', 400], ['medium', 500],
  ['normal', 400], ['light', 300], ['black', 900], ['heavy', 900], ['thin', 100], ['bold', 700], ['book', 400]
];

const RIBBI = ['regular', 'italic', 'bold', 'bolditalic'];

/**
 * Checks that the names, OS/2 weight and the italic/bold bits agree, since
 * design apps link styles and CSS matches font-weight from them
 */
function checkNamesAndStyle(font: Font): ReportWarning[] {
  const warnings: ReportWarning[] = [];
  const os2 = font.tables.os2;
  const subfamily = font.names.fontSubfamily?.en ?? '';
  const typographicSubfamily = font.names.preferredSubfamily?.en;
  const style = typographicSubfamily ?? subfamily;
  const normalized = style.toLowerCase().replace(/[\s_-]/g, '');

  const weightWord = WEIGHT_WORDS.find(([word]) => normalized.includes(word));
  if (os2 && weightWord && Math.abs(weightWord[1] - os2.usWeightClass) > 100) {
    warnings.push({
      code: 'STYLE_WEIGHT_MISMATCH',
      message: `Style "${style}" suggests weight ${weightWord[1]}, but OS/2 usWeightClass is ${os2.usWeightClass}`,
      recommendation: 'Set usWeightClass to match the style name; CSS font-weight matching reads it'
    });
  }

  const macStyle = font.tables.head?.macStyle ?? 0;
  const fsSelection = os2?.fsSelection ?? 0;
  const italic = { fsSelection: Boolean(fsSelection & 0x0001), macStyle: Boolean(macStyle & 0x0002), name: /italic|oblique/i.test(style) };
  if (os2 && new Set(Object.values(italic)).size > 1) {
    warnings.push({
      code: 'STYLE_ITALIC_MISMATCH',
      message: `Italic disagrees: fsSelection ${italic.fsSelection ? 'on' : 'off'}, macStyle ${italic.macStyle ? 'on' : 'off'}, style name "${style}"`,
      recommendation: 'Set fsSelection bit 0 and macStyle bit 1 to match the style name'
    });
  }
  const bold = { fsSelection: Boolean(fsSelection & 0x0020), macStyle: Boolean(macStyle & 0x0001), name: /bold/i.test(subfamily) };
  if (os2 && new Set(Object.values(bold)).size > 1) {
    warnings.push({
      code: 'STYLE_BOLD_MISMATCH',
      message: `Bold disagrees: fsSelection ${bold.fsSelection ? 'on' : 'off'}, macStyle ${bold.macStyle ? 'on' : 'off'}, subfamily "${subfamily}"`,
      recommendation: 'Set fsSelection bit 5 and macStyle bit 0 only on the Bold and Bold Italic styles'
    });
  }

  // Apps without typographic-name support group styles by name IDs 1 and 2, four to a family
  if (subfamily && !RIBBI.includes(subfamily.toLowerCase().replace(/\s/g, ''))) {
    warnings.push({
      code: 'NAME_SUBFAMILY_NOT_RIBBI',
      message: `Subfamily (name ID 2) is "${subfamily}"; it should be Regular, Italic, Bold or Bold Italic`,
      recommendation: `Put "${subfamily}" in the family name (ID 1, e.g. "${font.names.fontFamily?.en ?? 'Family'} ${subfamily}") with subfamily Regular, and keep the family and "${subfamily}" in name IDs 16/17, so apps group the styles`
    });
  }

  const postScriptName = font.names.postScriptName?.en;
  if (postScriptName && (postScriptName.length > 63 || /[^\x21-\x7E]|[[\](){}<>/%]/.test(postScriptName))) {
    warnings.push({
      code: 'NAME_POSTSCRIPT_INVALID',
      message: `PostScript name "${postScriptName}" must be at most 63 printable ASCII characters, without spaces or [](){}<>/%`,
      recommendation: 'Use a name like "FamilyName-StyleName"'
    });
  }
  return warnings;
}

type VerticalMetrics = NonNullable<FontValidationReport['verticalMetrics']>;

function analyzeVerticalMetrics(font: Font): VerticalMetrics | undefined {
  const { hhea, os2, head } = font.tables;
  if (!hhea || !os2 || !head || font.unitsPerEm <= 0) {
    return undefined;
  }
  const em = (units: number) => Math.round((units / font.unitsPerEm) * 1000) / 1000;
  const useTypoMetrics = Boolean(os2.fsSelection & 0x0080);
  const hheaHeight = hhea.ascender - hhea.descender + hhea.lineGap;
  const typoHeight = os2.sTypoAscender - os2.sTypoDescender + (os2.sTypoLineGap ?? 0);
  return {
    unitsPerEm: font.unitsPerEm,
    hhea: { ascender: hhea.ascender, descender: hhea.descender, lineGap: hhea.lineGap },
    typo: { ascender: os2.sTypoAscender, descender: os2.sTypoDescender, lineGap: os2.sTypoLineGap ?? 0 },
    win: { ascent: os2.usWinAscent, descent: os2.usWinDescent },
    bounds: { yMin: head.yMin, yMax: head.yMax },
    useTypoMetrics,
    lineHeight: {
      macOS: em(hheaHeight),
      windows: em(useTypoMetrics ? typoHeight : os2.usWinAscent + os2.usWinDescent),
      // FreeType reads hhea, falling back to the typo metrics when hhea is empty
      linux: em(hhea.ascender === 0 && hhea.descender === 0 ? typoHeight : hheaHeight)
    }
  };
}

function checkVerticalMetrics(metrics: VerticalMetrics): ReportWarning[] {
  const warnings: ReportWarning[] = [];
  const heights = Object.values(metrics.lineHeight);
  if (Math.max(...heights) - Math.min(...heights) > 0.005) {
    const { macOS, windows, linux } = metrics.lineHeight;
    warnings.push({
      code: 'VERTICAL_METRICS_MISMATCH',
      message: `Default line height differs by platform: macOS ${macOS}em, Windows ${windows}em, Linux ${linux}em`,
      recommendation: metrics.useTypoMetrics
        ? 'Make the hhea ascender, descender and line gap match the OS/2 typo metrics'
        : 'Set USE_TYPO_METRICS (fsSelection bit 7) with matching hhea and typo metrics, or make hhea ascender/descender equal usWinAscent/usWinDescent with a hhea line gap of 0'
    });
  }
  if (metrics.win.ascent < metrics.bounds.yMax || metrics.win.descent < -metrics.bounds.yMin) {
    warnings.push({
      code: 'WIN_METRICS_CLIP',
      message: `usWinAscent/usWinDescent (${metrics.win.ascent}/${metrics.win.descent}) are smaller than the glyph bounds (${metrics.bounds.yMax}/${-metrics.bounds.yMin}), so Windows clips the tallest glyphs`,
      recommendation: 'Set usWinAscent to at least head.yMax and usWinDescent to at least -head.yMin'
    });
  }
  return warnings;
}

/** opentype.js keys names by property for IDs 0-24 and by number above that */
const NAME_KEYS = [
  'copyright', 'fontFamily', 'fontSubfamily', 'uniqueID', 'fullName', 'version', 'postScriptName', 'trademark',
  'manufacturer', 'designer', 'description', 'manufacturerURL', 'designerURL', 'license', 'licenseURL', 'reserved',
  'preferredFamily', 'preferredSubfamily', 'compatibleFullName', 'sampleText', 'postScriptFindFontName',
  'wwsFamily', 'wwsSubfamily', 'lightPalette', 'darkPalette'
];

function nameById(font: Font, nameId: number): string | undefined {
  const names = font.names as unknown as Record<string, { en?: string } | undefined>;
  return names[NAME_KEYS[nameId] ?? String(nameId)]?.en;
}

/**
 * Reads fvar axes and named instances from the table itself, bounded by its
 * length (opentype.js drops the instance name IDs)
 */
function readFvar(font: Font, tables: SfntTables): {
  axes: FontValidationReport['metadata']['variationAxes'];
  instances: FontValidationReport['metadata']['namedInstances'];
} {
  const fvar = tables.get('fvar');
  if (!fvar || fvar.length < 16) {
    return { axes: [], instances: [] };
  }
  const axesOffset = fvar.readUInt16BE(4);
  const axisCount = fvar.readUInt16BE(8);
  const axisSize = fvar.readUInt16BE(10);
  const instanceCount = fvar.readUInt16BE(12);
  const instanceSize = fvar.readUInt16BE(14);
  // 16.16 fixed point, rounded so 0.4799957 reads as 0.48
  const fixed = (offset: number) => Math.round((fvar.readInt32BE(offset) / 65536) * 1000) / 1000;

  const axes: FontValidationReport['metadata']['variationAxes'] = [];
  for (let i = 0; i < axisCount && axisSize >= 20 && axesOffset + (i + 1) * axisSize <= fvar.length; i++) {
    const record = axesOffset + i * axisSize;
    axes.push({ tag: fvar.toString('latin1', record, record + 4), min: fixed(record + 4), default: fixed(record + 8), max: fixed(record + 12) });
  }

  const instances: FontValidationReport['metadata']['namedInstances'] = [];
  const instancesOffset = axesOffset + axisCount * axisSize;
  if (axes.length === axisCount && instanceSize >= 4 + axisCount * 4) {
    for (let i = 0; i < instanceCount && instancesOffset + (i + 1) * instanceSize <= fvar.length; i++) {
      const record = instancesOffset + i * instanceSize;
      const coordinates = Object.fromEntries(axes.map((axis, j) => [axis.tag, fixed(record + 4 + j * 4)]));
      const name = nameById(font, fvar.readUInt16BE(record));
      instances.push({ ...(name !== undefined && { name }), coordinates });
    }
  }
  return { axes, instances };
}

function colorTables(tables: SfntTables): string[] {
  const present: string[] = [];
  if (tables.has('COLR')) present.push(`COLRv${colrVersion(tables)}`);
  if (tables.has('CPAL')) present.push('CPAL');
  if (tables.has('SVG ')) present.push('SVG');
  if (tables.has('sbix')) present.push('sbix');
  if (tables.has('CBDT')) present.push('CBDT');
  return present;
}

function analyzeLicenseInfo(font: Font): FontValidationReport['metadata']['licenseInfo'] {
  const text = font.names.license?.en?.trim() || undefined;
  const url = font.names.licenseURL?.en?.trim() || undefined;
  const vendorId = font.tables.os2?.achVendID?.replace(/\0/g, '').trim() || undefined;
  const both = `${text ?? ''} ${url ?? ''}`;
  const type = /SIL Open Font License|\bOFL\b|openfontlicense\.org|scripts\.sil\.org\/OFL/i.test(both) ? 'OFL'
    : /Apache License|apache\.org\/licenses/i.test(both) ? 'Apache-2.0'
      : /Ubuntu Font Licen[cs]e/i.test(both) ? 'Ubuntu'
        : text || url ? 'other' : 'unknown';
  return { ...(text && { text }), ...(url && { url }), ...(vendorId && { vendorId }), type };
}

const humanize = (code: string) => code.toLowerCase().replace(/_/g, ' ');

function summarize(
  font: Font | undefined,
  format: FontFormat,
  fileSize: number,
  errors: ReportError[],
  warnings: ReportWarning[]
): string {
  const fatal = errors.filter(error => error.severity === 'error');
  if (fatal.length > 0 || !font) {
    const more = fatal.length > 1 ? ` (and ${fatal.length - 1} more error${fatal.length > 2 ? 's' : ''})` : '';
    return `Invalid: ${fatal[0]?.message ?? 'font could not be read'}${more}`;
  }
  const name = font.names.fullName?.en ?? font.names.fontFamily?.en ?? 'unnamed font';
  const listed = warnings.slice(0, 3).map(warning => humanize(warning.code)).join(', ');
  const more = warnings.length > 3 ? `, and ${warnings.length - 3} more` : '';
  const warningText = warnings.length === 0
    ? 'no warnings'
    : `${warnings.length} warning${warnings.length === 1 ? '' : 's'}: ${listed}${more}`;
  return `Valid ${format.toUpperCase()}, ${(fileSize / 1024).toFixed(1)} KB, ${font.numGlyphs} glyphs, ${name}; ${warningText}`;
}

const CSS_FORMATS: Record<FontFormat, string> = {
  ttf: 'truetype', otf: 'opentype', woff: 'woff', woff2: 'woff2', ttc: 'collection', unknown: 'opentype'
};

/** A @font-face rule for the validated font, named after the source file when there is one */
function fontFaceRule(font: Font, format: FontFormat, metadata: FontValidationReport['metadata'], source: FontInput): string {
  const family = font.names.preferredFamily?.en ?? font.names.fontFamily?.en ?? 'Font';
  const fileName = source.type === 'file' ? source.path.split(/[\\/]/).pop()
    : source.type === 'url' ? new URL(source.url).pathname.split('/').pop()
      : undefined;
  const url = fileName || `${font.names.postScriptName?.en ?? family.replace(/\s/g, '')}.${format === 'unknown' ? 'otf' : format}`;
  // A wght axis on the CSS scale gives a weight range; older Apple fonts use other scales (Skia: 0.48-3.2)
  const weightAxis = metadata.variationAxes.find(axis => axis.tag === 'wght' && axis.min >= 1 && axis.max <= 1000);
  const weight = weightAxis ? `${weightAxis.min} ${weightAxis.max}` : String(font.tables.os2?.usWeightClass ?? 400);
  const italic = Boolean((font.tables.os2?.fsSelection ?? 0) & 0x0001) || /italic|oblique/i.test(font.names.fontSubfamily?.en ?? '');
  const quote = (text: string) => JSON.stringify(text);
  return [
    '@font-face {',
    `  font-family: ${quote(family)};`,
    `  src: url(${quote(url)}) format(${quote(CSS_FORMATS[format])});`,
    `  font-weight: ${weight};`,
    `  font-style: ${italic ? 'italic' : 'normal'};`,
    '  font-display: swap;',
    '}'
  ].join('\n');
}
