import { colorBrandMatch } from '../../src/tools/colorBrandMatch.js';
import { ColorErrorCode } from '../../src/types/color.js';
import { describe, test, expect } from '@jest/globals';

describe('colorBrandMatch', () => {
  describe('successful brand matching', () => {
    test('finds exact match in brand palette', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#FF5733', '#33FF57', '#3357FF']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.confidence).toBe('exact');
        expect(result.result.deltaE).toBeLessThan(1);
        expect(result.result.bestMatch.hex).toBe('#ff5733');
        expect(result.metadata.brandPaletteSize).toBe(3);
        expect(result.metadata.algorithm).toBe('deltaE-euclidean');
        expect(result.result.alternatives).toHaveLength(2);
      }
    });

    test('finds close match with high confidence', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#FF5B37', '#33FF57', '#3357FF'], // Very close red (CIE76 deltaE ~2.07)
        maxDeltaE: 10
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.confidence).toBe('high');
        expect(result.result.deltaE).toBeLessThan(4); // maxDeltaE * 0.4
        expect(result.result.bestMatch.hex).toBe('#ff5b37');
        expect(result.result.alternatives).toHaveLength(2);
      }
    });

    test('finds medium confidence match', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0000', // Pure red
        brandPalette: ['#E00000', '#00FF00', '#0000FF'], // Darker red (CIE76 deltaE ~11.93)
        maxDeltaE: 20
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.confidence).toBe('medium');
        expect(result.result.deltaE).toBeLessThan(16); // maxDeltaE * 0.8
        expect(result.result.bestMatch.hex).toBe('#e00000');
      }
    });

    test('finds low confidence match', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0000', // Pure red
        brandPalette: ['#800080', '#008000', '#000080'], // Purple, green, blue
        maxDeltaE: 50
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.confidence).toBe('low');
        expect(result.result.deltaE).toBeGreaterThan(40); // > maxDeltaE * 0.8
      }
    });

    test('handles different color formats in brand palette', async () => {
      const result = await colorBrandMatch({
        targetColor: 'red',
        brandPalette: ['#ff0000', 'rgb(255,0,0)', 'hsl(0,100%,50%)', '#00ff00']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.confidence).toBe('exact');
        expect(result.metadata.brandPaletteSize).toBe(4);
        // Should match one of the red variants
        expect(result.result.deltaE).toBeLessThan(1);
      }
    });

    test('excludes alternatives when includeAlternatives is false', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#FF5733', '#33FF57', '#3357FF', '#FF33A5', '#A533FF'],
        includeAlternatives: false
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.alternatives).toHaveLength(0);
      }
    });

    test('limits alternatives to 3 items', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#FF5733', '#33FF57', '#3357FF', '#FF33A5', '#A533FF', '#FFAA33', '#AA33FF'],
        includeAlternatives: true
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.alternatives.length).toBeLessThanOrEqual(3);
      }
    });

    test('works with single color palette', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#33FF57']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.bestMatch.hex).toBe('#33ff57');
        expect(result.result.alternatives).toHaveLength(0);
        expect(result.metadata.brandPaletteSize).toBe(1);
      }
    });

    test('includes processing time in metadata', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#FF5733', '#33FF57']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.processingTime).toBeGreaterThan(0);
        expect(result.metadata.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }
    });

    test('handles large brand palette efficiently', async () => {
      const largePalette = Array.from({ length: 50 }, (_, i) => 
        `#${Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0')}`
      );
      
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: largePalette
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.brandPaletteSize).toBe(50);
        expect(result.metadata.processingTime).toBeLessThan(150); // Performance requirement
      }
    });
  });

  describe('input validation errors', () => {
    test('rejects invalid target color', async () => {
      const result = await colorBrandMatch({
        targetColor: 'not-a-color',
        brandPalette: ['#FF5733']
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.INVALID_COLOR);
        expect(result.error.suggestions).toContain('Use hex format (#RGB or #RRGGBB)');
      }
    });

    test('rejects empty brand palette', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: []
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('brand palette');
      }
    });

    test('handles brand palette with all invalid colors', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['not-a-color', 'also-not-a-color', 'definitely-not-a-color']
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('No valid colors found in brand palette');
        expect(result.error.suggestions).toContain('Check that brand palette contains valid colors');
      }
    });

    test('skips invalid colors but continues with valid ones', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['not-a-color', '#33FF57', 'also-invalid', '#3357FF']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.brandPaletteSize).toBe(2); // Only valid colors counted
      }
    });

    test('rejects missing required parameters', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733'
        // Missing brandPalette
      });

      expect(result.success).toBe(false);
    });

    test('rejects brand palette exceeding maximum size', async () => {
      const hugePalette = Array.from({ length: 51 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`);
      
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: hugePalette
      });

      expect(result.success).toBe(false);
    });

    test('rejects negative maxDeltaE', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#33FF57'],
        maxDeltaE: -5
      });

      expect(result.success).toBe(false);
    });

    test('rejects maxDeltaE exceeding maximum', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#33FF57'],
        maxDeltaE: 101
      });

      expect(result.success).toBe(false);
    });
  });

  describe('edge cases', () => {
    test('handles null input', async () => {
      const result = await colorBrandMatch(null);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.BRAND_MATCH_FAILED);
      }
    });

    test('handles undefined input', async () => {
      const result = await colorBrandMatch(undefined);

      expect(result.success).toBe(false);
    });

    test('handles non-object input', async () => {
      const result = await colorBrandMatch('invalid');

      expect(result.success).toBe(false);
    });

    test('handles empty object input', async () => {
      const result = await colorBrandMatch({});

      expect(result.success).toBe(false);
    });

    test('uses default values for optional parameters', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#FF5733', '#33FF57']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Should use default maxDeltaE = 5 and includeAlternatives = true
        expect(result.result.alternatives).toHaveLength(1);
      }
    });

    test('handles very similar colors with proper confidence levels', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#FF5A36', '#FF5B37', '#FF5C38'], // Very similar reds (closest CIE76 deltaE ~1.55)
        maxDeltaE: 5
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.confidence).toBe('high');
        expect(result.result.deltaE).toBeLessThan(2);
      }
    });
  });

  describe('performance requirements', () => {
    test('completes within performance target for large palette', async () => {
      const largePalette = Array.from({ length: 50 }, (_, i) => {
        const r = Math.floor(i * 255 / 50);
        const g = Math.floor((i * 2) % 256);
        const b = Math.floor((i * 3) % 256);
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
      });

      const startTime = performance.now();
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: largePalette
      });
      const endTime = performance.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(150); // Should complete within 150ms
      
      if (result.success) {
        expect(result.metadata.processingTime).toBeLessThan(150);
      }
    });
  });

  describe('confidence level calculations', () => {
    test('assigns exact confidence for deltaE < 1', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#FF5733'], // Exact match
        maxDeltaE: 10
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.confidence).toBe('exact');
        expect(result.result.deltaE).toBeLessThan(1);
      }
    });

    test('assigns high confidence for deltaE <= maxDeltaE * 0.4', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0000',
        brandPalette: ['#FF0B0B'], // Close match (CIE76 deltaE ~2.76)
        maxDeltaE: 10
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.confidence).toBe('high');
        expect(result.result.deltaE).toBeLessThanOrEqual(4); // 10 * 0.4
      }
    });

    test('assigns medium confidence for deltaE <= maxDeltaE * 0.8', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0000',
        brandPalette: ['#E00000'], // Medium match (CIE76 deltaE ~11.93)
        maxDeltaE: 20
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.confidence).toBe('medium');
        expect(result.result.deltaE).toBeLessThanOrEqual(16); // 20 * 0.8
      }
    });

    test('assigns low confidence for deltaE > maxDeltaE * 0.8', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0000',
        brandPalette: ['#0000FF'], // Poor match (red vs blue)
        maxDeltaE: 50
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.confidence).toBe('low');
        expect(result.result.deltaE).toBeGreaterThan(40); // 50 * 0.8
      }
    });
  });
});