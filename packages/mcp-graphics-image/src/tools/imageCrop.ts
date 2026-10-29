#!/usr/bin/env node

import { z } from 'zod';
import { ImageUtils } from '../util/imageUtils.js';
import {
  ImageInputSchema,
  RectangleSchema,
  ImageErrorCode
} from '../types/image.js';

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
      success: true,
      result: {
        data: result.data,
        format: result.format,
        originalDimensions,
        dimensions: result.dimensions,
        cropBounds: bounds
      },
      metadata: {
        processingTime: result.processingMetadata.processingTime,
        operation: `crop_${bounds.x},${bounds.y}_${bounds.width}x${bounds.height}`,
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
            message: error.message || 'Image crop failed',
            details: { processingTime: Math.round((performance.now() - startTime) * 100) / 100 },
            suggestions: [
              'Verify crop bounds are within image dimensions',
              'Ensure crop bounds have positive width and height',
              'Check that x and y coordinates are not negative'
            ]
          }
        };
      }
    }
    
    return {
      success: false,
      error: {
        code: ImageErrorCode.PROCESSING_FAILED,
        message: 'Unknown error during image crop'
      }
    };
  }
}

export const imageCropTool = {
  name: 'image.crop',
  description: 'Crop images to specified rectangular bounds',
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
      bounds: {
        type: 'object',
        properties: {
          x: { type: 'number', minimum: 0 },
          y: { type: 'number', minimum: 0 },
          width: { type: 'number', minimum: 1 },
          height: { type: 'number', minimum: 1 }
        },
        required: ['x', 'y', 'width', 'height']
      }
    },
    required: ['image', 'bounds']
  }
};