import { describe, test, expect } from '@jest/globals';
import { svgCreateTool } from '../../src/tools/svgCreate.js';

describe('svg.create Tool', () => {
  describe('Basic SVG Creation', () => {
    test('creates valid SVG with single rectangle', async () => {
      const input = {
        width: 100,
        height: 100,
        elements: [{
          type: 'rect',
          x: 10,
          y: 10,
          width: 80,
          height: 60,
          fill: '#ff0000'
        }]
      };

      const result = await svgCreateTool.invoke(input);
      
      expect(result.content[0].type).toBe('text');
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('<svg');
      expect(response.svg).toContain('width="100"');
      expect(response.svg).toContain('height="100"');
      expect(response.svg).toContain('<rect');
      expect(response.svg).toContain('fill="#ff0000"');
      expect(response.svg).toContain('</svg>');
    });

    test('creates SVG with multiple elements', async () => {
      const input = {
        width: 200,
        height: 150,
        elements: [
          {
            type: 'circle',
            cx: 50,
            cy: 50,
            r: 30,
            fill: 'blue'
          },
          {
            type: 'rect',
            x: 100,
            y: 25,
            width: 50,
            height: 50,
            fill: 'green'
          }
        ]
      };

      const result = await svgCreateTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('<circle');
      expect(response.svg).toContain('<rect');
      expect(response.metadata.elementCount).toBe(2);
    });

    test('creates SVG with text element', async () => {
      const input = {
        width: 300,
        height: 100,
        elements: [{
          type: 'text',
          x: 50,
          y: 50,
          content: 'Hello SVG',
          fontSize: 24,
          fontFamily: 'Arial',
          fill: 'black'
        }]
      };

      const result = await svgCreateTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('<text');
      expect(response.svg).toContain('Hello SVG');
      expect(response.svg).toContain('font-size="24"');
      expect(response.svg).toContain('font-family="Arial"');
    });
  });

  describe('Advanced SVG Features', () => {
    test('creates SVG with viewBox', async () => {
      const input = {
        width: 400,
        height: 300,
        viewBox: {
          x: 0,
          y: 0,
          width: 100,
          height: 75
        },
        elements: [{
          type: 'circle',
          cx: 50,
          cy: 37.5,
          r: 25,
          fill: 'purple'
        }]
      };

      const result = await svgCreateTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('viewBox="0 0 100 75"');
    });

    test('creates SVG with path element', async () => {
      const input = {
        width: 200,
        height: 200,
        elements: [{
          type: 'path',
          d: 'M 10 10 L 90 90 L 10 90 Z',
          fill: 'orange',
          stroke: 'black',
          strokeWidth: 2
        }]
      };

      const result = await svgCreateTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('<path');
      expect(response.svg).toContain('d="M 10 10 L 90 90 L 10 90 Z"');
      expect(response.svg).toContain('stroke-width="2"');
    });

    test('creates SVG with grouped elements', async () => {
      const input = {
        width: 200,
        height: 200,
        elements: [{
          type: 'group',
          id: 'test-group',
          elements: [
            {
              type: 'circle',
              cx: 50,
              cy: 50,
              r: 20,
              fill: 'red'
            },
            {
              type: 'circle',
              cx: 70,
              cy: 50,
              r: 20,
              fill: 'blue'
            }
          ]
        }]
      };

      const result = await svgCreateTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('<g');
      expect(response.svg).toContain('id="test-group"');
      expect(response.svg).toContain('</g>');
    });
  });

  describe('Metadata and Documentation', () => {
    test('includes metadata in SVG', async () => {
      const input = {
        width: 100,
        height: 100,
        elements: [{
          type: 'rect',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: 'gray'
        }],
        metadata: {
          title: 'Test SVG',
          description: 'A simple test rectangle',
          keywords: ['test', 'rectangle', 'svg']
        }
      };

      const result = await svgCreateTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('<title>Test SVG</title>');
      expect(response.svg).toContain('<desc>A simple test rectangle</desc>');
    });

    test('returns correct metadata', async () => {
      const input = {
        width: 150,
        height: 100,
        elements: [{
          type: 'circle',
          cx: 75,
          cy: 50,
          r: 40,
          fill: 'cyan'
        }]
      };

      const result = await svgCreateTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.width).toBe(150);
      expect(response.metadata.height).toBe(100);
      expect(response.metadata.elementCount).toBe(1);
      expect(response.metadata.fileSize).toBeGreaterThan(0);
      expect(response.metadata.generatedAt).toBeDefined();
    });
  });

  describe('Input Validation', () => {
    test('rejects invalid dimensions', async () => {
      const input = {
        width: -10,
        height: 100,
        elements: []
      };

      const result = await svgCreateTool.invoke(input);
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe(true);
      expect(response.code).toBe('INVALID_INPUT');
    });

    test('rejects dimensions too large', async () => {
      const input = {
        width: 20000,
        height: 100,
        elements: []
      };

      const result = await svgCreateTool.invoke(input);
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe(true);
    });

    test('rejects missing required element properties', async () => {
      const input = {
        width: 100,
        height: 100,
        elements: [{
          type: 'rect',
          x: 10,
          y: 10
          // Missing width and height
        }]
      };

      const result = await svgCreateTool.invoke(input);
      
      expect(result.isError).toBe(true);
    });

    test('rejects invalid color values', async () => {
      const input = {
        width: 100,
        height: 100,
        elements: [{
          type: 'rect',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: 'invalid-color'
        }]
      };

      const result = await svgCreateTool.invoke(input);
      
      expect(result.isError).toBe(true);
    });

    test('rejects invalid path data', async () => {
      const input = {
        width: 100,
        height: 100,
        elements: [{
          type: 'path',
          d: 'invalid path data'
        }]
      };

      const result = await svgCreateTool.invoke(input);
      
      expect(result.isError).toBe(true);
    });
  });

  describe('Performance Requirements', () => {
    test('creates simple SVG within performance threshold', async () => {
      const input = {
        width: 100,
        height: 100,
        elements: [{
          type: 'circle',
          cx: 50,
          cy: 50,
          r: 25,
          fill: 'red'
        }]
      };

      const startTime = performance.now();
      
      await svgCreateTool.invoke(input);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete within 50ms threshold
      expect(duration).toBeLessThan(50);
    });

    test('handles complex SVG within reasonable time', async () => {
      const elements = Array.from({ length: 50 }, (_, i) => ({
        type: 'circle' as const,
        cx: (i % 10) * 20 + 10,
        cy: Math.floor(i / 10) * 20 + 10,
        r: 5,
        fill: `hsl(${i * 7}, 70%, 50%)`
      }));

      const input = {
        width: 220,
        height: 120,
        elements
      };

      const startTime = performance.now();
      
      await svgCreateTool.invoke(input);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete within 200ms for moderate complexity
      expect(duration).toBeLessThan(200);
    });
  });

  describe('Edge Cases', () => {
    test('handles empty elements array', async () => {
      const input = {
        width: 100,
        height: 100,
        elements: []
      };

      const result = await svgCreateTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('<svg');
      expect(response.svg).toContain('</svg>');
      expect(response.metadata.elementCount).toBe(0);
    });

    test('handles zero-sized elements', async () => {
      const input = {
        width: 100,
        height: 100,
        elements: [{
          type: 'rect',
          x: 50,
          y: 50,
          width: 0,
          height: 0,
          fill: 'red'
        }]
      };

      const result = await svgCreateTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('width="0"');
      expect(response.svg).toContain('height="0"');
    });

    test('handles elements with default values', async () => {
      const input = {
        width: 100,
        height: 100,
        elements: [{
          type: 'circle',
          r: 25
          // cx and cy should default to 0
        }]
      };

      const result = await svgCreateTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('<circle');
      // Should place circle at origin
      expect(response.svg).toMatch(/cx="0"|center\([^,]*0/);
    });
  });
});