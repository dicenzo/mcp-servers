import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { TextToolResult } from '../types/typography.js';
import type { Font, LayoutTable } from 'opentype.js';
import { TypographyValidator } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';
import { 
  ValidateFontInputSchema, 
  ValidateFontInput, 
  FontValidationReport,
  TypographyErrorCode
} from '../types/typography.js';
import { UNICODE_BLOCKS, UNICODE_VERSION } from '../util/unicodeBlocks.js';
import { loadFontBuffer } from './loadFont.js';
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
        const fontBuffer = await loadFontBuffer(input.font);
        const loadTime = Date.now() - startTime;
        
        // Perform comprehensive font validation
        const validationReport = await performFontValidation(
          fontBuffer, 
          loadTime,
          input.options
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

/**
 * Performs comprehensive font validation
 */
async function performFontValidation(
  fontBuffer: Buffer,
  loadTime: number,
  options: ValidateFontInput['options']
): Promise<FontValidationReport> {
  try {
    const errors: Array<{
      code: string;
      message: string;
      severity: 'error' | 'warning' | 'info';
      location?: string;
    }> = [];
    
    const warnings: Array<{
      code: string;
      message: string;
      recommendation?: string;
    }> = [];
    
    const recommendations: string[] = [];
    
    // Files the parser can't read are reported as such, not as broken fonts
    const fileError = checkFontFile(fontBuffer);
    if (fileError) {
      errors.push(fileError);
      return createFailedValidationReport(errors, warnings, recommendations, fontBuffer, loadTime);
    }

    // Parse font using opentype.js
    let font: Font;
    let tables: SfntTables;
    
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
      return createFailedValidationReport(errors, warnings, recommendations, fontBuffer, loadTime);
    }
    
    // Detect font format
    const format = detectFontFormat(fontBuffer);
    const version = font.names.version?.en || 'Unknown';
    
    // Validate font structure
    const structureValidation = validateFontStructure(font, tables);
    errors.push(...structureValidation.errors);
    warnings.push(...structureValidation.warnings);
    
    // Check file size constraints
    if (options.maxFileSize && fontBuffer.length > options.maxFileSize) {
      warnings.push({
        code: 'FILE_SIZE_EXCEEDED',
        message: `Font file size (${fontBuffer.length} bytes) exceeds maximum (${options.maxFileSize} bytes)`,
        recommendation: 'Consider font subsetting or compression to reduce file size'
      });
    }
    
    // Check required features
    if (options.requiredFeatures && options.requiredFeatures.length > 0) {
      const availableFeatures = extractFeatures(font);
      const missingFeatures = options.requiredFeatures.filter(f => !availableFeatures.includes(f));
      
      if (missingFeatures.length > 0) {
        errors.push({
          code: 'MISSING_REQUIRED_FEATURES',
          message: `Missing required OpenType features: ${missingFeatures.join(', ')}`,
          severity: 'error',
          location: 'gsub/gpos-tables'
        });
      }
    }
    
    // Analyze font metadata
    const metadata = analyzeFontMetadata(font, format, tables);
    
    // Performance analysis
    const performance = options.checkPerformance ? analyzePerformance(font, fontBuffer, loadTime) : {
      loadTime: loadTime,
      fileSize: fontBuffer.length,
      glyphCount: font.numGlyphs,
      complexityScore: 0.5
    };
    
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
    const additionalRecommendations = generateRecommendations(font, format, tables, performance, compatibility.notes);
    recommendations.push(...additionalRecommendations);
    
    const validationReport: FontValidationReport = {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
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
      recommendations
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
function analyzeFontMetadata(font: Font, format: FontFormat, tables: SfntTables): FontValidationReport['metadata'] {
  const embedding = decodeEmbedding(font);
  return {
    hasValidTables: Boolean(font.tables.head && font.tables.hhea && font.tables.cmap),
    hasKerningInfo: Boolean(font.tables.kern || (font.tables.gpos && hasKerningInGPOS(font.tables.gpos))),
    hasOpenTypeFeatures: Boolean(font.tables.gsub || font.tables.gpos),
    hasVariationAxes: Boolean(font.tables.fvar),
    isWebOptimized: isWebOptimized(format, tables),
    hasLicense: Boolean(font.names.license),
    hasEmbeddingPermissions: embedding ? embedding.usage === 'installable' || embedding.usage === 'editable' : false,
    ...(embedding && { embedding })
  };
}

/**
 * Analyzes font performance characteristics
 */
function analyzePerformance(font: Font, fontBuffer: Buffer, loadTime: number): {
  loadTime: number;
  fileSize: number;
  glyphCount: number;
  complexityScore: number;
} {
  // Calculate complexity score based on various factors
  let complexityScore = 0;
  
  // File size factor (larger = more complex)
  const sizeScore = Math.min(fontBuffer.length / (1024 * 1024), 1); // Normalize to 1MB
  complexityScore += sizeScore * 0.3;
  
  // Glyph count factor
  const glyphScore = Math.min(font.numGlyphs / 65536, 1); // Normalize to max glyphs
  complexityScore += glyphScore * 0.3;
  
  // OpenType features factor
  const featureCount = extractFeatures(font).length;
  const featureScore = Math.min(featureCount / 50, 1); // Normalize to reasonable feature count
  complexityScore += featureScore * 0.2;
  
  // Tables factor
  const tableCount = Object.keys(font.tables).length;
  const tableScore = Math.min(tableCount / 20, 1); // Normalize to typical table count
  complexityScore += tableScore * 0.2;
  
  return {
    loadTime,
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
  if (!font.names.license) {
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
  font: Font,
  format: FontFormat,
  tables: SfntTables,
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
  const features = extractFeatures(font);
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
function checkFontFile(buffer: Buffer): FontValidationReport['errors'][number] | undefined {
  if (detectFontFormat(buffer) === 'ttc') {
    return {
      code: TypographyErrorCode.UNSUPPORTED_FORMAT,
      message: 'This is a font collection (.ttc/.otc), which type.validateFont can\'t read. Validate one of its fonts instead, for example with a system font source, which picks the face out of the collection.',
      severity: 'error',
      location: 'font-data'
    };
  }
  try {
    TypographyValidator.validateFontFile(buffer);
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
  loadTime: number
): FontValidationReport {
  return {
    isValid: false,
    format: detectFontFormat(fontBuffer),
    errors,
    warnings,
    metadata: {
      hasValidTables: false,
      hasKerningInfo: false,
      hasOpenTypeFeatures: false,
      hasVariationAxes: false,
      isWebOptimized: false,
      hasLicense: false,
      hasEmbeddingPermissions: false
    },
    performance: {
      loadTime,
      fileSize: fontBuffer.length,
      glyphCount: 0,
      complexityScore: 0
    },
    compatibility: {
      webBrowsers: {},
      operatingSystems: {},
      unicodeSupport: emptyUnicodeSupport()
    },
    recommendations
  };
}