import { ColorUtils, HarmonyType, PaletteSpace, PaletteSwatchDraft } from '../util/colorUtils.js';
import { ColorProcessingError } from '../util/colorError.js';
import {
  ColorPaletteInputSchema,
  ColorPalette,
  ColorErrorCode,
  Color,
  ColorInput,
  colorInputJsonSchema,
  DEFAULT_MAX_DELTA_E
} from '../types/color.js';

/**
 * MCP Tool: color.generatePalette
 * Generate harmonious color palettes from a base color
 */

/** WCAG AA contrast for body text */
const AA_TEXT_CONTRAST = 4.5;
/** Share of requested chroma a harmony color can lose to the sRGB gamut before we warn */
const GAMUT_WARNING_LOSS = 0.75;
/** Upper bound on extra candidates generated when spacing colors apart */
const MAX_CANDIDATES = 60;

const WHITE: Color = { space: 'srgb', values: [1, 1, 1] };
const BLACK: Color = { space: 'srgb', values: [0, 0, 0] };

export interface PaletteSwatch {
  /** Position-independent name: base, complement, triad-1, base-lighter-2, locked-1 ... */
  role: string;
  hex: string;
  /** Present on colors passed in through lockedColors */
  locked?: true;
  /** Fraction (0-1) of the requested chroma removed to fit the sRGB gamut */
  chromaLost: number;
  contrast: {
    onWhite: number;
    onBlack: number;
    /** The more readable text color to put on this swatch */
    textColor: '#ffffff' | '#000000';
    textContrast: number;
    /** Whether textColor reaches WCAG AA (4.5:1) for body text */
    meetsAA: boolean;
  };
  /** The most similar other color in the palette (CIEDE2000) */
  nearest?: { index: number; role: string; deltaE: number };
}

export interface PaletteScale {
  role: string;
  steps: Array<{ step: number; hex: string; color: Color; source: boolean }>;
}

export interface PaletteExports {
  css?: string;
  /** Drop into `theme.extend.colors` */
  tailwind?: Record<string, string | Record<string, string>>;
  /** W3C Design Tokens (DTCG) format */
  tokens?: Record<string, Record<string, { $type: 'color'; $value: string }>>;
}

export interface ColorGeneratePaletteResult {
  success: true;
  result: ColorPalette;
  /** One entry per color in result.colors, in the same order */
  swatches: PaletteSwatch[];
  /** 50-950 scales for each harmony hue and locked color, when `scale` is set */
  scales?: PaletteScale[];
  exports?: PaletteExports;
  /** Pairs closer than minDeltaE (or DEFAULT_MAX_DELTA_E when only lockedColors is set) */
  closePairs?: Array<{ indices: [number, number]; roles: [string, string]; deltaE: number }>;
  metadata: {
    processingTime: number;
    generatedAt: string;
    algorithm: string;
    colorSpace: string;
  };
  /** Present when the palette differs from what was asked for */
  warnings?: string[];
}

export interface ColorGeneratePaletteError {
  success: false;
  error: {
    code: ColorErrorCode;
    message: string;
    details?: Record<string, unknown>;
    suggestions?: string[];
  };
}

export type ColorGeneratePaletteResponse = ColorGeneratePaletteResult | ColorGeneratePaletteError;

/**
 * Generate harmonious color palette from base color
 */
