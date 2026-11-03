import { z } from 'zod';
import { ImageUtils } from '../util/imageUtils.js';
import { toImageError } from '../util/imageError.js';
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
      success: true as const,
      result: {
        data: result.data,
        format: result.format,
        appliedFilters: filters,
        processingMetadata: result.processingMetadata
      }
    };
    
  } catch (error) {
    return { success: false as const, error: toImageError(error, { code: ImageErrorCode.INVALID_FILTER_PARAMS, message: 'Image filter failed' }, startTime) };
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
          format: { enum: ['png', 'jpeg', 'jpg', 'webp', 'avif', 'gif', 'tiff'] }
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