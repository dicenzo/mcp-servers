#!/usr/bin/env node

import { z } from 'zod';
import { ImageUtils } from '../util/imageUtils.js';
import {
  ImageInputSchema,
  DimensionsSchema,
  ResizeMethods,
  ResizeMethod,
  ImageErrorCode
} from '../types/image.js';

/**
 * MCP Tool: image.resize
 * Resize images with quality preservation using various algorithms
 */

export const ImageResizeInputSchema = z.object({
  image: ImageInputSchema,
  dimensions: DimensionsSchema,
  method: z.enum(ResizeMethods).default('lanczos'),
  preserveAspectRatio: z.boolean().default(true),
  allowEnlargement: z.boolean().default(false)
});

export type ImageResizeInput = z.infer<typeof ImageResizeInputSchema>;

export interface ImageResizeResult {
  success: true;
  result: {
    data: string;
    format: string;
    originalDimensions: { width: number; height: number };
    dimensions: { width: number; height: number };
    scaleFactor: number;
    method: ResizeMethod;
  };
  metadata: {
    processingTime: number;
    operation: string;
    processedAt: string;
  };
}

export interface ImageResizeError {
  success: false;
  error: {
    code: ImageErrorCode;
    message: string;
    details?: Record<string, unknown>;
    suggestions?: string[];
  };
}

export type ImageResizeResponse = ImageResizeResult | ImageResizeError;

export async function imageResize(input: unknown): Promise<ImageResizeResponse> {
  const startTime = performance.now();
  
  try {
    const validated = ImageResizeInputSchema.parse(input);
    const { image, dimensions, method, preserveAspectRatio, allowEnlargement } = validated;
    
    // Get original dimensions from ImageUtils
    const sharpInstance = await ImageUtils.createSharpFromInput(image);
    const metadata = await sharpInstance.metadata();
    const originalDimensions = {
      width: metadata.width || 0,
      height: metadata.height || 0
    };
    
    // Check for enlargement if not allowed
    if (!allowEnlargement) {
      const scaleFactorW = dimensions.width / originalDimensions.width;
      const scaleFactorH = dimensions.height / originalDimensions.height;
      const maxScaleFactor = Math.max(scaleFactorW, scaleFactorH);
      
      if (maxScaleFactor > 1) {
        throw new Error(JSON.stringify({
          code: ImageErrorCode.INVALID_INPUT,
          message: 'Image enlargement not allowed',
          details: { 
            originalDimensions, 
            requestedDimensions: dimensions, 
            scaleFactor: maxScaleFactor 
          },
          suggestions: ['Set allowEnlargement to true or use smaller target dimensions']
        }));
      }
    }
    
    const result = await ImageUtils.resizeImage(image, dimensions, method, preserveAspectRatio);
    
    // Calculate scale factor
    const scaleFactorW = result.dimensions.width / originalDimensions.width;
    const scaleFactorH = result.dimensions.height / originalDimensions.height;
    const scaleFactor = preserveAspectRatio ? 
      Math.min(scaleFactorW, scaleFactorH) : 
      Math.max(scaleFactorW, scaleFactorH);
    
    return {
      success: true,
      result: {
        data: result.data,
        format: result.format,
        originalDimensions,
        dimensions: result.dimensions,
        scaleFactor: Math.round(scaleFactor * 1000) / 1000,
        method
      },
      metadata: {
        processingTime: result.processingMetadata.processingTime,
        operation: `resize_${originalDimensions.width}x${originalDimensions.height}_to_${result.dimensions.width}x${result.dimensions.height}_${method}`,
        processedAt: result.processingMetadata.processedAt
      }
    };
    
  } catch (error) {
    if (error instanceof Error) {
      try {
        const imageError = JSON.parse(error.message);
        return { success: false, error: imageError };
      } catch {
        return {
          success: false,
          error: {
            code: ImageErrorCode.PROCESSING_FAILED,
            message: error.message || 'Image resize failed',
            details: {
              processingTime: Math.round((performance.now() - startTime) * 100) / 100
            },
            suggestions: [
              'Verify image dimensions are within valid range (1-8192 pixels)',
              'Check that the image data is valid',
              'Try a different resize method if processing fails',
              'Consider enabling allowEnlargement if upscaling is needed'
            ]
          }
        };
      }
    }
    
    return {
      success: false,
      error: {
        code: ImageErrorCode.PROCESSING_FAILED,
        message: 'Unknown error during image resize'
      }
    };
  }
}

export const imageResizeTool = {
  name: 'image.resize',
  description: 'Resize images to specified dimensions with quality preservation using various interpolation methods',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Base64 encoded image data' },
          format: { 
            enum: ['png', 'jpeg', 'jpg', 'webp', 'avif', 'gif', 'tiff'], 
            description: 'Image format' 
          }
        },
        required: ['data', 'format']
      },
      dimensions: {
        type: 'object',
        properties: {
          width: { type: 'number', minimum: 1, maximum: 8192 },
          height: { type: 'number', minimum: 1, maximum: 8192 }
        },
        required: ['width', 'height']
      },
      method: { 
        enum: [...ResizeMethods], 
        default: 'lanczos',
        description: 'Interpolation method for resizing' 
      },
      preserveAspectRatio: { 
        type: 'boolean', 
        default: true,
        description: 'Maintain original aspect ratio' 
      },
      allowEnlargement: { 
        type: 'boolean', 
        default: false,
        description: 'Allow upscaling beyond original dimensions' 
      }
    },
    required: ['image', 'dimensions']
  }
};