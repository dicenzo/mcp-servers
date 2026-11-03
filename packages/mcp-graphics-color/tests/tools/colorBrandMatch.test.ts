import { colorBrandMatch, colorBrandMatchTool } from '../../src/tools/colorBrandMatch.js';
import { ColorErrorCode } from '../../src/types/color.js';
import { describe, test, expect, jest } from '@jest/globals';

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
        expect(result.metadata.algorithm).toBe('ciede2000');
        expect(result.result.alternatives).toHaveLength(2);
      }
    });

    test('finds close match with high confidence', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#FF6040', '#33FF57', '#3357FF'], // Very close red (CIEDE2000 ~1.98)
        maxDeltaE: 10
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.confidence).toBe('high');
        expect(result.result.deltaE).toBeLessThan(4); // maxDeltaE * 0.4
        expect(result.result.bestMatch.hex).toBe('#ff6040');
        expect(result.result.alternatives).toHaveLength(2);
      }
    });

    test('finds medium confidence match', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0000', // Pure red
        brandPalette: ['#C00000', '#00FF00', '#0000FF'], // Darker red (CIEDE2000 ~13.46)
        maxDeltaE: 20
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.confidence).toBe('medium');
        expect(result.result.deltaE).toBeLessThan(16); // maxDeltaE * 0.8
        expect(result.result.bestMatch.hex).toBe('#c00000');
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
        brandPalette: ['#FF5D3A', '#FF6040', '#FF6242'], // Very similar reds (closest CIEDE2000 ~1.11)
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
        brandPalette: ['#F00000'], // Close match (CIEDE2000 ~3.19)
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
        brandPalette: ['#C00000'], // Medium match (CIEDE2000 ~13.46)
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
  describe('maxDeltaE threshold', () => {
    test('flags a best match beyond maxDeltaE as outside the threshold', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0000',
        brandPalette: ['#0000FF', '#00FF00'],
        maxDeltaE: 5
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.bestMatch.hex).toBe('#0000ff');
        expect(result.result.withinThreshold).toBe(false);
        expect(result.result.alternatives[0].withinThreshold).toBe(false);
      }
    });

    test('flags matches inside maxDeltaE as within the threshold', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0000',
        brandPalette: ['#F00000', '#0000FF'], // CIEDE2000 ~3.19, ~52.88
        maxDeltaE: 5
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.withinThreshold).toBe(true);
        expect(result.result.alternatives[0].withinThreshold).toBe(false);
      }
    });
  });

  describe('skipped palette entries', () => {
    test('reports each invalid entry with its palette index and a reason', async () => {
      const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['not-a-color', '#33FF57', 'also-invalid', '#3357FF']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.skipped).toHaveLength(2);
        expect(result.result.skipped[0]).toMatchObject({ paletteIndex: 0, input: 'not-a-color' });
        expect(result.result.skipped[1]).toMatchObject({ paletteIndex: 2, input: 'also-invalid' });
        expect(result.result.skipped[0].reason).toMatch(/\S/);
        expect(result.result.skipped[0].reason).not.toMatch(/^\{/); // plain message, not serialized JSON
      }
      expect(warn).not.toHaveBeenCalled();
      warn.mockRestore();
    });

    test('returns an empty skipped list when every entry is valid', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#FF5733', '#33FF57']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.skipped).toEqual([]);
      }
    });
  });

  describe('palette indexes and names', () => {
    test('returns original palette indexes, counting skipped entries', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['not-a-color', '#33FF57', '#FF5733']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.paletteIndex).toBe(2);
        expect(result.result.alternatives[0].paletteIndex).toBe(1);
      }
    });

    test('accepts named palette entries and echoes the names back', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: [
          { name: 'Primary', color: '#FF5733' },
          { name: 'Accent', color: '#3357FF' },
          '#33FF57'
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.name).toBe('Primary');
        expect(result.result.paletteIndex).toBe(0);
        const accent = result.result.alternatives.find(alt => alt.paletteIndex === 1);
        const unnamed = result.result.alternatives.find(alt => alt.paletteIndex === 2);
        expect(accent?.name).toBe('Accent');
        expect(unnamed?.name).toBeUndefined();
      }
    });

    test('includes the name of a skipped named entry', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: [{ name: 'Broken', color: 'not-a-color' }, '#FF5733']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.skipped).toEqual([
          expect.objectContaining({ paletteIndex: 0, name: 'Broken', input: 'not-a-color' })
        ]);
      }
    });

    test('rejects a named entry with an empty name', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: [{ name: '', color: '#FF5733' }]
      });

      expect(result.success).toBe(false);
    });

    test('advertises named entries in the MCP input schema', () => {
      const items = colorBrandMatchTool.inputSchema.properties.brandPalette.items;
      expect(items.oneOf).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: 'string' }),
        expect.objectContaining({ type: 'object', required: ['name', 'color'] })
      ]));
    });
  });
  describe('confidence and threshold agree', () => {
    test('does not label a match exact when it is outside maxDeltaE', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#FF5C38'], // CIEDE2000 ~0.87
        maxDeltaE: 0.5
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.withinThreshold).toBe(false);
        expect(result.result.confidence).toBe('low');
      }
    });

    test('still labels an identical color exact when maxDeltaE is 0', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#FF5733'],
        maxDeltaE: 0
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.withinThreshold).toBe(true);
        expect(result.result.confidence).toBe('exact');
      }
    });
  });

  describe('object color inputs', () => {
    test('advertises object colors for targetColor and palette entries', () => {
      const { targetColor, brandPalette } = colorBrandMatchTool.inputSchema.properties;
      const objectColor = expect.objectContaining({ type: 'object', required: ['space', 'values'] });

      expect(targetColor.oneOf).toEqual(expect.arrayContaining([objectColor]));
      expect(brandPalette.items.oneOf).toEqual(expect.arrayContaining([objectColor]));
      const namedProperties = brandPalette.items.oneOf
        .map(option => option.properties)
        .find(properties => properties !== undefined && 'color' in properties);
      expect(namedProperties && 'color' in namedProperties ? namedProperties.color.oneOf : undefined)
        .toEqual(expect.arrayContaining([objectColor]));
    });

    test('matches object colors in target and palette', async () => {
      const result = await colorBrandMatch({
        targetColor: { space: 'srgb', values: [1, 0, 0] },
        brandPalette: [
          { name: 'Red', color: { space: 'hsl', values: [0, 1, 0.5] } },
          { space: 'srgb', values: [0, 0, 1] }
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.name).toBe('Red');
        expect(result.result.confidence).toBe('exact');
      }
    });
  });

  describe('alpha difference', () => {
    test('reports zero alpha difference for opaque colors', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0000',
        brandPalette: ['#FF0000', '#0000FF']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.alphaDifference).toBe(0);
        expect(result.result.alternatives[0].alphaDifference).toBe(0);
      }
    });

    test('reports alpha difference that deltaE ignores', async () => {
      const result = await colorBrandMatch({
        targetColor: 'rgba(255,0,0,0.5)',
        brandPalette: ['#FF0000', 'rgba(255,0,0,0.25)']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.deltaE).toBe(0);
        const byIndex = [result.result, ...result.result.alternatives]
          .reduce<Record<number, number>>((acc, m) => ({ ...acc, [m.paletteIndex]: m.alphaDifference }), {});
        expect(byIndex[0]).toBe(0.5);
        expect(byIndex[1]).toBe(0.25);
      }
    });

    test('reads alpha from a fourth value in object colors', async () => {
      const result = await colorBrandMatch({
        targetColor: { space: 'srgb', values: [1, 0, 0, 0.4] },
        brandPalette: ['#FF0000']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.alphaDifference).toBe(0.6);
      }
    });
  });
  describe('difference breakdown', () => {
    test('describes a darker, less saturated palette color', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0000',
        brandPalette: ['#E00000'] // same hue, lower L and C
      });

      expect(result.success).toBe(true);
      if (result.success) {
        const { difference } = result.result;
        expect(difference.lightness).toBeLessThan(-5);
        expect(difference.chroma).toBeLessThan(-5);
        expect(Math.abs(difference.hue)).toBeLessThan(2);
        expect(difference.summary).toBe('darker, less saturated');
      }
    });

    test('says there is no visible difference for identical colors', async () => {
      const result = await colorBrandMatch({
        targetColor: '#3357FF',
        brandPalette: ['#3357FF']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.difference).toEqual({
          lightness: 0,
          chroma: 0,
          hue: 0,
          summary: 'no visible difference'
        });
      }
    });

    test('describes a hue move toward orange as warmer', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0040', // pinkish red
        brandPalette: ['#FF2000'] // orange-leaning red
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.difference.summary).toContain('warmer');
      }
    });

    test('describes a hue move toward blue as cooler', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF2000',
        brandPalette: ['#FF0040']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.difference.summary).toContain('cooler');
      }
    });

    test('ignores hue for near-grey colors', async () => {
      const result = await colorBrandMatch({
        targetColor: '#808080',
        brandPalette: ['#A0A0A0']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.difference.hue).toBe(0);
        expect(result.result.difference.summary).toBe('lighter');
      }
    });

    test('includes a breakdown on each alternative', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0000',
        brandPalette: ['#FF0000', '#E00000']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.alternatives[0].difference.summary).toBe('darker, less saturated');
      }
    });
  });

  describe('maxAlternatives', () => {
    const palette = ['#FF5733', '#FF6040', '#F05030', '#C00000', '#3357FF', '#33FF57'];

    test('defaults to 3 alternatives', async () => {
      const result = await colorBrandMatch({ targetColor: '#FF5733', brandPalette: palette });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.alternatives).toHaveLength(3);
      }
    });

    test('returns the requested number of alternatives', async () => {
      const result = await colorBrandMatch({ targetColor: '#FF5733', brandPalette: palette, maxAlternatives: 5 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.alternatives).toHaveLength(5);
      }
    });

    test('returns no alternatives when maxAlternatives is 0', async () => {
      const result = await colorBrandMatch({ targetColor: '#FF5733', brandPalette: palette, maxAlternatives: 0 });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.alternatives).toEqual([]);
      }
    });

    test('includeAlternatives false still wins over maxAlternatives', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: palette,
        includeAlternatives: false,
        maxAlternatives: 5
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.alternatives).toEqual([]);
      }
    });

    test('rejects a non-integer or out-of-range maxAlternatives', async () => {
      for (const maxAlternatives of [-1, 1.5, 50]) {
        const result = await colorBrandMatch({ targetColor: '#FF5733', brandPalette: palette, maxAlternatives });
        expect(result.success).toBe(false);
      }
    });

    test('gives each alternative its own confidence', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#FF5733', '#FF6040', '#3357FF'], // CIEDE2000 0, ~1.98, large
        maxDeltaE: 10
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.alternatives.map(alt => alt.confidence)).toEqual(['high', 'low']);
      }
    });

    test('advertises maxAlternatives in the MCP input schema', () => {
      expect(colorBrandMatchTool.inputSchema.properties.maxAlternatives).toEqual(
        expect.objectContaining({ type: 'integer', minimum: 0, maximum: 49, default: 3 })
      );
    });
  });

  describe('duplicate palette colors', () => {
    test('keeps the first of several equivalent colors and reports the rest', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0000',
        brandPalette: [
          { name: 'Brand Red', color: '#ff0000' },
          'rgb(255,0,0)',
          { name: 'Alert', color: 'hsl(0,100%,50%)' },
          '#00ff00'
        ]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.name).toBe('Brand Red');
        expect(result.result.alternatives.map(alt => alt.paletteIndex)).toEqual([3]);
        expect(result.result.duplicates).toEqual([
          { paletteIndex: 1, duplicateOf: 0 },
          { paletteIndex: 2, name: 'Alert', duplicateOf: 0 }
        ]);
        expect(result.metadata.brandPaletteSize).toBe(4);
      }
    });

    test('treats colors that differ only in alpha as distinct', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0000',
        brandPalette: ['#FF0000', 'rgba(255,0,0,0.5)']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.duplicates).toEqual([]);
        expect(result.result.alternatives).toHaveLength(1);
      }
    });

    test('returns an empty duplicates list when all colors differ', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['#FF5733', '#33FF57']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.duplicates).toEqual([]);
      }
    });
  });

  describe('skip reasons', () => {
    test('includes the specific parse failure', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF5733',
        brandPalette: ['not-a-color', { space: 'srgb', values: [2, 0, 0] }, '#FF5733']
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.skipped.map(entry => entry.reason)).toEqual([
          'Failed to parse color input: Invalid color string format',
          'Failed to parse color input: Invalid color values for space srgb'
        ]);
      }
    });
  });
  describe('default maxDeltaE', () => {
    test('defaults to a CIEDE2000 threshold of 3', async () => {
      const result = await colorBrandMatch({
        targetColor: '#FF0000',
        brandPalette: ['#F00000'] // CIEDE2000 ~3.19
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.withinThreshold).toBe(false);
      }
    });

    test('advertises the default in the MCP input schema', () => {
      expect(colorBrandMatchTool.inputSchema.properties.maxDeltaE.default).toBe(3);
    });
  });
});