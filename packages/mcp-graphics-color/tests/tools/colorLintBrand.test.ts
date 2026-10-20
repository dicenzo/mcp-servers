import { colorLintBrand } from '../../src/tools/colorLintBrand.js';
import { ColorErrorCode } from '../../src/types/color.js';
import { describe, test, expect } from '@jest/globals';

describe('colorLintBrand', () => {
  describe('successful brand linting', () => {
    test('validates a compliant brand palette', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#00FF00', '#0000FF'],
        rules: {
          minContrast: 3,
          maxDeltaE: 5
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.palette.colors).toHaveLength(3);
        expect(result.result.score).toBeGreaterThanOrEqual(0);
        expect(result.result.score).toBeLessThanOrEqual(100);
        expect(result.metadata.paletteSize).toBe(3);
        expect(result.metadata.rulesApplied).toContain('contrast');
        expect(result.metadata.rulesApplied).toContain('duplicates');
      }
    });

    test('identifies contrast issues', async () => {
      const result = await colorLintBrand({
        palette: ['#888888', '#999999'], // Very similar grays
        rules: {
          minContrast: 4.5
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const contrastIssues = result.result.issues.filter(i => i.type === 'contrast');
        expect(contrastIssues.length).toBeGreaterThan(0);
        expect(contrastIssues[0].message).toContain('contrast ratio');
        expect(result.result.score).toBeLessThan(100);
      }
    });

    test('validates allowed colors compliance', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#00FF00'], 
        rules: {
          allowedColors: ['#FF0000', '#0000FF'], // Green not allowed
          maxDeltaE: 5
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const offBrandIssues = result.result.issues.filter(i => i.type === 'off-brand');
        expect(offBrandIssues.length).toBeGreaterThan(0);
        expect(offBrandIssues.some(issue => issue.message.includes('not within allowed'))).toBe(true);
        expect(result.metadata.rulesApplied).toContain('allowed-colors');
      }
    });

    test('identifies forbidden colors', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#00FF00'],
        rules: {
          forbiddenColors: ['#FF0000'], // Red is forbidden
          maxDeltaE: 5
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const forbiddenIssues = result.result.issues.filter(i => i.type === 'forbidden');
        expect(forbiddenIssues.length).toBeGreaterThan(0);
        expect(forbiddenIssues[0].severity).toBe('error');
        expect(forbiddenIssues[0].message).toContain('forbidden color');
        expect(result.metadata.rulesApplied).toContain('forbidden-colors');
      }
    });

    test('checks accessibility requirements', async () => {
      const result = await colorLintBrand({
        palette: ['#CCCCCC', '#DDDDDD'], // Low contrast grays
        rules: {
          requiredAccessibility: {
            textSize: 'normal',
            level: 'AA'
          }
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const accessibilityIssues = result.result.issues.filter(i => i.type === 'accessibility');
        expect(accessibilityIssues.length).toBeGreaterThan(0);
        expect(accessibilityIssues[0].message).toContain('accessibility standard');
        expect(accessibilityIssues[0].message).toContain('4.5'); // AA normal text requirement
        expect(result.metadata.rulesApplied).toContain('accessibility');
      }
    });

    test('identifies duplicate colors', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#FF0000', '#00FF00'], // Duplicate red
        rules: {
          minContrast: 3
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const duplicateIssues = result.result.issues.filter(i => 
          i.message.includes('duplicate') || i.message.includes('similar')
        );
        expect(duplicateIssues.length).toBeGreaterThan(0);
        expect(duplicateIssues[0].severity).toBe('info');
        expect(duplicateIssues[0].suggestion).toContain('removing duplicate');
      }
    });

    test('calculates correct score based on issues', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#FF0001'], // Nearly identical colors
        rules: {
          minContrast: 10, // Impossible to achieve
          forbiddenColors: ['#FF0000'], // Red is forbidden
          requiredAccessibility: {
            textSize: 'normal',
            level: 'AAA'
          }
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Should have multiple issues reducing the score
        expect(result.result.issues.length).toBeGreaterThan(0);
        expect(result.result.score).toBeLessThan(100);
        expect(result.result.score).toBeGreaterThanOrEqual(0);
      }
    });

    test('handles different accessibility levels and text sizes', async () => {
      const testCases = [
        { textSize: 'normal' as const, level: 'AA' as const, expectedRatio: 4.5 },
        { textSize: 'large' as const, level: 'AA' as const, expectedRatio: 3.0 },
        { textSize: 'normal' as const, level: 'AAA' as const, expectedRatio: 7.0 },
        { textSize: 'large' as const, level: 'AAA' as const, expectedRatio: 4.5 }
      ];

      for (const testCase of testCases) {
        const result = await colorLintBrand({
          palette: ['#CCCCCC', '#DDDDDD'], // Low contrast
          rules: {
            requiredAccessibility: {
              textSize: testCase.textSize,
              level: testCase.level
            }
          }
        });

        expect(result.success).toBe(true);
        if (result.success) {
          const accessibilityIssues = result.result.issues.filter(i => i.type === 'accessibility');
          if (accessibilityIssues.length > 0) {
            expect(accessibilityIssues[0].message).toContain(testCase.expectedRatio.toString());
          }
        }
      }
    });

    test('handles context use cases', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#00FF00'],
        rules: {
          minContrast: 3
        },
        context: {
          useCases: ['text', 'background', 'accent']
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.processingTime).toBeGreaterThan(0);
      }
    });

    test('skips invalid colors in palette', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', 'invalid-color', '#00FF00'],
        rules: {
          minContrast: 3
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.paletteSize).toBe(2); // Only valid colors counted
        expect(result.result.palette.colors).toHaveLength(2);
      }
    });

    test('passes with perfect palette', async () => {
      const result = await colorLintBrand({
        palette: ['#000000', '#FFFFFF'], // Perfect contrast
        rules: {
          minContrast: 4.5,
          allowedColors: ['#000000', '#FFFFFF']
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.passed).toBe(true);
        expect(result.result.issues.filter(i => i.severity === 'error')).toHaveLength(0);
        expect(result.result.score).toBeGreaterThanOrEqual(95);
      }
    });
  });

  describe('input validation errors', () => {
    test('rejects empty palette', async () => {
      const result = await colorLintBrand({
        palette: [],
        rules: { minContrast: 3 }
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('palette');
      }
    });

    test('rejects palette with all invalid colors', async () => {
      const result = await colorLintBrand({
        palette: ['not-a-color', 'also-invalid', 'definitely-not-a-color'],
        rules: { minContrast: 3 }
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('No valid colors found in palette');
        expect(result.error.suggestions).toContain('Verify all palette colors are valid');
      }
    });

    test('rejects missing required parameters', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000']
        // Missing rules
      });

      expect(result.success).toBe(false);
    });

    test('rejects palette exceeding maximum size', async () => {
      const largePalette = Array.from({ length: 21 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`);
      
      const result = await colorLintBrand({
        palette: largePalette,
        rules: { minContrast: 3 }
      });

      expect(result.success).toBe(false);
    });

    test('rejects invalid contrast values', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#00FF00'],
        rules: { minContrast: 0 } // Below minimum
      });

      expect(result.success).toBe(false);
    });

    test('rejects invalid maxDeltaE values', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#00FF00'],
        rules: { 
          maxDeltaE: -1, // Below minimum
          allowedColors: ['#FF0000']
        }
      });

      expect(result.success).toBe(false);
    });

    test('handles invalid allowed colors gracefully', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#00FF00'],
        rules: {
          allowedColors: ['invalid-color', '#FF0000'],
          maxDeltaE: 5
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Should still work with valid allowed colors
        expect(result.metadata.rulesApplied).toContain('allowed-colors');
      }
    });

    test('handles invalid forbidden colors gracefully', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#00FF00'],
        rules: {
          forbiddenColors: ['invalid-color', '#FF0000'],
          maxDeltaE: 5
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.rulesApplied).toContain('forbidden-colors');
      }
    });
  });

  describe('edge cases', () => {
    test('handles null input', async () => {
      const result = await colorLintBrand(null);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.PROCESSING_FAILED);
      }
    });

    test('handles undefined input', async () => {
      const result = await colorLintBrand(undefined);

      expect(result.success).toBe(false);
    });

    test('handles empty rules object', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#00FF00'],
        rules: {}
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Should only apply duplicate checking by default
        expect(result.metadata.rulesApplied).toEqual(['duplicates']);
      }
    });

    test('handles single color palette', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000'],
        rules: { minContrast: 3 }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.paletteSize).toBe(1);
        // No contrast issues possible with single color
        expect(result.result.issues.filter(i => i.type === 'contrast')).toHaveLength(0);
      }
    });

    test('handles very similar colors correctly', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#FF0001', '#FF0002'], // Very similar reds
        rules: { minContrast: 3 }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const duplicateIssues = result.result.issues.filter(i => 
          i.message.includes('duplicate') || i.message.includes('similar')
        );
        expect(duplicateIssues.length).toBeGreaterThan(0);
      }
    });

    test('uses default maxDeltaE when not specified', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#00FF00'],
        rules: {
          allowedColors: ['#FF0000']
          // maxDeltaE not specified, should default to 5
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.rulesApplied).toContain('allowed-colors');
      }
    });

    test('includes processing time and timestamp', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#00FF00'],
        rules: { minContrast: 3 }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.processingTime).toBeGreaterThan(0);
        expect(result.metadata.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
      }
    });
  });

  describe('score calculation', () => {
    test('reduces score based on issue types and severity', async () => {
      const result = await colorLintBrand({
        palette: ['#888888', '#999999'], // Similar grays - will have contrast issues
        rules: {
          minContrast: 4.5, // Higher than achievable
          forbiddenColors: ['#888888'], // First color is forbidden
          allowedColors: ['#FFFFFF'], // Neither color is allowed
          requiredAccessibility: {
            textSize: 'normal',
            level: 'AAA'
          }
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Should have multiple types of issues
        expect(result.result.issues.filter(i => i.type === 'contrast').length).toBeGreaterThan(0);
        expect(result.result.issues.filter(i => i.type === 'forbidden').length).toBeGreaterThan(0);
        expect(result.result.issues.filter(i => i.type === 'off-brand').length).toBeGreaterThan(0);
        
        // Score should be significantly reduced
        expect(result.result.score).toBeLessThan(50);
      }
    });

    test('maintains high score with minimal issues', async () => {
      const result = await colorLintBrand({
        palette: ['#000000', '#FFFFFF'], // High contrast
        rules: {
          minContrast: 4.5,
          allowedColors: ['#000000', '#FFFFFF']
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.score).toBeGreaterThanOrEqual(90);
        expect(result.result.passed).toBe(true);
      }
    });

    test('ensures score stays within 0-100 range', async () => {
      // Create scenario with many severe issues
      const manyColors = Array.from({ length: 10 }, (_, i) => `#${i}${i}${i}${i}${i}${i}`);
      
      const result = await colorLintBrand({
        palette: manyColors,
        rules: {
          minContrast: 20, // Impossible to achieve
          forbiddenColors: manyColors, // All colors are forbidden
          allowedColors: ['#FFFFFF'], // No color matches
          requiredAccessibility: {
            textSize: 'normal',
            level: 'AAA'
          }
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.score).toBeGreaterThanOrEqual(0);
        expect(result.result.score).toBeLessThanOrEqual(100);
      }
    });
  });

  describe('rule application tracking', () => {
    test('tracks which rules were applied', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#00FF00'],
        rules: {
          minContrast: 3,
          allowedColors: ['#FF0000', '#00FF00'],
          forbiddenColors: ['#0000FF'],
          requiredAccessibility: {
            textSize: 'normal',
            level: 'AA'
          }
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.rulesApplied).toContain('contrast');
        expect(result.metadata.rulesApplied).toContain('allowed-colors');
        expect(result.metadata.rulesApplied).toContain('forbidden-colors');
        expect(result.metadata.rulesApplied).toContain('accessibility');
        expect(result.metadata.rulesApplied).toContain('duplicates');
      }
    });

    test('only applies specified rules', async () => {
      const result = await colorLintBrand({
        palette: ['#FF0000', '#00FF00'],
        rules: {
          minContrast: 3
          // Only contrast rule specified
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.rulesApplied).toContain('contrast');
        expect(result.metadata.rulesApplied).toContain('duplicates');
        expect(result.metadata.rulesApplied).not.toContain('allowed-colors');
        expect(result.metadata.rulesApplied).not.toContain('forbidden-colors');
        expect(result.metadata.rulesApplied).not.toContain('accessibility');
      }
    });
  });
});