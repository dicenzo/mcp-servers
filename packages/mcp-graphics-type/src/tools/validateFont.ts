import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { TypographyValidator } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';
import { 
  ValidateFontInputSchema, 
  ValidateFontInput, 
  FontValidationReport,
  TypographyErrorCode,
  UNICODE_BLOCKS 
} from '../types/typography.js';
import { loadFontBuffer } from './loadFont.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

/**
 * Font Validation Tool - Comprehensive font analysis and validation
 */
export const validateFontTool: ExecutableTool = {
  name: 'type.validateFont',
  description: 'Perform comprehensive font validation including format checking, performance analysis, and compatibility testing',
  inputSchema: {
    type: 'object',
    properties: {
      font: {
        oneOf: [
          {
            type: 'object',
            properties: {
              type: { const: 'file' },
              path: { type: 'string' },
              format: { type: 'string', enum: ['ttf', 'otf', 'woff', 'woff2'] }
            },
            required: ['type', 'path']
          },
          {
            type: 'object', 
            properties: {
              type: { const: 'buffer' },
              data: { type: 'string' },
              format: { type: 'string', enum: ['ttf', 'otf', 'woff', 'woff2'] }
            },
            required: ['type', 'data']
          },
          {
            type: 'object',
            properties: {
              type: { const: 'url' },
              url: { type: 'string' },
              format: { type: 'string', enum: ['ttf', 'otf', 'woff', 'woff2'] }
            },
            required: ['type', 'url']
          },
          {
            type: 'object',
            properties: {
              type: { const: 'system' },
              name: { type: 'string' }
            },
            required: ['type', 'name']
          }
        ],
        description: 'Font to validate'
      },
      options: {
        type: 'object',
        properties: {
          checkLicense: {
            type: 'boolean',
            default: true,
            description: 'Check font license and embedding permissions'
          },
          checkPerformance: {
            type: 'boolean',
            default: true,
            description: 'Analyze font performance characteristics'
          },
          checkCompatibility: {
            type: 'boolean',
            default: true,
            description: 'Test compatibility across platforms and browsers'
          },
          targetPlatforms: {
            type: 'array',
            items: { type: 'string' },
            default: ['web'],
            description: 'Platforms to test compatibility for'
          },
          maxFileSize: {
            type: 'number',
            description: 'Maximum acceptable file size in bytes'
          },
          requiredFeatures: {
            type: 'array',
            items: { type: 'string' },
            description: 'OpenType features that must be present'
          }
        },
        additionalProperties: false
      }
    },
    required: ['font'],
    additionalProperties: false
  },

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
          input.options || {}
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
  options: {
    checkLicense?: boolean;
    checkPerformance?: boolean;
    checkCompatibility?: boolean;
    targetPlatforms?: string[];
    maxFileSize?: number;
    requiredFeatures?: string[];
  }
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
    
    // Parse font using opentype.js
    const opentype = await import('opentype.js');
    let font: any;
    
    try {
      font = opentype.parse(fontBuffer.buffer as ArrayBuffer);
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
    const structureValidation = validateFontStructure(font);
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
    const metadata = analyzeFontMetadata(font);
    
    // Performance analysis
    const performance = options.checkPerformance ? analyzePerformance(font, fontBuffer, loadTime) : {
      loadTime: loadTime,
      fileSize: fontBuffer.length,
      glyphCount: font.numGlyphs,
      complexityScore: 0.5
    };
    
    // Compatibility analysis
    const compatibility = options.checkCompatibility ? 
      analyzeCompatibility(font, fontBuffer, options.targetPlatforms || ['web']) : {
        webBrowsers: {},
        operatingSystems: {},
        unicodeSupport: {
          version: 'Unknown',
          supportedBlocks: [],
          missingBlocks: []
        }
      };
    
    // License analysis
    if (options.checkLicense) {
      const licenseAnalysis = analyzeLicense(font);
      warnings.push(...licenseAnalysis.warnings);
      recommendations.push(...licenseAnalysis.recommendations);
    }
    
    // Generate recommendations
    const additionalRecommendations = generateRecommendations(font, fontBuffer, performance, compatibility);
    recommendations.push(...additionalRecommendations);
    
    const validationReport: FontValidationReport = {
      isValid: errors.filter(e => e.severity === 'error').length === 0,
      format,
      version,
      errors,
      warnings,
      metadata,
      performance,
      compatibility,
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
function validateFontStructure(font: any): {
  errors: Array<{ code: string; message: string; severity: 'error' | 'warning' | 'info'; location?: string }>;
  warnings: Array<{ code: string; message: string; recommendation?: string }>;
} {
  const errors: Array<{ code: string; message: string; severity: 'error' | 'warning' | 'info'; location?: string }> = [];
  const warnings: Array<{ code: string; message: string; recommendation?: string }> = [];
  
  // Check required tables
  const requiredTables = ['cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'os2', 'post'];
  
  for (const tableName of requiredTables) {
    if (!font.tables[tableName]) {
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
  const cmap: any = font.tables.cmap;
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
function analyzeFontMetadata(font: any): {
  hasValidTables: boolean;
  hasKerningInfo: boolean;
  hasOpenTypeFeatures: boolean;
  hasVariationAxes: boolean;
  isWebOptimized: boolean;
  hasLicense: boolean;
  hasEmbeddingPermissions: boolean;
} {
  return {
    hasValidTables: Boolean(font.tables.head && font.tables.hhea && font.tables.cmap),
    hasKerningInfo: Boolean(font.tables.kern || (font.tables.gpos && hasKerningInGPOS(font.tables.gpos))),
    hasOpenTypeFeatures: Boolean(font.tables.gsub || font.tables.gpos),
    hasVariationAxes: Boolean(font.tables.fvar),
    isWebOptimized: isWebOptimized(font),
    hasLicense: Boolean(font.names.license),
    hasEmbeddingPermissions: Boolean(font.tables.os2 && font.tables.os2.fsType !== undefined)
  };
}

/**
 * Analyzes font performance characteristics
 */
function analyzePerformance(font: any, fontBuffer: Buffer, loadTime: number): {
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
function analyzeCompatibility(font: any, fontBuffer: Buffer, _platforms: string[]): {
  webBrowsers: Record<string, boolean>;
  operatingSystems: Record<string, boolean>;
  unicodeSupport: {
    version: string;
    supportedBlocks: string[];
    missingBlocks: string[];
  };
} {
  const format = detectFontFormat(fontBuffer);
  
  // Web browser compatibility
  const webBrowsers: Record<string, boolean> = {
    'Chrome': true, // Supports all formats
    'Firefox': format !== 'woff2' || true, // Modern Firefox supports WOFF2
    'Safari': format === 'ttf' || format === 'otf' || format === 'woff',
    'Edge': true,
    'Internet Explorer': format === 'ttf' || format === 'otf'
  };
  
  // Operating system compatibility
  const operatingSystems: Record<string, boolean> = {
    'Windows': format === 'ttf' || format === 'otf',
    'macOS': true,
    'Linux': format === 'ttf' || format === 'otf',
    'iOS': format !== 'woff2',
    'Android': format === 'ttf' || format === 'otf'
  };
  
  // Unicode support analysis
  const unicodeSupport = analyzeUnicodeSupport(font);
  
  return {
    webBrowsers,
    operatingSystems,
    unicodeSupport
  };
}

/**
 * Analyzes font license and embedding permissions
 */
function analyzeLicense(font: any): {
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
  if (font.tables.os2 && font.tables.os2.fsType !== undefined) {
    const fsType = font.tables.os2.fsType;
    
    if (fsType === 2) {
      warnings.push({
        code: 'RESTRICTED_LICENSE',
        message: 'Font has restricted embedding permissions',
        recommendation: 'Check license terms for web use restrictions'
      });
    } else if (fsType === 4) {
      warnings.push({
        code: 'PRINT_PREVIEW_ONLY',
        message: 'Font is restricted to print and preview embedding',
        recommendation: 'May not be suitable for web use'
      });
    } else if (fsType === 8) {
      warnings.push({
        code: 'EDITABLE_EMBEDDING_ONLY',
        message: 'Font allows editable embedding only',
        recommendation: 'Check if this meets your use case requirements'
      });
    }
  }
  
  return { warnings, recommendations };
}

/**
 * Generates recommendations based on analysis
 */
function generateRecommendations(font: any, fontBuffer: Buffer, performance: any, compatibility: any): string[] {
  const recommendations: string[] = [];
  
  // File size recommendations
  if (performance.fileSize > 1024 * 1024) {
    recommendations.push('Consider font subsetting to reduce file size for web use');
  }
  
  if (performance.fileSize > 100 * 1024 && !font.tables.woff) {
    recommendations.push('Consider using WOFF/WOFF2 compression for web deployment');
  }
  
  // Performance recommendations
  if (performance.glyphCount > 10000) {
    recommendations.push('Large glyph count detected - consider subsetting for better performance');
  }
  
  if (performance.complexityScore > 0.8) {
    recommendations.push('High complexity font - test loading performance on target devices');
  }
  
  // Compatibility recommendations
  const unsupportedBrowsers = Object.entries(compatibility.webBrowsers)
    .filter(([_, supported]) => !supported)
    .map(([browser]) => browser);
    
  if (unsupportedBrowsers.length > 0) {
    recommendations.push(`Consider providing fallback formats for: ${unsupportedBrowsers.join(', ')}`);
  }
  
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
function detectFontFormat(buffer: Buffer): 'ttf' | 'otf' | 'woff' | 'woff2' {
  const signature = buffer.subarray(0, 4);
  
  if (signature.equals(Buffer.from([0x77, 0x4F, 0x46, 0x46]))) {
    return 'woff';
  } else if (signature.equals(Buffer.from([0x77, 0x4F, 0x46, 0x32]))) {
    return 'woff2';
  } else if (signature.equals(Buffer.from([0x4F, 0x54, 0x54, 0x4F]))) {
    return 'otf';
  } else {
    return 'ttf';
  }
}

function extractFeatures(font: any): string[] {
  const features = new Set<string>();
  
  if (font.tables?.gsub?.features) {
    for (const feature of Object.keys(font.tables.gsub.features)) {
      features.add(feature);
    }
  }
  
  if (font.tables?.gpos?.features) {
    for (const feature of Object.keys(font.tables.gpos.features)) {
      features.add(feature);
    }
  }
  
  return Array.from(features);
}

function hasKerningInGPOS(gposTable: any): boolean {
  return Boolean(gposTable.features?.kern);
}

function isWebOptimized(font: any): boolean {
  // Check for web optimization indicators
  const hasWebOptimizations = Boolean(
    font.tables.os2 && // Has OS/2 table for web metrics
    font.tables.cmap && // Has character mapping
    font.names.license // Has license info
  );
  
  return hasWebOptimizations;
}

function analyzeUnicodeSupport(font: any): {
  version: string;
  supportedBlocks: string[];
  missingBlocks: string[];
} {
  const supportedBlocks: string[] = [];
  const missingBlocks: string[] = [];
  
  // Analyze character coverage (simplified)
  if (font.tables.cmap) {
    // Check basic Latin coverage
    const hasBasicLatin = font.hasChar && font.hasChar('A'); // opentype.js takes a character, not a code point
    if (hasBasicLatin) {
      supportedBlocks.push('Basic Latin');
    } else {
      missingBlocks.push('Basic Latin');
    }
    
    // Add more Unicode block analysis as needed
    UNICODE_BLOCKS.slice(0, 10).forEach(block => {
      if (!supportedBlocks.includes(block)) {
        missingBlocks.push(block);
      }
    });
  }
  
  return {
    version: 'Unicode 15.0', // Default assumption
    supportedBlocks,
    missingBlocks: missingBlocks.slice(0, 5) // Limit to prevent overflow
  };
}

function createFailedValidationReport(
  errors: any[],
  warnings: any[],
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
      unicodeSupport: {
        version: 'Unknown',
        supportedBlocks: [],
        missingBlocks: []
      }
    },
    recommendations
  };
}