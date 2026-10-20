#!/usr/bin/env node

import { z } from 'zod';
import { ColorUtils } from '../util/colorUtils.js';
import {
  ColorContrastInputSchema,
  ColorContrastInput,
  ContrastReport,
  ColorErrorCode,
  AccessibilityContext
} from '../types/color.js';

/**
 * MCP Tool: color.contrast
 * Check WCAG contrast ratios and accessibility compliance
 */

export interface ColorContrastResult {
  success: true;
  result: ContrastReport;
  metadata: {
    processingTime: number;
    checkedAt: string;
    wcagVersion: string;
  };
}

export interface ColorContrastError {
  success: false;
  error: {
    code: ColorErrorCode;
    message: string;
    details?: Record<string, unknown>;
    suggestions?: string[];
  };
}

export type ColorContrastResponse = ColorContrastResult | ColorContrastError;

/**
 * Check color contrast ratio and WCAG compliance
 */
export async function colorContrast(input: unknown): Promise<ColorContrastResponse> {
  const startTime = performance.now();
  
  try {
    // Validate input
    const validated = ColorContrastInputSchema.parse(input);
    const { foreground, background, algorithm = 'wcag', context } = validated;
    
    // Parse colors
    const fgColor = ColorUtils.parseColorInput(foreground);
    const bgColor = ColorUtils.parseColorInput(background);
    
    // Calculate contrast ratio
    const ratio = ColorUtils.calculateContrastRatio(fgColor, bgColor);
    
    // Determine WCAG compliance
    const textSize = context?.textSize || 'normal';
    const level = context?.level || 'AA';
    
    const wcagScore = calculateWCAGCompliance(ratio, textSize, level);
    
    // Calculate Delta E for additional context
    const deltaE = ColorUtils.calculateDeltaE(fgColor, bgColor);
    
    const endTime = performance.now();
    const processingTime = Math.round((endTime - startTime) * 100) / 100;
    
    // Ensure we meet performance requirements (<50ms for accessibility validation)
    if (processingTime > 50) {
      console.warn(`Contrast check took ${processingTime}ms, exceeding 50ms target`);
    }
    
    const report: ContrastReport = {
      ratio,
      score: wcagScore,
      algorithm,
      foreground: fgColor,
      background: bgColor,
      metadata: {
        calculatedAt: new Date().toISOString(),
        deltaE
      }
    };
    
    return {
      success: true,
      result: report,
      metadata: {
        processingTime,
        checkedAt: new Date().toISOString(),
        wcagVersion: '2.1'
      }
    };
    
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      return {
        success: false,
        error: {
          code: ColorErrorCode.ACCESSIBILITY_CHECK_FAILED,
          message: 'Invalid input parameters',
          details: {
            input,
            validationErrors: error.message,
            processingTime: Math.round((performance.now() - startTime) * 100) / 100
          },
          suggestions: [
            'Verify foreground and background colors are valid',
            'Check that colors are not identical',
            'Ensure algorithm is either "wcag" or "apca"'
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
      } catch (parseError) {
        // Handle unstructured errors
        return {
          success: false,
          error: {
            code: ColorErrorCode.ACCESSIBILITY_CHECK_FAILED,
            message: error.message || 'Contrast check failed',
            details: {
              input,
              processingTime: Math.round((performance.now() - startTime) * 100) / 100
            },
            suggestions: [
              'Verify foreground and background colors are valid',
              'Check that colors are not identical',
              'Ensure algorithm is either "wcag" or "apca"'
            ]
          }
        };
      }
    }
    
    return {
      success: false,
      error: {
        code: ColorErrorCode.ACCESSIBILITY_CHECK_FAILED,
        message: 'Unknown error during contrast check',
        details: { input }
      }
    };
  }
}

/**
 * Calculate WCAG compliance based on contrast ratio
 */
function calculateWCAGCompliance(
  ratio: number,
  textSize: 'normal' | 'large',
  level: 'AA' | 'AAA'
): ContrastReport['score'] {
  const thresholds = {
    AA: {
      normal: 4.5,
      large: 3.0
    },
    AAA: {
      normal: 7.0,
      large: 4.5
    }
  };
  
  return {
    AA: {
      normal: ratio >= thresholds.AA.normal,
      large: ratio >= thresholds.AA.large
    },
    AAA: {
      normal: ratio >= thresholds.AAA.normal,
      large: ratio >= thresholds.AAA.large
    }
  };
}

/**
 * Tool definition for MCP server registration
 */
export const colorContrastTool = {
  name: 'color.contrast',
  description: 'Check WCAG contrast ratios between foreground and background colors for accessibility compliance',
  inputSchema: {
    type: 'object',
    properties: {
      foreground: { type: 'string' },
      background: { type: 'string' },
      algorithm: { enum: ['wcag', 'apca'], default: 'wcag' },
      context: {
        type: 'object',
        properties: {
          textSize: { enum: ['normal', 'large'], default: 'normal' },
          level: { enum: ['AA', 'AAA'], default: 'AA' }
        }
      }
    },
    required: ['foreground', 'background']
  }
};