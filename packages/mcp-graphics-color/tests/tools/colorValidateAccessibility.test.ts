import { colorValidateAccessibility } from '../../src/tools/colorValidateAccessibility.js';
import { ColorErrorCode } from '../../src/types/color.js';
import { describe, test, expect } from '@jest/globals';

describe('colorValidateAccessibility', () => {
  describe('successful accessibility validation', () => {
    test('validates high contrast colors for AA normal text', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'],
        contexts: [
          {
            name: 'Primary Text',
            foreground: 0,
            background: 1,
            textSize: 'normal',
            level: 'AA'
          }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.overallPassed).toBe(true);
        expect(result.result.totalChecks).toBe(1);
        expect(result.result.passedChecks).toBe(1);
        expect(result.result.failedChecks).toBe(0);
        
        const validation = result.result.validations[0];
        expect(validation.context).toBe('Primary Text');
        expect(validation.wcag.ratio).toBe(21); // Max contrast ratio
        expect(validation.wcag.passed).toBe(true);
        expect(validation.wcag.requiredRatio).toBe(4.5);
        expect(validation.wcag.level).toBe('AA');
        expect(validation.wcag.textSize).toBe('normal');
      }
    });

    test('validates multiple contexts correctly', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF', '#808080'],
        contexts: [
          {
            name: 'High Contrast',
            foreground: 0,
            background: 1,
            textSize: 'normal',
            level: 'AA'
          },
          {
            name: 'Low Contrast',
            foreground: 0,
            background: 2,
            textSize: 'large',
            level: 'AA'
          }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.totalChecks).toBe(2);
        expect(result.result.validations).toHaveLength(2);
        expect(result.result.validations[0].context).toBe('High Contrast');
        expect(result.result.validations[1].context).toBe('Low Contrast');
      }
    });

    test('handles AAA level requirements', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'],
        contexts: [
          {
            name: 'AAA Normal',
            foreground: 0,
            background: 1,
            textSize: 'normal',
            level: 'AAA'
          }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const validation = result.result.validations[0];
        expect(validation.wcag.requiredRatio).toBe(7.0);
        expect(validation.wcag.passed).toBe(true); // Black/white should pass AAA
      }
    });

    test('handles large text requirements', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#666666', '#FFFFFF'],
        contexts: [
          {
            name: 'Large Text',
            foreground: 0,
            background: 1,
            textSize: 'large',
            level: 'AA'
          }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const validation = result.result.validations[0];
        expect(validation.wcag.requiredRatio).toBe(3.0);
        expect(validation.wcag.textSize).toBe('large');
      }
    });

    test('includes APCA scoring when requested', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'],
        contexts: [
          {
            name: 'APCA Test',
            foreground: 0,
            background: 1
          }
        ],
        includeAPCA: true
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const validation = result.result.validations[0];
        expect(validation.apca).toBeDefined();
        expect(validation.apca!.score).toBeGreaterThan(0);
        expect(validation.apca!.minScore).toBe(60); // Normal text minimum
        expect(validation.apca!.passed).toBe(true);
        expect(result.metadata.apcaIncluded).toBe(true);
      }
    });

    test('generates recommendations when requested', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#888888', '#999999'], // Low contrast
        contexts: [
          {
            name: 'Low Contrast Test',
            foreground: 0,
            background: 1,
            textSize: 'normal',
            level: 'AA'
          }
        ],
        includeRecommendations: true
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const validation = result.result.validations[0];
        expect(validation.recommendations).toBeDefined();
        expect(validation.recommendations!.length).toBeGreaterThan(0);
        expect(validation.recommendations![0]).toContain('contrast');
      }
    });

    test('excludes recommendations when not requested', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'],
        contexts: [
          {
            name: 'No Recommendations',
            foreground: 0,
            background: 1
          }
        ],
        includeRecommendations: false
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const validation = result.result.validations[0];
        expect(validation.recommendations).toBeUndefined();
      }
    });

    test('calculates summary statistics correctly', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF', '#666666'],
        contexts: [
          {
            name: 'High Contrast',
            foreground: 0, // Black
            background: 1, // White
            textSize: 'normal',
            level: 'AA'
          },
          {
            name: 'Medium Contrast',
            foreground: 2, // Gray
            background: 1, // White
            textSize: 'normal',
            level: 'AA'
          }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.summary.wcagAANormalPassed).toBeGreaterThanOrEqual(0);
        expect(result.result.summary.wcagAALargePassed).toBeGreaterThanOrEqual(0);
        expect(result.result.summary.wcagAAAPassed).toBeGreaterThanOrEqual(0);
        expect(result.result.summary.averageContrast).toBeGreaterThan(0);
      }
    });

    test('handles different color formats', async () => {
      const result = await colorValidateAccessibility({
        colors: ['black', 'white', 'rgb(128,128,128)', 'hsl(0,0%,50%)'],
        contexts: [
          {
            name: 'Mixed Formats',
            foreground: 0,
            background: 1
          }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.validations).toHaveLength(1);
        expect(result.result.validations[0].wcag.ratio).toBe(21);
      }
    });

    test('includes processing time and metadata', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'],
        contexts: [
          {
            name: 'Metadata Test',
            foreground: 0,
            background: 1
          }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.metadata.processingTime).toBeGreaterThan(0);
        expect(result.metadata.processingTime).toBeLessThan(50); // Performance target
        expect(result.metadata.checkedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
        expect(result.metadata.wcagVersion).toBe('2.1');
        expect(result.metadata.apcaIncluded).toBe(false);
      }
    });

    test('skips invalid colors gracefully', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', 'invalid-color', '#FFFFFF'],
        contexts: [
          {
            name: 'Skip Invalid',
            foreground: 0,
            background: 2 // Should reference the white color after invalid is skipped
          }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.validations).toHaveLength(1);
      }
    });
  });

  describe('failed accessibility validation', () => {
    test('identifies failing contrast ratios', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#888888', '#999999'], // Very similar grays
        contexts: [
          {
            name: 'Low Contrast',
            foreground: 0,
            background: 1,
            textSize: 'normal',
            level: 'AA'
          }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.overallPassed).toBe(false);
        expect(result.result.failedChecks).toBeGreaterThan(0);
        
        const validation = result.result.validations[0];
        expect(validation.wcag.passed).toBe(false);
        expect(validation.wcag.ratio).toBeLessThan(4.5);
      }
    });

    test('provides helpful recommendations for failing colors', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#CCCCCC', '#DDDDDD'], // Very light grays
        contexts: [
          {
            name: 'Light Colors',
            foreground: 0,
            background: 1,
            textSize: 'normal',
            level: 'AA'
          }
        ],
        includeRecommendations: true
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const validation = result.result.validations[0];
        expect(validation.wcag.passed).toBe(false);
        expect(validation.recommendations).toBeDefined();
        expect(validation.recommendations!.some(r => r.includes('darkening') || r.includes('lightening'))).toBe(true);
      }
    });
  });

  describe('input validation errors', () => {
    test('rejects less than 2 colors', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#FF0000'],
        contexts: [
          {
            name: 'Single Color',
            foreground: 0,
            background: 0
          }
        ]
      });

      expect(result.success).toBe(false);
    });

    test('rejects more than 10 colors', async () => {
      const colors = Array.from({ length: 11 }, (_, i) => `#${i.toString(16).padStart(6, '0')}`);
      
      const result = await colorValidateAccessibility({
        colors,
        contexts: [
          {
            name: 'Too Many Colors',
            foreground: 0,
            background: 1
          }
        ]
      });

      expect(result.success).toBe(false);
    });

    test('rejects empty contexts array', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'],
        contexts: []
      });

      expect(result.success).toBe(false);
    });

    test('rejects missing required context fields', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'],
        contexts: [
          {
            name: 'Missing Fields'
            // Missing foreground and background
          }
        ]
      });

      expect(result.success).toBe(false);
    });

    test('rejects invalid color indices', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'],
        contexts: [
          {
            name: 'Invalid Index',
            foreground: 0,
            background: 5 // Index out of range
          }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        // Should skip invalid contexts
        expect(result.result.validations).toHaveLength(0);
      }
    });

    test('rejects negative color indices', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'],
        contexts: [
          {
            name: 'Negative Index',
            foreground: -1,
            background: 1
          }
        ]
      });

      expect(result.success).toBe(false);
    });

    test('rejects invalid text size', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'],
        contexts: [
          {
            name: 'Invalid Text Size',
            foreground: 0,
            background: 1,
            textSize: 'medium' as any // Invalid value
          }
        ]
      });

      expect(result.success).toBe(false);
    });

    test('rejects invalid WCAG level', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'],
        contexts: [
          {
            name: 'Invalid Level',
            foreground: 0,
            background: 1,
            level: 'A' as any // Invalid value
          }
        ]
      });

      expect(result.success).toBe(false);
    });

    test('handles all invalid colors', async () => {
      const result = await colorValidateAccessibility({
        colors: ['not-a-color', 'also-invalid'],
        contexts: [
          {
            name: 'All Invalid',
            foreground: 0,
            background: 1
          }
        ]
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe('At least 2 valid colors are required for accessibility validation');
        expect(result.error.suggestions).toContain('Verify all colors in the palette are valid');
      }
    });
  });

  describe('edge cases', () => {
    test('handles null input', async () => {
      const result = await colorValidateAccessibility(null);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ColorErrorCode.ACCESSIBILITY_CHECK_FAILED);
      }
    });

    test('handles undefined input', async () => {
      const result = await colorValidateAccessibility(undefined);

      expect(result.success).toBe(false);
    });

    test('handles empty object input', async () => {
      const result = await colorValidateAccessibility({});

      expect(result.success).toBe(false);
    });

    test('handles same color for foreground and background', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#808080', '#808080'],
        contexts: [
          {
            name: 'Same Color',
            foreground: 0,
            background: 1
          }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const validation = result.result.validations[0];
        expect(validation.wcag.ratio).toBe(1); // Minimum ratio
        expect(validation.wcag.passed).toBe(false);
      }
    });

    test('uses default values for optional parameters', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'],
        contexts: [
          {
            name: 'Defaults',
            foreground: 0,
            background: 1
            // textSize and level should default
          }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const validation = result.result.validations[0];
        expect(validation.wcag.textSize).toBe('normal');
        expect(validation.wcag.level).toBe('AA');
      }
    });

    test('handles edge case contrast ratios correctly', async () => {
      // Test colors that produce exactly the minimum contrast ratio
      const result = await colorValidateAccessibility({
        colors: ['#767676', '#FFFFFF'], // Should be close to 4.5:1 ratio
        contexts: [
          {
            name: 'Edge Case',
            foreground: 0,
            background: 1,
            textSize: 'normal',
            level: 'AA'
          }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const validation = result.result.validations[0];
        expect(validation.wcag.ratio).toBeGreaterThan(4.4);
        expect(validation.wcag.ratio).toBeLessThan(4.6);
      }
    });
  });

  describe('APCA scoring', () => {
    test('calculates APCA scores for different text sizes', async () => {
      const testCases = [
        { textSize: 'normal' as const, expectedMinScore: 60 },
        { textSize: 'large' as const, expectedMinScore: 45 }
      ];

      for (const testCase of testCases) {
        const result = await colorValidateAccessibility({
          colors: ['#000000', '#FFFFFF'],
          contexts: [
            {
              name: `APCA ${testCase.textSize}`,
              foreground: 0,
              background: 1,
              textSize: testCase.textSize
            }
          ],
          includeAPCA: true
        });

        expect(result.success).toBe(true);
        if (result.success) {
          const validation = result.result.validations[0];
          expect(validation.apca).toBeDefined();
          expect(validation.apca!.minScore).toBe(testCase.expectedMinScore);
          expect(validation.apca!.score).toBeGreaterThan(0);
        }
      }
    });

    test('APCA scoring excluded by default', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'],
        contexts: [
          {
            name: 'No APCA',
            foreground: 0,
            background: 1
          }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const validation = result.result.validations[0];
        expect(validation.apca).toBeUndefined();
      }
    });
  });

  describe('performance requirements', () => {
    test('completes within performance target', async () => {
      const manyContexts = Array.from({ length: 10 }, (_, i) => ({
        name: `Context ${i}`,
        foreground: 0,
        background: 1,
        textSize: i % 2 === 0 ? 'normal' as const : 'large' as const,
        level: i % 2 === 0 ? 'AA' as const : 'AAA' as const
      }));

      const startTime = performance.now();
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'],
        contexts: manyContexts,
        includeAPCA: true,
        includeRecommendations: true
      });
      const endTime = performance.now();

      expect(result.success).toBe(true);
      expect(endTime - startTime).toBeLessThan(50); // Performance target
      
      if (result.success) {
        expect(result.metadata.processingTime).toBeLessThan(50);
      }
    });
  });

  describe('recommendation generation', () => {
    test('provides specific recommendations for different scenarios', async () => {
      const scenarios = [
        {
          colors: ['#333333', '#FFFFFF'], // Dark text on light background
          name: 'Dark on Light'
        },
        {
          colors: ['#CCCCCC', '#000000'], // Light text on dark background  
          name: 'Light on Dark'
        },
        {
          colors: ['#888888', '#999999'], // Low contrast
          name: 'Low Contrast'
        }
      ];

      for (const scenario of scenarios) {
        const result = await colorValidateAccessibility({
          colors: scenario.colors,
          contexts: [
            {
              name: scenario.name,
              foreground: 0,
              background: 1,
              textSize: 'normal',
              level: 'AA'
            }
          ],
          includeRecommendations: true
        });

        expect(result.success).toBe(true);
        if (result.success) {
          const validation = result.result.validations[0];
          if (!validation.wcag.passed) {
            expect(validation.recommendations).toBeDefined();
            expect(validation.recommendations!.length).toBeGreaterThan(0);
          }
        }
      }
    });

    test('provides positive feedback for excellent contrast', async () => {
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#FFFFFF'], // Maximum contrast
        contexts: [
          {
            name: 'Excellent Contrast',
            foreground: 0,
            background: 1,
            textSize: 'normal',
            level: 'AA'
          }
        ],
        includeRecommendations: true
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const validation = result.result.validations[0];
        expect(validation.recommendations).toBeDefined();
        expect(validation.recommendations!.some(r => r.includes('Excellent'))).toBe(true);
      }
    });
  });
});