import { z } from 'zod';
import { ImageUtils } from '../util/imageUtils.js';
import { toImageError } from '../util/imageError.js';
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
      success: true as const,
      result: {
        data: result.data,
        format: result.format,
        optimizationTarget: options.target,
        compressionRatio: result.processingMetadata.optimizationRatio,
        processingMetadata: result.processingMetadata
      }
    };
    
  } catch (error) {
    return { success: false as const, error: toImageError(error, { code: ImageErrorCode.OPTIMIZATION_FAILED, message: 'Image optimization failed' }, startTime) };
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
          format: { enum: ['png', 'jpeg', 'jpg', 'webp', 'avif', 'gif', 'tiff'] }
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