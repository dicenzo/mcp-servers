#!/usr/bin/env node

import { z } from 'zod';

/**
 * Core Image Types and Interfaces for MCP Graphics Image Server
 * Following the established patterns from mcp-color server
 */

// Supported image formats
export const SupportedImageFormats = ['png', 'jpeg', 'jpg', 'webp', 'avif', 'gif', 'tiff'] as const;
export type ImageFormat = typeof SupportedImageFormats[number];

// Memory limits from PRD
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB decoded input

export const MEMORY_LIMITS = {
  MAX_OPERATION_MEMORY: 100 * 1024 * 1024, // 100MB
  MAX_IMAGE_SIZE,
  // base64 inflates by 4/3; allow a little extra for a data URL prefix
  MAX_BASE64_LENGTH: Math.ceil(MAX_IMAGE_SIZE / 3) * 4 + 64,
  MAX_DIMENSION: 8192, // pixels per side
  MAX_COMPOSITE_LAYERS: 10
} as const;

// Image input validation schema
export const ImageInputSchema = z.object({
  data: z.string()
    .min(1, 'Image data cannot be empty')
    .max(MEMORY_LIMITS.MAX_BASE64_LENGTH, 'Image data exceeds maximum size'),
  format: z.enum(SupportedImageFormats),
  width: z.number().int().positive().max(MEMORY_LIMITS.MAX_DIMENSION).optional(),
  height: z.number().int().positive().max(MEMORY_LIMITS.MAX_DIMENSION).optional(),
  metadata: z.record(z.string(), z.unknown()).optional()
});

export type ImageInput = z.infer<typeof ImageInputSchema>;

// Dimensions schema
export const DimensionsSchema = z.object({
  width: z.number().int().positive().min(1).max(MEMORY_LIMITS.MAX_DIMENSION),
  height: z.number().int().positive().min(1).max(MEMORY_LIMITS.MAX_DIMENSION)
});

export type Dimensions = z.infer<typeof DimensionsSchema>;

// Rectangle for cropping operations
export const RectangleSchema = z.object({
  x: z.number().int().min(0),
  y: z.number().int().min(0),
  width: z.number().int().positive(),
  height: z.number().int().positive()
});

export type Rectangle = z.infer<typeof RectangleSchema>;

// Resize methods
export const ResizeMethods = ['nearest', 'linear', 'cubic', 'lanczos', 'mitchell'] as const;
export type ResizeMethod = typeof ResizeMethods[number];

// Filter types and configurations
export const FilterTypes = ['blur', 'sharpen', 'brightness', 'contrast', 'saturation', 'hue', 'gamma', 'exposure'] as const;
export type FilterType = typeof FilterTypes[number];

export const FilterConfigSchema = z.object({
  type: z.enum(FilterTypes),
  intensity: z.number().min(-100).max(100),
  radius: z.number().positive().optional() // For blur/sharpen
});

export type FilterConfig = z.infer<typeof FilterConfigSchema>;

// Optimization targets
export const OptimizationTargets = ['web', 'print', 'mobile', 'thumbnail'] as const;
export type OptimizationTarget = typeof OptimizationTargets[number];

export const OptimizationOptionsSchema = z.object({
  target: z.enum(OptimizationTargets),
  maxFileSize: z.number().int().positive().optional(),
  quality: z.number().int().min(10).max(100).optional(),
  progressive: z.boolean().optional(),
  lossless: z.boolean().optional()
});

export type OptimizationOptions = z.infer<typeof OptimizationOptionsSchema>;

// Composition blend modes
export const BlendModes = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge', 'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion'] as const;
export type BlendMode = typeof BlendModes[number];

export const CompositeLayerSchema = z.object({
  image: ImageInputSchema,
  x: z.number().int().default(0),
  y: z.number().int().default(0),
  blend: z.enum(BlendModes).default('normal'),
  opacity: z.number().min(0).max(1).default(1)
});

