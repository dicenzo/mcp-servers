import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { TextToolResult } from '../types/typography.js';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import * as opentype from 'opentype.js';
import { TypographyValidator } from '../util/validation.js';
import { PerformanceMonitor, FontCache } from '../util/performance.js';
import {
  allowedFontRoots,
  resolveAllowedFontPath,
  validateFontUrl,
  publicOnlyHttpsAgent,
  FONT_DIRS_ENV,
  MAX_REMOTE_FONT_BYTES,
  REMOTE_FONT_TIMEOUT_MS
} from '../util/fontSources.js';
import { 
  LoadFontInputSchema, 
  FontInput, 
  FontMetadata, 
  TypographyErrorCode,
} from '../types/typography.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<TextToolResult>;
}

/**
 * Font Loading Tool - Loads and extracts metadata from font files
 */
export const loadFontTool: ExecutableTool = {
  name: 'type.loadFont',
  description: 'Load a font and extract comprehensive metadata including metrics, features, and Unicode support',
  inputSchema: {
    type: 'object',
    properties: {
      type: {
        type: 'string',
        enum: ['file', 'buffer', 'url', 'system'],
        description: 'Font input type'
      },
      path: {
        type: 'string',
        description: 'Path to a .ttf/.otf/.woff/.woff2 file in a system font directory or a directory listed in MCP_FONT_DIRS (for file type)'
      },
      data: {
        type: 'string',
        description: 'Base64 encoded font data (for buffer type)'
      },
      url: {
        type: 'string',
        description: 'Public https:// URL to a font file, no redirects (for url type)'
      },
      name: {
        type: 'string',
        description: 'System font name (for system type)'
      },
      format: {
        type: 'string',
        enum: ['ttf', 'otf', 'woff', 'woff2'],
        description: 'Font format hint (optional)'
      }
    },
    required: [],
    additionalProperties: false
  },

  async invoke(args: unknown) {
    try {
      const { result, metrics } = await PerformanceMonitor.measureOperation('type.loadFont', async () => {
        
        // Validate input
        const input = TypographyValidator.validateInput(LoadFontInputSchema, args) as FontInput;
        
        // Generate cache key
        const cacheKey = FontCache.generateCacheKey(input);
        
        // Check cache first
        const cached = FontCache.get(cacheKey);
        if (cached) {
          return {
            font: cached.metadata,
            cached: true,
            cacheKey
          };
        }

        // Load font data
        const fontBuffer = await loadFontBuffer(input);
        
        // Validate font file
        TypographyValidator.validateFontFile(fontBuffer);
        
        // Extract metadata using multiple libraries for comprehensive analysis
        const metadata = await extractFontMetadata(fontBuffer, input);
        
        // Cache the result
        FontCache.set(cacheKey, fontBuffer, metadata);
        
        return {
          font: metadata,
          cached: false,
          cacheKey
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...result,
            performance: {
              duration: metrics.duration,
              memoryUsed: metrics.memoryUsed,
              cached: result.cached
            }
          }, null, 2)
        }]
      };

    } catch (error) {
      console.error('[type.loadFont] Error:', error);
      
      let errorResponse;
      if (error instanceof Error) {
        try {
          const parsedError = JSON.parse(error.message);
          errorResponse = {
            error: true,
            code: parsedError.code || TypographyErrorCode.FONT_LOAD_FAILED,
            message: parsedError.message || error.message,
            details: parsedError.details,
            suggestions: parsedError.suggestions,
            tool: 'type.loadFont',
            timestamp: new Date().toISOString()
          };
        } catch {
          errorResponse = {
            error: true,
            code: TypographyErrorCode.FONT_LOAD_FAILED,
            message: error.message,
            tool: 'type.loadFont',
            timestamp: new Date().toISOString()
          };
        }
      } else {
        errorResponse = {
          error: true,
          code: TypographyErrorCode.FONT_LOAD_FAILED,
          message: 'Font loading failed',
          tool: 'type.loadFont',
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
 * Loads font data from various input sources.
 *
 * Callers pass `buffer.buffer` to opentype.parse, so the returned Buffer must own
 * its ArrayBuffer exactly: small Buffers (readFileSync, base64 decoding) are often
 * slices of Node's shared pool, and parsing the whole pool reads unrelated bytes.
 */
export async function loadFontBuffer(input: FontInput): Promise<Buffer> {
  const data = await readFontSource(input);
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) {
    return data;
  }
  const owned = Buffer.alloc(data.byteLength);
  data.copy(owned);
  return owned;
}

async function readFontSource(input: FontInput): Promise<Buffer> {
  switch (input.type) {
    case 'file': {
      const fontPath = resolveAllowedFontPath(input.path, allowedFontRoots(getSystemFontPaths()));
      if (!fontPath) {
        // Deliberately doesn't echo the path: callers may be probing the filesystem.
        throw new Error(JSON.stringify({
          code: TypographyErrorCode.FONT_LOAD_FAILED,
          message: 'Font file not found or not in an allowed font directory',
          suggestions: [
            'Use a .ttf, .otf, .woff, or .woff2 file',
            `Place the font in a system font directory or a directory listed in ${FONT_DIRS_ENV}`,
            'Or pass the font as base64 with type "buffer"'
          ]
        }));
      }
      return fs.readFileSync(fontPath);
    }

    case 'buffer': {
      if (!Buffer.isBuffer(input.data)) {
        // Try to decode base64 if it's a string
        if (typeof input.data === 'string') {
          try {
            return Buffer.from(input.data, 'base64');
          } catch {
            throw new Error(JSON.stringify({
              code: TypographyErrorCode.FONT_LOAD_FAILED,
              message: 'Invalid buffer data format',
              suggestions: [
                'Provide valid Buffer object',
                'Use base64 encoded string for buffer data'
              ]
            }));
          }
        }
        return input.data as Buffer;
      }
      return input.data;
    }

    case 'url': {
      const url = validateFontUrl(input.url);
      if (!url) {
        throw new Error(JSON.stringify({
          code: TypographyErrorCode.FONT_LOAD_FAILED,
          message: 'Font URL must be a public https:// address',
          suggestions: [
            'Use an https:// URL on a public host',
            'Local, private-network, and credentialed URLs are not allowed'
          ]
        }));
      }

      const fetch = (await import('node-fetch')).default;
      let response;
      try {
        response = await fetch(url.toString(), {
          agent: publicOnlyHttpsAgent(),
          redirect: 'error',
          signal: AbortSignal.timeout(REMOTE_FONT_TIMEOUT_MS),
          size: MAX_REMOTE_FONT_BYTES
        });
      } catch (error) {
        throw new Error(JSON.stringify({
          code: TypographyErrorCode.FONT_LOAD_FAILED,
          message: `Failed to fetch font from URL: ${error instanceof Error ? error.message : 'request failed'}`,
          suggestions: [
            'Verify the URL is reachable and does not redirect',
            `Fonts over ${MAX_REMOTE_FONT_BYTES / (1024 * 1024)}MB or slower than ${REMOTE_FONT_TIMEOUT_MS / 1000}s are rejected`
          ]
        }));
      }
      
      if (!response.ok) {
        throw new Error(JSON.stringify({
          code: TypographyErrorCode.FONT_LOAD_FAILED,
          message: `Failed to fetch font from URL: ${response.status} ${response.statusText}`,
          details: { url: input.url, status: response.status },
          suggestions: [
            'Verify the URL is accessible',
            'Check internet connection',
            'Ensure the URL points to a valid font file'
          ]
        }));
      }

      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    }

    case 'system': {
      // Try to find system font
      const systemFontPaths = getSystemFontPaths();
      let fontBuffer: Buffer | null = null;

      for (const fontPath of systemFontPaths) {
        try {
          const files = fs.readdirSync(fontPath);
          const fontFile = files.find(file => 
            file.toLowerCase().includes(input.name.toLowerCase()) &&
            (file.endsWith('.ttf') || file.endsWith('.otf'))
          );

          if (fontFile) {
            fontBuffer = fs.readFileSync(path.join(fontPath, fontFile));
            break;
          }
        } catch {
          // Continue searching in other paths
        }
      }

      if (!fontBuffer) {
        throw new Error(JSON.stringify({
          code: TypographyErrorCode.SYSTEM_FONT_ACCESS_FAILED,
          message: `System font not found: ${input.name}`,
          suggestions: [
            'Verify the font name is correct',
            'Check if the font is installed on the system',
            'Use the full font family name'
          ]
        }));
      }

      return fontBuffer;
    }

    default: {
      // Unreachable for validated input; reports the raw type if a caller bypasses validation.
      const unsupported: { type: string } = input;
      throw new Error(JSON.stringify({
        code: TypographyErrorCode.INVALID_INPUT,
        message: `Unsupported font input type: ${unsupported.type}`,
        suggestions: [
          'Use supported input types: file, buffer, url, system'
        ]
      }));
    }
  }
}

/**
 * Gets system font paths for different platforms
 */
function getSystemFontPaths(): string[] {
  const platform = process.platform;
  
  switch (platform) {
    case 'win32':
      return [
        'C:\\Windows\\Fonts',
        path.join(process.env.USERPROFILE || '', 'AppData', 'Local', 'Microsoft', 'Windows', 'Fonts')
      ];
    
    case 'darwin':
      return [
        '/System/Library/Fonts',
        '/Library/Fonts',
        path.join(process.env.HOME || '', 'Library', 'Fonts')
      ];
    
    case 'linux':
      return [
        '/usr/share/fonts',
        '/usr/local/share/fonts',
        path.join(process.env.HOME || '', '.fonts'),
        path.join(process.env.HOME || '', '.local', 'share', 'fonts')
      ];
    
    default:
      return [];
  }
}

/**
 * Extracts comprehensive metadata from font buffer
 */
async function extractFontMetadata(fontBuffer: Buffer, _input: FontInput): Promise<FontMetadata> {
  try {
    // Use opentype.js for primary metadata extraction
    const font = opentype.parse(fontBuffer.buffer as ArrayBuffer);
    
    // Extract basic metadata
    const metadata: FontMetadata = {
      family: font.names.fontFamily?.en || 'Unknown',
      subfamily: font.names.fontSubfamily?.en || 'Regular',
      fullName: font.names.fullName?.en || font.names.fontFamily?.en || 'Unknown',
      postScriptName: font.names.postScriptName?.en || 'Unknown',
      version: font.names.version?.en || '1.0',
      copyright: font.names.copyright?.en,
      manufacturer: font.names.manufacturer?.en,
      designer: font.names.designer?.en,
      description: font.names.description?.en,
      license: font.names.license?.en,
      licenseURL: font.names.licenseURL?.en,
      trademark: font.names.trademark?.en,
      unitsPerEm: font.unitsPerEm,
      ascender: font.ascender,
      descender: font.descender,
      lineGap: font.lineGap || 0,
      capHeight: font.tables?.os2?.sCapHeight,
      xHeight: font.tables?.os2?.sxHeight,
      bbox: {
        xMin: font.tables?.head?.xMin || 0,
        yMin: font.tables?.head?.yMin || 0,
        xMax: font.tables?.head?.xMax || 0,
        yMax: font.tables?.head?.yMax || 0
      },
      weightClass: font.tables?.os2?.usWeightClass || 400,
      widthClass: font.tables?.os2?.usWidthClass || 5,
      macStyle: font.tables?.head?.macStyle || 0,
      fsSelection: font.tables?.os2?.fsSelection || 0,
      isFixedPitch: Boolean(font.tables?.post?.isFixedPitch),
      isItalic: Boolean(font.tables?.head?.macStyle && (font.tables.head.macStyle & 0x02)),
      isBold: Boolean(font.tables?.head?.macStyle && (font.tables.head.macStyle & 0x01)),
      isRegular: !font.tables?.head?.macStyle,
      supportedScripts: extractSupportedScripts(font),
      supportedLanguages: extractSupportedLanguages(font),
      features: extractOpenTypeFeatures(font),
      numGlyphs: font.numGlyphs,
      format: detectFontFormat(fontBuffer),
      fileSize: fontBuffer.length,
      checksum: generateChecksum(fontBuffer)
    };

    return metadata;

  } catch (error) {
    throw new Error(JSON.stringify({
      code: TypographyErrorCode.FONT_LOAD_FAILED,
      message: `Failed to extract font metadata: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestions: [
        'Verify the font file is not corrupted',
        'Check if the font format is supported',
        'Try a different font file'
      ]
    }));
  }
}

/**
 * Detects font format from buffer
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
 * Extracts supported scripts from font
 */
function extractSupportedScripts(font: opentype.Font): string[] {
  const scripts = new Set<string>();
  
  // Check GSUB table for script tags
  if (font.tables?.gsub?.scripts) {
    for (const record of font.tables.gsub.scripts) {
      scripts.add(record.tag);
    }
  }
  
  // Check GPOS table for script tags
  if (font.tables?.gpos?.scripts) {
    for (const record of font.tables.gpos.scripts) {
      scripts.add(record.tag);
    }
  }
  
  // If no scripts found, assume Latin
  if (scripts.size === 0) {
    scripts.add('latn');
  }
  
  return Array.from(scripts);
}

/**
 * Extracts supported languages from font
 */
function extractSupportedLanguages(font: opentype.Font): string[] {
  const languages = new Set<string>();
  
  // Extract from GSUB table
  if (font.tables?.gsub?.scripts) {
    for (const record of font.tables.gsub.scripts) {
      for (const langSysRecord of record.script.langSysRecords) {
        languages.add(langSysRecord.tag);
      }
    }
  }
  
  // Extract from GPOS table
  if (font.tables?.gpos?.scripts) {
    for (const record of font.tables.gpos.scripts) {
      for (const langSysRecord of record.script.langSysRecords) {
        languages.add(langSysRecord.tag);
      }
    }
  }
  
  // If no languages found, assume undefined
  if (languages.size === 0) {
    languages.add('und');
  }
  
  return Array.from(languages);
}

/**
 * Extracts OpenType features from font
 */
function extractOpenTypeFeatures(font: opentype.Font): string[] {
  const features = new Set<string>();
  
  // Extract from GSUB table
  if (font.tables?.gsub?.features) {
    for (const record of font.tables.gsub.features) {
      features.add(record.tag);
    }
  }
  
  // Extract from GPOS table
  if (font.tables?.gpos?.features) {
    for (const record of font.tables.gpos.features) {
      features.add(record.tag);
    }
  }
  
  return Array.from(features);
}

/**
 * Generates checksum for font buffer
 */
function generateChecksum(buffer: Buffer): string {
  return createHash('md5').update(buffer).digest('hex');
}