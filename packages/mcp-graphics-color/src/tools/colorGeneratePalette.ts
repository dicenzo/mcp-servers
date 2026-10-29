#!/usr/bin/env node

import { ColorUtils } from '../util/colorUtils.js';
import {
  ColorPaletteInputSchema,
  ColorPaletteInput,
  ColorPalette,
  ColorErrorCode,
  Color
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
    const colors = ColorUtils.generateHarmonyPalette(parsedBaseColor, harmony, count);
    
    // Apply options if provided
    let processedColors = colors;
    if (options) {
      processedColors = await applyPaletteOptions(colors, options, space);
    }
    
    const endTime = performance.now();
    const processingTime = Math.round((endTime - startTime) * 100) / 100;
    
    // Ensure we meet performance requirements (<100ms for palette generation)
    if (processingTime > 100) {
      console.warn(`Palette generation took ${processingTime}ms, exceeding 100ms target`);
    }
    
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
      }
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
    if (error instanceof Error) {
      try {
        const colorError = JSON.parse(error.message);
        return {
          success: false,
          error: colorError
        };
      } catch {
        // Handle unstructured errors
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
 * Apply additional palette options (saturation/lightness adjustments)
 */
async function applyPaletteOptions(
  colors: Color[],
  options: NonNullable<ColorPaletteInput['options']>,
  _space: string
): Promise<Color[]> {
  const { saturationRange, lightnessRange, hueShift } = options;
  
  return colors.map((color, index) => {
    try {
      // Convert to HSL for easy manipulation
      const hslColor = ColorUtils.convertColor(color, 'hsl');
      let [h, s, l] = hslColor.values;
      
      // Apply hue shift
      if (hueShift !== undefined) {
        h = (h + hueShift) % 360;
      }
      
      // Apply saturation range
      if (saturationRange) {
        const [minS, maxS] = saturationRange;
        const factor = index / (colors.length - 1 || 1);
        s = minS + (maxS - minS) * factor;
      }
      
      // Apply lightness range
      if (lightnessRange) {
        const [minL, maxL] = lightnessRange;
        const factor = index / (colors.length - 1 || 1);
        l = minL + (maxL - minL) * factor;
      }
      
      // Create modified color and convert back to original space
      const modifiedHsl: Color = {
        space: 'hsl',
        values: [h, s, l],
        alpha: color.alpha
      };
      
      return ColorUtils.convertColor(modifiedHsl, color.space);
    } catch (error) {
      // If processing fails, return original color
      console.warn(`Failed to apply options to color ${index}:`, error);
      return color;
    }
  });
}

/**
 * Tool definition for MCP server registration
 */
export const colorGeneratePaletteTool = {
  name: 'color.generatePalette',
  description: 'Generate harmonious color palettes from a base color using various harmony rules (monochromatic, analogous, complementary, etc.)',
  inputSchema: {
    type: 'object',
    properties: {
      baseColor: { type: 'string' },
      harmony: { enum: ['monochromatic', 'analogous', 'complementary', 'triadic', 'tetradic', 'split-complementary'] },
      count: { type: 'number', minimum: 2, maximum: 20, default: 5 },
      space: { enum: ['oklch', 'hsl', 'lab'], default: 'oklch' }
    },
    required: ['baseColor', 'harmony']
  }
};