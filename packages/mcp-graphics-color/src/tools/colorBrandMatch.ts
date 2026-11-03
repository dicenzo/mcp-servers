import { ZodError } from 'zod';
import { ColorUtils } from '../util/colorUtils.js';
import { ColorProcessingError } from '../util/colorError.js';
import {
  ColorBrandMatchInputSchema,
  BrandPaletteEntry,
  ColorInput,
  ColorMatch,
  ColorDifference,
  ColorErrorCode,
  Color,
  DEFAULT_MAX_DELTA_E,
  colorInputJsonSchema,
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
      maxDeltaE = DEFAULT_MAX_DELTA_E,
      includeAlternatives = true,
      maxAlternatives = 3
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
    
    // Drop entries indistinguishable from an earlier one (same CIEDE2000 color
    // and alpha) so alternatives aren't repeats; the first entry wins
    const uniqueBrandColors: typeof parsedBrandColors = [];
    const duplicates: ColorMatch['duplicates'] = [];
    for (const brandColor of parsedBrandColors) {
      const original = uniqueBrandColors.find(kept =>
        alphaDifference(kept.color, brandColor.color) === 0 &&
        ColorUtils.calculateDeltaE2000(kept.color, brandColor.color) === 0
      );
      if (original) {
        duplicates.push({
          paletteIndex: brandColor.paletteIndex,
          ...(brandColor.name !== undefined && { name: brandColor.name }),
          duplicateOf: original.paletteIndex
        });
      } else {
        uniqueBrandColors.push(brandColor);
      }
    }
    
    // Calculate CIEDE2000 Delta E for each brand color. Delta E ignores
    // transparency, so the alpha difference is reported alongside it.
    const matches = uniqueBrandColors.map(brandColor => {
      const deltaE = ColorUtils.calculateDeltaE2000(parsedTargetColor, brandColor.color);
      return {
        color: brandColor.color,
        deltaE,
        confidence: determineConfidence(deltaE, maxDeltaE),
        withinThreshold: deltaE <= maxDeltaE,
        alphaDifference: alphaDifference(parsedTargetColor, brandColor.color),
        difference: describeDifference(parsedTargetColor, brandColor.color),
        paletteIndex: brandColor.paletteIndex,
        ...(brandColor.name !== undefined && { name: brandColor.name })
      };
    });
    
    // Sort by Delta E (closest first)
    matches.sort((a, b) => a.deltaE - b.deltaE);
    
    // Find best match
    const [bestMatch, ...otherMatches] = matches;
    
    // Get alternatives if requested
    const alternatives = includeAlternatives ? otherMatches.slice(0, maxAlternatives) : [];
    
    const endTime = performance.now();
    const processingTime = Math.round((endTime - startTime) * 100) / 100;
    
    const result: ColorMatch = {
      inputColor: parsedTargetColor,
      bestMatch: bestMatch.color,
      deltaE: bestMatch.deltaE,
      confidence: bestMatch.confidence,
      withinThreshold: bestMatch.withinThreshold,
      alphaDifference: bestMatch.alphaDifference,
      difference: bestMatch.difference,
      paletteIndex: bestMatch.paletteIndex,
      ...(bestMatch.name !== undefined && { name: bestMatch.name }),
      alternatives,
      skipped,
      duplicates
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
 * Turn a parse failure into a plain message, adding the specific cause that
 * ColorUtils records in details.error
 */
function describeParseFailure(error: unknown): string {
  if (error instanceof ColorProcessingError) {
    const cause = error.details?.error;
    return typeof cause === 'string' ? `${error.message}: ${cause}` : error.message;
  }
  return error instanceof Error ? error.message : 'Unknown parse error';
}

/**
 * Read a color's alpha (1 when opaque). Object inputs may carry alpha as a
 * fourth entry in values rather than in the alpha field.
 */
function alphaOf(color: Color): number {
  return color.alpha ?? (color.values.length === 4 ? color.values[3] : 1);
}

function alphaDifference(a: Color, b: Color): number {
  return round2(Math.abs(alphaOf(a) - alphaOf(b)));
}

// Below these, a lightness/chroma/hue change isn't worth mentioning
const MIN_LIGHTNESS_CHANGE = 1;
const MIN_CHROMA_CHANGE = 1;
const MIN_HUE_CHANGE = 2;
// Hue is meaningless below this chroma (greys)
const MIN_CHROMA_FOR_HUE = 2;
// Hue angle (LCh degrees) treated as warmest; ~orange
const WARMEST_HUE = 50;

/**
 * Break down how `color` differs from `target` and describe it in words
 */
function describeDifference(target: Color, color: Color): ColorDifference {
  const from = ColorUtils.toLch(target);
  const to = ColorUtils.toLch(color);

  const lightness = to.l - from.l;
  const chroma = to.c - from.c;
  const hues = from.h !== undefined && to.h !== undefined &&
    from.c >= MIN_CHROMA_FOR_HUE && to.c >= MIN_CHROMA_FOR_HUE
    ? { from: from.h, to: to.h }
    : undefined;
  const hue = hues ? ((hues.to - hues.from + 540) % 360) - 180 : 0;

  const parts: string[] = [];
  if (Math.abs(lightness) >= MIN_LIGHTNESS_CHANGE) {
    parts.push(qualify(lightness > 0 ? 'lighter' : 'darker', lightness, 5));
  }
  if (Math.abs(chroma) >= MIN_CHROMA_CHANGE) {
    parts.push(qualify(chroma > 0 ? 'more saturated' : 'less saturated', chroma, 5));
  }
  if (hues && Math.abs(hue) >= MIN_HUE_CHANGE) {
    // Warmth peaks at WARMEST_HUE and is lowest opposite it (blue/cyan)
    const warmth = (h: number) => Math.cos(((h - WARMEST_HUE) * Math.PI) / 180);
    const warmer = warmth(hues.to) > warmth(hues.from);
    parts.push(qualify(warmer ? 'warmer' : 'cooler', hue, 10));
  }

  return {
    lightness: round2(lightness),
    chroma: round2(chroma),
    hue: round2(hue),
    summary: parts.length > 0 ? parts.join(', ') : 'no visible difference'
  };
}

function qualify(word: string, change: number, slightBelow: number): string {
  return Math.abs(change) < slightBelow ? `slightly ${word}` : word;
}

// Rounds to 2 decimals; `|| 0` turns -0 into 0 so identical colors read as 0
function round2(value: number): number {
  return Math.round(value * 100) / 100 || 0;
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
/**
 * Tool definition for MCP server registration
 */
export const colorBrandMatchTool = {
  name: 'color.brandMatch',
  description: 'Find the best matching color from a brand palette using CIEDE2000 Delta E. Palette entries may be plain colors or { name, color } objects; results report each match\'s palette index, name, whether it falls within maxDeltaE, its alpha difference (Delta E ignores transparency), and a lightness/chroma/hue breakdown with a plain-language summary. Unparseable entries are listed in skipped; entries identical to an earlier one are listed in duplicates and left out of matching.',
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
      maxDeltaE: { type: 'number', minimum: 0, maximum: 100, default: DEFAULT_MAX_DELTA_E, description: 'CIEDE2000 distance at or below which a match counts as within threshold (about 1 is just noticeable, 2-3 is close)' },
      includeAlternatives: { type: 'boolean', default: true },
      maxAlternatives: { type: 'integer', minimum: 0, maximum: 49, default: 3, description: 'How many runner-up matches to return' }
    },
    required: ['targetColor', 'brandPalette']
  }
};