import { z } from 'zod';
import { ImageUtils } from '../util/imageUtils.js';
import { toImageError } from '../util/imageError.js';
import { ImageInputSchema, OptimizationOptionsSchema, ImageErrorCode } from '../types/image.js';
import { toolInputSchema } from '../util/toolSchema.js';

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
        processingMetadata: result.processingMetadata,
        ...(result.warnings && { warnings: result.warnings })
      }
    };
    
  } catch (error) {
    return { success: false as const, error: toImageError(error, { code: ImageErrorCode.OPTIMIZATION_FAILED, message: 'Image optimization failed' }, startTime) };
  }
}

export const imageOptimizeTool = {
  name: 'image.optimize',
  description: 'Optimize images for web delivery with size/quality balance',
  inputSchema: toolInputSchema(ImageOptimizeInputSchema)
};