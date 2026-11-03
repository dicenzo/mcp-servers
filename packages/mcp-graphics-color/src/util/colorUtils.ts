import { 
  Color,
  ColorInput,
  ColorSpace,
  ColorErrorCode
} from '../types/color.js';
import * as culori from 'culori';
import { ColorProcessingError } from './colorError.js';
import type { Color as CuloriColor, Mode as CuloriMode } from 'culori';
import type { ZodError } from 'zod';

export type HarmonyType = 'monochromatic' | 'analogous' | 'complementary' | 'triadic' | 'tetradic' | 'split-complementary';

/** Spaces a palette can be generated in; `lab` works in its polar form, LCH. */
export type PaletteSpace = 'oklch' | 'lab' | 'hsl';

export interface PaletteAdjustments {
  hueShift?: number;
  lightnessRange?: [number, number];
  saturationRange?: [number, number];
}

interface PaletteSpaceGeometry {
  mode: 'oklch' | 'lch' | 'hsl';
  chromaChannel: 'c' | 's';
  maxLightness: number;
  maxChroma: number;
}

const PALETTE_SPACES: Record<PaletteSpace, PaletteSpaceGeometry> = {
  oklch: { mode: 'oklch', chromaChannel: 'c', maxLightness: 1, maxChroma: 0.4 },
  lab: { mode: 'lch', chromaChannel: 'c', maxLightness: 100, maxChroma: 150 },
  hsl: { mode: 'hsl', chromaChannel: 's', maxLightness: 1, maxChroma: 1 }
};

/**
 * A generated palette color with what's needed to describe it: its role
 * (`base`, `complement`, `triad-1-lighter-2` ...), how much of the requested
 * chroma was removed to fit sRGB (0-1), its hue offset from the base, and
 * whether it is a harmony hue at the base lightness rather than a tint/shade.
 */
export interface PaletteSwatchDraft {
  color: Color;
  role: string;
  chromaLost: number;
  hueOffset: number;
  key: boolean;
}

/** Tailwind-style scale steps and their OKLCH lightness targets. */
export const SCALE_STEPS: ReadonlyArray<readonly [step: number, lightness: number]> = [
  [50, 0.97], [100, 0.93], [200, 0.87], [300, 0.79], [400, 0.7], [500, 0.62],
  [600, 0.54], [700, 0.46], [800, 0.38], [900, 0.3], [950, 0.22]
];

/** Normalized (0-1) hue/lightness/chroma in a palette space; hue in degrees. */
interface PaletteCoordinates {
  hue: number;
  lightness: number;
  chroma: number;
}

/** OKLCH chroma below which a color counts as grey. */
const ACHROMATIC_CHROMA = 0.02;

/** Normalized lightness bounds for generated tints and shades. */
const MIN_PALETTE_LIGHTNESS = 0.15;
const MAX_PALETTE_LIGHTNESS = 0.95;
/** Largest lightness step between a harmony color and its tints and shades. */
const MAX_LIGHTNESS_STEP = 0.12;

/**
 * Channel values a culori color object may carry, keyed by channel name.
 * Every culori color type is assignable to this, so channels can be read
 * without first narrowing on `mode`.
 */
type CuloriChannels = Partial<Record<'r' | 'g' | 'b' | 'h' | 's' | 'l' | 'c' | 'a' | 'alpha', number>>;

/**
 * Advanced color utility functions for conversions and operations
 */
export class ColorUtils {
  private static readonly NAMED_COLORS = new Set([
    'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
    'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
    'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue',
    'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgrey', 'darkgreen', 'darkkhaki',
    'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
    'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
    'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick',
    'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
    'gray', 'grey', 'green', 'greenyellow', 'honeydew', 'hotpink', 'indianred', 'indigo',
    'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue',
    'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgrey', 'lightgreen',
    'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
    'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen',
    'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
    'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
    'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite',
    'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
    'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink',
    'plum', 'powderblue', 'purple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon',
    'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue',
    'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle',
    'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
  ]);

