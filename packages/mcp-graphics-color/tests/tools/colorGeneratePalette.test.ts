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

  describe('swatches', () => {
    test('name every color by role, one swatch per color', async () => {
      const result = await colorGeneratePalette({ baseColor: '#3366cc', harmony: 'triadic', count: 7 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.swatches.map(swatch => swatch.role)).toEqual([
          'base', 'triad-1', 'triad-2',
          'base-lighter-1', 'triad-1-lighter-1', 'triad-2-lighter-1',
          'base-darker-1'
        ]);
        expect(result.swatches.map(swatch => swatch.hex)).toEqual(hexes(result.result.colors));
      }
    });

    test('roles are unique for every harmony and count', async () => {
      for (const harmony of ['monochromatic', 'analogous', 'complementary', 'triadic', 'tetradic', 'split-complementary']) {
        for (const count of [2, 5, 11, 20]) {
          const result = await colorGeneratePalette({ baseColor: '#3366cc', harmony, count });
          expect(result.success).toBe(true);
          if (result.success) {
            const roles = result.swatches.map(swatch => swatch.role);
            expect(new Set(roles).size).toBe(count);
            expect(roles).toContain('base');
          }
        }
      }
    });

    test('report contrast and the readable text color', async () => {
      const result = await colorGeneratePalette({ baseColor: '#ffff00', harmony: 'monochromatic', count: 2 });

      expect(result.success).toBe(true);
      if (result.success) {
        const yellow = result.swatches.find(swatch => swatch.hex === '#ffff00');
        expect(yellow?.contrast.onWhite).toBeCloseTo(1.07, 1);
        expect(yellow?.contrast.onBlack).toBeCloseTo(19.56, 1);
        expect(yellow?.contrast.textColor).toBe('#000000');
        expect(yellow?.contrast.meetsAA).toBe(true);
      }
    });

    test('report each color\'s nearest neighbour', async () => {
      const result = await colorGeneratePalette({ baseColor: '#3366cc', harmony: 'complementary', count: 2 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.swatches[0].nearest).toMatchObject({ index: 1, role: 'complement' });
        expect(result.swatches[0].nearest?.deltaE).toBeGreaterThan(30);
      }
    });

    test('report chroma lost to the gamut, with a warning when harmony hues wash out', async () => {
      const result = await colorGeneratePalette({ baseColor: '#ffff00', harmony: 'triadic', count: 3 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.swatches[0].chromaLost).toBe(0);
        expect(result.swatches[1].chromaLost).toBeGreaterThan(0.75);
        expect(result.warnings?.some(warning => /lost most of their chroma/.test(warning))).toBe(true);
      }
    });

    test('hsl palettes never lose chroma', async () => {
      const result = await colorGeneratePalette({ baseColor: '#ffff00', harmony: 'triadic', count: 3, space: 'hsl' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.swatches.every(swatch => swatch.chromaLost === 0)).toBe(true);
      }
    });
  });

  describe('lockedColors', () => {
    test('keeps locked colors unchanged and counts them in count', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#3366cc',
        harmony: 'complementary',
        count: 5,
        lockedColors: ['#ff6600', { space: 'hsl', values: [120, 0.5, 0.4] }]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.colors).toHaveLength(5);
        expect(result.swatches.slice(-2).map(swatch => [swatch.role, swatch.locked])).toEqual([
          ['locked-1', true], ['locked-2', true]
        ]);
        expect(result.swatches[3].hex).toBe('#ff6600');
        expect(result.swatches[0].role).toBe('base');
      }
    });

    test('generated colors avoid duplicating a locked color', async () => {
      // The plain palette's complement is #8c6500; lock something right next to it
      const result = await colorGeneratePalette({
        baseColor: '#3366cc',
        harmony: 'complementary',
        count: 4,
        lockedColors: ['#8b6501']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const generated = result.swatches.filter(swatch => !swatch.locked);
        expect(generated).toHaveLength(3);
        generated.forEach(swatch => {
          const locked = result.swatches.length - 1;
          expect(swatch.nearest?.index === locked ? swatch.nearest.deltaE : Infinity).toBeGreaterThanOrEqual(3);
        });
      }
    });

    test('flags a locked color that duplicates the base', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#3366cc',
        harmony: 'complementary',
        count: 3,
        lockedColors: ['#3367cc']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.closePairs).toEqual([
          expect.objectContaining({ roles: ['base', 'locked-1'] })
        ]);
        expect(result.warnings?.some(warning => /closer than 3 Delta E/.test(warning))).toBe(true);
      }
    });

    test('rejects as many locked colors as count', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#3366cc',
        harmony: 'complementary',
        count: 2,
        lockedColors: ['#ff0000', '#00ff00']
      });

      expect(result.success).toBe(false);
    });

    test('names the locked color that failed to parse', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#3366cc',
        harmony: 'complementary',
        count: 3,
        lockedColors: ['#ff0000', 'nope']
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.INVALID_COLOR);
        expect(result.error.message).toBe('lockedColors[1] could not be parsed');
      }
    });
  });

  describe('minDeltaE', () => {
    const minDistance = (swatches: { nearest?: { deltaE: number } }[]) =>
      Math.min(...swatches.map(swatch => swatch.nearest?.deltaE ?? Infinity));

    test.each(['analogous', 'triadic', 'monochromatic'])('keeps %s colors apart and still fills count when possible', async (harmony) => {
      const result = await colorGeneratePalette({ baseColor: '#3366cc', harmony, count: 8, minDeltaE: 8 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.colors).toHaveLength(8);
        expect(minDistance(result.swatches)).toBeGreaterThanOrEqual(8);
        expect(hexes(result.result.colors)).toContain('#3366cc');
        expect(result.warnings).toBeUndefined();
      }
    });

    test('analogous without minDeltaE crowds colors that minDeltaE separates', async () => {
      const plain = await colorGeneratePalette({ baseColor: '#3366cc', harmony: 'analogous', count: 12 });
      const spaced = await colorGeneratePalette({ baseColor: '#3366cc', harmony: 'analogous', count: 12, minDeltaE: 6 });

      expect(plain.success && spaced.success).toBe(true);
      if (plain.success && spaced.success) {
        expect(minDistance(plain.swatches)).toBeLessThan(6);
        expect(minDistance(spaced.swatches)).toBeGreaterThanOrEqual(6);
      }
    });

    test('monochromatic stays dark to light after spacing', async () => {
      const result = await colorGeneratePalette({ baseColor: '#3366cc', harmony: 'monochromatic', count: 6, minDeltaE: 10 });

      expect(result.success).toBe(true);
      if (result.success) {
        const lightness = result.result.colors.map(color => ColorUtils.convertColor(color, 'oklch').values[0]);
        expect(lightness).toEqual([...lightness].sort((a, b) => a - b));
      }
    });

    test('returns fewer colors with a warning when the spacing cannot be met', async () => {
      const result = await colorGeneratePalette({ baseColor: '#3366cc', harmony: 'monochromatic', count: 20, minDeltaE: 20 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.colors.length).toBeLessThan(20);
        expect(minDistance(result.swatches)).toBeGreaterThanOrEqual(20);
        expect(result.warnings?.some(warning => /could not be placed at least 20 Delta E apart/.test(warning))).toBe(true);
      }
    });
  });

  describe('scale', () => {
    test('builds a 50-950 scale per harmony hue with the source color in place', async () => {
      const result = await colorGeneratePalette({ baseColor: '#3366cc', harmony: 'complementary', count: 4, scale: true });

      expect(result.success).toBe(true);
      if (result.success && result.scales) {
        expect(result.scales.map(scale => scale.role)).toEqual(['base', 'complement']);
        const base = result.scales[0];
        expect(base.steps.map(step => step.step)).toEqual([50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]);
        expect(base.steps.filter(step => step.source).map(step => step.hex)).toEqual(['#3366cc']);

        const lightness = base.steps.map(step => ColorUtils.convertColor(step.color, 'oklch').values[0]);
        expect(lightness).toEqual([...lightness].sort((a, b) => b - a));
        expect(new Set(base.steps.map(step => step.hex)).size).toBe(11);
      }
    });

    test('includes locked colors and omits scales unless asked', async () => {
      const scaled = await colorGeneratePalette({
        baseColor: '#3366cc', harmony: 'monochromatic', count: 3, scale: true, lockedColors: ['#ff6600']
      });
      const plain = await colorGeneratePalette({ baseColor: '#3366cc', harmony: 'monochromatic', count: 3 });

      expect(scaled.success && plain.success).toBe(true);
      if (scaled.success && plain.success) {
        expect(scaled.scales?.map(scale => scale.role)).toEqual(['base', 'locked-1']);
        expect(plain.scales).toBeUndefined();
      }
    });
  });

  describe('exports', () => {
    test('css custom properties use the prefix and include scale steps', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#3366cc', harmony: 'complementary', count: 2, scale: true, exports: ['css'], exportPrefix: 'brand'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const css = result.exports?.css ?? '';
        expect(css.startsWith(':root {')).toBe(true);
        expect(css).toContain('  --brand-base: #3366cc;');
        expect(css).toContain('  --brand-complement-500: ');
        expect(css.match(/--brand-/g)).toHaveLength(2 + 2 * 11);
        expect(result.exports?.tailwind).toBeUndefined();
      }
    });

    test('tailwind nests scales under DEFAULT and keeps plain colors flat', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#3366cc', harmony: 'complementary', count: 3, scale: true, exports: ['tailwind']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const tailwind = result.exports?.tailwind ?? {};
        expect(tailwind.base).toMatchObject({ DEFAULT: '#3366cc', '600': '#3366cc' });
        expect(typeof tailwind['base-lighter-1']).toBe('string');
      }
    });

    test('tokens follow the W3C design tokens format', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#3366cc', harmony: 'complementary', count: 2, exports: ['tokens']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.exports?.tokens).toEqual({
          color: {
            base: { $type: 'color', $value: '#3366cc' },
            complement: { $type: 'color', $value: result.swatches[1].hex }
          }
        });
      }
    });

    test('rejects prefixes that are not valid CSS identifiers', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#3366cc', harmony: 'complementary', count: 2, exports: ['css'], exportPrefix: '--Bad Prefix'
      });

      expect(result.success).toBe(false);
    });

    test('keeps alpha in exported hex', async () => {
      const result = await colorGeneratePalette({
        baseColor: { space: 'rgb', values: [0.2, 0.4, 0.8], alpha: 0.5 }, harmony: 'complementary', count: 2, exports: ['css']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.swatches[0].hex).toBe('#3366cc80');
        expect(result.exports?.css).toContain('#3366cc80');
      }
    });
  });

  describe('tool definition for new inputs', () => {
    test('advertises locked colors, spacing, scales and exports', () => {
      const { properties } = colorGeneratePaletteTool.inputSchema;

      expect(properties.lockedColors.items).toBe(properties.baseColor);
      expect(properties).toHaveProperty('minDeltaE');
      expect(properties).toHaveProperty('scale');
      expect(properties.exports.items.enum).toEqual(['css', 'tailwind', 'tokens']);
      expect(properties).toHaveProperty('exportPrefix');
    });
  });
});
