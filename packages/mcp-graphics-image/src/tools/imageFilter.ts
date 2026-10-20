#!/usr/bin/env node

import { z } from 'zod';
import { ImageUtils } from '../util/imageUtils.js';
import { ImageInputSchema, FilterConfigSchema, ImageErrorCode } from '../types/image.js';

export const ImageFilterInputSchema = z.object({
  image: ImageInputSchema,
  filters: z.array(FilterConfigSchema).min(1)
});

export async function imageFilter(input: unknown) {
  const startTime = performance.now();
  
  try {
    const validated = ImageFilterInputSchema.parse(input);
    const { image, filters } = validated;
    
    const result = await ImageUtils.applyFilters(image, filters);
    
    return {
      success: true,
      result: {
        data: result.data,
        format: result.format,
        appliedFilters: filters,
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
            code: ImageErrorCode.INVALID_FILTER_PARAMS,
            message: error.message || 'Image filter failed',
            details: { input, processingTime: Math.round((performance.now() - startTime) * 100) / 100 }
          }
        };
      }
    }
    return { success: false, error: { code: ImageErrorCode.PROCESSING_FAILED, message: 'Unknown error' } };
  }
}

export const imageFilterTool = {
  name: 'image.filter',
  description: 'Apply filters and effects to images (blur, sharpen, brightness, contrast, etc.)',
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
      filters: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: { enum: ['blur', 'sharpen', 'brightness', 'contrast', 'saturation', 'hue', 'gamma', 'exposure'] },
            intensity: { type: 'number', minimum: -100, maximum: 100 },
            radius: { type: 'number', minimum: 0.1 }
          },
          required: ['type', 'intensity']
        },
        minItems: 1
      }
    },
    required: ['image', 'filters']
  }
};