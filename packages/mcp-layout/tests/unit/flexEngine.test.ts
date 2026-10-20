import { FlexEngine } from '../../src/util/flexEngine.js';
import { FlexConfig, FlexElement, Rectangle } from '../../src/types/layout.js';
import { PerformanceMonitor } from '../../src/util/performance.js';

describe('FlexEngine', () => {
  const defaultBounds: Rectangle = { x: 0, y: 0, width: 600, height: 400 };
  const monitor = new PerformanceMonitor();

  beforeEach(() => {
    monitor.start('test');
  });

  describe('createLayout', () => {
    it('should create a simple row flexbox layout', () => {
      const config: FlexConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        alignContent: 'stretch',
        gap: '0'
      };

      const elements: FlexElement[] = [
        { id: 'item1', flexGrow: 0, flexShrink: 1, flexBasis: 'auto' },
        { id: 'item2', flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
        { id: 'item3', flexGrow: 0, flexShrink: 1, flexBasis: 'auto' }
      ];

      const layout = FlexEngine.createLayout(config, elements, defaultBounds, monitor);

      expect(layout.type).toBe('flex');
      expect(layout.config).toEqual(config);
      expect(layout.elements).toHaveLength(3);
      expect(layout.computedFlex?.mainAxis).toBe('horizontal');
      expect(layout.computedFlex?.crossAxis).toBe('vertical');
    });

    it('should create a column flexbox layout', () => {
      const config: FlexConfig = {
        direction: 'column',
        wrap: 'nowrap',
        justifyContent: 'space-between',
        alignItems: 'center',
        alignContent: 'stretch',
        gap: '10px'
      };

      const elements: FlexElement[] = [
        { id: 'item1', flexGrow: 0, flexShrink: 1, flexBasis: 'auto' },
        { id: 'item2', flexGrow: 0, flexShrink: 1, flexBasis: 'auto' },
        { id: 'item3', flexGrow: 0, flexShrink: 1, flexBasis: 'auto' }
      ];

      const layout = FlexEngine.createLayout(config, elements, defaultBounds, monitor);

      expect(layout.computedFlex?.mainAxis).toBe('vertical');
      expect(layout.computedFlex?.crossAxis).toBe('horizontal');
      expect(layout.config.direction).toBe('column');
    });

    it('should handle flex-grow distribution correctly', () => {
      const config: FlexConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        alignContent: 'stretch',
        gap: '0'
      };

      const elements: FlexElement[] = [
        { id: 'item1', flexGrow: 1, flexShrink: 1, flexBasis: 100 },
        { id: 'item2', flexGrow: 2, flexShrink: 1, flexBasis: 100 },
        { id: 'item3', flexGrow: 1, flexShrink: 1, flexBasis: 100 }
      ];

      const layout = FlexEngine.createLayout(config, elements, defaultBounds, monitor);
      const positions = layout.computedFlex?.elementPositions || [];

      expect(positions).toHaveLength(3);
      
      // Item2 should be larger due to higher flex-grow
      const item1Width = positions.find(p => p.id === 'item1')?.bounds.width || 0;
      const item2Width = positions.find(p => p.id === 'item2')?.bounds.width || 0;
      const item3Width = positions.find(p => p.id === 'item3')?.bounds.width || 0;

      expect(item2Width).toBeGreaterThan(item1Width);
      expect(item2Width).toBeGreaterThan(item3Width);
      expect(item1Width).toBe(item3Width); // Same flex-grow
    });

    it('should handle flex-shrink correctly when space is limited', () => {
      const config: FlexConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        alignContent: 'stretch',
        gap: '0'
      };

      const elements: FlexElement[] = [
        { id: 'item1', flexGrow: 0, flexShrink: 1, flexBasis: 300 },
        { id: 'item2', flexGrow: 0, flexShrink: 2, flexBasis: 300 }, // Shrinks more
        { id: 'item3', flexGrow: 0, flexShrink: 1, flexBasis: 300 }
      ];

      // Container is smaller than total flex-basis (600 < 900)
      const smallBounds: Rectangle = { x: 0, y: 0, width: 500, height: 100 };
      const layout = FlexEngine.createLayout(config, elements, smallBounds, monitor);
      const positions = layout.computedFlex?.elementPositions || [];

      expect(positions).toHaveLength(3);

      const item1Width = positions.find(p => p.id === 'item1')?.bounds.width || 0;
      const item2Width = positions.find(p => p.id === 'item2')?.bounds.width || 0;
      const item3Width = positions.find(p => p.id === 'item3')?.bounds.width || 0;

      // Item2 should be smaller due to higher flex-shrink
      expect(item2Width).toBeLessThan(item1Width);
      expect(item2Width).toBeLessThan(item3Width);
      expect(item1Width).toBe(item3Width); // Same flex-shrink
    });

    it('should handle flex-wrap correctly', () => {
      const config: FlexConfig = {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        alignContent: 'flex-start',
        gap: '10px'
      };

      const elements: FlexElement[] = [
        { id: 'item1', flexGrow: 0, flexShrink: 0, flexBasis: 200 },
        { id: 'item2', flexGrow: 0, flexShrink: 0, flexBasis: 200 },
        { id: 'item3', flexGrow: 0, flexShrink: 0, flexBasis: 200 },
        { id: 'item4', flexGrow: 0, flexShrink: 0, flexBasis: 200 }
      ];

      // Container width is 400, but we have 4 items of 200px + gaps
      // Should wrap to multiple lines
      const layout = FlexEngine.createLayout(config, elements, defaultBounds, monitor);
      const positions = layout.computedFlex?.elementPositions || [];

      expect(positions).toHaveLength(4);
      
      // Check that some items are on a second line (different Y positions)
      const yPositions = positions.map(p => p.bounds.y);
      const uniqueYPositions = [...new Set(yPositions)];
      expect(uniqueYPositions.length).toBeGreaterThan(1);
    });

    it('should handle justify-content variations', () => {
      const testJustifyContent = (justifyContent: FlexConfig['justifyContent']) => {
        const config: FlexConfig = {
          direction: 'row',
          wrap: 'nowrap',
          justifyContent,
          alignItems: 'stretch',
          alignContent: 'stretch',
          gap: '0'
        };

        const elements: FlexElement[] = [
          { id: 'item1', flexGrow: 0, flexShrink: 1, flexBasis: 100 },
          { id: 'item2', flexGrow: 0, flexShrink: 1, flexBasis: 100 }
        ];

        const layout = FlexEngine.createLayout(config, elements, defaultBounds, monitor);
        const positions = layout.computedFlex?.elementPositions || [];

        expect(positions).toHaveLength(2);
        return positions;
      };

      // Test different justify-content values
      const flexStartPositions = testJustifyContent('flex-start');
      const centerPositions = testJustifyContent('center');
      const flexEndPositions = testJustifyContent('flex-end');
      const spaceBetweenPositions = testJustifyContent('space-between');

      // Verify positions are different
      const getFirstItemX = (positions: any[]) => positions.find(p => p.id === 'item1')?.bounds.x || 0;

      expect(getFirstItemX(centerPositions)).toBeGreaterThan(getFirstItemX(flexStartPositions));
      expect(getFirstItemX(flexEndPositions)).toBeGreaterThan(getFirstItemX(centerPositions));
    });

    it('should respect min/max constraints', () => {
      const config: FlexConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        alignContent: 'stretch',
        gap: '0'
      };

      const elements: FlexElement[] = [
        { 
          id: 'item1',
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 'auto',
          minWidth: 150,
          maxWidth: 200
        },
        { 
          id: 'item2',
          flexGrow: 1,
          flexShrink: 1,
          flexBasis: 'auto'
        }
      ];

      const layout = FlexEngine.createLayout(config, elements, defaultBounds, monitor);
      const positions = layout.computedFlex?.elementPositions || [];

      const item1 = positions.find(p => p.id === 'item1');
      expect(item1?.bounds.width).toBeGreaterThanOrEqual(150);
      expect(item1?.bounds.width).toBeLessThanOrEqual(200);
    });

    it('should handle element ordering correctly', () => {
      const config: FlexConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        alignContent: 'stretch',
        gap: '0'
      };

      const elements: FlexElement[] = [
        { id: 'item1', flexGrow: 0, flexShrink: 1, flexBasis: 'auto', order: 3 },
        { id: 'item2', flexGrow: 0, flexShrink: 1, flexBasis: 'auto', order: 1 },
        { id: 'item3', flexGrow: 0, flexShrink: 1, flexBasis: 'auto', order: 2 }
      ];

      const layout = FlexEngine.createLayout(config, elements, defaultBounds, monitor);
      const positions = layout.computedFlex?.elementPositions || [];

      // Should be ordered by order property: item2, item3, item1
      positions.sort((a, b) => a.bounds.x - b.bounds.x);
      expect(positions[0].id).toBe('item2');
      expect(positions[1].id).toBe('item3');
      expect(positions[2].id).toBe('item1');
    });
  });

  describe('calculateMetrics', () => {
    it('should calculate flex metrics correctly', () => {
      const config: FlexConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        alignContent: 'stretch',
        gap: '0'
      };

      const elements: FlexElement[] = [
        { id: 'item1', flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
        { id: 'item2', flexGrow: 2, flexShrink: 0.5, flexBasis: 'auto' }
      ];

      const layout = FlexEngine.createLayout(config, elements, defaultBounds, monitor);
      const metrics = FlexEngine.calculateMetrics(layout);

      expect(metrics.totalElements).toBe(2);
      expect(metrics.flexGrowTotal).toBe(3);
      expect(metrics.flexShrinkTotal).toBe(1.5);
      expect(metrics.lineCount).toBeGreaterThanOrEqual(1);
      expect(metrics.averageElementSize).toBeGreaterThan(0);
    });
  });

  describe('optimizeLayout', () => {
    it('should optimize layout by removing unnecessary elements', () => {
      const config: FlexConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        alignContent: 'stretch',
        gap: '0'
      };

      const elements: FlexElement[] = [
        { id: 'item1', flexGrow: 1, flexShrink: 1, flexBasis: 'auto' },
        { 
          id: 'empty-item',
          flexGrow: 0,
          flexShrink: 1,
          flexBasis: 'auto'
          // No content, default flex values
        },
        { id: 'item3', flexGrow: 1, flexShrink: 1, flexBasis: 'auto', content: { text: 'Some content' } }
      ];

      const layout = FlexEngine.createLayout(config, elements, defaultBounds, monitor);
      const optimized = FlexEngine.optimizeLayout(layout);

      // Should keep elements with non-default flex values or content
      expect(optimized.elements.length).toBeLessThanOrEqual(layout.elements.length);
      expect(optimized.elements.find(el => el.id === 'item1')).toBeDefined(); // Has flex-grow
      expect(optimized.elements.find(el => el.id === 'item3')).toBeDefined(); // Has content
    });
  });

  describe('performance', () => {
    it('should handle many flex items efficiently', () => {
      const config: FlexConfig = {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        alignContent: 'flex-start',
        gap: '5px'
      };

      // Create 100 flex items
      const elements: FlexElement[] = Array.from({ length: 100 }, (_, i) => ({
        id: `item${i + 1}`,
        flexGrow: Math.random(),
        flexShrink: Math.random(),
        flexBasis: 50 + Math.random() * 100
      }));

      const startTime = performance.now();
      const layout = FlexEngine.createLayout(config, elements, defaultBounds, monitor);
      const endTime = performance.now();

      expect(layout.elements).toHaveLength(100);
      expect(layout.computedFlex?.elementPositions).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(200); // Should complete within 200ms
    });

    it('should handle complex wrapping scenarios efficiently', () => {
      const config: FlexConfig = {
        direction: 'row',
        wrap: 'wrap',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        alignContent: 'space-around',
        gap: '10px'
      };

      const elements: FlexElement[] = Array.from({ length: 50 }, (_, i) => ({
        id: `item${i + 1}`,
        flexGrow: 0,
        flexShrink: 0,
        flexBasis: 80 + (i % 5) * 20, // Varying sizes to create complex wrapping
        minWidth: 60,
        maxWidth: 150
      }));

      const startTime = performance.now();
      const layout = FlexEngine.createLayout(config, elements, defaultBounds, monitor);
      const endTime = performance.now();

      expect(layout.computedFlex?.elementPositions).toHaveLength(50);
      expect(endTime - startTime).toBeLessThan(150); // Complex wrapping should still be fast
    });
  });

  describe('edge cases', () => {
    it('should handle zero-width container', () => {
      const config: FlexConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        alignContent: 'stretch',
        gap: '0'
      };

      const elements: FlexElement[] = [
        { id: 'item1', flexGrow: 0, flexShrink: 1, flexBasis: 100 }
      ];

      const zeroWidthBounds: Rectangle = { x: 0, y: 0, width: 0, height: 100 };

      expect(() => {
        FlexEngine.createLayout(config, elements, zeroWidthBounds, monitor);
      }).not.toThrow();
    });

    it('should handle single element', () => {
      const config: FlexConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'center',
        alignItems: 'center',
        alignContent: 'stretch',
        gap: '0'
      };

      const elements: FlexElement[] = [
        { id: 'single-item', flexGrow: 0, flexShrink: 1, flexBasis: 200 }
      ];

      const layout = FlexEngine.createLayout(config, elements, defaultBounds, monitor);
      const positions = layout.computedFlex?.elementPositions || [];

      expect(positions).toHaveLength(1);
      expect(positions[0].bounds.width).toBe(200);
    });

    it('should handle all elements with flex-basis: 0', () => {
      const config: FlexConfig = {
        direction: 'row',
        wrap: 'nowrap',
        justifyContent: 'flex-start',
        alignItems: 'stretch',
        alignContent: 'stretch',
        gap: '0'
      };

      const elements: FlexElement[] = [
        { id: 'item1', flexGrow: 1, flexShrink: 1, flexBasis: 0 },
        { id: 'item2', flexGrow: 2, flexShrink: 1, flexBasis: 0 },
        { id: 'item3', flexGrow: 1, flexShrink: 1, flexBasis: 0 }
      ];

      const layout = FlexEngine.createLayout(config, elements, defaultBounds, monitor);
      const positions = layout.computedFlex?.elementPositions || [];

      expect(positions).toHaveLength(3);
      
      // Should distribute space based on flex-grow ratios
      const totalWidth = positions.reduce((sum, pos) => sum + pos.bounds.width, 0);
      expect(totalWidth).toBeCloseTo(defaultBounds.width, 1);
    });
  });
});