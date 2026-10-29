import { 
  Color,
  ColorInput,
  ColorSpace,
  ColorError,
  ColorErrorCode
} from '../types/color.js';
import * as culori from 'culori';
import type { Color as CuloriColor, Mode as CuloriMode } from 'culori';

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
      throw new Error(JSON.stringify({
        code: ColorErrorCode.INVALID_COLOR,
        message: 'Failed to parse color input',
        details: { input, error: error instanceof Error ? error.message : 'Unknown error' },
        suggestions: [
          'Use hex format (#RGB or #RRGGBB)',
          'Use CSS color strings (rgb(), hsl(), etc.)',
          'Use named colors (red, blue, green, etc.)',
          'Use object format with space and values array'
        ]
      } satisfies ColorError));
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
        // Map color spaces to culori equivalents for conversion
        const culoriTargetSpace = targetSpace === 'srgb' ? 'rgb' : targetSpace;
        
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
          // rgb-mode culori colors always carry r/g/b; NaN matches rounding a missing channel
          values = [channels.r, channels.g, channels.b].map(v => this.roundToPrecision(v ?? NaN, precision));
          break;
        case 'hsl':
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
      throw new Error(JSON.stringify({
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
      } satisfies ColorError));
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
      throw new Error(JSON.stringify({
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
      } satisfies ColorError));
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
      throw new Error(JSON.stringify({
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
      } satisfies ColorError));
    }
  }

  /**
   * Generate harmonious color palette from base color
   */
  static generateHarmonyPalette(
    baseColor: Color,
    harmony: 'monochromatic' | 'analogous' | 'complementary' | 'triadic' | 'tetradic' | 'split-complementary',
    count: number = 5
  ): Color[] {
    try {
      const baseCulori = this.colorToCulori(baseColor);
      const toHsl = culori.converter('hsl');
      const baseHsl = toHsl(baseCulori) as { h: number; s: number; l: number } | null | undefined;
      
      if (!baseHsl || typeof baseHsl !== 'object' || !('h' in baseHsl) || baseHsl.h === undefined) {
        throw new Error('Failed to extract hue from base color');
      }

      switch (harmony) {
        case 'monochromatic':
          return this.generateMonochromatic(baseColor, count);
        
        case 'analogous':
          return this.generateAnalogous(baseColor, count);
        
        case 'complementary':
          return this.generateComplementary(baseColor, count);
        
        case 'triadic':
          return this.generateTriadic(baseColor, count);
        
        case 'tetradic':
          return this.generateTetradic(baseColor, count);
        
        case 'split-complementary':
          return this.generateSplitComplementary(baseColor, count);
        
        default:
          throw new Error(`Unsupported harmony type: ${harmony}`);
      }
    } catch (error) {
      throw new Error(JSON.stringify({
        code: ColorErrorCode.PALETTE_GENERATION_FAILED,
        message: 'Failed to generate color palette',
        details: { 
          baseColor,
          harmony,
          count,
          error: error instanceof Error ? error.message : 'Unknown error'
        },
        suggestions: [
          'Ensure base color is valid',
          'Check harmony type is supported',
          'Verify count is reasonable (2-20)'
        ]
      } satisfies ColorError));
    }
  }

  /**
   * Convert internal Color format to culori color object
   */
  private static colorToCulori(color: Color): CuloriColor | undefined {
    const { space, values, alpha } = color;
    
    switch (space) {
      case 'srgb':
        return { mode: 'rgb', r: values[0], g: values[1], b: values[2], alpha };
      case 'rgb':
        return { mode: 'rgb', r: values[0], g: values[1], b: values[2], alpha };
      case 'hsl':
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
        return values.every(v => v >= 0 && v <= 1);
      case 'hsl':
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
   * Harmony palette generators
   */
  private static generateMonochromatic(baseColor: Color, count: number): Color[] {
    const colors: Color[] = [];
    const baseHsl = this.convertColor(baseColor, 'hsl');
    const baseLightness = baseHsl.values[2];
    
    for (let i = 0; i < count; i++) {
      const lightness = Math.max(0.1, Math.min(0.9, baseLightness + (i - count/2) * 0.15));
      colors.push(this.convertColor({
        space: 'hsl',
        values: [baseHsl.values[0], baseHsl.values[1], lightness]
      }, baseColor.space));
    }
    
    return colors;
  }

  private static generateAnalogous(baseColor: Color, count: number): Color[] {
    const colors: Color[] = [];
    const baseHsl = this.convertColor(baseColor, 'hsl');
    const baseHue = baseHsl.values[0];
    
    for (let i = 0; i < count; i++) {
      const hue = (baseHue + (i - count/2) * 30 + 360) % 360;
      colors.push(this.convertColor({
        space: 'hsl',
        values: [hue, baseHsl.values[1], baseHsl.values[2]]
      }, baseColor.space));
    }
    
    return colors;
  }

  private static generateComplementary(baseColor: Color, count: number): Color[] {
    const colors: Color[] = [baseColor];
    const baseHsl = this.convertColor(baseColor, 'hsl');
    const complementaryHue = (baseHsl.values[0] + 180) % 360;
    
    colors.push(this.convertColor({
      space: 'hsl',
      values: [complementaryHue, baseHsl.values[1], baseHsl.values[2]]
    }, baseColor.space));
    
    // Add variations if more colors needed
    while (colors.length < count) {
      const variation = colors.length % 2 === 0 ? baseHsl : {
        space: 'hsl' as ColorSpace,
        values: [complementaryHue, baseHsl.values[1], baseHsl.values[2]]
      };
      const lightness = Math.max(0.1, Math.min(0.9, variation.values[2] + (colors.length * 0.1)));
      
      colors.push(this.convertColor({
        space: 'hsl',
        values: [variation.values[0], variation.values[1], lightness]
      }, baseColor.space));
    }
    
    return colors.slice(0, count);
  }

  private static generateTriadic(baseColor: Color, count: number): Color[] {
    const colors: Color[] = [baseColor];
    const baseHsl = this.convertColor(baseColor, 'hsl');
    const baseHue = baseHsl.values[0];
    
    // Add triadic colors (120° apart)
    for (let i = 1; i <= 2; i++) {
      const hue = (baseHue + i * 120) % 360;
      colors.push(this.convertColor({
        space: 'hsl',
        values: [hue, baseHsl.values[1], baseHsl.values[2]]
      }, baseColor.space));
    }
    
    // Add variations if more colors needed
    while (colors.length < count) {
      const baseIndex = (colors.length - 3) % 3;
      const baseForVariation = colors[baseIndex];
      const baseHslVar = this.convertColor(baseForVariation, 'hsl');
      const lightness = Math.max(0.1, Math.min(0.9, baseHslVar.values[2] + 0.2));
      
      colors.push(this.convertColor({
        space: 'hsl',
        values: [baseHslVar.values[0], baseHslVar.values[1], lightness]
      }, baseColor.space));
    }
    
    return colors.slice(0, count);
  }

  private static generateTetradic(baseColor: Color, count: number): Color[] {
    const colors: Color[] = [baseColor];
    const baseHsl = this.convertColor(baseColor, 'hsl');
    const baseHue = baseHsl.values[0];
    
    // Add tetradic colors (90° apart)
    for (let i = 1; i <= 3; i++) {
      const hue = (baseHue + i * 90) % 360;
      colors.push(this.convertColor({
        space: 'hsl',
        values: [hue, baseHsl.values[1], baseHsl.values[2]]
      }, baseColor.space));
    }
    
    // Add variations if more colors needed
    while (colors.length < count) {
      const baseIndex = (colors.length - 4) % 4;
      const baseForVariation = colors[baseIndex];
      const baseHslVar = this.convertColor(baseForVariation, 'hsl');
      const lightness = Math.max(0.1, Math.min(0.9, baseHslVar.values[2] + 0.15));
      
      colors.push(this.convertColor({
        space: 'hsl',
        values: [baseHslVar.values[0], baseHslVar.values[1], lightness]
      }, baseColor.space));
    }
    
    return colors.slice(0, count);
  }

  private static generateSplitComplementary(baseColor: Color, count: number): Color[] {
    const colors: Color[] = [baseColor];
    const baseHsl = this.convertColor(baseColor, 'hsl');
    const baseHue = baseHsl.values[0];
    
    // Add split-complementary colors (150° and 210° from base)
    const splitHue1 = (baseHue + 150) % 360;
    const splitHue2 = (baseHue + 210) % 360;
    
    colors.push(this.convertColor({
      space: 'hsl',
      values: [splitHue1, baseHsl.values[1], baseHsl.values[2]]
    }, baseColor.space));
    
    colors.push(this.convertColor({
      space: 'hsl',
      values: [splitHue2, baseHsl.values[1], baseHsl.values[2]]
    }, baseColor.space));
    
    // Add variations if more colors needed
    while (colors.length < count) {
      const baseIndex = (colors.length - 3) % 3;
      const baseForVariation = colors[baseIndex];
      const baseHslVar = this.convertColor(baseForVariation, 'hsl');
      const lightness = Math.max(0.1, Math.min(0.9, baseHslVar.values[2] + 0.2));
      
      colors.push(this.convertColor({
        space: 'hsl',
        values: [baseHslVar.values[0], baseHslVar.values[1], lightness]
      }, baseColor.space));
    }
    
    return colors.slice(0, count);
  }
}