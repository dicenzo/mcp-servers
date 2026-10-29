import { registerWindow } from '@svgdotjs/svg.js';
import { SVG_LIMITS } from '../../src/types/svg.js';
import { svgTransformTool } from '../../src/tools/svgTransform.js';
import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';

describe('svg.transform Tool', () => {
  const baseSVG = '<svg width="100" height="100"><rect x="10" y="10" width="50" height="50" fill="red"/></svg>';

  describe('Basic Transformations', () => {
    test('applies translate transformation', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'translate',
          values: [20, 30]
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      expect(result.content[0].type).toBe('text');
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('transform=');
      expect(response.svg).toContain('translate(20, 30)');
      expect(response.transformations).toHaveLength(1);
      expect(response.transformations[0].type).toBe('translate');
      expect(response.transformations[0].applied).toBe(true);
    });

    test('applies rotate transformation', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'rotate',
          values: [45]
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      // SVG.js might convert rotate to matrix transformation
      expect(response.svg).toMatch(/(rotate\(45\)|matrix\([^)]+\))/);
      expect(response.transformations[0].type).toBe('rotate');
    });

    test('applies scale transformation', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'scale',
          values: [2, 1.5]
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('scale(2, 1.5)');
      expect(response.transformations[0].type).toBe('scale');
    });

    test('applies skewX transformation', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'skewX',
          values: [15]
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('skewX(15)');
    });

    test('applies skewY transformation', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'skewY',
          values: [10]
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('skewY(10)');
    });

    test('rejects matrix transformation (not in schema)', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'matrix',
          values: [1, 0, 0, 1, 20, 30]
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      // Matrix is not supported in the schema, so it should error
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe(true);
    });
  });

  describe('Multiple Transformations', () => {
    test('applies multiple transformations in sequence', async () => {
      const input = {
        svg: baseSVG,
        transforms: [
          {
            type: 'translate',
            values: [10, 20]
          },
          {
            type: 'rotate',
            values: [30]
          },
          {
            type: 'scale',
            values: [1.5]
          }
        ]
      };

      const result = await svgTransformTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.transformations).toHaveLength(3);
      expect(response.transformations.every((t: any) => t.applied)).toBe(true);
      expect(response.metadata.transformCount).toBe(3);
    });

    test('handles mixed absolute and relative transformations', async () => {
      const input = {
        svg: baseSVG,
        transforms: [
          {
            type: 'translate',
            values: [50, 50]
          },
          {
            type: 'rotate',
            values: [45, 25, 25] // Rotate around center
          }
        ]
      };

      const result = await svgTransformTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.transformations).toHaveLength(2);
    });
  });

  describe('Element Targeting', () => {
    test('applies transform to specific element by ID', async () => {
      const svgWithId = '<svg width="100" height="100"><rect id="target" x="10" y="10" width="50" height="50" fill="red"/></svg>';
      
      const input = {
        svg: svgWithId,
        transforms: [{
          type: 'translate',
          values: [20, 30],
          element: '#target'
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.transformations[0].element).toBe('#target');
    });

    test('handles non-existent element selector gracefully', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'translate',
          values: [20, 30],
          element: '#nonexistent'
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.transformations[0].applied).toBe(true);
    });
  });

  describe('Transform Origin', () => {
    test('applies transformation with custom origin', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'rotate',
          values: [45],
          origin: { x: 25, y: 25 }
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toBeDefined();
      expect(response.transformations[0].applied).toBe(true);
    });
  });

  describe('Input Validation', () => {
    test('rejects invalid SVG input', async () => {
      const input = {
        svg: 'invalid svg content',
        transforms: [{
          type: 'translate',
          values: [10, 20]
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe(true);
    });

    test('rejects invalid transformation type', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'invalid',
          values: [10, 20]
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      expect(result.isError).toBe(true);
    });

    test('handles empty values array for translate', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'translate',
          values: []
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      // Schema allows empty values array, but the tool should handle gracefully
      const response = JSON.parse(result.content[0].text);
      if (result.isError) {
        expect(response.error).toBe(true);
      } else {
        expect(response.transformations[0].applied).toBe(true);
      }
    });

    test('rejects matrix type (not supported in schema)', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'matrix',
          values: [1, 0, 0] // Matrix type not in schema
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      expect(result.isError).toBe(true);
    });

    test('rejects non-numeric transformation values', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'translate',
          values: ['invalid', 20] as any
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      expect(result.isError).toBe(true);
    });
  });

  describe('Edge Cases', () => {
    test('handles empty SVG', async () => {
      const input = {
        svg: '<svg></svg>',
        transforms: [{
          type: 'translate',
          values: [10, 20]
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('<svg');
      expect(response.transformations[0].applied).toBe(true);
    });

    test('handles single value for scale (uniform scaling)', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'scale',
          values: [2]
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('scale(2)');
    });

    test('handles single value for translate (x-only)', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'translate',
          values: [20]
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('translate(20)');
    });
  });

  describe('Performance Requirements', () => {
    test('completes simple transformation within performance threshold', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'translate',
          values: [10, 20]
        }]
      };

      const startTime = performance.now();
      
      await svgTransformTool.invoke(input);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete within 100ms threshold
      expect(duration).toBeLessThan(100);
    });

    test('handles multiple transformations efficiently', async () => {
      const transforms = Array.from({ length: 10 }, (_, i) => ({
        type: 'translate' as const,
        values: [i * 5, i * 10]
      }));

      const input = {
        svg: baseSVG,
        transforms
      };

      const startTime = performance.now();
      
      await svgTransformTool.invoke(input);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete within 300ms for multiple transforms
      expect(duration).toBeLessThan(300);
    });
  });

  describe('Metadata Validation', () => {
    test('returns correct metadata', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'rotate',
          values: [45]
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.originalSize).toBeGreaterThan(0);
      expect(response.metadata.transformedSize).toBeGreaterThan(0);
      expect(response.metadata.transformCount).toBe(1);
      expect(response.metadata.transformedAt).toBeDefined();
    });

    test('calculates size changes correctly', async () => {
      const input = {
        svg: baseSVG,
        transforms: [{
          type: 'translate',
          values: [100, 200]
        }]
      };

      const result = await svgTransformTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.transformedSize).toBeGreaterThan(response.metadata.originalSize);
    });
  });
});
describe('svg.transform security hardening', () => {
  const transform = async (svg: string, transforms: unknown[]) => {
    const result = await svgTransformTool.invoke({ svg, transforms });
    return { result, response: JSON.parse(result.content[0].text) };
  };

  test('rejects id selectors containing regex metacharacters without backtracking', async () => {
    const svg = '<svg width="100" height="100"><rect id="' + 'a'.repeat(30) + '" width="5" height="5"/></svg>';
    const start = Date.now();
    const { result, response } = await transform(svg, [
      { type: 'translate', values: [1, 1], element: '#(a|aa)*x' }
    ]);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(result.isError).toBe(true);
    expect(response.message).toMatch(/selector|id/i);
  });

  test('rejects id selectors that would break out of the attribute', async () => {
    const { result } = await transform('<svg width="10" height="10"><rect id="a" width="5" height="5"/></svg>', [
      { type: 'translate', values: [1, 1], element: '#a" onload="alert(1)' }
    ]);
    expect(result.isError).toBe(true);
  });

  test('accepts ids using the full XML-name character set', async () => {
    const svg = '<svg width="10" height="10"><rect id="icon_main.v2:part-1" width="5" height="5"/></svg>';
    const { result, response } = await transform(svg, [
      { type: 'translate', values: [3, 4], element: '#icon_main.v2:part-1' }
    ]);
    expect(result.isError).toBeUndefined();
    expect(response.svg).toContain('translate(3, 4)');
  });

  test('targets a self-closing element without producing malformed markup', async () => {
    const svg = '<svg width="100" height="100"><rect id="target" x="10" y="10" width="50" height="50" fill="red"/></svg>';
    const { result, response } = await transform(svg, [
      { type: 'translate', values: [20, 30], element: '#target' }
    ]);
    expect(result.isError).toBeUndefined();
    expect(response.svg).toMatch(/<rect id="target"[^>]*transform="translate\(20, 30\)"[^>]*\/>/);
    expect(response.svg).not.toContain('/ transform');
  });

  test('handles pathological input for element targeting in linear time', async () => {
    const svg = '<svg width="10" height="10">' + '<'.repeat(900000) + '</svg>';
    const start = Date.now();
    await transform(svg, [{ type: 'translate', values: [1, 1], element: '#a' }]);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  test('handles pathological input for root transforms in linear time', async () => {
    const svg = '<svg'.repeat(200000) + '</svg>';
    const start = Date.now();
    await transform(svg, [{ type: 'translate', values: [1, 1] }]);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  test('rejects input containing a DOCTYPE', async () => {
    const { result } = await transform(
      '<!DOCTYPE svg [<!ENTITY a "b">]><svg width="10" height="10"><text>&a;</text></svg>',
      [{ type: 'translate', values: [1, 1] }]
    );
    expect(result.isError).toBe(true);
  });

  test('rejects SVG input larger than the size cap', async () => {
    const svg = '<svg width="10" height="10">' + ' '.repeat(SVG_LIMITS.MAX_SVG_LENGTH) + '</svg>';
    const { result } = await transform(svg, [{ type: 'translate', values: [1, 1] }]);
    expect(result.isError).toBe(true);
  });

  test('rejects too many transforms', async () => {
    const transforms = Array.from({ length: SVG_LIMITS.MAX_TRANSFORMS + 1 }, () => ({ type: 'translate', values: [1, 1] }));
    const { result } = await transform('<svg width="10" height="10"></svg>', transforms);
    expect(result.isError).toBe(true);
  });
});

// Without a registered DOM window (the production case under Node), svg.js cannot
// parse the input and svg.transform falls back to string-based transformation.
describe('svg.transform string-based fallback (no DOM window)', () => {
  beforeAll(() => {
    registerWindow(undefined as any, undefined as any);
  });

  afterAll(() => {
    registerWindow((global as any).window, (global as any).document);
  });

  const transform = async (svg: string, transforms: unknown[]) => {
    const result = await svgTransformTool.invoke({ svg, transforms });
    return { result, response: JSON.parse(result.content[0].text) };
  };

  test('adds a transform to a self-closing element targeted by id', async () => {
    const { result, response } = await transform(
      '<svg width="100" height="100"><rect id="target" x="10" y="10" width="50" height="50" fill="red"/></svg>',
      [{ type: 'translate', values: [20, 30], element: '#target' }]
    );
    expect(result.isError).toBeUndefined();
    expect(response.svg).toBe(
      '<svg width="100" height="100"><rect id="target" x="10" y="10" width="50" height="50" fill="red" transform="translate(20, 30)"/></svg>'
    );
  });

  test('appends to an existing transform attribute', async () => {
    const { response } = await transform(
      '<svg width="100" height="100"><g id="layer" transform="scale(2)"><rect width="5" height="5"/></g></svg>',
      [{ type: 'rotate', values: [45], element: '#layer' }]
    );
    expect(response.svg).toContain('<g id="layer" transform="scale(2) rotate(45)">');
  });

  test('matches the id attribute exactly, not as a suffix of another attribute', async () => {
    const { response } = await transform(
      '<svg width="100" height="100"><rect data-id="target" width="5" height="5"/><rect id="target" width="6" height="6"/></svg>',
      [{ type: 'translate', values: [1, 2], element: '#target' }]
    );
    expect(response.svg).toContain('<rect data-id="target" width="5" height="5"/>');
    expect(response.svg).toContain('<rect id="target" width="6" height="6" transform="translate(1, 2)"/>');
  });

  test('wraps the root content in a group, keeping nested svg elements intact', async () => {
    const { response } = await transform(
      '<svg width="100" height="100"><svg x="5"><rect width="5" height="5"/></svg></svg>',
      [{ type: 'translate', values: [1, 2] }]
    );
    expect(response.svg).toBe(
      '<svg width="100" height="100"><g transform="translate(1, 2)"><svg x="5"><rect width="5" height="5"/></svg></g></svg>'
    );
  });

  test('handles pathological input for element targeting in linear time', async () => {
    const svg = '<svg width="10" height="10">' + '<'.repeat(900000) + '</svg>';
    const start = Date.now();
    await transform(svg, [{ type: 'translate', values: [1, 1], element: '#a' }]);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  test('handles pathological input for root transforms in linear time', async () => {
    const svg = '<svg'.repeat(200000) + '</svg>';
    const start = Date.now();
    await transform(svg, [{ type: 'translate', values: [1, 1] }]);
    expect(Date.now() - start).toBeLessThan(1000);
  });
});
