import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { TextToolResult } from '../types/typography.js';
import type { Font, Glyph } from 'opentype.js';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TypographyValidator } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';
import { 
  SubsetFontInputSchema, 
  SubsetFontInput, 
  FontSubset,
  TypographyErrorCode,
  MAX_CODEPOINT,
  MAX_UNICODE_RANGES
} from '../types/typography.js';
import { loadFontBuffer } from './loadFont.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<TextToolResult>;
}

/**
 * Font Subsetting Tool - Creates optimized font subsets for web use
 */
export const subsetFontTool: ExecutableTool = {
  name: 'type.subsetFont',
  description: 'Create optimized font subsets containing only specified characters for web optimization',
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
        description: 'Font to subset'
      },
      options: {
        type: 'object',
        properties: {
          characters: {
            type: 'string',
            description: 'Characters to include in subset'
          },
          unicodeRanges: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                start: { type: 'integer', minimum: 0, maximum: MAX_CODEPOINT },
                end: { type: 'integer', minimum: 0, maximum: MAX_CODEPOINT }
              },
              required: ['start', 'end']
            },
            maxItems: MAX_UNICODE_RANGES,
            description: 'Unicode ranges to include'
          },
          features: {
            type: 'array',
            items: { type: 'string' },
            description: 'OpenType features to preserve'
          },
          hinting: {
            type: 'boolean',
            default: true,
            description: 'Preserve font hinting'
          },
          desubroutinize: {
            type: 'boolean',
            default: false,
            description: 'Remove subroutines (reduces size but may affect quality)'
          },
          removeKerning: {
            type: 'boolean',
            default: false,
            description: 'Remove kerning information'
          },
          removeNames: {
            type: 'boolean',
            default: false,
            description: 'Remove font name table'
          },
          removeLayout: {
            type: 'boolean',
            default: false,
            description: 'Remove OpenType layout tables'
          },
          optimize: {
            type: 'boolean',
            default: true,
            description: 'Apply additional optimizations'
          }
        },
        required: ['characters'],
        additionalProperties: false
      }
    },
    required: ['font', 'options'],
    additionalProperties: false
  },

  async invoke(args: unknown) {
    try {
      const { result, metrics } = await PerformanceMonitor.measureOperation('type.subsetFont', async () => {
        
        // Validate input
        const input = TypographyValidator.validateInput(SubsetFontInputSchema, args) as SubsetFontInput;
        
        // Validate Unicode ranges if provided
        if (input.options.unicodeRanges) {
          TypographyValidator.validateUnicodeRanges(input.options.unicodeRanges);
        }
        
        // Load original font
        const fontBuffer = await loadFontBuffer(input.font);
        const originalSize = fontBuffer.length;
        
        // Create font subset
        const fontSubset = await createFontSubset(fontBuffer, input.options);
        
        // Calculate compression ratio
        const compressionRatio = (originalSize - fontSubset.fontData.length) / originalSize;
        
        return {
          subset: {
            ...fontSubset,
            originalSize,
            compressionRatio
          },
          originalSize,
          subsetSize: fontSubset.fontData.length
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...result,
            // Convert Buffer to base64 for JSON serialization
            subset: {
              ...result.subset,
              fontData: result.subset.fontData.toString('base64')
            },
            performance: {
              duration: metrics.duration,
              memoryUsed: metrics.memoryUsed
            }
          }, null, 2)
        }]
      };

    } catch (error) {
      console.error('[type.subsetFont] Error:', error);
      
      let errorResponse;
      if (error instanceof Error) {
        try {
          const parsedError = JSON.parse(error.message);
          errorResponse = {
            error: true,
            code: parsedError.code || TypographyErrorCode.SUBSETTING_FAILED,
            message: parsedError.message || error.message,
            details: parsedError.details,
            suggestions: parsedError.suggestions,
            tool: 'type.subsetFont',
            timestamp: new Date().toISOString()
          };
        } catch {
          errorResponse = {
            error: true,
            code: TypographyErrorCode.SUBSETTING_FAILED,
            message: error.message,
            tool: 'type.subsetFont',
            timestamp: new Date().toISOString()
          };
        }
      } else {
        errorResponse = {
          error: true,
          code: TypographyErrorCode.SUBSETTING_FAILED,
          message: 'Font subsetting failed',
          tool: 'type.subsetFont',
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
 * Creates a font subset with specified options
 */
async function createFontSubset(
  fontBuffer: Buffer,
  options: {
    characters: string;
    unicodeRanges?: Array<{ start: number; end: number }>;
    features?: string[];
    hinting?: boolean;
    desubroutinize?: boolean;
    removeKerning?: boolean;
    removeNames?: boolean;
    removeLayout?: boolean;
    optimize?: boolean;
  }
): Promise<FontSubset> {
  try {
    // Try to use professional subsetting libraries
    let subsetBuffer: Buffer;
    let glyphsIncluded: number;
    let totalGlyphs: number;
    
    try {
      // Attempt to use fonttools/pyftsubset via Node.js subprocess
      subsetBuffer = await createSubsetWithFonttools(fontBuffer, options);
      const glyphCounts = await getGlyphCounts(fontBuffer, subsetBuffer);
      glyphsIncluded = glyphCounts.subset;
      totalGlyphs = glyphCounts.total;
    } catch {
      console.warn('[Font Subset] Fonttools not available, using fallback method');
      
      // Fallback to opentype.js based subsetting
      const fallbackResult = await createBasicSubset(fontBuffer, options);
      subsetBuffer = fallbackResult.buffer;
      glyphsIncluded = fallbackResult.glyphsIncluded;
      totalGlyphs = fallbackResult.totalGlyphs;
    }
    
    // Analyze character coverage
    const charactersIncluded = Array.from(new Set(options.characters.split('')));
    const unicodeRanges = analyzeUnicodeRanges(charactersIncluded);
    
    // Determine features included
    const featuresIncluded = options.features || [];
    
    // Generate checksum
    const checksum = generateChecksum(subsetBuffer);
    
    // Detect format
    const format = detectFontFormat(subsetBuffer);
    
    const fontSubset: FontSubset = {
      fontData: subsetBuffer,
      originalSize: fontBuffer.length,
      subsetSize: subsetBuffer.length,
      compressionRatio: (fontBuffer.length - subsetBuffer.length) / fontBuffer.length,
      charactersIncluded,
      unicodeRanges,
      glyphsIncluded,
      totalGlyphs,
      featuresIncluded,
      format,
      checksum,
      subsetInfo: {
        createdAt: new Date().toISOString(),
        tool: 'mcp-graphics-type',
        version: '1.0.0'
      }
    };
    
    return fontSubset;
    
  } catch (error) {
    throw new Error(JSON.stringify({
      code: TypographyErrorCode.SUBSETTING_FAILED,
      message: `Font subsetting failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestions: [
        'Check if the font file is valid',
        'Verify character list contains valid Unicode characters',
        'Try with fewer characters or simpler options',
        'Ensure sufficient disk space for temporary files'
      ]
    }));
  }
}

/**
 * Creates font subset using fonttools/pyftsubset (professional approach)
 */
async function createSubsetWithFonttools(
  fontBuffer: Buffer,
  options: {
    characters: string;
    unicodeRanges?: Array<{ start: number; end: number }>;
    features?: string[];
    hinting?: boolean;
    desubroutinize?: boolean;
    removeKerning?: boolean;
    removeNames?: boolean;
    removeLayout?: boolean;
    optimize?: boolean;
  }
): Promise<Buffer> {
  
  // Create temporary files
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'font-subset-'));
  const inputPath = path.join(tempDir, 'input.ttf');
  const outputPath = path.join(tempDir, 'output.ttf');
  
  try {
    // Write input font
    fs.writeFileSync(inputPath, fontBuffer);
    
    // Build pyftsubset command
    const args = ['-m', 'fontTools.subset', inputPath];
    
    // Add character specification
    const unicodes = Array.from(options.characters).map(c => c.codePointAt(0)).filter((u): u is number => Boolean(u));
    const unicodeSpecs = unicodes.map(u => u.toString(16));

    // Unicode ranges go in the same --unicodes list (pyftsubset accepts "start-end" hex ranges)
    if (options.unicodeRanges) {
      unicodeSpecs.push(...mergeUnicodeRanges(options.unicodeRanges).map(r => `${r.start.toString(16)}-${r.end.toString(16)}`));
    }
    args.push(`--unicodes=${unicodeSpecs.join(',')}`);
    
    // Add feature options
    if (options.features && options.features.length > 0) {
      args.push(`--layout-features=${options.features.join(',')}`);
    } else if (options.removeLayout) {
      args.push('--no-layout-closure');
    }
    
    // Add optimization options
    if (options.desubroutinize) {
      args.push('--desubroutinize');
    }
    
    if (options.removeKerning) {
      args.push('--drop-tables=kern,KERN');
    }
    
    if (options.removeNames) {
      args.push('--drop-tables=name');
    }
    
    if (!options.hinting) {
      args.push('--no-hinting');
    }
    
    // Set output path
    args.push(`--output-file=${outputPath}`);
    
    // Execute pyftsubset
    await new Promise<void>((resolve, reject) => {
      const proc = spawn('python3', args, {
        stdio: ['pipe', 'pipe', 'pipe'],
        cwd: tempDir
      });
      
      let stderr = '';
      
      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      proc.on('close', (code: number | null) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`pyftsubset failed: ${stderr}`));
        }
      });
      
      proc.on('error', (error: Error) => {
        reject(new Error(`Failed to spawn pyftsubset: ${error.message}`));
      });
    });
    
    // Read output font
    const subsetBuffer = fs.readFileSync(outputPath);
    
    return subsetBuffer;
    
  } finally {
    // Cleanup temporary files
    try {
      if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
      if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      fs.rmdirSync(tempDir);
    } catch (cleanupError) {
      console.warn('[Font Subset] Cleanup failed:', cleanupError);
    }
  }
}

/**
 * Creates basic font subset using opentype.js (fallback approach)
 */
async function createBasicSubset(
  fontBuffer: Buffer,
  options: {
    characters: string;
    unicodeRanges?: Array<{ start: number; end: number }>;
    features?: string[];
    hinting?: boolean;
    desubroutinize?: boolean;
    removeKerning?: boolean;
    removeNames?: boolean;
    removeLayout?: boolean;
    optimize?: boolean;
  }
): Promise<{ buffer: Buffer; glyphsIncluded: number; totalGlyphs: number }> {
  const opentype = await import('opentype.js');
  const font = opentype.parse(fontBuffer.buffer as ArrayBuffer);
  
  // Get characters to include
  const characters = Array.from(new Set(options.characters.split('')));
  const glyphsToInclude = new Set<Glyph>();
  
  // Add glyphs for specified characters
  for (const char of characters) {
    const glyph = font.charToGlyph(char);
    if (glyph) {
      glyphsToInclude.add(glyph);
    }
  }
  
  // Add glyphs for Unicode ranges if specified. Walk the font's cmap rather
  // than every codepoint in each range: a range can span 1.1M codepoints.
  if (options.unicodeRanges) {
    for (const codepoint of codepointsInRanges(font, options.unicodeRanges)) {
      const glyph = font.charToGlyph(String.fromCodePoint(codepoint));
      if (glyph) {
        glyphsToInclude.add(glyph);
      }
    }
  }
  
  // Always include .notdef glyph (index 0)
  if (font.glyphs.glyphs[0]) {
    glyphsToInclude.add(font.glyphs.glyphs[0]);
  }
  
  // Create new font with subset of glyphs
  // Note: This is a simplified implementation
  // Full subsetting requires complex table manipulation
  const glyphArray = Array.from(glyphsToInclude);
  
  // Create a minimal subset (this is a basic implementation)
  // In a real implementation, you would need to:
  // 1. Remap glyph indices
  // 2. Update character mappings
  // 3. Remove unused tables
  // 4. Optimize table sizes
  
  const subsetFont = new opentype.Font({
    familyName: font.names.fontFamily?.en || 'Subset',
    styleName: font.names.fontSubfamily?.en || 'Regular',
    unitsPerEm: font.unitsPerEm,
    ascender: font.ascender,
    descender: font.descender,
    glyphs: glyphArray
  });
  
  // Convert to buffer
  const arrayBuffer = subsetFont.toArrayBuffer();
  const subsetBuffer = Buffer.from(arrayBuffer);
  
  return {
    buffer: subsetBuffer,
    glyphsIncluded: glyphArray.length,
    totalGlyphs: font.numGlyphs
  };
}

/**
 * Sorts ranges and merges any that overlap or touch, so each codepoint is
 * covered by exactly one range.
 */
export function mergeUnicodeRanges(
  ranges: Array<{ start: number; end: number }>
): Array<{ start: number; end: number }> {
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: Array<{ start: number; end: number }> = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end + 1) {
      last.end = Math.max(last.end, range.end);
    } else {
      merged.push({ start: range.start, end: range.end });
    }
  }

  return merged;
}

/**
 * Returns the codepoints mapped by the font's cmap that fall inside any of
 * the ranges. Cost is proportional to the cmap size, not the range span.
 */
export function codepointsInRanges(
  font: Font,
  ranges: Array<{ start: number; end: number }>
): number[] {
  const merged = mergeUnicodeRanges(ranges);
  const glyphIndexMap = font.tables.cmap?.glyphIndexMap ?? {};

  const inRanges = (codepoint: number): boolean => {
    // Binary search over the sorted, non-overlapping ranges
    let low = 0;
    let high = merged.length - 1;
    while (low <= high) {
      const mid = (low + high) >> 1;
      const range = merged[mid];
      if (!range) {
        return false;
      }
      if (codepoint < range.start) {
        high = mid - 1;
      } else if (codepoint > range.end) {
        low = mid + 1;
      } else {
        return true;
      }
    }
    return false;
  };

  return Object.keys(glyphIndexMap)
    .map(Number)
    .filter(codepoint => Number.isInteger(codepoint) && inRanges(codepoint));
}

/**
 * Gets glyph counts from original and subset fonts
 */
async function getGlyphCounts(originalBuffer: Buffer, subsetBuffer: Buffer): Promise<{ total: number; subset: number }> {
  try {
    const opentype = await import('opentype.js');
    const originalFont = opentype.parse(originalBuffer.buffer as ArrayBuffer);
    const subsetFont = opentype.parse(subsetBuffer.buffer as ArrayBuffer);
    
    return {
      total: originalFont.numGlyphs,
      subset: subsetFont.numGlyphs
    };
  } catch {
    // Return estimates if parsing fails
    return {
      total: Math.floor(originalBuffer.length / 100), // Rough estimate
      subset: Math.floor(subsetBuffer.length / 100)
    };
  }
}

/**
 * Analyzes Unicode ranges covered by characters
 */
function analyzeUnicodeRanges(characters: string[]): Array<{ start: number; end: number; name?: string }> {
  const codepoints = characters.map(c => c.codePointAt(0)).filter((cp): cp is number => Boolean(cp)).sort((a, b) => a - b);
  
  if (codepoints.length === 0) {
    return [];
  }
  
  const ranges: Array<{ start: number; end: number; name?: string }> = [];
  let currentStart = codepoints[0];
  let currentEnd = codepoints[0];
  
  for (let i = 1; i < codepoints.length; i++) {
    const cp = codepoints[i];
    
    if (cp <= currentEnd + 1) {
      // Extend current range
      currentEnd = cp;
    } else {
      // Start new range
      ranges.push({
        start: currentStart,
        end: currentEnd,
        name: getUnicodeBlockName(currentStart)
      });
      currentStart = cp;
      currentEnd = cp;
    }
  }
  
  // Add final range
  ranges.push({
    start: currentStart,
    end: currentEnd,
    name: getUnicodeBlockName(currentStart)
  });
  
  return ranges;
}

/**
 * Gets Unicode block name for a codepoint
 */
function getUnicodeBlockName(codepoint: number): string {
  // Basic block detection (simplified)
  if (codepoint >= 0x0000 && codepoint <= 0x007F) return 'Basic Latin';
  if (codepoint >= 0x0080 && codepoint <= 0x00FF) return 'Latin-1 Supplement';
  if (codepoint >= 0x0100 && codepoint <= 0x017F) return 'Latin Extended-A';
  if (codepoint >= 0x0180 && codepoint <= 0x024F) return 'Latin Extended-B';
  if (codepoint >= 0x0370 && codepoint <= 0x03FF) return 'Greek and Coptic';
  if (codepoint >= 0x0400 && codepoint <= 0x04FF) return 'Cyrillic';
  if (codepoint >= 0x0530 && codepoint <= 0x058F) return 'Armenian';
  if (codepoint >= 0x0590 && codepoint <= 0x05FF) return 'Hebrew';
  if (codepoint >= 0x0600 && codepoint <= 0x06FF) return 'Arabic';
  if (codepoint >= 0x4E00 && codepoint <= 0x9FFF) return 'CJK Unified Ideographs';
  
  return 'Unknown Block';
}

/**
 * Detects font format from buffer signature
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

/**
 * Generates MD5 checksum for buffer
 */
function generateChecksum(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex');
}
