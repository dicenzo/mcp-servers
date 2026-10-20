import { colorConvert } from '../../src/tools/colorConvert.js';
import { ColorErrorCode } from '../../src/types/color.js';
import { describe, test, expect } from '@jest/globals';

describe('colorConvert', () => {
  describe('valid conversions', () => {
    test('converts hex to RGB', async () => {
      const result = await colorConvert({
        color: '#ff0000',
        targetSpace: 'rgb'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.space).toBe('rgb');
        expect(result.result.values).toEqual([1, 0, 0]);
        expect(result.result.hex).toBe('#ff0000');
        expect(result.metadata.sourceSpace).toBe('srgb');
        expect(result.metadata.targetSpace).toBe('rgb');
      }
    });

    test('converts RGB to HSL', async () => {
      const result = await colorConvert({
        color: { space: 'rgb', values: [1, 0, 0] },
        targetSpace: 'hsl'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.space).toBe('hsl');
        expect(result.result.values[0]).toBe(0); // Hue for red
        expect(result.result.values[1]).toBe(1); // Full saturation
        expect(result.result.values[2]).toBe(0.5); // 50% lightness
      }
    });

    test('converts RGB to OKLCH', async () => {
      const result = await colorConvert({
        color: { space: 'rgb', values: [0.5, 0.5, 0.5] },
        targetSpace: 'oklch'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.space).toBe('oklch');
        expect(result.result.values).toHaveLength(3);
        expect(result.result.values[0]).toBeCloseTo(0.6, 1); // Lightness ~0.6
      }
    });

    test('applies custom precision', async () => {
      const result = await colorConvert({
        color: '#ff0000',
        targetSpace: 'rgb',
        precision: 1
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.precision).toBe(1);
        // Values should be rounded to 1 decimal place
        result.result.values.forEach(val => {
          expect(val * 10).toBe(Math.round(val * 10));
        });
      }
    });

    test('handles named colors', async () => {
      const result = await colorConvert({
        color: 'red',
        targetSpace: 'hsl'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.space).toBe('hsl');
        expect(result.result.values[0]).toBe(0); // Red hue
      }
    });

    test('converts to hex format', async () => {
      const result = await colorConvert({
        color: { space: 'rgb', values: [1, 0, 0] },
        targetSpace: 'hex'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.space).toBe('hex');
        expect(result.result.hex).toBe('#ff0000');
        expect(result.result.css).toBe('#ff0000');
      }
    });
  });

  describe('error handling', () => {
    test('handles invalid color input', async () => {
      const result = await colorConvert({
        color: 'invalid-color',
        targetSpace: 'rgb'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.INVALID_COLOR);
        expect(result.error.suggestions).toContain('Use hex format (#RGB or #RRGGBB)');
      }
    });

    test('handles invalid target space', async () => {
      const result = await colorConvert({
        color: '#ff0000',
        targetSpace: 'invalid' as any
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.PROCESSING_FAILED);
      }
    });

    test('handles malformed object color', async () => {
      const result = await colorConvert({
        color: { space: 'rgb', values: [2, 0, 0] }, // Invalid RGB value
        targetSpace: 'hsl'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.INVALID_COLOR);
      }
    });

    test('validates precision bounds', async () => {
      const result = await colorConvert({
        color: '#ff0000',
        targetSpace: 'rgb',
        precision: 15 // Above max
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.PROCESSING_FAILED);
      }
    });
  });

  describe('performance', () => {
    test('completes within performance target', async () => {
      const start = performance.now();
      
      await colorConvert({
        color: '#ff0000',
        targetSpace: 'oklch'
      });
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(10); // 10ms target
    });

    test('handles batch conversions efficiently', async () => {
      const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
      const start = performance.now();
      
      const results = await Promise.all(
        colors.map(color => colorConvert({ color, targetSpace: 'oklch' }))
      );
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50); // Should handle 5 conversions in under 50ms
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('handles colors with alpha', async () => {
      const result = await colorConvert({
        color: { space: 'rgb', values: [1, 0, 0], alpha: 0.5 },
        targetSpace: 'hsl'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.alpha).toBe(0.5);
      }
    });

    test('handles extreme color values', async () => {
      const result = await colorConvert({
        color: { space: 'rgb', values: [0, 0, 0] }, // Pure black
        targetSpace: 'hsl'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.values[2]).toBe(0); // 0% lightness
      }
    });

    test('handles high precision requirements', async () => {
      const result = await colorConvert({
        color: '#ff0000',
        targetSpace: 'oklch',
        precision: 8
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.precision).toBe(8);
        // Check that values have appropriate precision
        result.result.values.forEach(val => {
          expect(val.toString().split('.')[1]?.length || 0).toBeLessThanOrEqual(8);
        });
      }
    });
  });
});