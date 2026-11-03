#!/usr/bin/env node

import { ZodError } from 'zod';
import { ColorUtils } from '../util/colorUtils.js';
import {
  ColorBrandMatchInputSchema,
  BrandPaletteEntry,
  ColorInput,
  ColorMatch,
  ColorErrorCode,
  Color,
} from '../types/color.js';

/**
 * MCP Tool: color.brandMatch
 * Find the best matching colors from a brand palette
 */

export interface ColorBrandMatchResult {
  success: true;
  result: ColorMatch;
  metadata: {
    processingTime: number;
    checkedAt: string;
    brandPaletteSize: number;
    algorithm: string;
  };
}

export interface ColorBrandMatchError {
  success: false;
  error: {
    code: ColorErrorCode;
    message: string;
    details?: Record<string, unknown>;
    suggestions?: string[];
  };
}

export type ColorBrandMatchResponse = ColorBrandMatchResult | ColorBrandMatchError;

/**
 * Find best matching color in brand palette
 */
export async function colorBrandMatch(input: unknown): Promise<ColorBrandMatchResponse> {
  const startTime = performance.now();
  
  try {
    // Validate input
    const validated = ColorBrandMatchInputSchema.parse(input);
    const { 
      targetColor, 
      brandPalette, 
      maxDeltaE = 5,
      includeAlternatives = true 
    } = validated;
    
    // Parse target color
    const parsedTargetColor = ColorUtils.parseColorInput(targetColor);
    
    // Parse brand palette colors, keeping each entry's original position so
    // callers can map results (and skipped entries) back to their input
    const parsedBrandColors: Array<{ color: Color; paletteIndex: number; name?: string }> = [];
    const skipped: ColorMatch['skipped'] = [];
    brandPalette.forEach((entry, paletteIndex) => {
      const { color: colorInput, name } = unpackPaletteEntry(entry);
      try {
        parsedBrandColors.push({
          color: ColorUtils.parseColorInput(colorInput),
          paletteIndex,
          ...(name !== undefined && { name })
        });
      } catch (error) {
        skipped.push({
          paletteIndex,
          input: colorInput,
          ...(name !== undefined && { name }),
          reason: describeParseFailure(error)
        });
      }
    });
    
    if (parsedBrandColors.length === 0) {
      throw new Error('No valid colors found in brand palette');
    }
    
    // Calculate CIEDE2000 Delta E for each brand color. Delta E ignores
    // transparency, so the alpha difference is reported alongside it.
    const targetAlpha = alphaOf(parsedTargetColor);
    const matches = parsedBrandColors.map(brandColor => {
      const deltaE = ColorUtils.calculateDeltaE2000(parsedTargetColor, brandColor.color);
      return {
        color: brandColor.color,
        deltaE,
        withinThreshold: deltaE <= maxDeltaE,
        alphaDifference: Math.round(Math.abs(targetAlpha - alphaOf(brandColor.color)) * 100) / 100,
        paletteIndex: brandColor.paletteIndex,
        ...(brandColor.name !== undefined && { name: brandColor.name })
      };
    });
    
    // Sort by Delta E (closest first)
    matches.sort((a, b) => a.deltaE - b.deltaE);
    
    // Find best match
    const [bestMatch, ...otherMatches] = matches;
    
    // Determine confidence level based on Delta E
    const confidence = determineConfidence(bestMatch.deltaE, maxDeltaE);
    
    // Get alternatives if requested
    const alternatives = includeAlternatives ? otherMatches.slice(0, 3) : [];
    
    const endTime = performance.now();
    const processingTime = Math.round((endTime - startTime) * 100) / 100;
    
    // Ensure we meet performance requirements (<150ms for brand matching)
    if (processingTime > 150) {
      console.warn(`Brand matching took ${processingTime}ms, exceeding 150ms target`);
    }
    
    const result: ColorMatch = {
      inputColor: parsedTargetColor,
      bestMatch: bestMatch.color,
      deltaE: bestMatch.deltaE,
      confidence,
      withinThreshold: bestMatch.withinThreshold,
      alphaDifference: bestMatch.alphaDifference,
      paletteIndex: bestMatch.paletteIndex,
      ...(bestMatch.name !== undefined && { name: bestMatch.name }),
      alternatives,
      skipped
    };
    
    return {
      success: true,
      result,
      metadata: {
        processingTime,
        checkedAt: new Date().toISOString(),
        brandPaletteSize: parsedBrandColors.length,
        algorithm: 'ciede2000'
      }
    };
    
  } catch (error) {
    // Handle schema validation errors. Checked first: a ZodError's message is
    // itself JSON (the issue list), so the structured-error branch below would
    // otherwise return that array as the error, with no code or message.
    if (error instanceof ZodError) {
      return {
        success: false,
        error: {
          code: ColorErrorCode.BRAND_MATCH_FAILED,
          message: ColorUtils.describeValidationError(error),
          details: {
            input,
            validationErrors: error.issues,
            processingTime: Math.round((performance.now() - startTime) * 100) / 100
          },
          suggestions: [
            'Provide targetColor and a brandPalette of 1-50 colors',
            'Ensure maxDeltaE is between 0 and 100'
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
            code: ColorErrorCode.BRAND_MATCH_FAILED,
            message: error.message || 'Brand matching failed',
            details: {
              input,
              processingTime: Math.round((performance.now() - startTime) * 100) / 100
            },
            suggestions: [
              'Verify target color format is correct',
              'Check that brand palette contains valid colors',
              'Ensure maxDeltaE is a positive number',
              'Try with a larger brand palette for better matches'
            ]
          }
        };
      }
    }
    
    return {
      success: false,
      error: {
        code: ColorErrorCode.BRAND_MATCH_FAILED,
        message: 'Unknown error during brand matching',
        details: { input }
      }
    };
  }
}

