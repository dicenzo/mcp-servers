import { z } from 'zod';

/**
 * Color space definitions
 */
export type ColorSpace = 'srgb' | 'oklch' | 'oklab' | 'hsl' | 'hsla' | 'rgb' | 'rgba' | 'hex' | 'lab' | 'lch';

/**
 * Color input formats
 */
export const ColorInputSchema = z.union([
  z.string().min(3).max(50), // hex, named colors, or CSS color strings
  z.object({
    space: z.enum(['srgb', 'oklch', 'oklab', 'hsl', 'hsla', 'rgb', 'rgba', 'lab', 'lch']),
    values: z.array(z.number()).min(3).max(4),
    alpha: z.number().min(0).max(1).optional()
  })
]);

export type ColorInput = z.infer<typeof ColorInputSchema>;

/**
 * Standardized color output format
 */
export interface Color {
  space: ColorSpace;
  values: number[];
  alpha?: number;
  hex?: string;
  css?: string;
}

/**
 * Color palette definitions
 */
export interface ColorPalette {
  name?: string;
  colors: Color[];
  harmony?: 'monochromatic' | 'analogous' | 'complementary' | 'triadic' | 'tetradic' | 'split-complementary';
  metadata?: {
    baseColor?: Color;
    generatedAt?: string;
    algorithm?: string;
  };
}

/**
 * WCAG contrast validation
 */
export interface ContrastReport {
  ratio: number;
  score: {
    AA: {
      normal: boolean;
      large: boolean;
    };
    AAA: {
      normal: boolean;
      large: boolean;
    };
  };
  algorithm: 'wcag' | 'apca';
  foreground: Color;
  background: Color;
  metadata?: {
    calculatedAt: string;
    deltaE?: number;
  };
}

/**
 * Accessibility validation context
 */
export interface AccessibilityContext {
  textSize: 'normal' | 'large';
  level: 'AA' | 'AAA';
  algorithm?: 'wcag' | 'apca';
  includeAPCA?: boolean;
}

/**
 * Brand color matching
 */
export interface ColorMatch {
  inputColor: Color;
  bestMatch: Color;
  deltaE: number;
  confidence: 'exact' | 'high' | 'medium' | 'low';
  alternatives: Array<{
    color: Color;
    deltaE: number;
  }>;
}

/**
 * Brand linting rules
 */
export interface BrandRules {
  minContrast?: number;
  allowedColors?: Color[];
  forbiddenColors?: Color[];
  maxDeltaE?: number;
  requiredAccessibility?: AccessibilityContext;
}

/**
 * Brand lint results
 */
export interface BrandLintReport {
  passed: boolean;
  issues: Array<{
    type: 'contrast' | 'off-brand' | 'forbidden' | 'accessibility';
    severity: 'error' | 'warning' | 'info';
    message: string;
    color?: Color;
    suggestion?: string;
  }>;
  palette: ColorPalette;
  rules: BrandRules;
  score: number; // 0-100
}

/**
 * Error codes for color operations
 */
export enum ColorErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  INVALID_COLOR = 'INVALID_COLOR',
  UNSUPPORTED_SPACE = 'UNSUPPORTED_SPACE',
  CONVERSION_FAILED = 'CONVERSION_FAILED',
  PALETTE_GENERATION_FAILED = 'PALETTE_GENERATION_FAILED',
  ACCESSIBILITY_CHECK_FAILED = 'ACCESSIBILITY_CHECK_FAILED',
  BRAND_MATCH_FAILED = 'BRAND_MATCH_FAILED',
  PROCESSING_FAILED = 'PROCESSING_FAILED',
  PERFORMANCE_TIMEOUT = 'PERFORMANCE_TIMEOUT'
}

/**
 * Structured error for color operations
 */
export interface ColorError {
  code: ColorErrorCode;
  message: string;
  details?: Record<string, unknown>;
  suggestions?: string[];
}

/**
 * Input schemas for tools
 */

// Color conversion tool
export const ColorConvertInputSchema = z.object({
  color: ColorInputSchema,
  targetSpace: z.enum(['srgb', 'oklch', 'oklab', 'hsl', 'hsla', 'rgb', 'rgba', 'hex', 'lab', 'lch']),
  precision: z.number().min(1).max(10).default(3).optional()
});

export type ColorConvertInput = z.infer<typeof ColorConvertInputSchema>;

// Contrast validation tool
export const ColorContrastInputSchema = z.object({
  foreground: ColorInputSchema,
  background: ColorInputSchema,
  algorithm: z.enum(['wcag', 'apca']).default('wcag'),
  context: z.object({
    textSize: z.enum(['normal', 'large']).default('normal'),
    level: z.enum(['AA', 'AAA']).default('AA')
  }).optional()
});

export type ColorContrastInput = z.infer<typeof ColorContrastInputSchema>;

// Palette generation tool
export const ColorPaletteInputSchema = z.object({
  baseColor: ColorInputSchema,
  harmony: z.enum(['monochromatic', 'analogous', 'complementary', 'triadic', 'tetradic', 'split-complementary']),
  count: z.number().min(2).max(20).default(5),
  space: z.enum(['oklch', 'hsl', 'lab']).default('oklch').optional(),
  options: z.object({
    saturationRange: z.tuple([z.number(), z.number()]).optional(),
    lightnessRange: z.tuple([z.number(), z.number()]).optional(),
    hueShift: z.number().min(0).max(360).optional()
  }).optional()
});

export type ColorPaletteInput = z.infer<typeof ColorPaletteInputSchema>;

// Brand color matching tool
export const ColorBrandMatchInputSchema = z.object({
  targetColor: ColorInputSchema,
  brandPalette: z.array(ColorInputSchema).min(1).max(50),
  maxDeltaE: z.number().min(0).max(100).default(5).optional(),
  includeAlternatives: z.boolean().default(true).optional()
});

export type ColorBrandMatchInput = z.infer<typeof ColorBrandMatchInputSchema>;

// Brand linting tool
export const ColorBrandLintInputSchema = z.object({
  palette: z.array(ColorInputSchema).min(1).max(20),
  rules: z.object({
    minContrast: z.number().min(1).max(21).optional(),
    allowedColors: z.array(ColorInputSchema).optional(),
    forbiddenColors: z.array(ColorInputSchema).optional(),
    maxDeltaE: z.number().min(0).max(100).default(5).optional(),
    requiredAccessibility: z.object({
      textSize: z.enum(['normal', 'large']).default('normal'),
      level: z.enum(['AA', 'AAA']).default('AA')
    }).optional()
  }),
  context: z.object({
    useCases: z.array(z.enum(['text', 'background', 'accent', 'border'])).optional(),
    includeAPCA: z.boolean().default(false).optional()
  }).optional()
});

export type ColorBrandLintInput = z.infer<typeof ColorBrandLintInputSchema>;