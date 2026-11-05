import { z } from 'zod';
import { ImageUtils } from '../util/imageUtils.js';
import { toImageError } from '../util/imageError.js';
import { ImageInputSchema, FilterConfigSchema, ImageErrorCode } from '../types/image.js';
import { toolInputSchema } from '../util/toolSchema.js';

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
        processingMetadata: result.processingMetadata,
        ...(result.warnings && { warnings: result.warnings })
      }
    };
    
  } catch (error) {
    return { success: false as const, error: toImageError(error, { code: ImageErrorCode.INVALID_FILTER_PARAMS, message: 'Image filter failed' }, startTime) };
  }
}

export const imageFilterTool = {
  name: 'image.filter',
  description: 'Apply filters and effects to images (blur, sharpen, brightness, contrast, etc.)',
  inputSchema: toolInputSchema(ImageFilterInputSchema)
};