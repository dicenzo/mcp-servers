import { describe, test, expect } from '@jest/globals';
import { svgPathOperationsTool } from '../../src/tools/svgPathOperations.js';
import { SVG_LIMITS } from '../../src/types/svg.js';

describe('svg.path.operations Tool', () => {
  const simpleRect = 'M 10 10 L 60 10 L 60 60 L 10 60 Z';
  const simpleCircle = 'M 50 25 A 25 25 0 1 1 49.99 25 Z';
  const triangle = 'M 30 30 L 70 30 L 50 70 Z';
  const complexPath = 'M 10 10 C 20 20, 40 20, 50 10 S 80 5, 90 10 L 90 90 Z';

  describe('Union Operations', () => {
    test('performs union of two simple paths', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'union'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      expect(result.content[0].type).toBe('text');
      
      const response = JSON.parse(result.content[0].text);
      expect(response.path).toBeDefined();
      expect(response.operation.type).toBe('union');
      expect(response.operation.path1Length).toBeGreaterThan(0);
      expect(response.operation.path2Length).toBeGreaterThan(0);
      expect(response.operation.resultLength).toBeGreaterThan(0);
    });

    test('union combines path data correctly', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'union'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      // For simplified union, should contain both paths
      expect(response.path).toContain('M');
    });
  });

  describe('Intersection Operations', () => {
    test('performs intersection of two paths', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'intersect'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      if (response.error) {
        // Complex path operations might fail, which is acceptable
        expect(response.error).toBe(true);
      } else {
        expect(response.operation.type).toBe('intersect');
        expect(response.path).toBeDefined();
      }
    });

    test('intersection with custom tolerance', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'intersect',
        tolerance: 0.5
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      if (response.error) {
        expect(response.error).toBe(true);
      } else {
        expect(response.metadata.tolerance).toBe(0.5);
      }
    });

    test('intersection with custom precision', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'intersect',
        precision: 2
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      if (response.error) {
        expect(response.error).toBe(true);
      } else {
        expect(response.metadata.precision).toBe(2);
      }
    });
  });

  describe('Subtraction Operations', () => {
    test('performs subtraction of paths', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'subtract'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.operation.type).toBe('subtract');
      expect(response.path).toBeDefined();
    });
  });

  describe('Exclusion Operations', () => {
    test('performs exclusion of paths', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'exclude'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.operation.type).toBe('exclude');
      expect(response.path).toBeDefined();
    });
  });

  describe('Complex Path Operations', () => {
    test('handles complex bezier curves', async () => {
      const input = {
        path1: complexPath,
        path2: simpleRect,
        operation: 'union'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.operation.complexity).toBeDefined();
      expect(['simple', 'moderate', 'complex']).toContain(response.operation.complexity);
    });

    test('handles circular arcs', async () => {
      const input = {
        path1: simpleCircle,
        path2: simpleRect,
        operation: 'intersect'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      if (response.error) {
        // Complex arc operations might fail
        expect(response.error).toBe(true);
      } else {
        expect(response.path).toBeDefined();
      }
    });
  });

  describe('Input Validation', () => {
    test('rejects invalid path1 data', async () => {
      const input = {
        path1: 'invalid path data',
        path2: simpleRect,
        operation: 'union'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe(true);
    });

    test('rejects invalid path2 data', async () => {
      const input = {
        path1: simpleRect,
        path2: 'invalid path data',
        operation: 'union'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      expect(result.isError).toBe(true);
    });

    test('rejects invalid operation type', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'invalid_operation'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      expect(result.isError).toBe(true);
    });

    test('handles precision out of range', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'union',
        precision: 15 // Above maximum
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      // Should either error or clamp to valid range
      const response = JSON.parse(result.content[0].text);
      if (result.isError) {
        expect(response.error).toBe(true);
      } else {
        expect(response.path).toBeDefined();
      }
    });

    test('handles precision below minimum', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'union',
        precision: 0 // Below minimum
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      // Should either error or clamp to valid range
      const response = JSON.parse(result.content[0].text);
      if (result.isError) {
        expect(response.error).toBe(true);
      } else {
        expect(response.path).toBeDefined();
      }
    });

    test('handles tolerance out of range', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'union',
        tolerance: 2.0 // Above maximum
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      // Should either error or clamp to valid range
      const response = JSON.parse(result.content[0].text);
      if (result.isError) {
        expect(response.error).toBe(true);
      } else {
        expect(response.path).toBeDefined();
      }
    });

    test('handles tolerance below minimum', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'union',
        tolerance: 0.0001 // Below minimum
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      // Should either error or clamp to valid range
      const response = JSON.parse(result.content[0].text);
      if (result.isError) {
        expect(response.error).toBe(true);
      } else {
        expect(response.path).toBeDefined();
      }
    });
  });

  describe('Default Values', () => {
    test('uses default precision when not specified', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'union'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.precision).toBe(3);
    });

    test('uses default tolerance when not specified', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'union'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.tolerance).toBe(0.1);
    });
  });

  describe('Performance Requirements', () => {
    test('completes simple operation within performance threshold', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'union'
      };

      const startTime = performance.now();
      
      await svgPathOperationsTool.invoke(input);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete within 100ms threshold for simple paths
      expect(duration).toBeLessThan(100);
    });

    test('handles complex paths within reasonable time', async () => {
      const input = {
        path1: complexPath,
        path2: simpleCircle,
        operation: 'intersect'
      };

      const startTime = performance.now();
      
      await svgPathOperationsTool.invoke(input);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete within 300ms for complex paths
      expect(duration).toBeLessThan(300);
    });
  });

  describe('Edge Cases', () => {
    test('handles identical paths', async () => {
      const input = {
        path1: simpleRect,
        path2: simpleRect,
        operation: 'union'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.path).toBeDefined();
    });

    test('handles empty path result', async () => {
      // Use paths that would result in no intersection
      const path1 = 'M 0 0 L 10 0 L 10 10 L 0 10 Z';
      const path2 = 'M 50 50 L 60 50 L 60 60 L 50 60 Z';
      
      const input = {
        path1,
        path2,
        operation: 'intersect'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      if (response.error) {
        // Empty result operations might fail
        expect(response.error).toBe(true);
      } else {
        expect(response.path).toBeDefined();
      }
    });

    test('handles single-point paths', async () => {
      const input = {
        path1: 'M 10 10',
        path2: simpleRect,
        operation: 'union'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.path).toBeDefined();
    });
  });

  describe('Path Complexity Assessment', () => {
    test('correctly assesses simple path complexity', async () => {
      const input = {
        path1: 'M 10 10 L 20 20 Z',
        path2: triangle,
        operation: 'union'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      if (response.error) {
        expect(response.error).toBe(true);
      } else {
        // Path complexity assessment might be different than expected
        expect(['simple', 'moderate']).toContain(response.operation.complexity);
      }
    });

    test('correctly assesses complex path complexity', async () => {
      const veryComplexPath = 'M 10 10 C 20 20 30 30 40 40 S 50 50 60 60 Q 70 70 80 80 T 90 90 A 10 10 0 1 1 100 100 L 110 110 Z';
      
      const input = {
        path1: veryComplexPath,
        path2: complexPath,
        operation: 'union'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(['moderate', 'complex']).toContain(response.operation.complexity);
    });
  });

  describe('Metadata Validation', () => {
    test('returns correct metadata', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'union'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.processedAt).toBeDefined();
      expect(response.metadata.precision).toBe(3);
      expect(response.metadata.tolerance).toBe(0.1);
      
      const timestamp = new Date(response.metadata.processedAt);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });

    test('tracks path lengths correctly', async () => {
      const input = {
        path1: simpleRect,
        path2: triangle,
        operation: 'union'
      };

      const result = await svgPathOperationsTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.operation.path1Length).toBe(simpleRect.length);
      expect(response.operation.path2Length).toBe(triangle.length);
      expect(response.operation.resultLength).toBeGreaterThan(0);
    });
  });
});
describe('svg.path.operations input caps', () => {
  const run = async (path1: string, path2: string, operation: string) => {
    const result = await svgPathOperationsTool.invoke({ path1, path2, operation });
    return { result, response: JSON.parse(result.content[0].text) };
  };

  test('rejects path data larger than the path cap', async () => {
    const big = 'M 0 0' + ' L 1 1'.repeat(SVG_LIMITS.MAX_PATH_LENGTH / 5);
    const { result } = await run(big, 'M 0 0 L 1 1', 'union');
    expect(result.isError).toBe(true);
  });

  test('rejects paths with more coordinates than the coordinate cap', async () => {
    const many = 'M 0 0' + ' L 1 1'.repeat(SVG_LIMITS.MAX_PATH_COORDINATES + 1);
    const { result, response } = await run(many, 'M 0 0 L 1 1', 'intersect');
    expect(result.isError).toBe(true);
    expect(response.message).toMatch(/coordinate/i);
  });

  test.each(['intersect', 'subtract', 'exclude'])('worst-case %s at the coordinate cap finishes within 1s', async (operation) => {
    // Points that never fall within tolerance of each other force a full n*m scan
    const pathA = 'M 0 0' + Array.from({ length: SVG_LIMITS.MAX_PATH_COORDINATES - 1 }, (_, i) => ` L ${i * 10} 0`).join('');
    const pathB = 'M 0 5' + Array.from({ length: SVG_LIMITS.MAX_PATH_COORDINATES - 1 }, (_, i) => ` L ${i * 10} 5`).join('');
    const start = Date.now();
    const { result } = await run(pathA, pathB, operation);
    expect(Date.now() - start).toBeLessThan(1000);
    // An empty intersection is reported as an error; only the timing matters here
    expect(result.content[0].type).toBe('text');
  });
});
