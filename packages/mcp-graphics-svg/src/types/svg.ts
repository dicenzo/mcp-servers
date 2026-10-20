import { z } from 'zod';

// Base SVG Types
export const SVGDimensionsSchema = z.object({
  width: z.number().min(1).max(10000),
  height: z.number().min(1).max(10000)
});

export const SVGViewBoxSchema = z.object({
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().min(1),
  height: z.number().min(1)
});

// SVG Element Types
export const SVGBasicPropertiesSchema = z.object({
  id: z.string().optional(),
  className: z.string().optional(),
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  opacity: z.number().min(0).max(1).optional()
});

export const SVGTransformSchema = z.object({
  type: z.enum(['translate', 'rotate', 'scale', 'skewX', 'skewY', 'matrix']),
  values: z.array(z.number())
});

export const SVGRectSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('rect'),
  x: z.number().default(0),
  y: z.number().default(0),
  width: z.number().min(0),
  height: z.number().min(0),
  rx: z.number().min(0).optional(),
  ry: z.number().min(0).optional()
});

export const SVGCircleSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('circle'),
  cx: z.number().default(0),
  cy: z.number().default(0),
  r: z.number().min(0)
});

export const SVGEllipseSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('ellipse'),
  cx: z.number().default(0),
  cy: z.number().default(0),
  rx: z.number().min(0),
  ry: z.number().min(0)
});

export const SVGLineSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('line'),
  x1: z.number().default(0),
  y1: z.number().default(0),
  x2: z.number().default(0),
  y2: z.number().default(0)
});

export const SVGPolygonSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('polygon'),
  points: z.array(z.object({ x: z.number(), y: z.number() }))
});

export const SVGPolylineSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('polyline'),
  points: z.array(z.object({ x: z.number(), y: z.number() }))
});

export const SVGPathSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('path'),
  d: z.string()
});

export const SVGTextSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('text'),
  x: z.number().default(0),
  y: z.number().default(0),
  content: z.string(),
  fontSize: z.number().min(1).optional(),
  fontFamily: z.string().optional(),
  textAnchor: z.enum(['start', 'middle', 'end']).optional()
});

export const SVGGroupSchema = SVGBasicPropertiesSchema.extend({
  type: z.literal('group'),
  elements: z.array(z.any())
});

export const SVGElementSchema = z.discriminatedUnion('type', [
  SVGRectSchema,
  SVGCircleSchema,
  SVGEllipseSchema,
  SVGLineSchema,
  SVGPolygonSchema,
  SVGPolylineSchema,
  SVGPathSchema,
  SVGTextSchema,
  SVGGroupSchema
]);

// SVG Document Schema
export const SVGDocumentSchema = z.object({
  width: z.number().min(1),
  height: z.number().min(1),
  viewBox: SVGViewBoxSchema.optional(),
  elements: z.array(SVGElementSchema),
  metadata: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    keywords: z.array(z.string()).optional()
  }).optional()
});

// Tool Input/Output Schemas
export const SVGCreateInputSchema = SVGDocumentSchema;

export const SVGOptimizeInputSchema = z.object({
  svg: z.string(),
  options: z.object({
    removeComments: z.boolean().default(true),
    removeEmptyElements: z.boolean().default(true),
    mergePaths: z.boolean().default(true),
    precision: z.number().min(1).max(10).default(3),
    removeUnusedDefs: z.boolean().default(true),
    minifyStyles: z.boolean().default(true)
  }).optional()
});

export const SVGTransformInputSchema = z.object({
  svg: z.string(),
  transforms: z.array(z.object({
    type: z.enum(['translate', 'rotate', 'scale', 'skewX', 'skewY']),
    values: z.array(z.number()),
    element: z.string().optional() // CSS selector for target element
  }))
});

export const SVGPathOperationsInputSchema = z.object({
  path1: z.string(), // SVG path data
  path2: z.string(), // SVG path data
  operation: z.enum(['union', 'intersect', 'subtract', 'exclude'])
});

// Type exports
export type SVGDimensions = z.infer<typeof SVGDimensionsSchema>;
export type SVGViewBox = z.infer<typeof SVGViewBoxSchema>;
export type SVGElement = z.infer<typeof SVGElementSchema>;
export type SVGDocument = z.infer<typeof SVGDocumentSchema>;
export type SVGCreateInput = z.infer<typeof SVGCreateInputSchema>;
export type SVGOptimizeInput = z.infer<typeof SVGOptimizeInputSchema>;
export type SVGTransformInput = z.infer<typeof SVGTransformInputSchema>;
export type SVGPathOperationsInput = z.infer<typeof SVGPathOperationsInputSchema>;

// Error types
export enum SVGErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_SVG = 'INVALID_SVG',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  OPTIMIZATION_FAILED = 'OPTIMIZATION_FAILED',
  TRANSFORMATION_FAILED = 'TRANSFORMATION_FAILED',
  PATH_OPERATION_FAILED = 'PATH_OPERATION_FAILED',
  PERFORMANCE_TIMEOUT = 'PERFORMANCE_TIMEOUT'
}

export interface SVGError {
  code: SVGErrorCode;
  message: string;
  details?: Record<string, unknown>;
  suggestions?: string[];
}

// SVGO Configuration Types
export interface SVGOOptions {
  precision?: number;
  removeComments?: boolean;
  removeEmptyElements?: boolean;
  removeUnusedDefs?: boolean;
  minifyStyles?: boolean;
  mergePaths?: boolean;
  removeMetadata?: boolean;
  removeViewBox?: boolean;
  aggressive?: boolean;
}

export interface SVGOConfig {
  multipass: boolean;
  precision: number;
  plugins: (string | { name: string; params: Record<string, unknown> })[];
}

// Path Operation Types
export interface PathOperationOptions {
  precision: number;
  tolerance: number;
}

export interface PathOperationArgs {
  precision?: number;
  tolerance?: number;
}