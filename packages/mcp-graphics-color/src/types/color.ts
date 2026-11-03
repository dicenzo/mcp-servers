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

/** JSON Schema equivalent of ColorInputSchema, for MCP tool definitions */
export const colorInputJsonSchema = {
  oneOf: [
    { type: 'string', minLength: 3, maxLength: 50 },
    {
      type: 'object',
      properties: {
        space: { enum: ['srgb', 'oklch', 'oklab', 'hsl', 'hsla', 'rgb', 'rgba', 'lab', 'lch'] },
        values: { type: 'array', items: { type: 'number' }, minItems: 3, maxItems: 4 },
        alpha: { type: 'number', minimum: 0, maximum: 1 }
      },
      required: ['space', 'values']
    }
  ]
};

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
  /** APCA lightness contrast, present when algorithm is 'apca' */
  apca?: {
    lc: number; // signed: positive dark-on-light, negative light-on-dark
    polarity: 'dark-on-light' | 'light-on-dark';
  };
  foreground: Color;
  background: Color;
  metadata?: {
    calculatedAt: string;
    deltaE?: number;
    deltaEAlgorithm?: 'ciede2000';
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
/**
 * How a palette color differs from the target, in CIE LCh (D65). Each value
 * is palette minus target; hue is the signed shortest angle in degrees and is
 * 0 when either color is too grey for hue to mean anything.
 */
export interface ColorDifference {
  lightness: number;
  chroma: number;
  hue: number;
  /** Plain-language description, e.g. "slightly darker, warmer" */
  summary: string;
}

export interface ColorMatch {
  inputColor: Color;
  bestMatch: Color;
  deltaE: number;
  confidence: 'exact' | 'high' | 'medium' | 'low';
  /** Whether deltaE is at or below the requested maxDeltaE */
  withinThreshold: boolean;
  /** Absolute alpha difference (0-1); deltaE ignores transparency */
  alphaDifference: number;
  difference: ColorDifference;
  /** Position of the match in the original brandPalette input */
  paletteIndex: number;
  name?: string;
  alternatives: Array<{
    color: Color;
    deltaE: number;
    confidence: 'exact' | 'high' | 'medium' | 'low';
    withinThreshold: boolean;
    alphaDifference: number;
    difference: ColorDifference;
    paletteIndex: number;
    name?: string;
  }>;
  /** Palette entries that could not be parsed and were left out of matching */
  skipped: Array<{
    paletteIndex: number;
    input: ColorInput;
    name?: string;
    reason: string;
  }>;
  /** Palette entries identical to an earlier entry, left out of matching */
  duplicates: Array<{
    paletteIndex: number;
    name?: string;
    /** paletteIndex of the earlier entry that was kept */
    duplicateOf: number;
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
const PercentSchema = z.number().min(0).max(100);

export const ColorPaletteInputSchema = z.object({
  baseColor: ColorInputSchema,
  harmony: z.enum(['monochromatic', 'analogous', 'complementary', 'triadic', 'tetradic', 'split-complementary']),
  count: z.number().int().min(2).max(20).default(5),
  space: z.enum(['oklch', 'hsl', 'lab']).default('oklch').optional(),
  options: z.object({
    saturationRange: z.tuple([PercentSchema, PercentSchema]).optional(),
    lightnessRange: z.tuple([PercentSchema, PercentSchema]).optional(),
    hueShift: z.number().min(-360).max(360).optional()
  }).optional(),
  lockedColors: z.array(ColorInputSchema).max(10).optional(),
  minDeltaE: z.number().min(0).max(50).optional(),
  scale: z.boolean().default(false).optional(),
  exports: z.array(z.enum(['css', 'tailwind', 'tokens'])).max(3).optional(),
  exportPrefix: z.string().regex(/^[a-z][a-z0-9-]*$/).max(40).default('color').optional()
}).refine(
  input => (input.lockedColors?.length ?? 0) < input.count,
  { message: 'lockedColors must leave at least one slot for the base color (fewer locked colors than count)', path: ['lockedColors'] }
);

export type ColorPaletteInput = z.infer<typeof ColorPaletteInputSchema>;

/**
 * Default CIEDE2000 tolerance for brand matching and linting. About 1 is just
 * noticeable side by side and 2-3 reads as "the same color" in use.
 */
export const DEFAULT_MAX_DELTA_E = 3;

// Brand color matching tool
export const BrandPaletteEntrySchema = z.union([
  ColorInputSchema,
  z.object({
    name: z.string().min(1).max(100),
    color: ColorInputSchema
  })
]);

export type BrandPaletteEntry = z.infer<typeof BrandPaletteEntrySchema>;

export const ColorBrandMatchInputSchema = z.object({
  targetColor: ColorInputSchema,
  brandPalette: z.array(BrandPaletteEntrySchema).min(1).max(50),
  maxDeltaE: z.number().min(0).max(100).default(DEFAULT_MAX_DELTA_E).optional(),
  includeAlternatives: z.boolean().default(true).optional(),
  maxAlternatives: z.number().int().min(0).max(49).default(3).optional()
});

export type ColorBrandMatchInput = z.infer<typeof ColorBrandMatchInputSchema>;

// Brand linting tool
export const ColorBrandLintInputSchema = z.object({
  palette: z.array(ColorInputSchema).min(1).max(20),
  rules: z.object({
    minContrast: z.number().min(1).max(21).optional(),
    allowedColors: z.array(ColorInputSchema).optional(),
    forbiddenColors: z.array(ColorInputSchema).optional(),
    maxDeltaE: z.number().min(0).max(100).default(DEFAULT_MAX_DELTA_E).optional(),
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