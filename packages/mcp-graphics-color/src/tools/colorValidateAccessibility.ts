#!/usr/bin/env node

import { z } from 'zod';
import { ColorUtils } from '../util/colorUtils.js';
import {
  ColorInput,
  ColorInputSchema,
  Color,
  ColorErrorCode,
  AccessibilityContext
} from '../types/color.js';

/**
 * MCP Tool: color.validateAccessibility
 * Comprehensive accessibility validation for color combinations
 */

// Input schema for accessibility validation
export const ColorValidateAccessibilityInputSchema = z.object({
  colors: z.array(ColorInputSchema).min(2).max(10),
  contexts: z.array(z.object({
    name: z.string(),
    foreground: z.number().min(0),
    background: z.number().min(0),
    textSize: z.enum(['normal', 'large']).default('normal'),
    level: z.enum(['AA', 'AAA']).default('AA'),
    description: z.string().optional()
  })).min(1),
  includeAPCA: z.boolean().default(false),
  includeRecommendations: z.boolean().default(true)
});

export type ColorValidateAccessibilityInput = z.infer<typeof ColorValidateAccessibilityInputSchema>;

export interface AccessibilityValidationResult {
  context: string;
  foregroundColor: Color;
  backgroundColor: Color;
  wcag: {
    ratio: number;
    level: 'AA' | 'AAA';
    textSize: 'normal' | 'large';
    passed: boolean;
    requiredRatio: number;
  };
  apca?: {
    score: number;
    passed: boolean;
    minScore: number;
  };
  recommendations?: string[];
}

export interface ColorValidateAccessibilityResult {
  success: true;
  result: {
    overallPassed: boolean;
    totalChecks: number;
    passedChecks: number;
    failedChecks: number;
    validations: AccessibilityValidationResult[];
    summary: {
      wcagAANormalPassed: number;
      wcagAALargePassed: number;
      wcagAAAPassed: number;
      averageContrast: number;
    };
  };
  metadata: {
    processingTime: number;
    checkedAt: string;
    wcagVersion: string;
    apcaIncluded: boolean;
  };
}

export interface ColorValidateAccessibilityError {
  success: false;
  error: {
    code: ColorErrorCode;
    message: string;
    details?: Record<string, unknown>;
    suggestions?: string[];
  };
}

export type ColorValidateAccessibilityResponse = ColorValidateAccessibilityResult | ColorValidateAccessibilityError;

/**
 * Comprehensive accessibility validation for multiple color contexts
 */
export async function colorValidateAccessibility(input: unknown): Promise<ColorValidateAccessibilityResponse> {
  const startTime = performance.now();
  
  try {
    // Validate input
    const validated = ColorValidateAccessibilityInputSchema.parse(input);
    const { colors, contexts, includeAPCA = false, includeRecommendations = true } = validated;
    
    // Parse colors
    const parsedColors: Color[] = [];
    for (const colorInput of colors) {
      try {
        const parsedColor = ColorUtils.parseColorInput(colorInput);
        parsedColors.push(parsedColor);
      } catch (error) {
        console.warn('Skipping invalid color:', colorInput, error);
      }
    }
    
    if (parsedColors.length < 2) {
      throw new Error('At least 2 valid colors are required for accessibility validation');
    }
    
    // Perform accessibility validations
    const validations: AccessibilityValidationResult[] = [];
    let totalContrast = 0;
    let wcagAANormalPassed = 0;
    let wcagAALargePassed = 0;
    let wcagAAAPassed = 0;
    
    for (const context of contexts) {
      const { name, foreground, background, textSize, level, description } = context;
      
      // Validate color indices
      if (foreground >= parsedColors.length || background >= parsedColors.length) {
        console.warn(`Skipping context ${name}: invalid color indices`);
        continue;
      }
      
      const fgColor = parsedColors[foreground];
      const bgColor = parsedColors[background];
      
      // Calculate WCAG contrast
      const ratio = ColorUtils.calculateContrastRatio(fgColor, bgColor);
      totalContrast += ratio;
      
      const requiredRatio = getRequiredContrastRatio(textSize, level);
      const wcagPassed = ratio >= requiredRatio;
      
      // Track passed checks
      if (ratio >= 4.5) wcagAANormalPassed++;
      if (ratio >= 3.0) wcagAALargePassed++;
      if (ratio >= 7.0) wcagAAAPassed++;
      
      const validation: AccessibilityValidationResult = {
        context: name,
        foregroundColor: fgColor,
        backgroundColor: bgColor,
        wcag: {
          ratio: Math.round(ratio * 100) / 100,
          level,
          textSize,
          passed: wcagPassed,
          requiredRatio
        }
      };
      
      // Add APCA scoring if requested
      if (includeAPCA) {
        const apcaScore = calculateAPCAScore(fgColor, bgColor);
        const minAPCAScore = getMinAPCAScore(textSize);
        validation.apca = {
          score: apcaScore,
          passed: Math.abs(apcaScore) >= minAPCAScore,
          minScore: minAPCAScore
        };
      }
      
      // Add recommendations if requested
      if (includeRecommendations) {
        validation.recommendations = generateRecommendations(validation, fgColor, bgColor);
      }
      
      validations.push(validation);
    }
    
    const totalChecks = validations.length;
    const passedChecks = validations.filter(v => v.wcag.passed).length;
    const failedChecks = totalChecks - passedChecks;
    const overallPassed = failedChecks === 0;
    const averageContrast = totalChecks > 0 ? totalContrast / totalChecks : 0;
    
    const endTime = performance.now();
    const processingTime = Math.round((endTime - startTime) * 100) / 100;
    
    // Ensure we meet performance requirements (<50ms for accessibility validation)
    if (processingTime > 50) {
      console.warn(`Accessibility validation took ${processingTime}ms, exceeding 50ms target`);
    }
    
    return {
      success: true,
      result: {
        overallPassed,
        totalChecks,
        passedChecks,
        failedChecks,
        validations,
        summary: {
          wcagAANormalPassed,
          wcagAALargePassed,
          wcagAAAPassed,
          averageContrast: Math.round(averageContrast * 100) / 100
        }
      },
      metadata: {
        processingTime,
        checkedAt: new Date().toISOString(),
        wcagVersion: '2.1',
        apcaIncluded: includeAPCA
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
      } catch (parseError) {
        // Handle unstructured errors
        return {
          success: false,
          error: {
            code: ColorErrorCode.ACCESSIBILITY_CHECK_FAILED,
            message: error.message || 'Accessibility validation failed',
            details: {
              input,
              processingTime: Math.round((performance.now() - startTime) * 100) / 100
            },
            suggestions: [
              'Verify all colors in the palette are valid',
              'Check that context indices are within range',
              'Ensure at least 2 colors are provided',
              'Verify text size and level parameters are correct'
            ]
          }
        };
      }
    }
    
    return {
      success: false,
      error: {
        code: ColorErrorCode.ACCESSIBILITY_CHECK_FAILED,
        message: 'Unknown error during accessibility validation',
        details: { input }
      }
    };
  }
}