export async function colorGeneratePalette(input: unknown): Promise<ColorGeneratePaletteResponse> {
  const startTime = performance.now();
  
  try {
    // Validate input
    const validated = ColorPaletteInputSchema.parse(input);
    const { 
      baseColor, 
      harmony, 
      count = 5, 
      space = 'oklch',
      options,
      lockedColors = [],
      minDeltaE,
      scale = false,
      exports: exportFormats = [],
      exportPrefix = 'color'
    } = validated;
    
    // Parse base color
    const parsedBaseColor = ColorUtils.parseColorInput(baseColor);
    const locked = lockedColors.map(parseLockedColor);
    
    // Generate harmony colors for the slots locked colors leave free;
    // options adjust only the generated colors
    const selection = selectHarmonySwatches(
      parsedBaseColor, harmony, count - locked.length, space, locked, minDeltaE
    );
    const generated = options
      ? ColorUtils.adjustPaletteSwatches(selection.swatches, space, options)
      : selection.swatches;
    const drafts: PaletteSwatchDraft[] = [
      ...generated,
      ...locked.map((color, i) => ({ color, role: `locked-${i + 1}`, chromaLost: 0, hueOffset: 0, key: true }))
    ];
    const colors = drafts.map(draft => draft.color);

    const distances = pairwiseDeltaE(colors);
    const swatches = drafts.map((draft, index) =>
      describeSwatch(draft, index, drafts, distances, index >= generated.length));
    // With locked colors, flag pairs that read as the same color even without minDeltaE
    const closeThreshold = minDeltaE ?? (locked.length > 0 ? DEFAULT_MAX_DELTA_E : undefined);
    const closePairs = closeThreshold === undefined ? [] : findClosePairs(drafts, distances, closeThreshold);
    const scales = scale
      ? drafts.filter(draft => draft.key).map(draft => buildScale(draft))
      : [];
    const exported = exportFormats.length > 0
      ? buildExports(swatches, scales, exportFormats, exportPrefix)
      : undefined;

    const warnings = paletteWarnings({
      baseColor: parsedBaseColor,
      harmony,
      generated,
      swatches,
      shortfall: selection.shortfall,
      closePairs: closePairs.length,
      closeThreshold,
      lockedCount: locked.length
    });
    
    const endTime = performance.now();
    const processingTime = Math.round((endTime - startTime) * 100) / 100;
    
    const palette: ColorPalette = {
      name: `${harmony}-palette-${count}`,
      colors,
      harmony,
      metadata: {
        baseColor: parsedBaseColor,
        generatedAt: new Date().toISOString(),
        algorithm: `harmony-${harmony}`
      }
    };
    
    return {
      success: true,
      result: palette,
      swatches,
      ...(scales.length > 0 && { scales }),
      ...(exported && { exports: exported }),
      ...(closePairs.length > 0 && { closePairs }),
      metadata: {
        processingTime,
        generatedAt: new Date().toISOString(),
        algorithm: `harmony-${harmony}`,
        colorSpace: space
      },
      ...(warnings.length > 0 && { warnings })
    };
    
  } catch (error) {
    // Handle Zod validation errors
    if (error instanceof Error && error.name === 'ZodError') {
      return {
        success: false,
        error: {
          code: ColorErrorCode.PALETTE_GENERATION_FAILED,
          message: 'Invalid input parameters',
          details: {
            input,
            validationErrors: error.message,
            processingTime: Math.round((performance.now() - startTime) * 100) / 100
          },
          suggestions: [
            'Verify base color format is correct',
            'Check harmony type is supported',
            'Ensure count is between 2 and 20',
            'Verify color space is valid'
          ]
        }
      };
    }
    
    // Handle structured errors from ColorUtils
    if (error instanceof ColorProcessingError) {
      return {
        success: false,
        error: error.toColorError()
      };
    }

    // Handle unstructured errors
    if (error instanceof Error) {
      return {
        success: false,
        error: {
          code: ColorErrorCode.PALETTE_GENERATION_FAILED,
          message: error.message || 'Palette generation failed',
          details: {
            input,
            processingTime: Math.round((performance.now() - startTime) * 100) / 100
          },
          suggestions: [
            'Verify base color format is correct',
            'Check harmony type is supported',
            'Ensure count is between 2 and 20',
            'Verify color space is valid'
          ]
        }
      };
    }
    
    return {
      success: false,
      error: {
        code: ColorErrorCode.PALETTE_GENERATION_FAILED,
        message: 'Unknown error during palette generation',
        details: { input }
      }
    };
  }
}

function parseLockedColor(input: ColorInput, index: number): Color {
  try {
    return ColorUtils.parseColorInput(input);
  } catch (error) {
    throw new ColorProcessingError({
      code: ColorErrorCode.INVALID_COLOR,
      message: `lockedColors[${index}] could not be parsed`,
      details: {
        input,
        error: error instanceof ColorProcessingError ? error.toColorError() : String(error)
      },
      suggestions: ['Use hex (#RRGGBB), a CSS color string, a named color, or a { space, values } object']
    });
  }
}

function hexOf(color: Color): string {
  // Prefer the hex computed at conversion time; re-deriving it from rounded values can drift by 1
  const hex = color.hex ?? ColorUtils.convertColor(color, 'hex').hex ?? '';
  if (color.alpha === undefined || color.alpha >= 1) return hex;
  return hex + Math.round(color.alpha * 255).toString(16).padStart(2, '0');
}

