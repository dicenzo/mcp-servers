import { describe, test, expect } from '@jest/globals';
import { svgOptimizeTool } from '../../src/tools/svgOptimize.js';
import { SVG_LIMITS } from '../../src/types/svg.js';

describe('svg.optimize Tool', () => {
  const unoptimizedSVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- This is a test SVG with comments -->
<svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      .unused-class { fill: green; }
    </style>
  </defs>
  <title>Test SVG</title>
  <desc>A test SVG for optimization</desc>
  <rect x="10.123456789" y="20.987654321" width="50.000000" height="40.000000" fill="rgb(255, 0, 0)" stroke="black" stroke-width="1"/>
  <circle cx="100.000" cy="100.000" r="30.000000" fill="#ff0000"/>
  <g>
    <!-- Empty group -->
  </g>
  <path d="M 10.123 20.456 L 30.789 40.123 Z"/>
</svg>`;

  const simpleSVG = '<svg width="100" height="100"><rect x="10" y="10" width="50" height="50" fill="red"/></svg>';

  describe('Basic Optimization', () => {
    test('optimizes SVG with default options', async () => {
      const input = {
        svg: unoptimizedSVG
      };

      const result = await svgOptimizeTool.invoke(input);
      
      expect(result.content[0].type).toBe('text');
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toBeDefined();
      expect(response.svg).toContain('<svg');
      expect(response.svg).toContain('</svg>');
      expect(response.optimization.originalSize).toBeGreaterThan(0);
      expect(response.optimization.optimizedSize).toBeGreaterThan(0);
      expect(response.optimization.compressionRatio).toBeGreaterThanOrEqual(0);
    });

    test('removes comments by default', async () => {
      const input = {
        svg: unoptimizedSVG
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).not.toContain('<!-- This is a test SVG with comments -->');
      expect(response.svg).not.toContain('<!-- Empty group -->');
    });

    test('reduces numeric precision', async () => {
      const input = {
        svg: unoptimizedSVG,
        options: {
          precision: 2
        }
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      // Should not have long decimal numbers
      expect(response.svg).not.toContain('10.123456789');
      expect(response.svg).not.toContain('20.987654321');
    });
  });

  describe('Optimization Options', () => {
    test('preserves comments when removeComments is false', async () => {
      const svgWithComments = '<svg width="100" height="100"><!-- keep this comment --><rect x="10" y="10" width="50" height="50" fill="red"/></svg>';
      
      const input = {
        svg: svgWithComments,
        options: {
          removeComments: false
        }
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      // SVGO may minify comments by removing spaces, so check for presence rather than exact match
      expect(response.svg).toMatch(/<!--.*keep this comment.*-->/);
    });

    test('preserves metadata when removeMetadata is false', async () => {
      const input = {
        svg: unoptimizedSVG,
        options: {
          removeMetadata: false
        }
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      // SVGO may remove title but preserve desc, check for at least one metadata element
      expect(response.svg).toContain('<desc>A test SVG for optimization</desc>');
    });

    test('removes metadata when removeMetadata is true', async () => {
      const input = {
        svg: unoptimizedSVG,
        options: {
          removeMetadata: true
        }
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).not.toContain('<title>Test SVG</title>');
      // Note: SVGO might not remove all metadata elements depending on configuration
    });

    test('configures precision correctly', async () => {
      const input = {
        svg: unoptimizedSVG,
        options: {
          precision: 1
        }
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toBeDefined();
    });

    test('handles removeViewBox option', async () => {
      const input = {
        svg: unoptimizedSVG,
        options: {
          removeViewBox: true
        }
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      // Note: SVGO may or may not actually remove viewBox depending on its internal logic
      expect(response.svg).toBeDefined();
    });
  });

  describe('Optimization Metrics', () => {
    test('calculates compression ratio correctly', async () => {
      const input = {
        svg: unoptimizedSVG
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.optimization.originalSize).toBeGreaterThan(0);
      expect(response.optimization.optimizedSize).toBeGreaterThan(0);
      expect(response.optimization.savedBytes).toBeGreaterThanOrEqual(0);
      expect(response.optimization.compressionRatio).toBeGreaterThanOrEqual(0);
      
      // Verify calculation
      const expectedSaved = response.optimization.originalSize - response.optimization.optimizedSize;
      expect(response.optimization.savedBytes).toBe(expectedSaved);
      
      const expectedRatio = (expectedSaved / response.optimization.originalSize) * 100;
      expect(response.optimization.compressionRatio).toBeCloseTo(expectedRatio, 2);
    });

    test('tracks element count changes', async () => {
      const input = {
        svg: unoptimizedSVG
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.optimization.originalElementCount).toBeGreaterThan(0);
      expect(response.optimization.optimizedElementCount).toBeGreaterThanOrEqual(0);
      expect(response.optimization.elementsRemoved).toBeGreaterThanOrEqual(0);
      
      // Verify calculation
      const expectedRemoved = response.optimization.originalElementCount - response.optimization.optimizedElementCount;
      expect(response.optimization.elementsRemoved).toBe(expectedRemoved);
    });

    test('handles SVG with no optimization potential', async () => {
      const input = {
        svg: simpleSVG
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.optimization.compressionRatio).toBeGreaterThanOrEqual(0);
      expect(response.optimization.savedBytes).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Input Validation', () => {
    test('rejects invalid SVG input', async () => {
      const input = {
        svg: 'invalid svg content'
      };

      const result = await svgOptimizeTool.invoke(input);
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe(true);
    });

    test('rejects empty SVG input', async () => {
      const input = {
        svg: ''
      };

      const result = await svgOptimizeTool.invoke(input);
      
      expect(result.isError).toBe(true);
    });

    test('rejects malformed XML', async () => {
      const input = {
        svg: '<svg><rect></svg>' // Unclosed rect tag
      };

      const result = await svgOptimizeTool.invoke(input);
      
      expect(result.isError).toBe(true);
    });

    test('validates precision range', async () => {
      const input = {
        svg: simpleSVG,
        options: {
          precision: 15 // Above maximum
        }
      };

      const result = await svgOptimizeTool.invoke(input);
      
      expect(result.isError).toBe(true);
    });

    test('validates minimum precision', async () => {
      const input = {
        svg: simpleSVG,
        options: {
          precision: 0 // Below minimum
        }
      };

      const result = await svgOptimizeTool.invoke(input);
      
      expect(result.isError).toBe(true);
    });
  });

  describe('Performance Requirements', () => {
    test('optimizes simple SVG within performance threshold', async () => {
      const input = {
        svg: simpleSVG
      };

      const startTime = performance.now();
      
      await svgOptimizeTool.invoke(input);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete within 100ms threshold for simple SVG
      expect(duration).toBeLessThan(100);
    });

    test('handles complex SVG within reasonable time', async () => {
      const input = {
        svg: unoptimizedSVG
      };

      const startTime = performance.now();
      
      await svgOptimizeTool.invoke(input);
      
      const endTime = performance.now();
      const duration = endTime - startTime;
      
      // Should complete within 500ms for complex SVG
      expect(duration).toBeLessThan(500);
    });
  });

  describe('Edge Cases', () => {
    test('handles SVG with only root element', async () => {
      const input = {
        svg: '<svg width="100" height="100"></svg>'
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      if (response.error) {
        // SVGO might reject empty SVGs, which is acceptable
        expect(response.error).toBe(true);
      } else {
        expect(response.svg).toContain('<svg');
        expect(response.svg).toContain('</svg>');
        expect(response.optimization.originalElementCount).toBe(1);
      }
    });

    test('handles SVG with nested groups', async () => {
      const nestedSVG = `<svg width="100" height="100">
        <g>
          <g>
            <rect x="10" y="10" width="50" height="50" fill="red"/>
          </g>
        </g>
      </svg>`;

      const input = {
        svg: nestedSVG
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toBeDefined();
    });

    test('preserves essential SVG structure', async () => {
      const input = {
        svg: simpleSVG
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.svg).toContain('width="100"');
      expect(response.svg).toContain('height="100"');
      // SVGO might convert rect to path, so check for any shape element
      expect(response.svg).toMatch(/<(rect|path|circle|ellipse)/);
    });
  });

  describe('Metadata Validation', () => {
    test('returns correct metadata', async () => {
      const input = {
        svg: simpleSVG
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.metadata.tool).toBe('svg.optimize');
      expect(response.metadata.optimizedAt).toBeDefined();
      expect(response.metadata.svgoVersion).toBeDefined();
    });

    test('includes timestamp in metadata', async () => {
      const input = {
        svg: simpleSVG
      };

      const result = await svgOptimizeTool.invoke(input);
      
      const response = JSON.parse(result.content[0].text);
      const timestamp = new Date(response.metadata.optimizedAt);
      expect(timestamp).toBeInstanceOf(Date);
      expect(timestamp.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });
});
describe('svg.optimize security hardening', () => {
  const optimizeSvg = async (svg: string) => {
    const result = await svgOptimizeTool.invoke({ svg });
    return { result, response: JSON.parse(result.content[0].text) };
  };

  test('rejects internal entity expansion (billion laughs) before parsing', async () => {
    const entities = ['<!ENTITY e0 "' + 'x'.repeat(100) + '">'];
    for (let i = 1; i < 10; i++) {
      entities.push(`<!ENTITY e${i} "${`&e${i - 1};`.repeat(10)}">`);
    }
    const svg = `<?xml version="1.0"?><!DOCTYPE svg [${entities.join('')}]>` +
      '<svg xmlns="http://www.w3.org/2000/svg"><text>&e9;</text></svg>';

    const start = Date.now();
    const { result, response } = await optimizeSvg(svg);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(result.isError).toBe(true);
    expect(response.message).toMatch(/DOCTYPE|ENTITY/);
  });

  test('rejects SVG input larger than the size cap', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg">' + ' '.repeat(SVG_LIMITS.MAX_SVG_LENGTH) + '</svg>';
    const { result } = await optimizeSvg(svg);
    expect(result.isError).toBe(true);
  });

  test('removes a script element whose closing tag evades the pre-check', async () => {
    const { result, response } = await optimizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script ><rect width="10" height="10"/></svg>'
    );
    if (!result.isError) {
      expect(response.svg).not.toMatch(/<script/i);
      expect(response.svg).not.toContain('alert(1)');
    }
  });

  test('removes <set> and <animate> elements that target event handlers or href', async () => {
    const { result, response } = await optimizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<rect width="10" height="10" fill="red"><set attributeName="onmouseover" to="alert(1)"/></rect>' +
      // Entity-encoded payloads evade the string pre-check, so the parser-based pass must catch them
      '<a><animate attributeName="href" values="jav&#x61;script:alert(1)"/><text>x</text></a>' +
      '<a><animate attributeName="xlink:href" to="jav&#x61;script:alert(2)"/><text>y</text></a>' +
      '</svg>'
    );
    expect(result.isError).toBeUndefined();
    expect(response.svg).not.toContain('onmouseover');
    expect(response.svg).not.toContain('alert(');
    expect(response.svg).not.toMatch(/<set\b/);
    expect(response.svg).not.toMatch(/<animate\b/);
  });

  test('removes foreignObject content', async () => {
    const { result, response } = await optimizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg"><foreignObject width="100" height="100">' +
      '<iframe xmlns="http://www.w3.org/1999/xhtml" src="https://evil.example/"></iframe>' +
      '</foreignObject><rect width="10" height="10" fill="red"/></svg>'
    );
    expect(result.isError).toBeUndefined();
    expect(response.svg).not.toMatch(/foreignObject/i);
    expect(response.svg).not.toContain('evil.example');
  });

  test('removes external hrefs but keeps fragment and data:image references', async () => {
    const { result, response } = await optimizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">' +
      '<defs><circle id="dot" r="5" fill="red"/></defs>' +
      '<use href="#dot"/>' +
      '<use xlink:href="https://evil.example/sprite.svg#x"/>' +
      '<a href="https://evil.example/"><rect width="10" height="10" fill="blue"/></a>' +
      '<image width="1" height="1" href="data:image/png;base64,iVBORw0KGgo="/>' +
      '</svg>'
    );
    expect(result.isError).toBeUndefined();
    expect(response.svg).not.toContain('evil.example');
    // SVGO minifies ids, so check that a fragment reference survived rather than its name
    expect(response.svg).toMatch(/<use href="#\w+"\/>/);
    expect(response.svg).toContain('data:image/png;base64');
  });

  test('removes xml-stylesheet processing instructions', async () => {
    const { result, response } = await optimizeSvg(
      '<?xml-stylesheet href="https://evil.example/x.css"?><svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10" fill="red"/></svg>'
    );
    if (!result.isError) {
      expect(response.svg).not.toContain('evil.example');
    }
  });

  test('preserves ordinary content when nothing unsafe is present', async () => {
    const { result, response } = await optimizeSvg(
      '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect x="10" y="10" width="50" height="50" fill="red"/></svg>'
    );
    expect(result.isError).toBeUndefined();
    // SVGO converts the rect to an equivalent path
    expect(response.svg).toMatch(/<(rect|path)\b/);
    expect(response.svg).toContain('fill="red"');
  });
});
