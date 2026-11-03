import { ColorUtils } from '../util/colorUtils.js';
import { ColorProcessingError } from '../util/colorError.js';
import {
  ColorConvertInputSchema,
  Color,
  ColorErrorCode
} from '../types/color.js';

/**
 * MCP Tool: color.convert
 * Convert colors between different color spaces with high precision
 */

export interface ColorConvertResult {
  success: true;
  result: Color;
  metadata: {
    sourceSpace: string;
    targetSpace: string;
    precision: number;
    convertedAt: string;
  };
}

export interface ColorConvertError {
  success: false;
  error: {
    code: ColorErrorCode;
    message: string;
    details?: Record<string, unknown>;
    suggestions?: string[];
  };
}

export type ColorConvertResponse = ColorConvertResult | ColorConvertError;

/**
 * Convert color between different color spaces
 */
export async function colorConvert(input: unknown): Promise<ColorConvertResponse> {
  const startTime = performance.now();
  
  try {
    // Validate input
    const validated = ColorConvertInputSchema.parse(input);
    const { color, targetSpace, precision = 3 } = validated;
    
    // Parse input color
    const sourceColor = ColorUtils.parseColorInput(color);
    
    // Perform conversion
    const convertedColor = ColorUtils.convertColor(sourceColor, targetSpace, precision);
    
    return {
      success: true,
      result: convertedColor,
      metadata: {
        sourceSpace: sourceColor.space,
        targetSpace,
        precision,
        convertedAt: new Date().toISOString()
      }
    };
    
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      return {
        success: false,
        error: {
          code: ColorErrorCode.PROCESSING_FAILED,
          message: 'Invalid input parameters',
          details: {
            input,
            validationErrors: error.message,
            processingTime: Math.round((performance.now() - startTime) * 100) / 100
          },
          suggestions: [
            'Verify input color format is correct',
            'Check target color space is supported',
            'Ensure precision value is between 1 and 10'
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
          code: ColorErrorCode.PROCESSING_FAILED,
          message: error.message || 'Color conversion failed',
          details: {
            input,
            processingTime: Math.round((performance.now() - startTime) * 100) / 100
          },
          suggestions: [
            'Verify input color format is correct',
            'Check target color space is supported',
            'Ensure precision value is between 1 and 10'
          ]
        }
      };
    }
    
    return {
      success: false,
      error: {
        code: ColorErrorCode.PROCESSING_FAILED,
        message: 'Unknown error during color conversion',
        details: { input }
      }
    };
  }
}

/**
 * Tool definition for MCP server registration
 */
export const colorConvertTool = {
  name: 'color.convert',
  description: 'Convert colors between different color spaces (sRGB, HSL, Lab, LCH, OKLCH, etc.) with configurable precision',
  inputSchema: {
    type: 'object',
    properties: {
      color: {
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
      },
      targetSpace: { enum: ['srgb', 'oklch', 'oklab', 'hsl', 'hsla', 'rgb', 'rgba', 'hex', 'lab', 'lch'] },
      precision: { type: 'number', minimum: 1, maximum: 10 }
    },
    required: ['color', 'targetSpace']
  }
};