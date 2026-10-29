#!/usr/bin/env node

import { ColorUtils } from '../util/colorUtils.js';
import {
  ColorBrandMatchInputSchema,
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
    
    // Parse brand palette colors
    const parsedBrandColors: Color[] = [];
    for (const brandColorInput of brandPalette) {
      try {
        const parsedColor = ColorUtils.parseColorInput(brandColorInput);
        parsedBrandColors.push(parsedColor);
      } catch (error) {
        console.warn('Skipping invalid brand color:', brandColorInput, error);
      }
    }
    
    if (parsedBrandColors.length === 0) {
      throw new Error('No valid colors found in brand palette');
    }
    
    // Calculate Delta E for each brand color
    const matches = parsedBrandColors.map((brandColor, index) => {
      const deltaE = ColorUtils.calculateDeltaE(parsedTargetColor, brandColor);
      return {
        color: brandColor,
        deltaE,
        index
      };
    });
    
    // Sort by Delta E (closest first)
    matches.sort((a, b) => a.deltaE - b.deltaE);
    
    // Find best match
    const bestMatch = matches[0];
    
    // Determine confidence level based on Delta E
    const confidence = determineConfidence(bestMatch.deltaE, maxDeltaE);
    
    // Get alternatives if requested
    const alternatives = includeAlternatives
      ? matches.slice(1, Math.min(4, matches.length)).map(match => ({
          color: match.color,
          deltaE: match.deltaE
        }))
      : [];
    
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
      alternatives
    };
    
    return {
      success: true,
      result,
      metadata: {
        processingTime,
        checkedAt: new Date().toISOString(),
        brandPaletteSize: parsedBrandColors.length,
        algorithm: 'deltaE-euclidean'
      }
    };
    
  } catch (error) {
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
 * Determine confidence level based on Delta E distance
 */
function determineConfidence(deltaE: number, maxDeltaE: number): ColorMatch['confidence'] {
  if (deltaE < 1) {
    return 'exact';
  } else if (deltaE <= maxDeltaE * 0.4) {
    return 'high';
  } else if (deltaE <= maxDeltaE * 0.8) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Tool definition for MCP server registration
 */
export const colorBrandMatchTool = {
  name: 'color.brandMatch',
  description: 'Find the best matching color from a brand palette using Delta E color difference calculations',
  inputSchema: {
    type: 'object',
    properties: {
      targetColor: { type: 'string' },
      brandPalette: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 50 },
      maxDeltaE: { type: 'number', minimum: 0, maximum: 100, default: 5 },
      includeAlternatives: { type: 'boolean', default: true }
    },
    required: ['targetColor', 'brandPalette']
  }
};