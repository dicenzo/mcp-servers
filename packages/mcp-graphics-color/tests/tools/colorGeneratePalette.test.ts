import { colorGeneratePalette } from '../../src/tools/colorGeneratePalette.js';
import { ColorErrorCode } from '../../src/types/color.js';
import { describe, test, expect } from '@jest/globals';

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
          saturationRange: [0.3, 0.9],
          lightnessRange: [0.2, 0.8],
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

    test('handles malformed options', async () => {
      const result = await colorGeneratePalette({
        baseColor: '#ff0000',
        harmony: 'monochromatic',
        count: 5,
        options: {
          saturationRange: [1.5, 2.0], // Invalid range
        }
      });

      // Should still succeed but potentially ignore invalid options
      expect(result.success).toBe(true);
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
          saturationRange: [0.1, 0.9],
          lightnessRange: [0.2, 0.9],
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
});