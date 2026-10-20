import { colorContrast } from '../../src/tools/colorContrast.js';
import { ColorErrorCode } from '../../src/types/color.js';
import { describe, test, expect } from '@jest/globals';

describe('colorContrast', () => {
  describe('valid contrast checks', () => {
    test('calculates contrast between black and white', async () => {
      const result = await colorContrast({
        foreground: '#000000',
        background: '#ffffff'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.ratio).toBe(21); // Maximum contrast ratio
        expect(result.result.score.AA.normal).toBe(true);
        expect(result.result.score.AA.large).toBe(true);
        expect(result.result.score.AAA.normal).toBe(true);
        expect(result.result.score.AAA.large).toBe(true);
        expect(result.result.algorithm).toBe('wcag');
      }
    });

    test('calculates contrast for similar colors', async () => {
      const result = await colorContrast({
        foreground: '#444444',
        background: '#555555'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.ratio).toBeLessThan(2);
        expect(result.result.score.AA.normal).toBe(false);
        expect(result.result.score.AA.large).toBe(false);
      }
    });

    test('handles custom context settings', async () => {
      const result = await colorContrast({
        foreground: '#666666',
        background: '#ffffff',
        context: {
          textSize: 'large',
          level: 'AA'
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Large text has lower contrast requirements
        const ratio = result.result.ratio;
        expect(ratio).toBeGreaterThan(3); // Should pass AA large (3:1)
        expect(result.result.score.AA.large).toBe(true);
      }
    });

    test('compares RGB object colors', async () => {
      const result = await colorContrast({
        foreground: { space: 'rgb', values: [0, 0, 0] },
        background: { space: 'rgb', values: [1, 1, 1] }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.ratio).toBe(21);
      }
    });

    test('includes Delta E in metadata', async () => {
      const result = await colorContrast({
        foreground: '#ff0000',
        background: '#00ff00'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.metadata?.deltaE).toBeGreaterThan(0);
        expect(result.result.foreground.space).toBe('srgb');
        expect(result.result.background.space).toBe('srgb');
      }
    });

    test('handles different color spaces', async () => {
      const result = await colorContrast({
        foreground: { space: 'hsl', values: [0, 1, 0] }, // Pure black in HSL
        background: { space: 'hsl', values: [0, 1, 1] }  // Pure white in HSL
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.ratio).toBe(21);
      }
    });
  });

  describe('WCAG compliance levels', () => {
    test('validates AA normal text requirements', async () => {
      // Test color combination that should just pass AA normal (4.5:1)
      const result = await colorContrast({
        foreground: '#767676',
        background: '#ffffff',
        context: { textSize: 'normal', level: 'AA' }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const { ratio, score } = result.result;
        expect(ratio).toBeGreaterThanOrEqual(4.5);
        expect(score.AA.normal).toBe(true);
      }
    });

    test('validates AA large text requirements', async () => {
      // Test color combination that should pass AA large (3:1) but not normal
      const result = await colorContrast({
        foreground: '#949494',
        background: '#ffffff',
        context: { textSize: 'large', level: 'AA' }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const { ratio, score } = result.result;
        expect(ratio).toBeGreaterThanOrEqual(3.0);
        expect(score.AA.large).toBe(true);
      }
    });

    test('validates AAA normal text requirements', async () => {
      // Test color combination for AAA normal (7:1)
      const result = await colorContrast({
        foreground: '#595959',
        background: '#ffffff',
        context: { textSize: 'normal', level: 'AAA' }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const { ratio, score } = result.result;
        expect(ratio).toBeGreaterThanOrEqual(7.0);
        expect(score.AAA.normal).toBe(true);
      }
    });

    test('validates AAA large text requirements', async () => {
      // Test color combination for AAA large (4.5:1)
      const result = await colorContrast({
        foreground: '#767676',
        background: '#ffffff',
        context: { textSize: 'large', level: 'AAA' }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const { ratio, score } = result.result;
        expect(ratio).toBeGreaterThanOrEqual(4.5);
        expect(score.AAA.large).toBe(true);
      }
    });
  });

  describe('error handling', () => {
    test('handles invalid foreground color', async () => {
      const result = await colorContrast({
        foreground: 'invalid-color',
        background: '#ffffff'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.INVALID_COLOR);
      }
    });

    test('handles invalid background color', async () => {
      const result = await colorContrast({
        foreground: '#000000',
        background: 'not-a-color'
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.INVALID_COLOR);
      }
    });

    test('handles identical colors', async () => {
      const result = await colorContrast({
        foreground: '#888888',
        background: '#888888'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.ratio).toBe(1); // No contrast
        expect(result.result.score.AA.normal).toBe(false);
        expect(result.result.score.AA.large).toBe(false);
      }
    });

    test('validates algorithm parameter', async () => {
      const result = await colorContrast({
        foreground: '#000000',
        background: '#ffffff',
        algorithm: 'invalid' as any
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.ACCESSIBILITY_CHECK_FAILED);
      }
    });
  });

  describe('performance', () => {
    test('completes within performance target', async () => {
      const start = performance.now();
      
      await colorContrast({
        foreground: '#333333',
        background: '#ffffff'
      });
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(50); // 50ms target
    });

    test('handles multiple contrast checks efficiently', async () => {
      const colorPairs = [
        { fg: '#000000', bg: '#ffffff' },
        { fg: '#333333', bg: '#cccccc' },
        { fg: '#ff0000', bg: '#00ff00' },
        { fg: '#0000ff', bg: '#ffff00' }
      ];
      
      const start = performance.now();
      
      const results = await Promise.all(
        colorPairs.map(({ fg, bg }) => 
          colorContrast({ foreground: fg, background: bg })
        )
      );
      
      const duration = performance.now() - start;
      expect(duration).toBeLessThan(150); // Should handle 4 checks efficiently
      expect(results.every(r => r.success)).toBe(true);
    });
  });

  describe('edge cases', () => {
    test('handles colors with alpha channels', async () => {
      const result = await colorContrast({
        foreground: { space: 'rgb', values: [0, 0, 0], alpha: 0.8 },
        background: { space: 'rgb', values: [1, 1, 1], alpha: 0.9 }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.foreground.alpha).toBe(0.8);
        expect(result.result.background.alpha).toBe(0.9);
        // Contrast should still be calculated properly
        expect(result.result.ratio).toBeGreaterThan(1);
      }
    });

    test('handles very small color differences', async () => {
      const result = await colorContrast({
        foreground: '#808080',
        background: '#808081' // Tiny difference
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.ratio).toBeCloseTo(1, 2);
        expect(result.result.metadata?.deltaE).toBeLessThan(1);
      }
    });

    test('calculates precise ratios', async () => {
      const result = await colorContrast({
        foreground: '#767676',
        background: '#ffffff'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Should be precise to 2 decimal places
        expect(Number.isInteger(result.result.ratio * 100)).toBe(true);
        expect(result.result.ratio).toBeCloseTo(4.54, 1);
      }
    });
  });
});