import { GridEngine } from '../../src/util/gridEngine.js';
import { GridConfig, GridElement, Rectangle } from '../../src/types/layout.js';
import { PerformanceMonitor } from '../../src/util/performance.js';

describe('GridEngine', () => {
  const defaultBounds: Rectangle = { x: 0, y: 0, width: 600, height: 400 };
  const monitor = new PerformanceMonitor();

  beforeEach(() => {
    monitor.start('test');
  });

  describe('createLayout', () => {
    it('should create a simple 2x2 grid layout', () => {
      const config: GridConfig = {
        columns: '1fr 1fr',
        rows: '1fr 1fr',
        gap: '10px',
        autoFlow: 'row'
      };

      const elements: GridElement[] = [
        { id: 'item1' },
        { id: 'item2' },
        { id: 'item3' },
        { id: 'item4' }
      ];

      const layout = GridEngine.createLayout(config, elements, defaultBounds, monitor);

      expect(layout.type).toBe('grid');
      expect(layout.config).toEqual(config);
      expect(layout.elements).toHaveLength(4);
      expect(layout.bounds).toEqual(defaultBounds);
      expect(layout.computedGrid).toBeDefined();
    });

    it('should handle grid areas correctly', () => {
      const config: GridConfig = {
        columns: '1fr 1fr',
        rows: '100px 1fr',
        gap: '0',
        autoFlow: 'row',
        areas: [
          ['header', 'header'],
          ['sidebar', 'main']
        ]
      };

      const elements: GridElement[] = [
        { id: 'header', gridArea: 'header' },
        { id: 'sidebar', gridArea: 'sidebar' },
        { id: 'main', gridArea: 'main' }
      ];

      const layout = GridEngine.createLayout(config, elements, defaultBounds, monitor);

      expect(layout.computedGrid?.areas).toBeDefined();
      expect(Object.keys(layout.computedGrid?.areas || {})).toContain('header');
      expect(Object.keys(layout.computedGrid?.areas || {})).toContain('sidebar');
      expect(Object.keys(layout.computedGrid?.areas || {})).toContain('main');
    });

    it('should handle repeat() syntax', () => {
      const config: GridConfig = {
        columns: 'repeat(3, 1fr)',
        rows: 'repeat(2, 100px)',
        gap: '0',
        autoFlow: 'row'
      };

      const elements: GridElement[] = [
        { id: 'item1' },
        { id: 'item2' },
        { id: 'item3' }
      ];

      expect(() => {
        GridEngine.createLayout(config, elements, defaultBounds, monitor);
      }).not.toThrow();
    });

    it('should handle minmax() syntax', () => {
      const config: GridConfig = {
        columns: 'minmax(100px, 1fr) 200px',
        rows: 'auto 1fr',
        gap: '0',
        autoFlow: 'row'
      };

      const elements: GridElement[] = [
        { id: 'item1' },
        { id: 'item2' }
      ];

      expect(() => {
        GridEngine.createLayout(config, elements, defaultBounds, monitor);
      }).not.toThrow();
    });

    it('should validate invalid grid configuration', () => {
      const config: GridConfig = {
        columns: '', // Invalid empty columns
        rows: '1fr',
        gap: '0',
        autoFlow: 'row'
      };

      const elements: GridElement[] = [
        { id: 'item1' }
      ];

      expect(() => {
        GridEngine.createLayout(config, elements, defaultBounds, monitor);
      }).toThrow();
    });

    it('should handle explicit grid line references', () => {
      const config: GridConfig = {
        columns: '1fr 1fr 1fr',
        rows: '100px 100px',
        gap: '0',
        autoFlow: 'row'
      };

      const elements: GridElement[] = [
        { 
          id: 'item1',
          gridColumnStart: 1,
          gridColumnEnd: 3,
          gridRowStart: 1,
          gridRowEnd: 2
        }
      ];

      const layout = GridEngine.createLayout(config, elements, defaultBounds, monitor);
      expect(layout.elements[0].gridColumnStart).toBe(1);
      expect(layout.elements[0].gridColumnEnd).toBe(3);
    });
  });

  describe('calculateMetrics', () => {
    it('should calculate grid metrics correctly', () => {
      const config: GridConfig = {
        columns: '1fr 1fr',
        rows: '1fr 1fr',
        gap: '10px',
        autoFlow: 'row'
      };

      const elements: GridElement[] = [
        { id: 'item1' },
        { id: 'item2' }
      ];

      const layout = GridEngine.createLayout(config, elements, defaultBounds, monitor);
      const metrics = GridEngine.calculateMetrics(layout);

      expect(metrics.totalTracks).toBeGreaterThan(0);
      expect(metrics.usedAreas).toBeGreaterThanOrEqual(0);
      expect(metrics.elementOverlaps).toBeDefined();
      expect(metrics.emptyAreas).toBeGreaterThanOrEqual(0);
    });
  });

  describe('optimizeLayout', () => {
    it('should optimize layout by removing unused areas', () => {
      const config: GridConfig = {
        columns: '1fr 1fr',
        rows: '1fr 1fr',
        gap: '0',
        autoFlow: 'row',
        areas: [
          ['header', 'header'],
          ['unused', 'main']
        ]
      };

      const elements: GridElement[] = [
        { id: 'header', gridArea: 'header' },
        { id: 'main', gridArea: 'main' }
        // Note: 'unused' area is not used by any element
      ];

      const layout = GridEngine.createLayout(config, elements, defaultBounds, monitor);
      const optimized = GridEngine.optimizeLayout(layout);

      // Should remove unused area
      const areas = optimized.computedGrid?.areas || {};
      expect(Object.keys(areas)).not.toContain('unused');
      expect(Object.keys(areas)).toContain('header');
      expect(Object.keys(areas)).toContain('main');
    });
  });

  describe('parseGridTemplate edge cases', () => {
    it('should handle auto keyword', () => {
      const config: GridConfig = {
        columns: 'auto',
        rows: 'auto',
        gap: '0',
        autoFlow: 'row'
      };

      const elements: GridElement[] = [{ id: 'item1' }];

      expect(() => {
        GridEngine.createLayout(config, elements, defaultBounds, monitor);
      }).not.toThrow();
    });

    it('should handle named grid lines', () => {
      const config: GridConfig = {
        columns: '[start] 1fr [middle] 1fr [end]',
        rows: '[top] 100px [bottom]',
        gap: '0',
        autoFlow: 'row'
      };

      const elements: GridElement[] = [
        { 
          id: 'item1',
          gridColumnStart: 'start',
          gridColumnEnd: 'middle'
        }
      ];

      expect(() => {
        GridEngine.createLayout(config, elements, defaultBounds, monitor);
      }).not.toThrow();
    });

    it('should handle complex repeat patterns', () => {
      const config: GridConfig = {
        columns: 'repeat(auto-fit, minmax(200px, 1fr))',
        rows: 'auto',
        gap: '16px',
        autoFlow: 'row'
      };

      const elements: GridElement[] = [
        { id: 'item1' },
        { id: 'item2' },
        { id: 'item3' }
      ];

      expect(() => {
        GridEngine.createLayout(config, elements, defaultBounds, monitor);
      }).not.toThrow();
    });
  });

  describe('performance', () => {
    it('should handle large numbers of elements efficiently', () => {
      const config: GridConfig = {
        columns: 'repeat(10, 1fr)',
        rows: 'repeat(10, 1fr)',
        gap: '1px',
        autoFlow: 'row'
      };

      // Create 100 grid items
      const elements: GridElement[] = Array.from({ length: 100 }, (_, i) => ({
        id: `item${i + 1}`
      }));

      const startTime = performance.now();
      const layout = GridEngine.createLayout(config, elements, defaultBounds, monitor);
      const endTime = performance.now();

      expect(layout.elements).toHaveLength(100);
      expect(endTime - startTime).toBeLessThan(100); // Should complete within 100ms
    });

    it('should handle complex grid areas without performance issues', () => {
      // Create a complex 5x5 grid with various areas
      const areas = [
        ['header', 'header', 'header', 'header', 'header'],
        ['nav', 'main', 'main', 'main', 'ads'],
        ['nav', 'main', 'main', 'main', 'ads'],
        ['nav', 'content', 'content', 'sidebar', 'ads'],
        ['footer', 'footer', 'footer', 'footer', 'footer']
      ];

      const config: GridConfig = {
        columns: '150px 1fr 1fr 200px 100px',
        rows: '80px 1fr 1fr 1fr 60px',
        areas,
        gap: '10px',
        autoFlow: 'row'
      };

      const elements: GridElement[] = [
        { id: 'header', gridArea: 'header' },
        { id: 'nav', gridArea: 'nav' },
        { id: 'main', gridArea: 'main' },
        { id: 'content', gridArea: 'content' },
        { id: 'sidebar', gridArea: 'sidebar' },
        { id: 'ads', gridArea: 'ads' },
        { id: 'footer', gridArea: 'footer' }
      ];

      const startTime = performance.now();
      const layout = GridEngine.createLayout(config, elements, defaultBounds, monitor);
      const endTime = performance.now();

      expect(layout.computedGrid?.areas).toBeDefined();
      expect(Object.keys(layout.computedGrid?.areas || {})).toHaveLength(7);
      expect(endTime - startTime).toBeLessThan(50); // Should be very fast for this complexity
    });
  });
});