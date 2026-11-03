import { ColorUtils } from '../util/colorUtils.js';
import { ColorProcessingError } from '../util/colorError.js';
import {
  ColorPaletteInputSchema,
  ColorPalette,
  ColorErrorCode,
  Color,
  colorInputJsonSchema
} from '../types/color.js';

/**
 * MCP Tool: color.generatePalette
 * Generate harmonious color palettes from a base color
 */

export interface ColorGeneratePaletteResult {
  success: true;
  result: ColorPalette;
  metadata: {
    processingTime: number;
    generatedAt: string;
    algorithm: string;
    colorSpace: string;
  };
  /** Present when the palette differs from what was asked for */
  warnings?: string[];
}

export interface ColorGeneratePaletteError {
  success: false;
  error: {
    code: ColorErrorCode;
    message: string;
    details?: Record<string, unknown>;
    suggestions?: string[];
  };
}

export type ColorGeneratePaletteResponse = ColorGeneratePaletteResult | ColorGeneratePaletteError;

/**
 * Generate harmonious color palette from base color
 */
export async function colorGeneratePalette(input: unknown): Promise<ColorGeneratePaletteResponse> {
  const startTime = performance.now();
  
  try {
    // Validate input
    const validated = ColorPaletteInputSchema.parse(input);
    const { 
      baseColor, 
      harmony, 
      count = 5, 
      space = 'oklch',
      options 
    } = validated;
    
    // Parse base color
    const parsedBaseColor = ColorUtils.parseColorInput(baseColor);
    
    // Generate harmony palette
    const colors = ColorUtils.generateHarmonyPalette(parsedBaseColor, harmony, count, space);
    const processedColors = options
      ? ColorUtils.adjustPaletteColors(colors, space, options)
      : colors;
    const warnings = paletteWarnings(parsedBaseColor, harmony, processedColors);
    
    const endTime = performance.now();
    const processingTime = Math.round((endTime - startTime) * 100) / 100;
    
    const palette: ColorPalette = {
      name: `${harmony}-palette-${count}`,
      colors: processedColors,
      harmony,
      metadata: {
        baseColor: parsedBaseColor,
        generatedAt: new Date().toISOString(),
        algorithm: `harmony-${harmony}`
      }
    };
    
    return {
      success: true,
      result: palette,
      metadata: {
        processingTime,
        generatedAt: new Date().toISOString(),
        algorithm: `harmony-${harmony}`,
        colorSpace: space
      },
      ...(warnings.length > 0 && { warnings })
    };
    
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      return {
        success: false,
        error: {
          code: ColorErrorCode.PALETTE_GENERATION_FAILED,
          message: 'Invalid input parameters',
          details: {
            input,
            validationErrors: error.message,
            processingTime: Math.round((performance.now() - startTime) * 100) / 100
          },
          suggestions: [
            'Verify base color format is correct',
            'Check harmony type is supported',
            'Ensure count is between 2 and 20',
            'Verify color space is valid'
          ]
        }
      };
    }
    
    // Handle structured errors from ColorUtils
    if (error instanceof ColorProcessingError) {
      return {
        success: false,
        error: error.toColorError()
      };
    }

    // Handle unstructured errors
    if (error instanceof Error) {
      return {
        success: false,
        error: {
          code: ColorErrorCode.PALETTE_GENERATION_FAILED,
          message: error.message || 'Palette generation failed',
          details: {
            input,
            processingTime: Math.round((performance.now() - startTime) * 100) / 100
          },
          suggestions: [
            'Verify base color format is correct',
            'Check harmony type is supported',
            'Ensure count is between 2 and 20',
            'Verify color space is valid'
          ]
        }
      };
    }
    
    return {
      success: false,
      error: {
        code: ColorErrorCode.PALETTE_GENERATION_FAILED,
        message: 'Unknown error during palette generation',
        details: { input }
      }
    };
  }
}

/**
 * Explain where the palette departs from the request: a grey base color can't
 * carry a hue harmony, and 8-bit rounding can make close colors identical.
 */
function paletteWarnings(baseColor: Color, harmony: string, colors: Color[]): string[] {
  const warnings: string[] = [];
  if (harmony !== 'monochromatic' && ColorUtils.isAchromatic(baseColor)) {
    warnings.push(`Base color has no meaningful hue, so a monochromatic ramp was generated instead of ${harmony}`);
  }

  const hexes = colors.map(color => ColorUtils.convertColor(color, 'hex').hex);
  const duplicates = hexes.length - new Set(hexes).size;
  if (duplicates > 0) {
    warnings.push(`${duplicates} color(s) are identical to another after rounding to 8-bit hex`);
  }
  return warnings;
}

/**
 * Tool definition for MCP server registration
 */
export const colorGeneratePaletteTool = {
  name: 'color.generatePalette',
  description: 'Generate a harmonious palette from a base color (monochromatic, analogous, complementary, triadic, tetradic, split-complementary). Hues are rotated in the chosen space (OKLCH by default, which keeps lightness perceptually even) and mapped into the sRGB gamut. The base color is always included; extra colors are tints and shades of the harmony hues. Grey base colors fall back to a monochromatic ramp and the result carries a warning. Options: hueShift rotates every color; lightnessRange and saturationRange (percent) replace lightness and chroma, spread from the first color to the last.',
  inputSchema: {
    type: 'object',
    properties: {
      baseColor: colorInputJsonSchema,
      harmony: { enum: ['monochromatic', 'analogous', 'complementary', 'triadic', 'tetradic', 'split-complementary'] },
      count: { type: 'integer', minimum: 2, maximum: 20, default: 5 },
      space: { enum: ['oklch', 'hsl', 'lab'], default: 'oklch', description: 'Space the harmony is computed in; lab uses its polar form (LCH)' },
      options: {
        type: 'object',
        properties: {
          hueShift: { type: 'number', minimum: -360, maximum: 360, description: 'Degrees to rotate every color' },
          lightnessRange: {
            type: 'array', items: { type: 'number', minimum: 0, maximum: 100 }, minItems: 2, maxItems: 2,
            description: '[first, last] lightness in percent, spread evenly across the palette'
          },
          saturationRange: {
            type: 'array', items: { type: 'number', minimum: 0, maximum: 100 }, minItems: 2, maxItems: 2,
            description: '[first, last] chroma in percent of the space maximum (OKLCH 0.4, LCH 150, HSL 100%), spread evenly across the palette'
          }
        }
      }
    },
    required: ['baseColor', 'harmony']
  }
};
