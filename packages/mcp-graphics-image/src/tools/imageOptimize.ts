#!/usr/bin/env node

import { z } from 'zod';
import { ImageUtils } from '../util/imageUtils.js';
import { ImageInputSchema, OptimizationOptionsSchema, ImageErrorCode } from '../types/image.js';

export const ImageOptimizeInputSchema = z.object({
  image: ImageInputSchema,
  options: OptimizationOptionsSchema
});

export async function imageOptimize(input: unknown) {
  const startTime = performance.now();
  
  try {
    const validated = ImageOptimizeInputSchema.parse(input);
    const { image, options } = validated;
    
    const result = await ImageUtils.optimizeImage(image, options);
    
    return {
      success: true,
      result: {
        data: result.data,
        format: result.format,
        optimizationTarget: options.target,
        compressionRatio: result.processingMetadata.optimizationRatio,
        processingMetadata: result.processingMetadata
      }
    };
    
  } catch (error) {
    if (error instanceof Error) {
      try {
        const imageError = JSON.parse(error.message);
        return { success: false, error: imageError };
      } catch (parseError) {
        return {
          success: false,
          error: {
            code: ImageErrorCode.OPTIMIZATION_FAILED,
            message: error.message || 'Image optimization failed',
            details: { input, processingTime: Math.round((performance.now() - startTime) * 100) / 100 }
          }
        };
      }
    }
    return { success: false, error: { code: ImageErrorCode.PROCESSING_FAILED, message: 'Unknown error' } };
  }
}

export const imageOptimizeTool = {
  name: 'image.optimize',
  description: 'Optimize images for web delivery with size/quality balance',
  inputSchema: {
    type: 'object',
    properties: {
      image: {
        type: 'object',
        properties: {
          data: { type: 'string', description: 'Base64 encoded image data' },
          format: { enum: ['png', 'jpeg', 'jpg', 'webp', 'avif', 'gif', 'tiff', 'bmp'] }
        },
        required: ['data', 'format']
      },
      options: {
        type: 'object',
        properties: {
          target: { enum: ['web', 'print', 'mobile', 'thumbnail'] },
          maxFileSize: { type: 'number', minimum: 1024 },
          quality: { type: 'number', minimum: 10, maximum: 100 },
          progressive: { type: 'boolean' },
          lossless: { type: 'boolean' }
        },
        required: ['target']
      }
    },
    required: ['image', 'options']
  }
};