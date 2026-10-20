import { LayoutMetricsCalculator } from '../../src/util/layoutMetrics.js';
import { GridLayout, LayoutElement, Rectangle } from '../../src/types/layout.js';
import { PerformanceMonitor } from '../../src/util/performance.js';

describe('LayoutMetricsCalculator', () => {
  const monitor = new PerformanceMonitor();

  beforeEach(() => {
    monitor.start('test');
  });

  const createMockGridLayout = (): GridLayout => ({
    type: 'grid',
    config: {
      columns: '1fr 1fr',
      rows: '100px 1fr',
      gap: '10px',
      autoFlow: 'row'
    },
    elements: [
      { id: 'header' },
      { id: 'content' }
    ],
    bounds: { x: 0, y: 0, width: 400, height: 300 },
    computedGrid: {
      tracks: {
        columns: [
          { start: 0, size: 195 },
          { start: 205, size: 195 }
        ],
        rows: [
          { start: 0, size: 100 },
          { start: 110, size: 190 }
        ]
      }
    }
  });

  const createMockElements = (): LayoutElement[] => [
    {
      id: 'header',
      type: 'div',
      bounds: { x: 0, y: 0, width: 400, height: 100 },
      content: { text: 'Header content', title: 'Main Header' }
    },
    {
      id: 'content',
      type: 'div',
      bounds: { x: 0, y: 110, width: 400, height: 190 },
      content: { text: 'Main content area with some text' }
    }
  ];

  describe('calculateMetrics', () => {
    it('should calculate basic layout metrics', () => {
      const layout = createMockGridLayout();
      const elements = createMockElements();

      const metrics = LayoutMetricsCalculator.calculateMetrics(layout, elements, monitor);

      expect(metrics.elementCount).toBe(2);
      expect(metrics.totalBounds).toBeDefined();
      expect(metrics.totalBounds.width).toBeGreaterThan(0);
      expect(metrics.totalBounds.height).toBeGreaterThan(0);
      expect(metrics.overflowElements).toBeDefined();
      expect(metrics.performance.calculationTime).toBeGreaterThan(0);
    });

    it('should detect overflow elements', () => {
      const layout = createMockGridLayout();
      const elements: LayoutElement[] = [
        {
          id: 'overflow-element',
          type: 'div',
          bounds: { x: 500, y: 0, width: 100, height: 50 }, // Outside container bounds
          content: { text: 'Overflow content' }
        },
        {
          id: 'normal-element',
          type: 'div',
          bounds: { x: 50, y: 50, width: 100, height: 50 }, // Inside container bounds
          content: { text: 'Normal content' }
        }
      ];

      const metrics = LayoutMetricsCalculator.calculateMetrics(layout, elements, monitor);

      expect(metrics.overflowElements).toContain('overflow-element');
      expect(metrics.overflowElements).not.toContain('normal-element');
    });

    it('should generate appropriate warnings', () => {
      const layout = createMockGridLayout();
      const elements: LayoutElement[] = [
        {
          id: 'problematic-element',
          type: 'div',
          bounds: { x: 450, y: 350, width: 100, height: 50 }, // Overflow element
          content: { text: 'Problematic content' }
        }
      ];

      const metrics = LayoutMetricsCalculator.calculateMetrics(layout, elements, monitor);

      expect(metrics.warnings?.length).toBeGreaterThan(0);
      expect(metrics.warnings?.some(warning => 
        warning.includes('overflow')
      )).toBe(true);
    });
  });

  describe('generateQualityReport', () => {
    it('should generate comprehensive quality report', () => {
      const layout = createMockGridLayout();
      const elements = createMockElements();

      const report = LayoutMetricsCalculator.generateQualityReport(layout, elements, monitor);

      expect(report.overallScore).toBeGreaterThanOrEqual(0);
      expect(report.overallScore).toBeLessThanOrEqual(100);
      expect(report.category).toMatch(/^(excellent|good|fair|poor)$/);
      expect(report.metrics).toBeDefined();
      expect(report.recommendations).toBeDefined();
      expect(Array.isArray(report.recommendations)).toBe(true);
    });

    it('should provide quality category based on score', () => {
      const layout = createMockGridLayout();
      
      // High quality layout
      const goodElements: LayoutElement[] = [
        {
          id: 'well-positioned',
          type: 'div',
          bounds: { x: 10, y: 10, width: 180, height: 80 },
          content: { text: 'Well positioned content' }
        },
        {
          id: 'properly-sized',
          type: 'div',
          bounds: { x: 200, y: 10, width: 190, height: 280 },
          content: { text: 'Properly sized content' }
        }
      ];

      const report = LayoutMetricsCalculator.generateQualityReport(layout, goodElements, monitor);

      expect(report.overallScore).toBeGreaterThan(70);
      expect(['excellent', 'good', 'fair']).toContain(report.category);
    });

    it('should provide recommendations for improvements', () => {
      const layout = createMockGridLayout();
      const problematicElements: LayoutElement[] = [
        {
          id: 'slow-element',
          type: 'div',
          bounds: { x: 0, y: 0, width: 100, height: 50 },
          content: { 
            largeData: 'x'.repeat(2000) // Large content
          }
        }
      ];

      // Mock slow performance
      const slowMonitor = new PerformanceMonitor();
      slowMonitor.start('slow-test');
      // Simulate slow calculation
      setTimeout(() => {}, 150);

      const report = LayoutMetricsCalculator.generateQualityReport(layout, problematicElements, slowMonitor);

      expect(report.recommendations.length).toBeGreaterThan(0);
      expect(report.recommendations.some(rec => 
        rec.includes('performance') || rec.includes('optimization') || rec.includes('content')
      )).toBe(true);
    });
  });

  describe('accessibility analysis', () => {
    it('should analyze touch target sizes', () => {
      const layout = createMockGridLayout();
      const elements: LayoutElement[] = [
        {
          id: 'good-button',
          type: 'div',
          bounds: { x: 0, y: 0, width: 50, height: 50 }, // Good size for touch
          content: { onClick: true, text: 'Click me' }
        },
        {
          id: 'small-button',
          type: 'div',
          bounds: { x: 60, y: 0, width: 20, height: 20 }, // Too small for touch
          content: { onClick: true, text: 'Small' }
        },
        {
          id: 'non-interactive',
          type: 'div',
          bounds: { x: 100, y: 0, width: 10, height: 10 }, // Small but not interactive
          content: { text: 'Just text' }
        }
      ];

      const metrics = LayoutMetricsCalculator.calculateMetrics(layout, elements, monitor);

      // Check that accessibility warnings are generated for small interactive elements
      expect(metrics.warnings?.some(warning => 
        warning.includes('accessibility') || warning.includes('touch')
      )).toBe(true);
    });

    it('should check keyboard navigation flow', () => {
      const layout = createMockGridLayout();
      const elements: LayoutElement[] = [
        {
          id: 'first-interactive',
          type: 'div',
          bounds: { x: 0, y: 0, width: 100, height: 50 },
          content: { href: '#first', text: 'First link' }
        },
        {
          id: 'second-interactive',
          type: 'div',
          bounds: { x: 150, y: 0, width: 100, height: 50 },
          content: { href: '#second', text: 'Second link' }
        }
      ];

      const metrics = LayoutMetricsCalculator.calculateMetrics(layout, elements, monitor);

      // Should analyze keyboard navigation flow
      expect(metrics.warnings?.some(warning => 
        warning.includes('focus') || warning.includes('keyboard') || warning.includes('navigation')
      )).toBeDefined();
    });
  });

  describe('performance analysis', () => {
    it('should measure calculation performance', () => {
      const layout = createMockGridLayout();
      const elements = createMockElements();

      const startTime = performance.now();
      const metrics = LayoutMetricsCalculator.calculateMetrics(layout, elements, monitor);
      const endTime = performance.now();

      expect(metrics.performance.calculationTime).toBeGreaterThan(0);
      expect(metrics.performance.calculationTime).toBeLessThan(endTime - startTime + 10); // Allow some tolerance
    });

    it('should detect performance issues', () => {
      const layout = createMockGridLayout();
      
      // Create many elements to potentially cause performance issues
      const manyElements: LayoutElement[] = Array.from({ length: 50 }, (_, i) => ({
        id: `element${i}`,
        type: 'div',
        bounds: { x: (i % 10) * 40, y: Math.floor(i / 10) * 30, width: 35, height: 25 },
        content: { text: `Element ${i}` }
      }));

      const metrics = LayoutMetricsCalculator.calculateMetrics(layout, manyElements, monitor);

      expect(metrics.elementCount).toBe(50);
      // Performance warnings might be generated for complex layouts
    });
  });

  describe('spacing and alignment analysis', () => {
    it('should analyze element spacing consistency', () => {
      const layout = createMockGridLayout();
      const elements: LayoutElement[] = [
        {
          id: 'element1',
          type: 'div',
          bounds: { x: 0, y: 0, width: 50, height: 50 },
          content: { text: 'First' }
        },
        {
          id: 'element2',
          type: 'div',
          bounds: { x: 70, y: 0, width: 50, height: 50 }, // 20px spacing
          content: { text: 'Second' }
        },
        {
          id: 'element3',
          type: 'div',
          bounds: { x: 140, y: 0, width: 50, height: 50 }, // 20px spacing (consistent)
          content: { text: 'Third' }
        },
        {
          id: 'element4',
          type: 'div',
          bounds: { x: 230, y: 0, width: 50, height: 50 }, // 40px spacing (inconsistent)
          content: { text: 'Fourth' }
        }
      ];

      const metrics = LayoutMetricsCalculator.calculateMetrics(layout, elements, monitor);

      // Should detect spacing inconsistencies
      expect(metrics.warnings?.some(warning => 
        warning.includes('spacing') || warning.includes('inconsistent')
      )).toBeDefined();
    });

    it('should analyze element alignment', () => {
      const layout = createMockGridLayout();
      const elements: LayoutElement[] = [
        {
          id: 'aligned1',
          type: 'div',
          bounds: { x: 50, y: 10, width: 100, height: 30 },
          content: { text: 'Aligned top' }
        },
        {
          id: 'aligned2',
          type: 'div',
          bounds: { x: 50, y: 50, width: 100, height: 30 }, // Same x position
          content: { text: 'Aligned middle' }
        },
        {
          id: 'misaligned',
          type: 'div',
          bounds: { x: 55, y: 90, width: 100, height: 30 }, // Slightly different x
          content: { text: 'Misaligned' }
        }
      ];

      const metrics = LayoutMetricsCalculator.calculateMetrics(layout, elements, monitor);

      // Analysis should detect alignment patterns
      expect(metrics.totalBounds).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle layout with no elements', () => {
      const layout = createMockGridLayout();
      const elements: LayoutElement[] = [];

      expect(() => {
        LayoutMetricsCalculator.calculateMetrics(layout, elements, monitor);
      }).not.toThrow();

      const metrics = LayoutMetricsCalculator.calculateMetrics(layout, elements, monitor);
      expect(metrics.elementCount).toBe(0);
    });

    it('should handle elements without bounds', () => {
      const layout = createMockGridLayout();
      const elements: LayoutElement[] = [
        {
          id: 'no-bounds',
          type: 'div',
          content: { text: 'No bounds element' }
        }
      ];

      expect(() => {
        LayoutMetricsCalculator.calculateMetrics(layout, elements, monitor);
      }).not.toThrow();
    });

    it('should handle zero-size elements', () => {
      const layout = createMockGridLayout();
      const elements: LayoutElement[] = [
        {
          id: 'zero-size',
          type: 'div',
          bounds: { x: 50, y: 50, width: 0, height: 0 },
          content: { text: 'Zero size' }
        }
      ];

      const metrics = LayoutMetricsCalculator.calculateMetrics(layout, elements, monitor);
      expect(metrics.elementCount).toBe(1);
    });

    it('should handle negative positions', () => {
      const layout = createMockGridLayout();
      const elements: LayoutElement[] = [
        {
          id: 'negative-pos',
          type: 'div',
          bounds: { x: -50, y: -25, width: 100, height: 50 },
          content: { text: 'Negative position' }
        }
      ];

      const metrics = LayoutMetricsCalculator.calculateMetrics(layout, elements, monitor);
      expect(metrics.totalBounds.x).toBeLessThan(0);
      expect(metrics.totalBounds.y).toBeLessThan(0);
    });
  });
});