  /**
   * Describe schema validation failures in readable terms, e.g.
   * "brand palette: Array must contain at least 1 element(s)".
   * camelCase field names are split into words; a failure on the whole
   * input (such as null) is reported against "input".
   */
  static describeValidationError(error: ZodError): string {
    const descriptions = error.issues.map(issue => {
      const field = issue.path.length > 0
        ? issue.path.map(part => String(part).replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()).join(' > ')
        : 'input';
      return `${field}: ${issue.message}`;
    });
    return `Invalid input parameters: ${descriptions.join('; ')}`;
  }

  /**
   * Parse and normalize color input to internal Color format
   */
  static parseColorInput(input: ColorInput): Color {
    try {
      if (typeof input === 'string') {
        return this.parseStringColor(input);
      } else {
        return this.parseObjectColor(input);
      }
    } catch (error) {
      throw new ColorProcessingError({
        code: ColorErrorCode.INVALID_COLOR,
        message: 'Failed to parse color input',
        details: { input, error: error instanceof Error ? error.message : 'Unknown error' },
        suggestions: [
          'Use hex format (#RGB or #RRGGBB)',
          'Use CSS color strings (rgb(), hsl(), etc.)',
          'Use named colors (red, blue, green, etc.)',
          'Use object format with space and values array'
        ]
      });
    }
  }

  /**
   * Parse string color formats
   */
  private static parseStringColor(colorString: string): Color {
    const trimmed = colorString.trim();

    // Try to parse with culori
    try {
      const culoriColor = culori.parse(trimmed);
      if (!culoriColor) throw new Error('Invalid color format');
      
      // Determine the color space based on the parsed color
      let space: ColorSpace = 'srgb';
      let values: number[] = [0, 0, 0];
      
      if (culoriColor.mode === 'rgb') {
        space = 'srgb';
        values = [culoriColor.r || 0, culoriColor.g || 0, culoriColor.b || 0];
      } else if (culoriColor.mode === 'hsl') {
        space = 'hsl';
        values = [culoriColor.h || 0, culoriColor.s || 0, culoriColor.l || 0];
      } else if (culoriColor.mode === 'oklch') {
        space = 'oklch';
        values = [culoriColor.l || 0, culoriColor.c || 0, culoriColor.h || 0];
      } else if (culoriColor.mode === 'oklab') {
        space = 'oklab';
        values = [culoriColor.l || 0, culoriColor.a || 0, culoriColor.b || 0];
      } else if (culoriColor.mode === 'lab') {
        space = 'lab';
        values = [culoriColor.l || 0, culoriColor.a || 0, culoriColor.b || 0];
      } else if (culoriColor.mode === 'lch') {
        space = 'lch';
        values = [culoriColor.l || 0, culoriColor.c || 0, culoriColor.h || 0];
      } else {
        // Default to srgb for other modes
        space = 'srgb';
        const rgbColor = culori.converter('rgb')(culoriColor);
        if (!rgbColor) {
          throw new Error('Failed to convert color to RGB');
        }
        values = [rgbColor.r || 0, rgbColor.g || 0, rgbColor.b || 0];
      }
      
      return {
        space,
        values,
        alpha: culoriColor.alpha,
        hex: culori.formatHex(culoriColor),
        css: culori.formatCss(culoriColor)
      };
    } catch {
      throw new Error('Invalid color string format');
    }
  }

