/// <reference types="jest" />
import { createGridTool } from '../../src/tools/createGrid.js';
import { createFlexTool } from '../../src/tools/createFlex.js';
import { addConstraintsTool } from '../../src/tools/addConstraints.js';
import { autoLayoutTool } from '../../src/tools/autoLayout.js';
import { measureTool } from '../../src/tools/measure.js';

describe('Layout Tools Integration', () => {
  describe('createGridTool', () => {
    it('should create a valid grid layout with CSS output', async () => {
      const input = {
        config: {
          columns: '1fr 2fr 1fr',
          rows: 'auto 1fr auto',
          gap: '16px',
          areas: [
            ['header', 'header', 'header'],
            ['sidebar', 'main', 'aside'],
            ['footer', 'footer', 'footer']
          ]
        },
        elements: [
          { id: 'header', gridArea: 'header' },
          { id: 'sidebar', gridArea: 'sidebar' },
          { id: 'main', gridArea: 'main' },
          { id: 'aside', gridArea: 'aside' },
          { id: 'footer', gridArea: 'footer' }
        ],
        bounds: { x: 0, y: 0, width: 800, height: 600 }
      };

      const response = await (createGridTool as any).invoke(input);
      expect(response.content).toBeDefined();
      expect(response.content[0].type).toBe('text');
      
      const result = JSON.parse(response.content[0].text);
      expect(result.success).toBe(true);
      expect(result.layout).toBeDefined();
      expect(result.layout.type).toBe('grid');
      expect(result.css).toBeDefined();
      expect(result.css).toContain('display: grid');
      expect(result.css).toContain('grid-template-columns: 1fr 2fr 1fr');
      expect(result.css).toContain('grid-template-areas');
      expect(result.metrics).toBeDefined();
    });

    it('should handle validation errors gracefully', async () => {
      const invalidInput = {
        config: {
          columns: '', // Invalid empty columns
          rows: 'auto',
          gap: '16px'
        },
        elements: [
          { id: 'test' }
        ],
        bounds: { x: 0, y: 0, width: 800, height: 600 }
      };

      const response = await (createGridTool as any).invoke(invalidInput);
      const result = JSON.parse(response.content[0].text);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.details).toBeDefined();
    });

    it('should optimize layout when requested', async () => {
      const input = {
        config: {
          columns: '1fr 1fr',
          rows: '1fr 1fr',
          gap: '10px',
          areas: [
            ['used-area', 'unused-area'],
            ['used-area', 'another-unused']
          ]
        },
        elements: [
          { id: 'only-element', gridArea: 'used-area' }
        ],
        bounds: { x: 0, y: 0, width: 400, height: 300 },
        optimize: true
      };

      const response = await (createGridTool as any).invoke(input);
      const result = JSON.parse(response.content[0].text);
      
      expect(result.success).toBe(true);
      expect(result.layout.computedGrid?.areas).toBeDefined();
      
      // Optimization should remove unused areas
      const areas = result.layout.computedGrid.areas || {};
      expect(Object.keys(areas)).not.toContain('unused-area');
      expect(Object.keys(areas)).not.toContain('another-unused');
    });
  });

  describe('createFlexTool', () => {
    it('should create a valid flexbox layout with CSS output', async () => {
      const input = {
        config: {
          direction: 'row',
          wrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '12px'
        },
        elements: [
          { id: 'item1', flexGrow: 1, flexShrink: 0, flexBasis: 200 },
          { id: 'item2', flexGrow: 2, flexShrink: 1, flexBasis: 'auto' },
          { id: 'item3', flexGrow: 1, flexShrink: 0, flexBasis: 150, order: -1 }
        ],
        bounds: { x: 0, y: 0, width: 600, height: 200 }
      };

      const response = await (createFlexTool as any).invoke(input);
      const result = JSON.parse(response.content[0].text);
      
      expect(result.success).toBe(true);
      expect(result.layout.type).toBe('flex');
      expect(result.layout.computedFlex?.mainAxis).toBe('horizontal');
      expect(result.layout.computedFlex?.elementPositions).toHaveLength(3);
      expect(result.css).toContain('display: flex');
      expect(result.css).toContain('flex-direction: row');
      expect(result.css).toContain('justify-content: space-between');
      
      // Check element ordering
      const positions = result.layout.computedFlex.elementPositions;
      const sortedByX = positions.sort((a: any, b: any) => a.bounds.x - b.bounds.x);
      expect(sortedByX[0].id).toBe('item3'); // Has order: -1
    });

    it('should handle flex-wrap correctly', async () => {
      const input = {
        config: {
          direction: 'row',
          wrap: 'wrap',
          justifyContent: 'flex-start',
          alignItems: 'stretch',
          gap: '8px'
        },
        elements: [
          { id: 'item1', flexBasis: 250, flexShrink: 0 },
          { id: 'item2', flexBasis: 250, flexShrink: 0 },
          { id: 'item3', flexBasis: 250, flexShrink: 0 }
        ],
        bounds: { x: 0, y: 0, width: 500, height: 300 } // Forces wrapping
      };

      const response = await (createFlexTool as any).invoke(input);
      const result = JSON.parse(response.content[0].text);
      
      expect(result.success).toBe(true);
      
      // Should create multiple lines due to wrapping
      const positions = result.layout.computedFlex.elementPositions;
      const yPositions = positions.map((p: any) => p.bounds.y);
      const uniqueYPositions = [...new Set(yPositions)];
      expect(uniqueYPositions.length).toBeGreaterThan(1);
    });
  });

  describe('addConstraintsTool', () => {
    it('should solve position and size constraints', async () => {
      const input = {
        elements: [
          { id: 'anchor', type: 'div' },
          { id: 'relative', type: 'div' }
        ],
        constraints: [
          {
            type: 'position',
            element: 'anchor',
            property: 'x',
            value: 100,
            relation: 'equal',
            priority: 600
          },
          {
            type: 'position',
            element: 'anchor',
            property: 'y',
            value: 50,
            relation: 'equal',
            priority: 600
          },
          {
            type: 'size',
            element: 'anchor',
            property: 'width',
            value: 200,
            relation: 'equal',
            priority: 500
          },
          {
            type: 'spacing',
            element: 'relative',
            property: 'horizontal',
            value: 20,
            target: 'anchor',
            relation: 'equal',
            priority: 400
          }
        ],
        bounds: { x: 0, y: 0, width: 800, height: 600 }
      };

      const response = await (addConstraintsTool as any).invoke(input);
      const result = JSON.parse(response.content[0].text);
      
      expect(result.success).toBe(true);
      expect(result.elements).toHaveLength(2);
      
      const anchorElement = result.elements.find((el: any) => el.id === 'anchor');
      const relativeElement = result.elements.find((el: any) => el.id === 'relative');
      
      expect(anchorElement.bounds.x).toBe(100);
      expect(anchorElement.bounds.y).toBe(50);
      expect(anchorElement.bounds.width).toBe(200);
      
      // Relative element should be positioned with spacing from anchor
      expect(relativeElement.bounds.x).toBe(320); // anchor.x + anchor.width + spacing
      
      expect(result.css).toContain('position: absolute');
      expect(result.constraintStats).toBeDefined();
    });

    it('should handle constraint conflicts', async () => {
      const input = {
        elements: [
          { id: 'element1', type: 'div' }
        ],
        constraints: [
          {
            type: 'position',
            element: 'element1',
            property: 'x',
            value: 200,
            relation: 'greater',
            priority: 500
          },
          {
            type: 'position',
            element: 'element1',
            property: 'x',
            value: 100,
            relation: 'less',
            priority: 500
          }
        ],
        bounds: { x: 0, y: 0, width: 800, height: 600 }
      };

      const response = await (addConstraintsTool as any).invoke(input);
      const result = JSON.parse(response.content[0].text);
      
      // Should handle conflicts gracefully
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('autoLayoutTool', () => {
    it('should create intelligent automatic layout', async () => {
      const input = {
        elements: [
          {
            id: 'title',
            type: 'text',
            content: { 
              text: 'Main Title',
              title: 'Important heading',
              important: true
            }
          },
          {
            id: 'image',
            type: 'image',
            content: {
              src: 'example.jpg',
              width: 200,
              height: 150
            }
          },
          {
            id: 'description',
            type: 'text',
            content: {
              text: 'This is a longer description that should wrap and be positioned appropriately relative to the title and image.'
            }
          }
        ],
        bounds: { x: 0, y: 0, width: 400, height: 600 },
        config: {
          direction: 'vertical',
          spacing: 16,
          alignment: 'start',
          responsive: true
        }
      };

      const response = await (autoLayoutTool as any).invoke(input);
      const result = JSON.parse(response.content[0].text);
      
      expect(result.success).toBe(true);
      expect(result.elements).toHaveLength(3);
      expect(result.recommendations).toBeDefined();
      expect(result.recommendations.recommendedDirection).toBeDefined();
      expect(result.recommendations.reasoning).toBeDefined();
      expect(Array.isArray(result.recommendations.reasoning)).toBe(true);
      
      // Elements should be positioned based on content priority
      const titleElement = result.elements.find((el: any) => el.id === 'title');
      const imageElement = result.elements.find((el: any) => el.id === 'image');
      
      expect(titleElement.bounds).toBeDefined();
      expect(imageElement.bounds).toBeDefined();
      
      // Title (high priority) should be positioned before image
      expect(titleElement.bounds.y).toBeLessThanOrEqual(imageElement.bounds.y);
    });

    it('should provide layout recommendations', async () => {
      const input = {
        elements: Array.from({ length: 12 }, (_, i) => ({
          id: `item${i + 1}`,
          type: 'div',
          content: { text: `Item ${i + 1}` }
        })),
        bounds: { x: 0, y: 0, width: 800, height: 400 }
      };

      const response = await (autoLayoutTool as any).invoke(input);
      const result = JSON.parse(response.content[0].text);
      
      expect(result.success).toBe(true);
      expect(result.recommendations.recommendedDirection).toBe('grid'); // Many elements
      expect(result.recommendations.reasoning).toContain(
        result.recommendations.reasoning.find((r: string) => r.includes('grid'))
      );
    });
  });

  describe('measureTool', () => {
    it('should calculate comprehensive layout metrics', async () => {
      const mockLayout = {
        type: 'flex',
        config: {
          direction: 'row',
          wrap: 'nowrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px'
        },
        elements: [
          { id: 'item1', flexGrow: 1 },
          { id: 'item2', flexGrow: 2 }
        ],
        bounds: { x: 0, y: 0, width: 600, height: 200 },
        computedFlex: {
          mainAxis: 'horizontal',
          crossAxis: 'vertical',
          elementPositions: [
            {
              id: 'item1',
              bounds: { x: 0, y: 0, width: 192, height: 200 },
              flexValues: { grow: 1, shrink: 1, basis: 0 }
            },
            {
              id: 'item2',
              bounds: { x: 408, y: 0, width: 192, height: 200 },
              flexValues: { grow: 2, shrink: 1, basis: 0 }
            }
          ]
        }
      };

      const elements = [
        {
          id: 'item1',
          type: 'div',
          bounds: { x: 0, y: 0, width: 192, height: 200 },
          content: { text: 'First item', onClick: true }
        },
        {
          id: 'item2',
          type: 'div',
          bounds: { x: 408, y: 0, width: 192, height: 200 },
          content: { text: 'Second item with more content' }
        }
      ];

      const input = {
        layout: mockLayout,
        elements,
        includeQualityReport: true,
        includeAccessibilityCheck: true,
        includePerformanceAnalysis: true
      };

      const response = await (measureTool as any).invoke(input);
      const result = JSON.parse(response.content[0].text);
      
      expect(result.success).toBe(true);
      expect(result.metrics).toBeDefined();
      expect(result.metrics.elementCount).toBe(2);
      expect(result.metrics.totalBounds).toBeDefined();
      
      expect(result.qualityReport).toBeDefined();
      expect(result.qualityReport.overallScore).toBeGreaterThanOrEqual(0);
      expect(result.qualityReport.overallScore).toBeLessThanOrEqual(100);
      expect(result.qualityReport.category).toMatch(/^(excellent|good|fair|poor)$/);
      
      expect(result.performanceAnalysis).toBeDefined();
      expect(result.performanceAnalysis.renderingComplexity).toBeDefined();
      expect(result.performanceAnalysis.memoryFootprint).toBeDefined();
      
      expect(result.accessibilityAnalysis).toBeDefined();
      expect(result.accessibilityAnalysis.touchTargetCompliance).toBeDefined();
      expect(result.accessibilityAnalysis.keyboardNavigationFlow).toBeDefined();
      
      expect(result.analysisPerformance).toBeDefined();
      expect(result.analysisPerformance.duration).toBeGreaterThan(0);
    });

    it('should detect accessibility issues', async () => {
      const mockLayout = {
        type: 'grid',
        config: { columns: '1fr 1fr', rows: '1fr', gap: '0' },
        elements: [{ id: 'small-button' }],
        bounds: { x: 0, y: 0, width: 400, height: 200 }
      };

      const elements = [
        {
          id: 'small-button',
          type: 'div',
          bounds: { x: 0, y: 0, width: 20, height: 20 }, // Too small for touch
          content: { onClick: true, text: 'Click' }
        }
      ];

      const input = {
        layout: mockLayout,
        elements,
        includeAccessibilityCheck: true
      };

      const response = await (measureTool as any).invoke(input);
      const result = JSON.parse(response.content[0].text);
      
      expect(result.success).toBe(true);
      expect(result.accessibilityAnalysis.touchTargetCompliance.complianceRate).toBeLessThan(1);
      expect(result.accessibilityAnalysis.touchTargetCompliance.nonCompliant).toHaveLength(1);
    });
  });

  describe('tool error handling', () => {
    it('should handle malformed input gracefully', async () => {
      const invalidInput = {
        // Missing required fields
        config: null,
        bounds: 'invalid'
      };

      const response = await (createGridTool as any).invoke(invalidInput);
      const result = JSON.parse(response.content[0].text);
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should provide meaningful error messages', async () => {
      const input = {
        config: {
          columns: 'invalid-value-that-cannot-be-parsed',
          rows: 'auto'
        },
        elements: [{ id: 'test' }],
        bounds: { x: 0, y: 0, width: 400, height: 300 }
      };

      const response = await (createGridTool as any).invoke(input);
      const result = JSON.parse(response.content[0].text);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('validation');
      expect(result.details).toBeDefined();
    });
  });
});