export type CompositeLayer = z.infer<typeof CompositeLayerSchema>;

export const CompositionConfigSchema = z.object({
  width: z.number().int().positive().max(MEMORY_LIMITS.MAX_DIMENSION),
  height: z.number().int().positive().max(MEMORY_LIMITS.MAX_DIMENSION),
  background: z.string().optional(), // Hex color or 'transparent'
  layers: z.array(CompositeLayerSchema).min(1).max(MEMORY_LIMITS.MAX_COMPOSITE_LAYERS)
});

export type CompositionConfig = z.infer<typeof CompositionConfigSchema>;

// Image metadata interface
export interface ImageMetadata {
  width: number;
  height: number;
  format: ImageFormat;
  channels: number;
  hasAlpha: boolean;
  density?: number | undefined;
  colorspace?: string | undefined;
  fileSize?: number | undefined;
  compression?: string | undefined;
  quality?: number | undefined;
  exif?: Record<string, unknown> | undefined;
  icc?: Buffer | undefined;
}

// Processing metadata for tracking operations
export interface ProcessingMetadata {
  processingTime: number;
  operation: string;
  inputSize: number;
  outputSize: number;
  qualityLoss?: number;
  optimizationRatio?: number;
  processedAt: string;
}

// Image output interface
export interface ImageOutput {
  data: string; // Base64 encoded image data
  format: ImageFormat;
  dimensions: Dimensions;
  metadata: ImageMetadata;
  processingMetadata: ProcessingMetadata;
}

// Error codes for image processing
export enum ImageErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  MEMORY_EXCEEDED = 'MEMORY_EXCEEDED',
  DIMENSION_TOO_LARGE = 'DIMENSION_TOO_LARGE',
  INVALID_FILTER_PARAMS = 'INVALID_FILTER_PARAMS',
  COMPOSITE_FAILED = 'COMPOSITE_FAILED',
  OPTIMIZATION_FAILED = 'OPTIMIZATION_FAILED',
  DECODE_ERROR = 'DECODE_ERROR',
  ENCODE_ERROR = 'ENCODE_ERROR',
  FILE_TOO_LARGE = 'FILE_TOO_LARGE',
  PERFORMANCE_TIMEOUT = 'PERFORMANCE_TIMEOUT'
}

// Image processing contexts
export interface ImageProcessingContext {
  maxMemoryUsage: number; // in MB
  timeout: number; // in milliseconds
  quality: number; // 1-100
  preserveMetadata: boolean;
  enableOptimization: boolean;
}

// Default processing context
export const DEFAULT_PROCESSING_CONTEXT: ImageProcessingContext = {
  maxMemoryUsage: 100, // 100MB as per PRD requirements
  timeout: 30000, // 30 seconds
  quality: 85,
  preserveMetadata: true,
  enableOptimization: true
};

// Performance thresholds from PRD
export const PERFORMANCE_THRESHOLDS = {
  FORMAT_CONVERSION: 300, // ms for 1920x1080
  RESIZE_OPERATION: 200, // ms for standard web sizes
  FILTER_APPLICATION: 500, // ms for complex operations
  OPTIMIZATION: 400, // ms for web optimization
  COMPOSITE: 600 // ms for multi-layer composition
} as const;


// Common image processing validation
export const validateImageInput = (input: unknown): ImageInput => {
  return ImageInputSchema.parse(input);
};

export const validateDimensions = (dims: unknown): Dimensions => {
  return DimensionsSchema.parse(dims);
};

export const validateRectangle = (rect: unknown): Rectangle => {
  return RectangleSchema.parse(rect);
};

export const validateFilterConfig = (filter: unknown): FilterConfig => {
  return FilterConfigSchema.parse(filter);
};

export const validateOptimizationOptions = (opts: unknown): OptimizationOptions => {
  return OptimizationOptionsSchema.parse(opts);
};

export const validateCompositionConfig = (config: unknown): CompositionConfig => {
  return CompositionConfigSchema.parse(config);
};