/**
 * Pick harmony colors for `slots`. Without locked colors or minDeltaE this is
 * the plain harmony. Otherwise colors too close to a locked color (or, with
 * minDeltaE, to an already chosen color) are skipped and replaced from a larger
 * pool of tints and shades. The base color is always kept.
 */
function selectHarmonySwatches(
  baseColor: Color,
  harmony: HarmonyType,
  slots: number,
  space: PaletteSpace,
  locked: Color[],
  minDeltaE: number | undefined
): { swatches: PaletteSwatchDraft[]; shortfall: number } {
  const primary = ColorUtils.generateHarmonySwatches(baseColor, harmony, slots, space);
  if (minDeltaE === undefined && locked.length === 0) {
    return { swatches: primary, shortfall: 0 };
  }

  const lockedDistance = minDeltaE ?? DEFAULT_MAX_DELTA_E;
  const base = primary.find(swatch => swatch.color === baseColor);
  const candidates = [
    ...(base ? [base] : []),
    ...primary.filter(swatch => swatch !== base),
    ...candidatePool(primary, slots, space)
  ];

  const chosen: PaletteSwatchDraft[] = [];
  const hexes = new Set<string>();
  const roles = new Set<string>();
  for (const candidate of candidates) {
    if (chosen.length >= slots) break;
    const hex = hexOf(candidate.color);
    if (candidate !== base) {
      if (hexes.has(hex)) continue;
      if (locked.some(color => ColorUtils.calculateDeltaE2000(candidate.color, color) < lockedDistance)) continue;
      if (minDeltaE !== undefined &&
          chosen.some(swatch => ColorUtils.calculateDeltaE2000(candidate.color, swatch.color) < minDeltaE)) continue;
    }

    // Pool candidates can reuse a primary role at a different lightness
    let role = candidate.role;
    for (let n = 2; roles.has(role); n++) role = `${candidate.role}-alt-${n}`;
    roles.add(role);
    hexes.add(hex);
    chosen.push({ ...candidate, role });
  }

  return { swatches: orderSwatches(chosen, harmony), shortfall: slots - chosen.length };
}

/**
 * Replacement candidates: a finer tint/shade ladder for each harmony hue, so
 * every harmony (analogous too) can trade lightness for distance.
 */
function candidatePool(primary: PaletteSwatchDraft[], slots: number, space: PaletteSpace): PaletteSwatchDraft[] {
  const keys = primary.filter(swatch => swatch.key);
  const perKey = Math.max(4, Math.ceil(Math.min(MAX_CANDIDATES, slots * 3) / keys.length));
  return keys.flatMap(key =>
    ColorUtils.generateHarmonySwatches(key.color, 'monochromatic', perKey, space)
      .filter(swatch => swatch.color !== key.color)
      .map(swatch => ({
        ...swatch,
        role: swatch.role.replace(/^base/, key.role),
        hueOffset: key.hueOffset,
        key: false
      }))
  );
}

/**
 * Restore the plain harmony's ordering after selection mixed in pool colors:
 * monochromatic dark to light, analogous by hue, others harmony hues first.
 */
function orderSwatches(swatches: PaletteSwatchDraft[], harmony: HarmonyType): PaletteSwatchDraft[] {
  const lightness = (swatch: PaletteSwatchDraft) => ColorUtils.convertColor(swatch.color, 'oklch').values[0];
  if (harmony === 'monochromatic' || swatches.every(swatch => swatch.hueOffset === 0)) {
    return [...swatches].sort((a, b) => lightness(a) - lightness(b));
  }
  if (harmony === 'analogous') {
    return [...swatches].sort((a, b) => a.hueOffset - b.hueOffset || lightness(a) - lightness(b));
  }
  return [...swatches.filter(swatch => swatch.key), ...swatches.filter(swatch => !swatch.key)];
}

function pairwiseDeltaE(colors: Color[]): number[][] {
  return colors.map((a, i) => colors.map((b, j) => (i === j ? 0 : ColorUtils.calculateDeltaE2000(a, b))));
}