  /**
   * Parse object color format
   */
  private static parseObjectColor(colorObj: { space: ColorSpace; values: number[]; alpha?: number }): Color {
    const { space, values, alpha } = colorObj;
    
    if (!this.isValidColorSpace(space)) {
      throw new Error(`Unsupported color space: ${space}`);
    }

    if (!this.areValidColorValues(values, space)) {
      throw new Error(`Invalid color values for space ${space}`);
    }

    // Create culori color object
    let culoriColor: CuloriColor;
    
    switch (space) {
      case 'srgb':
      case 'rgb':
        culoriColor = { mode: 'rgb', r: values[0], g: values[1], b: values[2], alpha };
        break;
      case 'hsl':
        culoriColor = { mode: 'hsl', h: values[0], s: values[1], l: values[2], alpha };
        break;
      case 'oklch':
        culoriColor = { mode: 'oklch', l: values[0], c: values[1], h: values[2], alpha };
        break;
      case 'oklab':
        culoriColor = { mode: 'oklab', l: values[0], a: values[1], b: values[2], alpha };
        break;
      case 'lab':
        culoriColor = { mode: 'lab', l: values[0], a: values[1], b: values[2], alpha };
        break;
      case 'lch':
        culoriColor = { mode: 'lch', l: values[0], c: values[1], h: values[2], alpha };
        break;
      default:
        throw new Error(`Color space conversion not implemented: ${space}`);
    }

    return {
      space,
      values: [...values],
      alpha,
      hex: culori.formatHex(culoriColor),
      css: culori.formatCss(culoriColor)
    };
  }

