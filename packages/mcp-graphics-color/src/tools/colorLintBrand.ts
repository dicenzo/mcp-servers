#!/usr/bin/env node

import { z } from 'zod';
import { ColorUtils } from '../util/colorUtils.js';
import {
  ColorBrandLintInputSchema,
  ColorBrandLintInput,
  BrandLintReport,
  ColorErrorCode,
  Color,
  BrandRules,
  AccessibilityContext
} from '../types/color.js';

/**
 * MCP Tool: color.lintBrand
 * Validate brand color consistency and compliance
 */

export interface ColorLintBrandResult {
  success: true;
  result: BrandLintReport;
  metadata: {
    processingTime: number;
    checkedAt: string;
    paletteSize: number;
    rulesApplied: string[];
  };
}

export interface ColorLintBrandError {
  success: false;
  error: {
    code: ColorErrorCode;
    message: string;
    details?: Record<string, unknown>;
    suggestions?: string[];
  };
}

export type ColorLintBrandResponse = ColorLintBrandResult | ColorLintBrandError;

/**
 * Lint brand color palette for consistency and compliance
 */
export async function colorLintBrand(input: unknown): Promise<ColorLintBrandResponse> {
  const startTime = performance.now();
  
  try {
    // Validate input
    const validated = ColorBrandLintInputSchema.parse(input);
    const { palette, rules, context } = validated;
    
    // Parse palette colors
    const parsedColors: Color[] = [];
    for (const colorInput of palette) {
      try {
        const parsedColor = ColorUtils.parseColorInput(colorInput);
        parsedColors.push(parsedColor);
      } catch (error) {
        console.warn('Skipping invalid color in palette:', colorInput, error);
      }
    }
    
    if (parsedColors.length === 0) {
      throw new Error('No valid colors found in palette');
    }
    
    // Initialize lint report
    const issues: BrandLintReport['issues'] = [];
    let totalScore = 100;
    const rulesApplied: string[] = [];
    
    // Apply brand linting rules
    if (rules.minContrast !== undefined) {
      await lintContrastRules(parsedColors, rules.minContrast, issues, context);
      rulesApplied.push('contrast');
      totalScore -= issues.filter(i => i.type === 'contrast').length * 15;
    }
    
    if (rules.allowedColors) {
      await lintAllowedColors(parsedColors, rules.allowedColors, rules.maxDeltaE || 5, issues);
      rulesApplied.push('allowed-colors');
      totalScore -= issues.filter(i => i.type === 'off-brand').length * 20;
    }
    
    if (rules.forbiddenColors) {
      await lintForbiddenColors(parsedColors, rules.forbiddenColors, rules.maxDeltaE || 5, issues);
      rulesApplied.push('forbidden-colors');
      totalScore -= issues.filter(i => i.type === 'forbidden').length * 25;
    }
    
    if (rules.requiredAccessibility) {
      await lintAccessibilityRules(parsedColors, rules.requiredAccessibility, issues, context);
      rulesApplied.push('accessibility');
      totalScore -= issues.filter(i => i.type === 'accessibility').length * 10;
    }
    
    // Check for color duplicates
    await lintDuplicates(parsedColors, issues);
    rulesApplied.push('duplicates');
    totalScore -= issues.filter(i => i.message.includes('duplicate')).length * 5;
    
    const endTime = performance.now();
    const processingTime = Math.round((endTime - startTime) * 100) / 100;
    
    const passed = issues.filter(i => i.severity === 'error').length === 0;
    const finalScore = Math.max(0, Math.min(100, totalScore));
    
    const report: BrandLintReport = {
      passed,
      issues,
      palette: {
        name: 'Brand Palette',
        colors: parsedColors
      },
      rules: rules as BrandRules,
      score: finalScore
    };
    
    return {
      success: true,
      result: report,
      metadata: {
        processingTime,
        checkedAt: new Date().toISOString(),
        paletteSize: parsedColors.length,
        rulesApplied
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
            code: ColorErrorCode.PROCESSING_FAILED,
            message: error.message || 'Brand linting failed',
            details: {
              input,
              processingTime: Math.round((performance.now() - startTime) * 100) / 100
            },
            suggestions: [
              'Verify all palette colors are valid',
              'Check that rules are properly formatted',
              'Ensure allowed/forbidden colors are valid',
              'Verify contrast and accessibility requirements'
            ]
          }
        };
      }
    }
    
    return {
      success: false,
      error: {
        code: ColorErrorCode.PROCESSING_FAILED,
        message: 'Unknown error during brand linting',
        details: { input }
      }
    };
  }
}

/**
 * Lint contrast requirements between colors
 */
async function lintContrastRules(
  colors: Color[],
  minContrast: number,
  issues: BrandLintReport['issues'],
  context?: ColorBrandLintInput['context']
): Promise<void> {
  const useCases = context?.useCases || ['text', 'background'];
  
  // Check all color pairs for contrast
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      try {
        const ratio = ColorUtils.calculateContrastRatio(colors[i], colors[j]);
        
        if (ratio < minContrast) {
          issues.push({
            type: 'contrast',
            severity: ratio < minContrast * 0.7 ? 'error' : 'warning',
            message: `Contrast ratio ${ratio.toFixed(2)} between colors is below required ${minContrast}`,
            color: colors[i],
            suggestion: `Consider adjusting lightness to achieve minimum ${minContrast} contrast ratio`
          });
        }
      } catch (error) {
        console.warn('Failed to check contrast between colors:', error);
      }
    }
  }
}