function describeSwatch(
  draft: PaletteSwatchDraft,
  index: number,
  drafts: PaletteSwatchDraft[],
  distances: number[][],
  locked: boolean
): PaletteSwatch {
  const onWhite = Math.round(ColorUtils.calculateContrastRatio(draft.color, WHITE) * 100) / 100;
  const onBlack = Math.round(ColorUtils.calculateContrastRatio(draft.color, BLACK) * 100) / 100;
  const textContrast = Math.max(onWhite, onBlack);

  let nearest: PaletteSwatch['nearest'];
  distances[index].forEach((deltaE, other) => {
    if (other !== index && (!nearest || deltaE < nearest.deltaE)) {
      nearest = { index: other, role: drafts[other].role, deltaE };
    }
  });

  return {
    role: draft.role,
    hex: hexOf(draft.color),
    ...(locked && { locked: true as const }),
    chromaLost: draft.chromaLost,
    contrast: {
      onWhite,
      onBlack,
      textColor: onWhite >= onBlack ? '#ffffff' : '#000000',
      textContrast,
      meetsAA: textContrast >= AA_TEXT_CONTRAST
    },
    ...(nearest && { nearest })
  };
}

function findClosePairs(
  drafts: PaletteSwatchDraft[],
  distances: number[][],
  minDeltaE: number
): NonNullable<ColorGeneratePaletteResult['closePairs']> {
  const pairs: NonNullable<ColorGeneratePaletteResult['closePairs']> = [];
  for (let i = 0; i < drafts.length; i++) {
    for (let j = i + 1; j < drafts.length; j++) {
      if (distances[i][j] < minDeltaE) {
        pairs.push({ indices: [i, j], roles: [drafts[i].role, drafts[j].role], deltaE: distances[i][j] });
      }
    }
  }
  return pairs;
}

function buildScale(draft: PaletteSwatchDraft): PaletteScale {
  return {
    role: draft.role,
    steps: ColorUtils.generateTintScale(draft.color).map(({ step, color, source }) => ({
      step,
      hex: hexOf(color),
      color,
      source
    }))
  };
}

function buildExports(
  swatches: PaletteSwatch[],
  scales: PaletteScale[],
  formats: Array<'css' | 'tailwind' | 'tokens'>,
  prefix: string
): PaletteExports {
  // Flat name → hex, with scale steps as `${role}-${step}`
  const entries: Array<[string, string]> = [];
  for (const swatch of swatches) {
    entries.push([swatch.role, swatch.hex]);
    const scale = scales.find(candidate => candidate.role === swatch.role);
    scale?.steps.forEach(({ step, hex }) => entries.push([`${swatch.role}-${step}`, hex]));
  }

  const exported: PaletteExports = {};
  if (formats.includes('css')) {
    exported.css = `:root {\n${entries.map(([name, hex]) => `  --${prefix}-${name}: ${hex};`).join('\n')}\n}`;
  }
  if (formats.includes('tailwind')) {
    exported.tailwind = Object.fromEntries(swatches.map(swatch => {
      const scale = scales.find(candidate => candidate.role === swatch.role);
      return [swatch.role, scale
        ? { DEFAULT: swatch.hex, ...Object.fromEntries(scale.steps.map(({ step, hex }) => [String(step), hex])) }
        : swatch.hex];
    }));
  }
  if (formats.includes('tokens')) {
    exported.tokens = {
      [prefix]: Object.fromEntries(entries.map(([name, hex]) => [name, { $type: 'color' as const, $value: hex }]))
    };
  }
  return exported;
}

/**
 * Explain where the palette departs from the request: a grey base color can't
 * carry a hue harmony, harmony hues can lose most of their chroma to the sRGB
 * gamut, spacing or locked colors can leave slots unfilled, and 8-bit rounding
 * can make close colors identical.
 */