/**
 * Get required contrast ratio for WCAG compliance
 */
function getRequiredContrastRatio(textSize: 'normal' | 'large', level: 'AA' | 'AAA'): number {
  const ratios = {
    AA: { normal: 4.5, large: 3.0 },
    AAA: { normal: 7.0, large: 4.5 }
  };
  
  return ratios[level][textSize];
}

/**
 * Calculate APCA score (simplified implementation)
 * Note: This is a simplified version. Full APCA requires more complex calculations.
 */
function calculateAPCAScore(foreground: Color, background: Color): number {
  // Simplified APCA calculation - in production, use the official APCA library
  const fgLuminance = getRelativeLuminance(foreground);
  const bgLuminance = getRelativeLuminance(background);
  
  // Simplified contrast score (not actual APCA)
  const contrast = Math.abs(fgLuminance - bgLuminance);
  return Math.round(contrast * 100);
}

/**
 * Get minimum APCA score for text size
 */
function getMinAPCAScore(textSize: 'normal' | 'large'): number {
  return textSize === 'normal' ? 60 : 45;
}

/**
 * Calculate relative luminance (WCAG formula)
 */
function getRelativeLuminance(color: Color): number {
  // Convert to sRGB if needed
  const srgb = color.space === 'srgb' ? color : ColorUtils.convertColor(color, 'srgb');
  const [r, g, b] = srgb.values;
  
  // Apply gamma correction
  const getRGB = (val: number) => {
    return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
  };
  
  return 0.2126 * getRGB(r) + 0.7152 * getRGB(g) + 0.0722 * getRGB(b);
}

/**
 * Generate accessibility recommendations
 */
function generateRecommendations(
  validation: AccessibilityValidationResult,
  foreground: Color,
  background: Color
): string[] {
  const recommendations: string[] = [];
  const { wcag } = validation;
  
  if (!wcag.passed) {
    const deficit = wcag.requiredRatio - wcag.ratio;
    recommendations.push(`Increase contrast by ${deficit.toFixed(1)} to meet ${wcag.level} standards`);
    
    // Suggest specific adjustments
    const bgLuminance = getRelativeLuminance(background);
    if (bgLuminance > 0.5) {
      recommendations.push('Consider darkening the text color or lightening the background');
    } else {
      recommendations.push('Consider lightening the text color or darkening the background');
    }
    
    // Suggest alternative approach
    if (wcag.textSize === 'normal') {
      recommendations.push('Consider using larger text size to reduce contrast requirements');
    }
  }
  
  // Add positive reinforcement
  if (wcag.passed && wcag.ratio > wcag.requiredRatio * 1.5) {
    recommendations.push('Excellent contrast ratio - well above minimum requirements');
  }
  
  return recommendations;
}

/**
 * Tool definition for MCP server registration
 */
export const colorValidateAccessibilityTool = {
  name: 'color.validateAccessibility',
  description: 'Comprehensive accessibility validation for color combinations including WCAG compliance checking and recommendations',
  inputSchema: {
    type: 'object',
    properties: {
      colors: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 10 },
      contexts: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            foreground: { type: 'number', minimum: 0 },
            background: { type: 'number', minimum: 0 },
            textSize: { enum: ['normal', 'large'], default: 'normal' },
            level: { enum: ['AA', 'AAA'], default: 'AA' }
          },
          required: ['name', 'foreground', 'background']
        },
        minItems: 1
      },
      includeAPCA: { type: 'boolean', default: false },
      includeRecommendations: { type: 'boolean', default: true }
    },
    required: ['colors', 'contexts']
  }
};