/**
 * Split a palette entry into its color input and optional name
 */
function unpackPaletteEntry(entry: BrandPaletteEntry): { color: ColorInput; name?: string } {
  if (typeof entry === 'object' && 'name' in entry) {
    return { color: entry.color, name: entry.name };
  }
  return { color: entry };
}

/**
 * Turn a parse failure into a plain message. ColorUtils throws errors whose
 * message is a serialized ColorError, so unwrap that when present.
 */
function describeParseFailure(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Unknown parse error';
  }
  try {
    const parsed: unknown = JSON.parse(error.message);
    if (parsed && typeof parsed === 'object' && 'message' in parsed && typeof parsed.message === 'string') {
      return parsed.message;
    }
  } catch {
    // Not a serialized ColorError; fall through to the raw message
  }
  return error.message;
}

/**
 * Read a color's alpha (1 when opaque). Object inputs may carry alpha as a
 * fourth entry in values rather than in the alpha field.
 */
function alphaOf(color: Color): number {
  return color.alpha ?? (color.values.length === 4 ? color.values[3] : 1);
}

/**
 * Determine confidence level based on Delta E distance. 'exact' also requires
 * the match to be within maxDeltaE, so the label never contradicts
 * withinThreshold.
 */
function determineConfidence(deltaE: number, maxDeltaE: number): ColorMatch['confidence'] {
  if (deltaE < 1 && deltaE <= maxDeltaE) {
    return 'exact';
  } else if (deltaE <= maxDeltaE * 0.4) {
    return 'high';
  } else if (deltaE <= maxDeltaE * 0.8) {
    return 'medium';
  } else {
    return 'low';
  }
}

// Mirrors ColorInputSchema: a color string or a { space, values } object
const colorInputJsonSchema = {
  oneOf: [
    { type: 'string', minLength: 3, maxLength: 50 },
    {
      type: 'object',
      properties: {
        space: { enum: ['srgb', 'oklch', 'oklab', 'hsl', 'hsla', 'rgb', 'rgba', 'lab', 'lch'] },
        values: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 4 },
        alpha: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: ['space', 'values']
    }
  ]
};

/**
 * Tool definition for MCP server registration
 */
export const colorBrandMatchTool = {
  name: 'color.brandMatch',
  description: 'Find the best matching color from a brand palette using CIEDE2000 Delta E. Palette entries may be plain colors or { name, color } objects; results report each match\'s palette index, name, whether it falls within maxDeltaE, and its alpha difference (Delta E ignores transparency), plus any entries skipped as unparseable.',
  inputSchema: {
    type: 'object',
    properties: {
      targetColor: colorInputJsonSchema,
      brandPalette: {
        type: 'array',
        items: {
          oneOf: [
            ...colorInputJsonSchema.oneOf,
            {
              type: 'object',
              properties: {
                name: { type: 'string', minLength: 1, maxLength: 100 },
                color: colorInputJsonSchema
              },
              required: ['name', 'color']
            }
          ]
        },
        minItems: 1,
        maxItems: 50
      },
      maxDeltaE: { type: 'number', minimum: 0, maximum: 100, default: 5, description: 'CIEDE2000 distance at or below which a match counts as within threshold (about 1 is just noticeable, 2-3 is close)' },
      includeAlternatives: { type: 'boolean', default: true }
    },
    required: ['targetColor', 'brandPalette']
  }
};