function paletteWarnings({ baseColor, harmony, generated, swatches, shortfall, closePairs, closeThreshold, lockedCount }: {
  baseColor: Color;
  harmony: string;
  generated: PaletteSwatchDraft[];
  swatches: PaletteSwatch[];
  shortfall: number;
  closePairs: number;
  closeThreshold: number | undefined;
  lockedCount: number;
}): string[] {
  const warnings: string[] = [];
  if (harmony !== 'monochromatic' && ColorUtils.isAchromatic(baseColor)) {
    warnings.push(`Base color has no meaningful hue, so a monochromatic ramp was generated instead of ${harmony}`);
  }

  const faded = generated.filter(swatch => swatch.key && swatch.chromaLost > GAMUT_WARNING_LOSS);
  if (faded.length > 0) {
    warnings.push(`${faded.length} harmony color(s) lost most of their chroma (over 75%) to fit sRGB (${faded.map(swatch => swatch.role).join(', ')}); very light or dark base colors can't hold strong color at other hues`);
  }

  if (shortfall > 0) {
    const constraint = lockedCount > 0
      ? `at least ${closeThreshold} Delta E from each other and the locked colors`
      : `at least ${closeThreshold} Delta E apart`;
    warnings.push(`${shortfall} color(s) could not be placed ${constraint}, so the palette is shorter than count`);
  }

  if (closePairs > 0) {
    warnings.push(`${closePairs} pair(s) are closer than ${closeThreshold} Delta E; see closePairs (the base and locked colors are always kept)`);
  }

  const hexes = swatches.map(swatch => swatch.hex);
  const duplicates = hexes.length - new Set(hexes).size;
  if (duplicates > 0) {
    warnings.push(`${duplicates} color(s) are identical to another after rounding to 8-bit hex`);
  }
  return warnings;
}

/**
 * Tool definition for MCP server registration
 */
export const colorGeneratePaletteTool = {
  name: 'color.generatePalette',
  description: 'Generate a harmonious palette from a base color (monochromatic, analogous, complementary, triadic, tetradic, split-complementary). Hues are rotated in the chosen space (OKLCH by default, which keeps lightness perceptually even) and mapped into the sRGB gamut. The base color is always included; extra colors are tints and shades of the harmony hues. Each color comes with a swatch: a role name (base, complement, triad-1, base-lighter-1 ...), WCAG contrast on white and black with the readable text color, how much chroma was lost to the gamut, and its nearest neighbour (CIEDE2000). Optional: lockedColors to keep existing brand colors and build around them, minDeltaE to keep colors apart, scale for Tailwind-style 50-950 ramps, and exports as CSS variables, Tailwind colors or W3C design tokens. Grey base colors fall back to a monochromatic ramp; warnings explain any departure from the request. Options: hueShift rotates every generated color; lightnessRange and saturationRange (percent) replace lightness and chroma, spread from the first color to the last.',
  inputSchema: {
    type: 'object',
    properties: {
      baseColor: colorInputJsonSchema,
      harmony: { enum: ['monochromatic', 'analogous', 'complementary', 'triadic', 'tetradic', 'split-complementary'] },
      count: { type: 'integer', minimum: 2, maximum: 20, default: 5, description: 'Total colors, including any lockedColors' },
      space: { enum: ['oklch', 'hsl', 'lab'], default: 'oklch', description: 'Space the harmony is computed in; lab uses its polar form (LCH)' },
      options: {
        type: 'object',
        properties: {
          hueShift: { type: 'number', minimum: -360, maximum: 360, description: 'Degrees to rotate every generated color' },
          lightnessRange: {
            type: 'array', items: { type: 'number', minimum: 0, maximum: 100 }, minItems: 2, maxItems: 2,
            description: '[first, last] lightness in percent, spread evenly across the generated colors'
          },
          saturationRange: {
            type: 'array', items: { type: 'number', minimum: 0, maximum: 100 }, minItems: 2, maxItems: 2,
            description: '[first, last] chroma in percent of the space maximum (OKLCH 0.4, LCH 150, HSL 100%), spread evenly across the generated colors'
          }
        }
      },
      lockedColors: {
        type: 'array', items: colorInputJsonSchema, maxItems: 10,
        description: 'Existing colors to keep unchanged (appended after the generated colors); generated colors avoid duplicating them. Must be fewer than count.'
      },
      minDeltaE: {
        type: 'number', minimum: 0, maximum: 50,
        description: 'Minimum CIEDE2000 distance between generated colors (about 5 is clearly different, 10+ is distinct at a glance). Applied before options.'
      },
      scale: { type: 'boolean', default: false, description: 'Also return a 50-950 OKLCH scale for each harmony hue and locked color' },
      exports: {
        type: 'array', items: { enum: ['css', 'tailwind', 'tokens'] }, maxItems: 3,
        description: 'Also return the palette as CSS custom properties, a Tailwind theme.extend.colors object, and/or W3C design tokens'
      },
      exportPrefix: { type: 'string', pattern: '^[a-z][a-z0-9-]*$', maxLength: 40, default: 'color', description: 'Prefix for CSS variable and token names' }
    },
    required: ['baseColor', 'harmony']
  }
};
