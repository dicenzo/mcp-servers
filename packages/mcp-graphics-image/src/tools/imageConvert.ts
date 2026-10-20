#!/usr/bin/env node

import { z } from 'zod';
import { ImageUtils } from '../util/imageUtils.js';
import {
  ImageInput,
  ImageInputSchema,
  SupportedImageFormats,
  ImageFormat,
  ImageErrorCode
} from '../types/image.js';

/**
 * MCP Tool: image.convert
 * Convert images between different formats with quality control
 */

// Input schema for format conversion
export const ImageConvertInputSchema = z.object({
  image: ImageInputSchema,
  format: z.enum(SupportedImageFormats),
  quality: z.number().int().min(10).max(100).optional(),
  preserveMetadata: z.boolean().default(true)
});

export type ImageConvertInput = z.infer<typeof ImageConvertInputSchema>;

export interface ImageConvertResult {
  success: true;
  result: {
    data: string;
    format: ImageFormat;
    dimensions: { width: number; height: number };
    originalFormat: ImageFormat;
    originalSize: number;
    newSize: number;
    compressionRatio: number;
    qualityLoss?: number;
  };
  metadata: {
    processingTime: number;
    operation: string;
    processedAt: string;
    targetFormat: ImageFormat;
    quality?: number;
  };
}

export interface ImageConvertError {
  success: false;
  error: {
    code: ImageErrorCode;
    message: string;
    details?: Record<string, unknown>;
    suggestions?: string[];
  };
}

export type ImageConvertResponse = ImageConvertResult | ImageConvertError;

/**
 * Convert image between formats
 */
export async function imageConvert(input: unknown): Promise<ImageConvertResponse> {
  const startTime = performance.now();
  
  try {
    // Validate input
    const validated = ImageConvertInputSchema.parse(input);
    const { image, format, quality, preserveMetadata } = validated;
    
    // Check if conversion is needed
    if (image.format === format && quality === undefined) {
      // Return original image if no conversion needed
      const base64Data = image.data.replace(/^data:image\/[a-z]+;base64,/, '');
      const size = Buffer.from(base64Data, 'base64').length;
      
      return {
        success: true,
        result: {
          data: image.data,
          format: image.format,
          dimensions: {
            width: image.width || 0,
            height: image.height || 0
          },
          originalFormat: image.format,
          originalSize: size,
          newSize: size,
          compressionRatio: 1.0
        },
        metadata: {
          processingTime: performance.now() - startTime,
          operation: `no_conversion_needed_${format}`,
          processedAt: new Date().toISOString(),
          targetFormat: format
        }
      };
    }
    
    // Perform conversion
    const result = await ImageUtils.convertFormat(image, format, quality);
    
    // Calculate compression metrics
    const originalBase64 = image.data.replace(/^data:image\/[a-z]+;base64,/, '');
    const originalSize = Buffer.from(originalBase64, 'base64').length;
    const compressionRatio = result.metadata.fileSize! / originalSize;
    
    // Estimate quality loss (simplified heuristic)
    let qualityLoss: number | undefined = undefined;
    if (isLossyFormat(image.format) || isLossyFormat(format)) {
      const targetQuality = quality || 85;
      qualityLoss = Math.max(0, 100 - targetQuality);
    }
    
    const endTime = performance.now();
    const processingTime = Math.round((endTime - startTime) * 100) / 100;
    
    return {
      success: true,
      result: {
        data: result.data,
        format: result.format,
        dimensions: result.dimensions,
        originalFormat: image.format,
        originalSize,
        newSize: result.metadata.fileSize!,
        compressionRatio: Math.round(compressionRatio * 1000) / 1000,
        ...(qualityLoss !== undefined && { qualityLoss })
      },
      metadata: {
        processingTime,
        operation: `convert_${image.format}_to_${format}`,
        processedAt: new Date().toISOString(),
        targetFormat: format,
        ...(quality !== undefined && { quality })
      }
    };
    
  } catch (error) {
    // Handle structured errors from ImageUtils
    if (error instanceof Error) {
      try {
        const imageError = JSON.parse(error.message);
        return {
          success: false,
          error: imageError
        };
      } catch (parseError) {
        // Handle unstructured errors
        return {
          success: false,
          error: {
            code: ImageErrorCode.PROCESSING_FAILED,
            message: error.message || 'Format conversion failed',
            details: {
              input,
              processingTime: Math.round((performance.now() - startTime) * 100) / 100
            },
            suggestions: [
              'Verify the input image is valid and properly encoded',
              'Check that the target format is supported',
              'Ensure quality parameter is within valid range (10-100)',
              'Try with a smaller image if processing fails'
            ]
          }
        };
      }
    }
    
    return {
      success: false,
      error: {
        code: ImageErrorCode.PROCESSING_FAILED,
        message: 'Unknown error during format conversion',
        details: { input }
      }
    };
  }
}

/**
 * Check if image format uses lossy compression
 */
function isLossyFormat(format: ImageFormat): boolean {
  return ['jpeg', 'jpg', 'webp', 'avif'].includes(format);
}

/**
 * Tool definition for MCP server registration
 */
export const imageConvertTool = {
  name: 'image.convert',
  description: 'Convert images between different formats (PNG, JPEG, WebP, AVIF, etc.) with quality control and optimization',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Base64 encoded image data' },
          format: { 
            enum: [...SupportedImageFormats], 
            description: 'Current image format' 
          },
          width: { type: 'number', description: 'Image width in pixels (optional)' },
          height: { type: 'number', description: 'Image height in pixels (optional)' },
          metadata: { type: 'object', description: 'Additional image metadata (optional)' }
        },
        required: ['data', 'format']
      },
      format: { 
        enum: [...SupportedImageFormats], 
        description: 'Target format for conversion' 
      },
      quality: { 
        type: 'number', 
        minimum: 10, 
        maximum: 100, 
        description: 'Output quality for lossy formats (10-100, default: 85)' 
      },
      preserveMetadata: { 
        type: 'boolean', 
        default: true, 
        description: 'Whether to preserve EXIF and other metadata' 
      }
    },
    required: ['image', 'format']
  }
};