/**
 * Lint allowed colors compliance
 */
async function lintAllowedColors(
  colors: Color[],
  allowedColors: ColorBrandLintInput['rules']['allowedColors'],
  maxDeltaE: number,
  issues: BrandLintReport['issues']
): Promise<void> {
  if (!allowedColors) return;
  
  const parsedAllowedColors = allowedColors.map(ColorUtils.parseColorInput);
  
  for (const color of colors) {
    let isAllowed = false;
    let closestDeltaE = Infinity;
    
    for (const allowedColor of parsedAllowedColors) {
      try {
        const deltaE = ColorUtils.calculateDeltaE(color, allowedColor);
        closestDeltaE = Math.min(closestDeltaE, deltaE);
        
        if (deltaE <= maxDeltaE) {
          isAllowed = true;
          break;
        }
      } catch (error) {
        console.warn('Failed to compare colors:', error);
      }
    }
    
    if (!isAllowed) {
      issues.push({
        type: 'off-brand',
        severity: closestDeltaE > maxDeltaE * 2 ? 'error' : 'warning',
        message: `Color is not within allowed brand colors (closest match: ΔE=${closestDeltaE.toFixed(2)})`,
        color,
        suggestion: `Use a color within ΔE=${maxDeltaE} of approved brand colors`
      });
    }
  }
}

/**
 * Lint forbidden colors compliance
 */
async function lintForbiddenColors(
  colors: Color[],
  forbiddenColors: ColorBrandLintInput['rules']['forbiddenColors'],
  maxDeltaE: number,
  issues: BrandLintReport['issues']
): Promise<void> {
  if (!forbiddenColors) return;
  
  const parsedForbiddenColors = forbiddenColors.map(ColorUtils.parseColorInput);
  
  for (const color of colors) {
    for (const forbiddenColor of parsedForbiddenColors) {
      try {
        const deltaE = ColorUtils.calculateDeltaE(color, forbiddenColor);
        
        if (deltaE <= maxDeltaE) {
          issues.push({
            type: 'forbidden',
            severity: 'error',
            message: `Color is too similar to forbidden color (ΔE=${deltaE.toFixed(2)})`,
            color,
            suggestion: `Avoid colors within ΔE=${maxDeltaE} of forbidden brand colors`
          });
        }
      } catch (error) {
        console.warn('Failed to check forbidden color:', error);
      }
    }
  }
}

/**
 * Lint accessibility requirements
 */
async function lintAccessibilityRules(
  colors: Color[],
  accessibility: AccessibilityContext,
  issues: BrandLintReport['issues'],
  context?: ColorBrandLintInput['context']
): Promise<void> {
  const { textSize, level } = accessibility;
  const requiredRatio = getRequiredContrastRatio(textSize, level);
  
  // Check each color pair for accessibility
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      try {
        const ratio = ColorUtils.calculateContrastRatio(colors[i], colors[j]);
        
        if (ratio < requiredRatio) {
          issues.push({
            type: 'accessibility',
            severity: 'warning',
            message: `Colors don't meet ${level} accessibility standard for ${textSize} text (${ratio.toFixed(2)} < ${requiredRatio})`,
            color: colors[i],
            suggestion: `Increase contrast to meet WCAG ${level} standard (${requiredRatio}:1 minimum)`
          });
        }
      } catch (error) {
        console.warn('Failed accessibility check:', error);
      }
    }
  }
}

/**
 * Lint for duplicate colors
 */
async function lintDuplicates(
  colors: Color[],
  issues: BrandLintReport['issues']
): Promise<void> {
  const duplicates = new Set<number>();
  
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      try {
        const deltaE = ColorUtils.calculateDeltaE(colors[i], colors[j]);
        
        if (deltaE < 1) { // Essentially the same color
          duplicates.add(j);
          issues.push({
            type: 'off-brand',
            severity: 'info',
            message: `Duplicate or very similar colors found (ΔE=${deltaE.toFixed(2)})`,
            color: colors[j],
            suggestion: 'Consider removing duplicate colors from palette'
          });
        }
      } catch (error) {
        console.warn('Failed duplicate check:', error);
      }
    }
  }
}

/**
 * Get required contrast ratio for accessibility level
 */
function getRequiredContrastRatio(textSize: 'normal' | 'large', level: 'AA' | 'AAA'): number {
  const ratios = {
    AA: { normal: 4.5, large: 3.0 },
    AAA: { normal: 7.0, large: 4.5 }
  };
  
  return ratios[level][textSize];
}

/**
 * Tool definition for MCP server registration
 */
export const colorLintBrandTool = {
  name: 'color.lintBrand',
  description: 'Validate brand color palette consistency, accessibility compliance, and adherence to brand guidelines',
  inputSchema: {
    type: 'object',
    properties: {
      palette: { type: 'array', items: { type: 'string' }, minItems: 1, maxItems: 20 },
      rules: {
        type: 'object',
        properties: {
          minContrast: { type: 'number', minimum: 1, maximum: 21 },
          maxDeltaE: { type: 'number', minimum: 0, maximum: 100, default: 5 }
        }
      }
    },
    required: ['palette', 'rules']
  }
};