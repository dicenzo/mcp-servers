import { z } from 'zod';
import { ImageUtils } from '../util/imageUtils.js';
import { toImageError } from '../util/imageError.js';
import { CompositionConfigSchema, ImageErrorCode, MEMORY_LIMITS } from '../types/image.js';

export const ImageCompositeInputSchema = z.object({
  config: CompositionConfigSchema
});

export async function imageComposite(input: unknown) {
  const startTime = performance.now();
  
  try {
    const validated = ImageCompositeInputSchema.parse(input);
    const { config } = validated;
    
    const result = await ImageUtils.compositeImages(config);
    
    return {
      success: true as const,
      result: {
        data: result.data,
        format: result.format,
        dimensions: result.dimensions,
        layerCount: config.layers.length,
        processingMetadata: result.processingMetadata,
        ...(result.warnings && { warnings: result.warnings })
      }
    };
    
  } catch (error) {
    return { success: false as const, error: toImageError(error, { code: ImageErrorCode.COMPOSITE_FAILED, message: 'Image composite failed' }, startTime) };
  }
}

export const imageCompositeTool = {
  name: 'image.composite',
  description: 'Composite multiple images with positioning, blending, and opacity control',
  inputSchema: {
    type: 'object',
    properties: {
      config: {
        type: 'object',
        properties: {
          width: { type: 'number', minimum: 1, maximum: 8192 },
          height: { type: 'number', minimum: 1, maximum: 8192 },
          background: { type: 'string', description: 'Background color (hex) or "transparent"' },
          layers: {
            type: 'array',
            items: {
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
                x: { type: 'number', default: 0 },
                y: { type: 'number', default: 0 },
                blend: { 
                  enum: ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'], 
                  default: 'normal' 
                },
                opacity: { type: 'number', minimum: 0, maximum: 1, default: 1 }
              },
              required: ['image']
            },
            minItems: 1,
            maxItems: MEMORY_LIMITS.MAX_COMPOSITE_LAYERS
          }
        },
        required: ['width', 'height', 'layers']
      }
    },
    required: ['config']
  }
};