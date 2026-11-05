import { z } from 'zod';
import { ImageUtils } from '../util/imageUtils.js';
import { toImageError } from '../util/imageError.js';
import {
  ImageInputSchema,
  RectangleSchema,
  ImageErrorCode
} from '../types/image.js';
import { toolInputSchema } from '../util/toolSchema.js';

export const ImageCropInputSchema = z.object({
  image: ImageInputSchema,
  bounds: RectangleSchema
});

export type ImageCropInput = z.infer<typeof ImageCropInputSchema>;

export interface ImageCropResult {
  success: true;
  result: {
    data: string;
    format: string;
    originalDimensions: { width: number; height: number };
    dimensions: { width: number; height: number };
    cropBounds: { x: number; y: number; width: number; height: number };
    warnings?: string[];
  };
  metadata: {
    processingTime: number;
    operation: string;
    processedAt: string;
  };
}

export interface ImageCropError {
  success: false;
  error: {
    code: ImageErrorCode;
    message: string;
    details?: Record<string, unknown>;
    suggestions?: string[];
  };
}

export type ImageCropResponse = ImageCropResult | ImageCropError;

export async function imageCrop(input: unknown): Promise<ImageCropResponse> {
  const startTime = performance.now();
  
  try {
    const validated = ImageCropInputSchema.parse(input);
    const { image, bounds } = validated;
    
    const sharpInstance = await ImageUtils.createSharpFromInput(image);
    const metadata = await sharpInstance.metadata();
    const originalDimensions = {
      width: metadata.width || 0,
      height: metadata.height || 0
    };
    
    const result = await ImageUtils.cropImage(image, bounds);
    
    return {
      success: true as const,
      result: {
        data: result.data,
        format: result.format,
        originalDimensions,
        dimensions: result.dimensions,
        cropBounds: bounds,
        ...(result.warnings && { warnings: result.warnings })
      },
      metadata: {
        processingTime: result.processingMetadata.processingTime,
        operation: `crop_${bounds.x},${bounds.y}_${bounds.width}x${bounds.height}`,
        processedAt: result.processingMetadata.processedAt
      }
    };
    
  } catch (error) {
    return { success: false as const, error: toImageError(error, { code: ImageErrorCode.PROCESSING_FAILED, message: 'Image crop failed', suggestions: ['Verify crop bounds are within image dimensions'] }, startTime) };
  }
}

export const imageCropTool = {
  name: 'image.crop',
  description: 'Crop images to specified rectangular bounds',
  inputSchema: toolInputSchema(ImageCropInputSchema)
};