  /**
   * Convert color between different color spaces
   */
  static convertColor(color: Color, targetSpace: ColorSpace, precision: number = 3): Color {
    try {
      // Create culori color object from source color
      const sourceColor = this.colorToCulori(color);
      
      // Handle special cases
      let convertedColor: CuloriColor | undefined;
      if ((color.space === 'srgb' && targetSpace === 'rgb') || (color.space === 'rgb' && targetSpace === 'srgb')) {
        // These are equivalent color spaces, just copy values
        // Object.assign (rather than spread) lets TypeScript see the result as an Rgb color
        convertedColor = Object.assign({}, sourceColor, { mode: 'rgb' as const });
      } else if (color.space === targetSpace) {
        // Same space, return as-is
        convertedColor = sourceColor;
      } else if (targetSpace === 'hex') {
        // For hex conversion, convert to rgb first, then format as hex
        const rgbConverter = culori.converter('rgb');
        convertedColor = rgbConverter(sourceColor);
      } else {
        // Map color spaces to culori equivalents for conversion. hsla/rgba are hsl/rgb:
        // alpha travels separately on the Color object.
        const culoriTargetSpace =
          targetSpace === 'srgb' || targetSpace === 'rgba' ? 'rgb' :
          targetSpace === 'hsla' ? 'hsl' :
          targetSpace;
        
        // Convert to target space using culori converter
        const targetConverter = culori.converter(culoriTargetSpace as CuloriMode);
        convertedColor = targetConverter(sourceColor);
      }
      
      if (!convertedColor) {
        throw new Error(`Conversion to ${targetSpace} failed`);
      }
      const channels: CuloriChannels = convertedColor;

      // Extract values based on target space
      let values: number[];
      
      switch (targetSpace) {
        case 'srgb':
        case 'rgb':
        case 'rgba':
          // rgb-mode culori colors always carry r/g/b; NaN matches rounding a missing channel
          values = [channels.r, channels.g, channels.b].map(v => this.roundToPrecision(v ?? NaN, precision));
          break;
        case 'hsl':
        case 'hsla':
          values = [
            channels.h || 0, 
            channels.s || 0, 
            channels.l || 0
          ].map(v => this.roundToPrecision(v, precision));
          break;
        case 'oklch':
          values = [
            channels.l || 0,
            channels.c || 0,
            channels.h || 0
          ].map(v => this.roundToPrecision(v, precision));
          break;
        case 'oklab':
          values = [
            channels.l || 0,
            channels.a || 0,
            channels.b || 0
          ].map(v => this.roundToPrecision(v, precision));
          break;
        case 'lab':
          values = [
            channels.l || 0,
            channels.a || 0,
            channels.b || 0
          ].map(v => this.roundToPrecision(v, precision));
          break;
        case 'lch':
          values = [
            channels.l || 0,
            channels.c || 0,
            channels.h || 0
          ].map(v => this.roundToPrecision(v, precision));
          break;
        case 'hex':
          return {
            space: 'hex',
            values: [0], // Placeholder
            alpha: channels.alpha,
            hex: culori.formatHex(convertedColor),
            css: culori.formatHex(convertedColor)
          };
        default:
          throw new Error(`Target space not supported: ${targetSpace}`);
      }

      return {
        space: targetSpace,
        values,
        alpha: channels.alpha,
        hex: culori.formatHex(convertedColor),
        css: culori.formatCss(convertedColor)
      };
    } catch (error) {
      throw new ColorProcessingError({
        code: ColorErrorCode.CONVERSION_FAILED,
        message: 'Color space conversion failed',
        details: { 
          sourceColor: color,
          targetSpace,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        suggestions: [
          'Check that source color is valid',
          'Verify target color space is supported',
          'Ensure color values are within valid ranges'
        ]
      });
    }
  }

  /**
   * Calculate WCAG contrast ratio between two colors
   */
  static calculateContrastRatio(foreground: Color, background: Color): number {
    try {
      const fgCulori = this.colorToCulori(foreground);
      const bgCulori = this.colorToCulori(background);

      if (!fgCulori || !bgCulori) {
        throw new Error('Failed to convert colors for contrast calculation');
      }

      const ratio = culori.wcagContrast(fgCulori, bgCulori);
      return Math.round(ratio * 100) / 100; // Round to 2 decimal places
    } catch (error) {
      throw new ColorProcessingError({
        code: ColorErrorCode.ACCESSIBILITY_CHECK_FAILED,
        message: 'Failed to calculate contrast ratio',
        details: { 
          foreground,
          background,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        suggestions: [
          'Ensure both colors are valid',
          'Check color space compatibility'
        ]
      });
    }
  }

  /**
   * Calculate Delta E color difference
   */
  static calculateDeltaE(color1: Color, color2: Color): number {
    try {
      const c1 = this.colorToCulori(color1);
      const c2 = this.colorToCulori(color2);
      
      // Convert to Lab for Delta E calculation
      const toLab = culori.converter('lab');
      const lab1 = toLab(c1);
      const lab2 = toLab(c2);
      
      if (!lab1 || !lab2) {
        throw new Error('Failed to convert colors to Lab space');
      }
      
      const deltaE = culori.differenceEuclidean('lab')(lab1, lab2);
      return Math.round(deltaE * 100) / 100;
    } catch (error) {
      throw new ColorProcessingError({
        code: ColorErrorCode.PROCESSING_FAILED,
        message: 'Failed to calculate Delta E',
        details: { 
          color1,
          color2,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        suggestions: [
          'Ensure both colors are valid',
          'Check color values are within valid ranges'
        ]
      });
    }
  }

  /**
   * Calculate CIEDE2000 color difference, the perceptually uniform successor
   * to CIE76 (calculateDeltaE). Values are smaller than CIE76 for the same
   * pair, so thresholds tuned for one do not carry over to the other.
   */
  static calculateDeltaE2000(color1: Color, color2: Color): number {
    try {
      const c1 = this.colorToCulori(color1);
      const c2 = this.colorToCulori(color2);

      if (!c1 || !c2) {
        throw new Error('Failed to convert colors for CIEDE2000 calculation');
      }

      const deltaE = culori.differenceCiede2000()(c1, c2);
      if (!Number.isFinite(deltaE)) {
        throw new Error('CIEDE2000 produced a non-finite result');
      }
      return Math.round(deltaE * 100) / 100;
    } catch (error) {
      throw new ColorProcessingError({
        code: ColorErrorCode.PROCESSING_FAILED,
        message: 'Failed to calculate CIEDE2000 Delta E',
        details: {
          color1,
          color2,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        suggestions: [
          'Ensure both colors are valid',
          'Check color values are within valid ranges'
        ]
      });
    }
  }

  /**
   * Convert a color to CIE LCh (D65), the space CIEDE2000 works in. Hue is
   * undefined for achromatic colors.
   */
  static toLch(color: Color): { l: number; c: number; h?: number } {
    const culoriColor = this.colorToCulori(color);
    const lch = culoriColor ? culori.converter('lch65')(culoriColor) : undefined;
    if (!lch) {
      throw new ColorProcessingError({
        code: ColorErrorCode.PROCESSING_FAILED,
        message: 'Failed to convert color to LCh',
        details: { color },
        suggestions: ['Ensure the color is valid']
      });
    }
    return { l: lch.l, c: lch.c, ...(lch.h !== undefined && { h: lch.h }) };
  }

  /**
   * Generate a harmonious palette from a base color. Hues are rotated in `space`
   * (OKLCH by default, so lightness stays perceptually even), extra colors are
   * tints and shades of the harmony hues, and the base color itself is always
   * included. Greys fall back to a monochromatic ramp.
   */
  static generateHarmonyPalette(
    baseColor: Color,
    harmony: HarmonyType,
    count: number = 5,
    space: PaletteSpace = 'oklch'
  ): Color[] {
    return this.generateHarmonySwatches(baseColor, harmony, count, space).map(swatch => swatch.color);
  }

  /**
   * generateHarmonyPalette with each color's role, gamut loss and hue offset
   */
  static generateHarmonySwatches(
    baseColor: Color,
    harmony: HarmonyType,
    count: number = 5,
    space: PaletteSpace = 'oklch'
  ): PaletteSwatchDraft[] {
    try {
      const geometry = PALETTE_SPACES[space];
      const base = this.toPaletteCoordinates(baseColor, space);
      // Rotating the hue of a grey only produces more of the same grey
      const requestedOffsets = this.harmonyHueOffsets(harmony, count);
      const effectiveHarmony = this.isAchromatic(baseColor) ? 'monochromatic' : harmony;
      const hueOffsets = effectiveHarmony === harmony
        ? requestedOffsets
        : this.harmonyHueOffsets(effectiveHarmony, count);
      const hueRoles = this.harmonyHueRoles(effectiveHarmony, hueOffsets);
      const levels = Math.ceil(count / hueOffsets.length);
      const ladder = this.lightnessLadder(base.lightness, levels);
      if (effectiveHarmony === 'monochromatic') {
        // A single hue reads best as a dark-to-light ramp
        ladder.sort((a, b) => a - b);
      }
      const ladderLabels = this.ladderLabels(ladder, base.lightness);

      // Round 0 places every harmony hue at the base lightness; later rounds add
      // tints and shades, nearest first, so small counts get the closest variations.
      const swatches: PaletteSwatchDraft[] = [];
      for (let round = 0; round < levels && swatches.length < count; round++) {
        hueOffsets.forEach((offset, hueIndex) => {
          if (swatches.length >= count) return;
          const lightness = ladder[round];
          const key = lightness === base.lightness;
          const role = key ? hueRoles[hueIndex] : `${hueRoles[hueIndex]}-${ladderLabels[round]}`;
          if (offset === 0 && key) {
            swatches.push({ color: baseColor, role, chromaLost: 0, hueOffset: 0, key });
            return;
          }
          const { color, chromaLost } = this.fromPaletteCoordinates({
            hue: base.hue + offset,
            lightness,
            chroma: base.chroma
          }, geometry, baseColor);
          swatches.push({ color, role, chromaLost, hueOffset: offset, key });
        });
      }

      return swatches;
    } catch (error) {
      if (error instanceof ColorProcessingError) {
        throw error;
      }
      throw new ColorProcessingError({
        code: ColorErrorCode.PALETTE_GENERATION_FAILED,
        message: 'Failed to generate color palette',
        details: { 
          baseColor,
          harmony,
          count,
          space,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        suggestions: [
          'Ensure base color is valid',
          'Check harmony type is supported',
          'Verify count is reasonable (2-20)'
        ]
      });
    }
  }

  /**
   * A Tailwind-style 50-950 scale for one color, built in OKLCH with the color's
   * hue and chroma and fixed lightness targets (chroma reduced where needed to
   * fit sRGB). The step closest in lightness to the color is the color itself.
   */
  static generateTintScale(color: Color): Array<{ step: number; color: Color; source: boolean }> {
    const geometry = PALETTE_SPACES.oklch;
    const coords = this.toPaletteCoordinates(color, 'oklch');
    let sourceIndex = 0;
    SCALE_STEPS.forEach(([, lightness], index) => {
      if (Math.abs(lightness - coords.lightness) < Math.abs(SCALE_STEPS[sourceIndex][1] - coords.lightness)) {
        sourceIndex = index;
      }
    });

    return SCALE_STEPS.map(([step, lightness], index) => ({
      step,
      color: index === sourceIndex
        ? color
        : this.fromPaletteCoordinates({ hue: coords.hue, lightness, chroma: coords.chroma }, geometry, color).color,
      source: index === sourceIndex
    }));
  }

  /**
   * Whether a color has too little chroma for its hue to mean anything
   * (greys, black, white and near-greys).
   */
  static isAchromatic(color: Color): boolean {
    const oklch = this.convertColor(color, 'oklch', 6);
    return oklch.values[1] < ACHROMATIC_CHROMA;
  }

  /**
   * Adjust palette swatches in the palette's working space. `hueShift` rotates
   * every color; `lightnessRange` and `saturationRange` (percent, 0-100) replace
   * each color's lightness or chroma, spread evenly from the first color to the
   * last. Chroma percentages are relative to the space's maximum (OKLCH 0.4,
   * LCH 150, HSL saturation 100%).
   */
  static adjustPaletteSwatches(
    swatches: PaletteSwatchDraft[],
    space: PaletteSpace,
    options: PaletteAdjustments
  ): PaletteSwatchDraft[] {
    const { hueShift, lightnessRange, saturationRange } = options;
    const geometry = PALETTE_SPACES[space];
    const along = (range: [number, number], index: number) => {
      const factor = swatches.length > 1 ? index / (swatches.length - 1) : 0;
      return (range[0] + (range[1] - range[0]) * factor) / 100;
    };

    return swatches.map((swatch, index) => {
      const coords = this.toPaletteCoordinates(swatch.color, space);
      const { color, chromaLost } = this.fromPaletteCoordinates({
        hue: coords.hue + (hueShift ?? 0),
        lightness: lightnessRange ? along(lightnessRange, index) : coords.lightness,
        chroma: saturationRange ? along(saturationRange, index) : coords.chroma
      }, geometry, swatch.color);
      return { ...swatch, color, chromaLost };
    });
  }

  /**
   * Convert internal Color format to culori color object
   */
  private static colorToCulori(color: Color): CuloriColor | undefined {
    const { space, values, alpha } = color;
    
    switch (space) {
      case 'srgb':
      case 'rgb':
      case 'rgba':
        return { mode: 'rgb', r: values[0], g: values[1], b: values[2], alpha };
      case 'hsl':
      case 'hsla':
        return { mode: 'hsl', h: values[0], s: values[1], l: values[2], alpha };
      case 'oklch':
        return { mode: 'oklch', l: values[0], c: values[1], h: values[2], alpha };
      case 'oklab':
        return { mode: 'oklab', l: values[0], a: values[1], b: values[2], alpha };
      case 'lab':
        return { mode: 'lab', l: values[0], a: values[1], b: values[2], alpha };
      case 'lch':
        return { mode: 'lch', l: values[0], c: values[1], h: values[2], alpha };
      case 'hex':
        if (color.hex) {
          return culori.parse(color.hex);
        }
        throw new Error('Hex color missing hex value');
      default:
        throw new Error(`Unsupported color space: ${space}`);
    }
  }

  /**
   * Validation helpers
   */
  private static isValidColorSpace(space: string): space is ColorSpace {
    return ['srgb', 'oklch', 'oklab', 'hsl', 'hsla', 'rgb', 'rgba', 'hex', 'lab', 'lch'].includes(space);
  }

  private static areValidColorValues(values: number[], space: ColorSpace): boolean {
    if (values.length < 3) return false;
    
    switch (space) {
      case 'srgb':
      case 'rgb':
      case 'rgba':
        return values.every(v => v >= 0 && v <= 1);
      case 'hsl':
      case 'hsla':
        return values[0] >= 0 && values[0] <= 360 && // hue
               values[1] >= 0 && values[1] <= 1 &&   // saturation 
               values[2] >= 0 && values[2] <= 1;     // lightness
      case 'oklch':
        return values[0] >= 0 && values[0] <= 1 &&   // lightness
               values[1] >= 0 &&                     // chroma (unbounded but reasonable limit)
               values[2] >= 0 && values[2] <= 360;   // hue
      default:
        return true; // Other spaces have different valid ranges
    }
  }

  private static roundToPrecision(value: number, precision: number): number {
    const factor = Math.pow(10, precision);
    return Math.round(value * factor) / factor;
  }

  /**
   * Harmony palette helpers
   */

  /**
   * Hue offsets (degrees from the base) that define each harmony. Analogous spreads
   * `count` hues around the base, narrowing the step as the count grows.
   */
  private static harmonyHueOffsets(harmony: HarmonyType, count: number): number[] {
    switch (harmony) {
      case 'monochromatic':
        return [0];
      case 'analogous': {
        const step = Math.min(30, 120 / (count - 1));
        const centre = Math.floor((count - 1) / 2);
        return Array.from({ length: count }, (_, i) => (i - centre) * step);
      }
      case 'complementary':
        return [0, 180];
      case 'triadic':
        return [0, 120, 240];
      case 'tetradic':
        return [0, 90, 180, 270];
      case 'split-complementary':
        return [0, 150, 210];
      default:
        throw new Error(`Unsupported harmony type: ${harmony}`);
    }
  }

  /**
   * Role names for each harmony hue, in the order of harmonyHueOffsets
   */
  private static harmonyHueRoles(harmony: HarmonyType, offsets: number[]): string[] {
    const numbered = (prefix: string) => offsets.map((_, i) => (i === 0 ? 'base' : `${prefix}-${i}`));
    switch (harmony) {
      case 'monochromatic':
        return ['base'];
      case 'analogous': {
        const step = offsets.length > 1 ? Math.abs(offsets[1] - offsets[0]) : 1;
        return offsets.map(offset => {
          const position = Math.round(offset / step);
          if (position === 0) return 'base';
          return `analogous-${position < 0 ? 'minus' : 'plus'}-${Math.abs(position)}`;
        });
      }
      case 'complementary':
        return ['base', 'complement'];
      case 'triadic':
        return numbered('triad');
      case 'tetradic':
        return numbered('tetrad');
      case 'split-complementary':
        return numbered('split');
      default:
        throw new Error(`Unsupported harmony type: ${harmony}`);
    }
  }

  /**
   * Label each ladder entry `lighter-n` / `darker-n` relative to the base,
   * numbered outward from the base. The base itself gets an empty label.
   */
  private static ladderLabels(ladder: number[], baseLightness: number): string[] {
    const labels = ladder.map(() => '');
    for (const direction of ['lighter', 'darker'] as const) {
      ladder
        .map((lightness, index) => ({ lightness, index }))
        .filter(({ lightness }) =>
          direction === 'lighter' ? lightness > baseLightness : lightness < baseLightness)
        .sort((a, b) => Math.abs(a.lightness - baseLightness) - Math.abs(b.lightness - baseLightness))
        .forEach(({ index }, n) => { labels[index] = `${direction}-${n + 1}`; });
    }
    return labels;
  }

  /**
   * `levels` distinct lightness values (normalized 0-1): the base lightness first,
   * then steps above and below it, nearest first. Steps are at most
   * MAX_LIGHTNESS_STEP so a few variations stay close to the base, and shrink as
   * more are needed so they all fit in the usable range.
   */
  private static lightnessLadder(baseLightness: number, levels: number): number[] {
    if (levels <= 1) return [baseLightness];

    const range = MAX_PALETTE_LIGHTNESS - MIN_PALETTE_LIGHTNESS;
    // Dividing by `levels` (not levels - 1) leaves room for levels - 1 steps
    // on whichever sides of the anchor have space
    const step = Math.min(MAX_LIGHTNESS_STEP, range / levels);
    const anchor = Math.max(MIN_PALETTE_LIGHTNESS, Math.min(MAX_PALETTE_LIGHTNESS, baseLightness));
    const inRange = (value: number) =>
      value >= MIN_PALETTE_LIGHTNESS - 1e-9 && value <= MAX_PALETTE_LIGHTNESS + 1e-9;

    // A base outside the usable range (near-black, near-white) gets the anchor as a variation
    const ladder = [baseLightness];
    if (anchor !== baseLightness) ladder.push(anchor);
    for (let k = 1; ladder.length < levels; k++) {
      for (const candidate of [anchor + k * step, anchor - k * step]) {
        if (ladder.length < levels && inRange(candidate)) ladder.push(candidate);
      }
    }
    return ladder;
  }

  /**
   * Read a color as normalized hue/lightness/chroma in the palette's working space.
   * Lightness and chroma are 0-1 fractions of the space's range; a missing hue
   * (greys) reads as 0.
   */
  private static toPaletteCoordinates(color: Color, space: PaletteSpace): PaletteCoordinates {
    const geometry = PALETTE_SPACES[space];
    const converted = culori.converter(geometry.mode)(this.colorToCulori(color));
    if (!converted) {
      throw new Error(`Conversion to ${geometry.mode} failed`);
    }
    const channels: CuloriChannels = converted;
    return {
      hue: channels.h ?? 0,
      lightness: (channels.l ?? 0) / geometry.maxLightness,
      chroma: (channels[geometry.chromaChannel] ?? 0) / geometry.maxChroma
    };
  }

  /**
   * Build a color from normalized palette coordinates, reduce its chroma until it
   * fits in sRGB, and return it in the template color's space with its alpha,
   * along with the fraction of the requested chroma that was removed.
   */
  private static fromPaletteCoordinates(
    coords: PaletteCoordinates,
    geometry: PaletteSpaceGeometry,
    template: Color
  ): { color: Color; chromaLost: number } {
    const hue = ((coords.hue % 360) + 360) % 360;
    const lightness = Math.max(0, Math.min(1, coords.lightness)) * geometry.maxLightness;
    const chroma = Math.max(0, coords.chroma) * geometry.maxChroma;

    let values: number[];
    let chromaLost = 0;
    if (geometry.mode === 'hsl') {
      values = [hue, Math.min(1, chroma), lightness];
    } else {
      const mapped: CuloriChannels = culori.clampChroma(
        { mode: geometry.mode, l: lightness, c: chroma, h: hue },
        geometry.mode
      );
      const mappedChroma = mapped.c ?? 0;
      values = [mapped.l ?? lightness, mappedChroma, hue];
      if (chroma > 0) {
        chromaLost = this.roundToPrecision(Math.max(0, (chroma - mappedChroma) / chroma), 2);
      }
    }

    const color: Color = { space: geometry.mode, values, alpha: template.alpha };
    return { color: this.convertColor(color, template.space), chromaLost };
  }
}