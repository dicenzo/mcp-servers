import { z } from 'zod';
import { ImageUtils } from '../util/imageUtils.js';
import { toImageError } from '../util/imageError.js';
import { CompositionConfigSchema, ImageErrorCode } from '../types/image.js';
import { toolInputSchema } from '../util/toolSchema.js';

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
  inputSchema: toolInputSchema(ImageCompositeInputSchema)
};