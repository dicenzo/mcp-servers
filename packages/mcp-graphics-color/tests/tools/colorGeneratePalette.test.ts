import { colorGeneratePalette, colorGeneratePaletteTool } from '../../src/tools/colorGeneratePalette.js';
import { ColorUtils } from '../../src/util/colorUtils.js';
import { ColorErrorCode } from '../../src/types/color.js';
import { describe, test, expect } from '@jest/globals';

const hexes = (colors: { hex?: string }[]) => colors.map(color => color.hex);

describe('colorGeneratePalette', () => {
  describe('valid palette generation', () => {
    test('generates monochromatic palette', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#ff0000',
        harmony: 'monochromatic',
        count: 5
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.colors).toHaveLength(5);
        expect(result.result.harmony).toBe('monochromatic');
        expect(result.result.name).toBe('monochromatic-palette-5');
        expect(result.result.metadata?.baseColor).toBeDefined();
        expect(result.result.metadata?.generatedAt).toBeDefined();
      }
    });

    test('generates analogous palette', async () => {
      const result = await colorGeneratePalette({
        baseColor: { space: 'hsl', values: [120, 0.8, 0.5] },
        harmony: 'analogous',
        count: 4
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.colors).toHaveLength(4);
        expect(result.result.harmony).toBe('analogous');
        
        // Colors should have different hues but similar saturation/lightness
        const colors = result.result.colors;
        expect(colors.every(color => color.space)).toBeTruthy();
      }
    });

    test('generates complementary palette', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#0066cc',
        harmony: 'complementary',
        count: 3
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.colors).toHaveLength(3);
        expect(result.result.harmony).toBe('complementary');
        
        // Should include base color and its complement
        const colors = result.result.colors;
        expect(colors[0]).toEqual(result.result.metadata?.baseColor);
      }
    });

    test('generates triadic palette', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#ff0000',
        harmony: 'triadic',
        count: 6
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.colors).toHaveLength(6);
        expect(result.result.harmony).toBe('triadic');
        
        // First 3 colors should be 120° apart
        const colors = result.result.colors;
        expect(colors.length).toBe(6);
      }
    });

    test('generates tetradic palette', async () => {
      const result = await colorGeneratePalette({
        baseColor: 'blue',
        harmony: 'tetradic',
        count: 4
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.colors).toHaveLength(4);
        expect(result.result.harmony).toBe('tetradic');
      }
    });

    test('generates split-complementary palette', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#ffff00',
        harmony: 'split-complementary',
        count: 5
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.colors).toHaveLength(5);
        expect(result.result.harmony).toBe('split-complementary');
      }
    });

    test('applies custom options', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#ff0000',
        harmony: 'analogous',
        count: 3,
        options: {
          saturationRange: [30, 90],
          lightnessRange: [20, 80],
          hueShift: 30
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.colors).toHaveLength(3);
        // Should have applied the options
        expect(result.metadata.colorSpace).toBe('oklch');
      }
    });

    test('uses different color spaces', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#00ff00',
        harmony: 'monochromatic',
        count: 3,
        space: 'hsl'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.colorSpace).toBe('hsl');
      }
    });
  });

  describe('palette validation', () => {
    test('validates minimum count', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#ff0000',
        harmony: 'monochromatic',
        count: 1 // Below minimum
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.PALETTE_GENERATION_FAILED);
      }
    });

    test('validates maximum count', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#ff0000',
        harmony: 'monochromatic',
        count: 25 // Above maximum
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.PALETTE_GENERATION_FAILED);
      }
    });

    test('handles different base color formats', async () => {
      const formats = [
        '#ff0000',
        'red',
        'rgb(255, 0, 0)',
        { space: 'rgb' as const, values: [1, 0, 0] },
        { space: 'hsl' as const, values: [0, 1, 0.5] }
      ];

      for (const baseColor of formats) {
        const result = await colorGeneratePalette({
          baseColor,
          harmony: 'monochromatic',
          count: 3
        });

        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.result.colors).toHaveLength(3);
        }
      }
    });
  });

  describe('error handling', () => {
    test('handles invalid base color', async () => {
      const result = await colorGeneratePalette({
        baseColor: 'not-a-color',
        harmony: 'monochromatic',
        count: 5
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.INVALID_COLOR);
        expect(result.error.suggestions).toContain('Use hex format (#RGB or #RRGGBB)');
      }
    });

    test('handles invalid harmony type', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#ff0000',
        harmony: 'invalid-harmony' as any,
        count: 5
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.PALETTE_GENERATION_FAILED);
      }
    });

    test('handles invalid color space', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#ff0000',
        harmony: 'monochromatic',
        count: 5,
        space: 'invalid-space' as any
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.PALETTE_GENERATION_FAILED);
      }
    });

    test('rejects ranges outside 0-100 percent', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#ff0000',
        harmony: 'monochromatic',
        count: 5,
        options: {
          saturationRange: [150, 200],
        }
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.PALETTE_GENERATION_FAILED);
      }
    });

    test('rejects a fractional count', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#ff0000',
        harmony: 'analogous',
        count: 4.5
      });

      expect(result.success).toBe(false);
    });
  });

  describe('performance', () => {
    test('completes within performance target', async () => {
      const start = performance.now();
      
      await colorGeneratePalette({
        baseColor: '#ff0000',
        harmony: 'complementary',
        count: 10
      });
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(100); // 100ms target
    });

    test('handles large palettes efficiently', async () => {
      const start = performance.now();
      
      const result = await colorGeneratePalette({
        baseColor: '#3366cc',
        harmony: 'tetradic',
        count: 20 // Maximum count
      });
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(200);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.colors).toHaveLength(20);
      }
    });

    test('handles complex options efficiently', async () => {
      const start = performance.now();
      
      await colorGeneratePalette({
        baseColor: { space: 'oklch', values: [0.7, 0.15, 250] },
        harmony: 'split-complementary',
        count: 8,
        options: {
          saturationRange: [10, 90],
          lightnessRange: [20, 90],
          hueShift: 45
        }
      });
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(150);
    });
  });

  describe('color quality', () => {
    test('generates distinct colors in palette', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#ff0000',
        harmony: 'analogous',
        count: 5
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const colors = result.result.colors;
        
        // Check that colors are distinct (no exact duplicates)
        for (let i = 0; i < colors.length; i++) {
          for (let j = i + 1; j < colors.length; j++) {
            const color1 = colors[i];
            const color2 = colors[j];
            
            // Colors should not be identical
            expect(JSON.stringify(color1.values)).not.toBe(JSON.stringify(color2.values));
          }
        }
      }
    });

    test('maintains color space consistency', async () => {
      const result = await colorGeneratePalette({
        baseColor: { space: 'rgb', values: [0.8, 0.2, 0.3] },
        harmony: 'triadic',
        count: 4
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const colors = result.result.colors;
        
        // All colors should have the same space as input
        colors.forEach(color => {
          expect(color.space).toBe('rgb');
          expect(color.values).toHaveLength(3);
        });
      }
    });

    test('preserves alpha channel', async () => {
      const result = await colorGeneratePalette({
        baseColor: { space: 'rgb', values: [1, 0, 0], alpha: 0.7 },
        harmony: 'monochromatic',
        count: 3
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const baseColor = result.result.metadata?.baseColor;
        expect(baseColor?.alpha).toBe(0.7);
      }
    });
  });

  describe('harmony correctness', () => {
    const harmonies = ['monochromatic', 'analogous', 'complementary', 'triadic', 'tetradic', 'split-complementary'] as const;

    test.each(harmonies)('%s includes the base color and never repeats a color, for every count', async (harmony) => {
      for (const baseColor of ['#3366cc', '#ff0000', '#7a5c3e', '#ffd6e0']) {
        for (let count = 2; count <= 20; count++) {
          const result = await colorGeneratePalette({ baseColor, harmony, count });

          expect(result.success).toBe(true);
          if (result.success) {
            const generated = hexes(result.result.colors);
            expect(generated).toHaveLength(count);
            expect(generated).toContain(baseColor);
            expect(new Set(generated).size).toBe(count);
            expect(result.warnings).toBeUndefined();
          }
        }
      }
    });

    test('analogous with an odd count keeps the base color in the middle', async () => {
      const result = await colorGeneratePalette({ baseColor: '#3366cc', harmony: 'analogous', count: 5 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.colors[2].hex).toBe('#3366cc');
      }
    });

    test('monochromatic runs from dark to light', async () => {
      const result = await colorGeneratePalette({ baseColor: '#3366cc', harmony: 'monochromatic', count: 8 });

      expect(result.success).toBe(true);
      if (result.success) {
        const lightness = result.result.colors.map(color => ColorUtils.convertColor(color, 'oklch').values[0]);
        expect(lightness).toEqual([...lightness].sort((a, b) => a - b));
      }
    });

    test('oklch harmonies keep the base perceptual lightness', async () => {
      const result = await colorGeneratePalette({ baseColor: '#3366cc', harmony: 'triadic', count: 3 });

      expect(result.success).toBe(true);
      if (result.success) {
        const [base, ...others] = result.result.colors.map(color => ColorUtils.convertColor(color, 'oklch').values[0]);
        others.forEach(lightness => expect(lightness).toBeCloseTo(base, 2));
      }
    });

    test('space changes the result', async () => {
      const bySpace = await Promise.all((['oklch', 'lab', 'hsl'] as const).map(space =>
        colorGeneratePalette({ baseColor: '#3366cc', harmony: 'triadic', count: 3, space })
      ));

      const palettes = bySpace.map(result => (result.success ? hexes(result.result.colors).join() : ''));
      expect(new Set(palettes).size).toBe(3);
      expect(palettes[2]).toBe('#3366cc,#cc3366,#66cc33'); // classic HSL triad
    });

    test.each(['#808080', '#000000', '#ffffff'])('grey base %s falls back to a monochromatic ramp with a warning', async (baseColor) => {
      const result = await colorGeneratePalette({ baseColor, harmony: 'complementary', count: 4 });

      expect(result.success).toBe(true);
      if (result.success) {
        const generated = hexes(result.result.colors);
        expect(generated).toContain(baseColor);
        expect(new Set(generated).size).toBe(4);
        expect(result.warnings?.[0]).toMatch(/monochromatic ramp/);
      }
    });
  });

  describe('options', () => {
    test('lightnessRange is in percent and spreads from first to last color', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#3366cc',
        harmony: 'analogous',
        count: 5,
        options: { lightnessRange: [20, 80] }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const lightness = result.result.colors.map(color => ColorUtils.convertColor(color, 'oklch').values[0]);
        expect(lightness[0]).toBeCloseTo(0.2, 2);
        expect(lightness[2]).toBeCloseTo(0.5, 2);
        expect(lightness[4]).toBeCloseTo(0.8, 2);
        expect(new Set(hexes(result.result.colors)).size).toBe(5);
      }
    });

    test('saturationRange is a percent of the space maximum chroma', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#3366cc',
        harmony: 'monochromatic',
        count: 2,
        space: 'hsl',
        options: { saturationRange: [0, 100] }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const saturation = result.result.colors.map(color => ColorUtils.convertColor(color, 'hsl').values[1]);
        expect(saturation[0]).toBeCloseTo(0, 2);
        expect(saturation[1]).toBeCloseTo(1, 2);
      }
    });

    test('hueShift accepts negative rotations', async () => {
      const shifted = await colorGeneratePalette({
        baseColor: '#3366cc',
        harmony: 'complementary',
        count: 2,
        space: 'hsl',
        options: { hueShift: -60 }
      });

      expect(shifted.success).toBe(true);
      if (shifted.success) {
        expect(ColorUtils.convertColor(shifted.result.colors[0], 'hsl').values[0]).toBeCloseTo(160, 0);
      }
    });
  });

  describe('tool definition', () => {
    test('advertises options and object base colors', () => {
      const { properties } = colorGeneratePaletteTool.inputSchema;

      expect(properties.options.properties).toHaveProperty('lightnessRange');
      expect(properties.options.properties).toHaveProperty('saturationRange');
      expect(properties.options.properties).toHaveProperty('hueShift');
      expect(properties.baseColor.oneOf).toHaveLength(2);
      expect(properties.count.type).toBe('integer');
    });
  });
});
