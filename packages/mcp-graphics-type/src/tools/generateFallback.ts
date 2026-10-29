import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { TextToolResult } from '../types/typography.js';
import type { Font } from 'opentype.js';
import { TypographyValidator } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';
import { 
  GenerateFallbackInputSchema, 
  GenerateFallbackInput, 
  FontInput,
  SystemFontStack,
  TypographyErrorCode 
} from '../types/typography.js';
import { loadFontBuffer } from './loadFont.js';

type GenericFamily = SystemFontStack['genericFamily'];
type TargetPlatform = SystemFontStack['platform'];

interface FontCharacteristics {
  isSerif: boolean;
  isMonospace: boolean;
  weight: number;
  width: number;
  style: string;
  scripts: string[];
  features: string[];
  xHeight: number;
  capHeight: number;
  ascender: number;
  descender: number;
}

interface FallbackOptions {
  textContent?: string;
  preferredGenericFamily?: GenericFamily;
  includeWebFonts?: boolean;
}

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<TextToolResult>;
}

/**
 * System Font Stack Generation Tool - Creates optimal fallback font stacks
 */
export const generateFallbackTool: ExecutableTool = {
  name: 'type.generateFallback',
  description: 'Generate optimal system font fallback stacks based on primary font characteristics and target platforms',
  inputSchema: {
    type: 'object',
    properties: {
      primaryFont: {
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
        description: 'Primary font to generate fallbacks for'
      },
      targetPlatforms: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['windows', 'macos', 'linux', 'ios', 'android', 'web']
        },
        default: ['web'],
        description: 'Target platforms for font stack'
      },
      textContent: {
        type: 'string',
        description: 'Sample text content to analyze for character coverage (optional)'
      },
      preferredGenericFamily: {
        type: 'string',
        enum: ['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui'],
        description: 'Preferred generic font family fallback'
      },
      includeWebFonts: {
        type: 'boolean',
        default: false,
        description: 'Include web font fallbacks in the stack'
      }
    },
    required: ['primaryFont'],
    additionalProperties: false
  },

  async invoke(args: unknown) {
    try {
      const { result, metrics } = await PerformanceMonitor.measureOperation('type.generateFallback', async () => {
        
        // Validate input
        const input = TypographyValidator.validateInput(GenerateFallbackInputSchema, args) as GenerateFallbackInput;
        
        // Load primary font
        const fontBuffer = await loadFontBuffer(input.primaryFont);
        
        // Generate fallback stack
        const fontStack = await generateSystemFontStack(
          fontBuffer, 
          input.primaryFont,
          input.targetPlatforms || ['web'],
          {
            textContent: input.textContent,
            preferredGenericFamily: input.preferredGenericFamily,
            includeWebFonts: input.includeWebFonts || false
          }
        );
        
        return {
          fontStack,
          targetPlatforms: input.targetPlatforms || ['web']
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
      console.error('[type.generateFallback] Error:', error);
      
      let errorResponse;
      if (error instanceof Error) {
        try {
          const parsedError = JSON.parse(error.message);
          errorResponse = {
            error: true,
            code: parsedError.code || TypographyErrorCode.SYSTEM_FONT_ACCESS_FAILED,
            message: parsedError.message || error.message,
            details: parsedError.details,
            suggestions: parsedError.suggestions,
            tool: 'type.generateFallback',
            timestamp: new Date().toISOString()
          };
        } catch {
          errorResponse = {
            error: true,
            code: TypographyErrorCode.SYSTEM_FONT_ACCESS_FAILED,
            message: error.message,
            tool: 'type.generateFallback',
            timestamp: new Date().toISOString()
          };
        }
      } else {
        errorResponse = {
          error: true,
          code: TypographyErrorCode.SYSTEM_FONT_ACCESS_FAILED,
          message: 'Fallback font stack generation failed',
          tool: 'type.generateFallback',
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
 * Generates optimal system font stack based on primary font characteristics
 */
async function generateSystemFontStack(
  fontBuffer: Buffer,
  primaryFontInput: FontInput,
  targetPlatforms: TargetPlatform[],
  options: FallbackOptions
): Promise<SystemFontStack> {
  try {
    // Analyze primary font characteristics
    const fontCharacteristics = await analyzeFontCharacteristics(fontBuffer);
    
    // Get primary font name
    const primaryFontName = await getPrimaryFontName(fontBuffer, primaryFontInput);
    
    // Generate fallback candidates for each platform
    const fallbackCandidates = new Map<string, string[]>();
    
    for (const platform of targetPlatforms) {
      const candidates = generatePlatformSpecificFallbacks(fontCharacteristics, platform, options);
      fallbackCandidates.set(platform, candidates);
    }
    
    // Create unified fallback stack
    const unifiedStack = createUnifiedFallbackStack(
      fallbackCandidates,
      fontCharacteristics,
      options
    );
    
    // Test font availability on current system
    const availableFonts = await testFontAvailability(unifiedStack);
    
    // Determine generic family
    const genericFamily = options.preferredGenericFamily || 
                         determineGenericFamily(fontCharacteristics);
    
    // Generate CSS declaration
    const cssDeclaration = generateCSSDeclaration(primaryFontName, unifiedStack, genericFamily);
    
    // Calculate confidence score
    const confidence = calculateConfidenceScore(availableFonts, fontCharacteristics, options.textContent);
    
    const fontStack: SystemFontStack = {
      primaryFont: primaryFontName,
      fallbackStack: unifiedStack,
      genericFamily,
      cssDeclaration,
      platform: determinePrimaryPlatform(targetPlatforms),
      confidence,
      availableFonts
    };
    
    return fontStack;
    
  } catch (error) {
    throw new Error(JSON.stringify({
      code: TypographyErrorCode.SYSTEM_FONT_ACCESS_FAILED,
      message: `Font stack generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestions: [
        'Check if the primary font can be analyzed',
        'Verify target platforms are supported',
        'Ensure system fonts are accessible'
      ]
    }));
  }
}

/**
 * Analyzes font characteristics for fallback selection
 */
async function analyzeFontCharacteristics(fontBuffer: Buffer): Promise<FontCharacteristics> {
  const opentype = await import('opentype.js');
  const font = opentype.parse(fontBuffer.buffer as ArrayBuffer);
  
  // Analyze font properties
  const os2Table = font.tables.os2;
  const postTable = font.tables.post;
  
  const characteristics = {
    isSerif: detectSerif(font),
    isMonospace: Boolean(postTable?.isFixedPitch),
    weight: os2Table?.usWeightClass || 400,
    width: os2Table?.usWidthClass || 5,
    style: detectStyle(font),
    scripts: extractSupportedScripts(font),
    features: extractFeatures(font),
    xHeight: (os2Table?.sxHeight || 0) / font.unitsPerEm,
    capHeight: (os2Table?.sCapHeight || 0) / font.unitsPerEm,
    ascender: font.ascender / font.unitsPerEm,
    descender: font.descender / font.unitsPerEm
  };
  
  return characteristics;
}

/**
 * Gets primary font name from font data or input
 */
async function getPrimaryFontName(fontBuffer: Buffer, primaryFontInput: FontInput): Promise<string> {
  if (primaryFontInput.type === 'system') {
    return primaryFontInput.name;
  }
  
  try {
    const opentype = await import('opentype.js');
    const font = opentype.parse(fontBuffer.buffer as ArrayBuffer);
    return font.names.fontFamily?.en || 'Unknown Font';
  } catch {
    return 'Unknown Font';
  }
}

/**
 * Generates platform-specific fallback fonts
 */
function generatePlatformSpecificFallbacks(
  characteristics: FontCharacteristics,
  platform: TargetPlatform,
  options: { includeWebFonts?: boolean }
): string[] {
  const fallbacks: string[] = [];
  
  switch (platform) {
    case 'web':
      fallbacks.push(...getWebFallbacks(characteristics, options.includeWebFonts));
      break;
    case 'windows':
      fallbacks.push(...getWindowsFallbacks(characteristics));
      break;
    case 'macos':
      fallbacks.push(...getMacOSFallbacks(characteristics));
      break;
    case 'linux':
      fallbacks.push(...getLinuxFallbacks(characteristics));
      break;
    case 'ios':
      fallbacks.push(...getIOSFallbacks(characteristics));
      break;
    case 'android':
      fallbacks.push(...getAndroidFallbacks(characteristics));
      break;
  }
  
  return fallbacks;
}

/**
 * Gets web-safe fallback fonts
 */
function getWebFallbacks(characteristics: FontCharacteristics, includeWebFonts?: boolean): string[] {
  const fallbacks: string[] = [];
  
  if (includeWebFonts) {
    // Add popular web fonts
    if (characteristics.isSerif) {
      fallbacks.push('Georgia', 'Times New Roman', 'Times');
    } else if (characteristics.isMonospace) {
      fallbacks.push('Monaco', 'Menlo', 'Consolas', 'Courier New');
    } else {
      fallbacks.push('Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif');
    }
  } else {
    // System fonts only
    if (characteristics.isSerif) {
      fallbacks.push('Georgia', 'Times New Roman', 'serif');
    } else if (characteristics.isMonospace) {
      fallbacks.push('Consolas', 'Monaco', 'Courier New', 'monospace');
    } else {
      fallbacks.push('system-ui', '-apple-system', 'BlinkMacSystemFont', 'Arial', 'sans-serif');
    }
  }
  
  return fallbacks;
}

/**
 * Gets Windows-specific fallback fonts
 */
function getWindowsFallbacks(characteristics: FontCharacteristics): string[] {
  if (characteristics.isSerif) {
    return ['Georgia', 'Times New Roman', 'Cambria', 'serif'];
  } else if (characteristics.isMonospace) {
    return ['Consolas', 'Courier New', 'monospace'];
  } else {
    return ['Segoe UI', 'Tahoma', 'Arial', 'sans-serif'];
  }
}

/**
 * Gets macOS-specific fallback fonts
 */
function getMacOSFallbacks(characteristics: FontCharacteristics): string[] {
  if (characteristics.isSerif) {
    return ['Georgia', 'Times New Roman', 'Times', 'serif'];
  } else if (characteristics.isMonospace) {
    return ['Menlo', 'Monaco', 'Courier New', 'monospace'];
  } else {
    return ['-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'Helvetica', 'Arial', 'sans-serif'];
  }
}

/**
 * Gets Linux-specific fallback fonts
 */
function getLinuxFallbacks(characteristics: FontCharacteristics): string[] {
  if (characteristics.isSerif) {
    return ['Liberation Serif', 'Times New Roman', 'serif'];
  } else if (characteristics.isMonospace) {
    return ['Liberation Mono', 'DejaVu Sans Mono', 'monospace'];
  } else {
    return ['Liberation Sans', 'DejaVu Sans', 'Arial', 'sans-serif'];
  }
}

/**
 * Gets iOS-specific fallback fonts
 */
function getIOSFallbacks(characteristics: FontCharacteristics): string[] {
  if (characteristics.isSerif) {
    return ['Georgia', 'Times New Roman', 'serif'];
  } else if (characteristics.isMonospace) {
    return ['Menlo', 'Courier New', 'monospace'];
  } else {
    return ['-apple-system', 'San Francisco', 'Helvetica Neue', 'sans-serif'];
  }
}

/**
 * Gets Android-specific fallback fonts
 */
function getAndroidFallbacks(characteristics: FontCharacteristics): string[] {
  if (characteristics.isSerif) {
    return ['Noto Serif', 'serif'];
  } else if (characteristics.isMonospace) {
    return ['Roboto Mono', 'monospace'];
  } else {
    return ['Roboto', 'sans-serif'];
  }
}

/**
 * Creates unified fallback stack from platform-specific candidates
 */
function createUnifiedFallbackStack(
  platformCandidates: Map<string, string[]>,
  _characteristics: FontCharacteristics,
  _options: FallbackOptions
): string[] {
  const fontCounts = new Map<string, number>();
  const allCandidates = new Set<string>();
  
  // Count font appearances across platforms
  for (const candidates of platformCandidates.values()) {
    for (const font of candidates) {
      fontCounts.set(font, (fontCounts.get(font) || 0) + 1);
      allCandidates.add(font);
    }
  }
  
  // Sort by frequency and relevance
  const sortedFonts = Array.from(allCandidates).sort((a, b) => {
    const countA = fontCounts.get(a) || 0;
    const countB = fontCounts.get(b) || 0;
    
    // Prefer fonts that appear on more platforms
    if (countA !== countB) {
      return countB - countA;
    }
    
    // Prefer system fonts over others
    const systemFontsA = isSystemFont(a) ? 1 : 0;
    const systemFontsB = isSystemFont(b) ? 1 : 0;
    
    return systemFontsB - systemFontsA;
  });
  
  // Limit to reasonable number of fallbacks
  return sortedFonts.slice(0, 8);
}

/**
 * Tests font availability on current system
 */
async function testFontAvailability(fontStack: string[]): Promise<Array<{
  name: string;
  path?: string;
  isInstalled: boolean;
  priority: number;
}>> {
  const availableFonts: Array<{
    name: string;
    path?: string;
    isInstalled: boolean;
    priority: number;
  }> = [];
  
  for (let i = 0; i < fontStack.length; i++) {
    const fontName = fontStack[i];
    const isInstalled = await checkFontInstalled(fontName);
    const fontPath = isInstalled ? await findFontPath(fontName) : undefined;
    
    availableFonts.push({
      name: fontName,
      path: fontPath,
      isInstalled,
      priority: i + 1
    });
  }
  
  return availableFonts;
}

/**
 * Helper functions for font detection and analysis
 */
function detectSerif(font: Font): boolean {
  // Simple heuristic: check if font name contains serif indicators
  const fontName = (font.names.fontFamily?.en || '').toLowerCase();
  const serifKeywords = ['serif', 'times', 'georgia', 'cambria', 'garamond'];
  return serifKeywords.some(keyword => fontName.includes(keyword));
}

function detectStyle(font: Font): string {
  const macStyle = font.tables?.head?.macStyle || 0;
  
  if (macStyle & 0x02) return 'italic';
  if (macStyle & 0x01) return 'bold';
  return 'normal';
}

function extractSupportedScripts(font: Font): string[] {
  const scripts = new Set<string>();
  
  if (font.tables?.gsub?.scripts) {
    for (const scriptTag of Object.keys(font.tables.gsub.scripts)) {
      scripts.add(scriptTag);
    }
  }
  
  return Array.from(scripts);
}

function extractFeatures(font: Font): string[] {
  const features = new Set<string>();
  
  if (font.tables?.gsub?.features) {
    for (const feature of Object.keys(font.tables.gsub.features)) {
      features.add(feature);
    }
  }
  
  return Array.from(features);
}

function determineGenericFamily(characteristics: FontCharacteristics): GenericFamily {
  if (characteristics.isMonospace) return 'monospace';
  if (characteristics.isSerif) return 'serif';
  return 'sans-serif';
}

function determinePrimaryPlatform(platforms: TargetPlatform[]): TargetPlatform {
  if (platforms.includes('web')) return 'web';
  if (platforms.includes('macos')) return 'macos';
  if (platforms.includes('windows')) return 'windows';
  return platforms[0];
}

function generateCSSDeclaration(primaryFont: string, fallbackStack: string[], genericFamily: string): string {
  const allFonts = [primaryFont, ...fallbackStack, genericFamily];
  const quotedFonts = allFonts.map(font => 
    font.includes(' ') || font.includes('-') ? `"${font}"` : font
  );
  return `font-family: ${quotedFonts.join(', ')};`;
}

function calculateConfidenceScore(
  availableFonts: SystemFontStack['availableFonts'],
  characteristics: FontCharacteristics,
  _textContent?: string
): number {
  let score = 0;
  
  // Base score from available fonts
  const installedCount = availableFonts.filter(f => f.isInstalled).length;
  score += (installedCount / availableFonts.length) * 0.4;
  
  // Bonus for system fonts
  const systemFontCount = availableFonts.filter(f => f.isInstalled && isSystemFont(f.name)).length;
  score += (systemFontCount / availableFonts.length) * 0.3;
  
  // Bonus for font characteristics coverage
  if (characteristics.scripts.includes('latn')) score += 0.2;
  if (characteristics.features.length > 0) score += 0.1;
  
  return Math.min(1, score);
}

function isSystemFont(fontName: string): boolean {
  const systemFonts = [
    'system-ui', '-apple-system', 'BlinkMacSystemFont',
    'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial',
    'sans-serif', 'serif', 'monospace'
  ];
  return systemFonts.includes(fontName);
}

async function checkFontInstalled(fontName: string): Promise<boolean> {
  // Simple check - in a real implementation, you would use system APIs
  const systemFonts = ['Arial', 'Helvetica', 'Times New Roman', 'Georgia', 'Courier New'];
  return systemFonts.includes(fontName) || isSystemFont(fontName);
}

async function findFontPath(_fontName: string): Promise<string | undefined> {
  // In a real implementation, you would search system font directories
  return undefined;
}