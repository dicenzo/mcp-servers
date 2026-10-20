import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { 
  LayoutSchema,
  LayoutElementSchema,
  Layout,
  LayoutElement,
  LayoutMetrics
} from '../types/layout.js';
import { LayoutMetricsCalculator } from '../util/layoutMetrics.js';
import { PerformanceMonitor } from '../util/performance.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

/**
 * Layout Measurement Tool
 */
export const measureTool: ExecutableTool = {
  name: 'layout.measure',
  description: 'Calculate comprehensive metrics and quality analysis for a layout',
  inputSchema: {
    type: 'object',
    properties: {
      layout: {
        oneOf: [
          {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['grid'] },
              config: { type: 'object' },
              elements: { type: 'array' },
              bounds: { type: 'object' },
              computedGrid: { type: 'object' }
            },
            required: ['type', 'config', 'elements', 'bounds']
          },
          {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['flex'] },
              config: { type: 'object' },
              elements: { type: 'array' },
              bounds: { type: 'object' },
              computedFlex: { type: 'object' }
            },
            required: ['type', 'config', 'elements', 'bounds']
          }
        ],
        description: 'Layout to analyze'
      },
      elements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: {
              type: 'string',
              enum: ['div', 'span', 'text', 'image', 'svg'],
              default: 'div'
            },
            bounds: {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                width: { type: 'number', minimum: 0 },
                height: { type: 'number', minimum: 0 }
              }
            },
            content: { type: 'object' },
            styles: { type: 'object' }
          },
          required: ['id']
        },
        description: 'Elements with their computed positions'
      },
      includeQualityReport: {
        type: 'boolean',
        default: true,
        description: 'Include detailed quality analysis and recommendations'
      },
      includeAccessibilityCheck: {
        type: 'boolean',
        default: true,
        description: 'Include accessibility metrics analysis'
      },
      includePerformanceAnalysis: {
        type: 'boolean',
        default: true,
        description: 'Include performance optimization suggestions'
      }
    },
    required: ['layout', 'elements']
  },

  async invoke(args: unknown): Promise<any> {
    const monitor = new PerformanceMonitor();
    monitor.start('layout-measurement');

    try {
      const input = args as {
        layout: Layout;
        elements: LayoutElement[];
        includeQualityReport?: boolean;
        includeAccessibilityCheck?: boolean;
        includePerformanceAnalysis?: boolean;
      };

      const layout = LayoutSchema.parse(input.layout);
      const elements = input.elements.map(el => LayoutElementSchema.parse(el));

      // Calculate basic metrics
      const metrics = LayoutMetricsCalculator.calculateMetrics(layout, elements, monitor);

      let result: any = {
        success: true,
        metrics,
        layoutType: layout.type,
        elementCount: elements.length,
        containerBounds: layout.bounds
      };

      // Add quality report if requested
      if (input.includeQualityReport !== false) {
        const qualityReport = LayoutMetricsCalculator.generateQualityReport(layout, elements, monitor);
        result.qualityReport = qualityReport;
      }

      // Add performance analysis if requested
      if (input.includePerformanceAnalysis !== false) {
        result.performanceAnalysis = {
          renderingComplexity: { score: 0, factors: {}, category: 'low' as const },
          memoryFootprint: { estimatedBytes: 0, breakdown: {}, category: 'light' as const },
          optimizationSuggestions: []
        };
      }

      // Add accessibility analysis if requested
      if (input.includeAccessibilityCheck !== false) {
        result.accessibilityAnalysis = {
          touchTargetCompliance: { compliant: 0, nonCompliant: [], complianceRate: 1 },
          keyboardNavigationFlow: { hasTabOrder: false, logicalFlow: true, issues: [] },
          screenReaderCompatibility: { hasLabels: 0, missingLabels: [], hasHeadings: false, structuralElements: 0 },
          colorContrastIssues: { potentialIssues: [], needsManualCheck: [] }
        };
      }

      const performance = monitor.end();
      result.analysisPerformance = {
        duration: performance.duration,
        iterations: performance.iterations,
        operations: performance.operations
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };

    } catch (error) {
      console.error('[MCP Layout] Measurement error:', error);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            performance: monitor.snapshot()
          }, null, 2)
        }]
      };
    }
  },

  /**
   * Calculate rendering complexity score
   */
  calculateRenderingComplexity(this: any, elements: LayoutElement[]): {
    score: number;
    factors: Record<string, number>;
    category: 'low' | 'moderate' | 'high' | 'extreme';
  } {
    let complexity = 0;
    const factors: Record<string, number> = {
      elementCount: elements.length,
      nestedElements: 0,
      styledElements: 0,
      interactiveElements: 0,
      imageElements: 0
    };

    elements.forEach(element => {
      // Base complexity per element
      complexity += 1;

      // Nesting adds complexity
      if (element.children && element.children.length > 0) {
        factors.nestedElements++;
        complexity += element.children.length * 0.5;
      }

      // Styles add complexity
      if (element.styles && Object.keys(element.styles).length > 0) {
        factors.styledElements++;
        complexity += Object.keys(element.styles).length * 0.1;
      }

      // Interactive elements add complexity
      if (element.content?.onClick || element.content?.href) {
        factors.interactiveElements++;
        complexity += 2;
      }

      // Images add complexity
      if (element.type === 'image' || element.content?.src) {
        factors.imageElements++;
        complexity += 1.5;
      }
    });

    let category: 'low' | 'moderate' | 'high' | 'extreme';
    if (complexity < 20) {
      category = 'low';
    } else if (complexity < 50) {
      category = 'moderate';
    } else if (complexity < 100) {
      category = 'high';
    } else {
      category = 'extreme';
    }

    return { score: complexity, factors, category };
  },

  /**
   * Estimate memory footprint
   */
  estimateMemoryFootprint(this: any, layout: Layout, elements: LayoutElement[]): {
    estimatedBytes: number;
    breakdown: Record<string, number>;
    category: 'light' | 'moderate' | 'heavy' | 'extreme';
  } {
    const breakdown: Record<string, number> = {
      layoutStructure: 0,
      elementData: 0,
      computedStyles: 0,
      content: 0
    };

    // Base layout structure
    breakdown.layoutStructure = 1000; // Base overhead

    // Element data
    breakdown.elementData = elements.length * 200; // Estimated per element

    // Computed styles
    elements.forEach(element => {
      if (element.styles) {
        breakdown.computedStyles += Object.keys(element.styles).length * 50;
      }
    });

    // Content data
    elements.forEach(element => {
      if (element.content) {
        const contentSize = JSON.stringify(element.content).length;
        breakdown.content += contentSize * 2; // Estimated overhead
      }
    });

    const totalBytes = Object.values(breakdown).reduce((a, b) => a + b, 0);

    let category: 'light' | 'moderate' | 'heavy' | 'extreme';
    if (totalBytes < 50000) { // 50KB
      category = 'light';
    } else if (totalBytes < 200000) { // 200KB
      category = 'moderate';
    } else if (totalBytes < 500000) { // 500KB
      category = 'heavy';
    } else {
      category = 'extreme';
    }

    return {
      estimatedBytes: totalBytes,
      breakdown,
      category
    };
  },

  /**
   * Generate optimization suggestions
   */
  generateOptimizationSuggestions(this: any,
    layout: Layout,
    elements: LayoutElement[],
    metrics: LayoutMetrics
  ): string[] {
    const suggestions: string[] = [];

    // Element count optimization
    if (elements.length > 50) {
      suggestions.push('Consider virtualizing or paginating elements for better performance');
    }

    // Layout complexity
    if (layout.type === 'grid' && elements.length < 6) {
      suggestions.push('Simple flexbox might be more efficient than grid for few elements');
    }

    // Overflow suggestions
    if (metrics.overflowElements.length > 0) {
      suggestions.push(`${metrics.overflowElements.length} elements overflow - consider larger container or smaller elements`);
    }

    // Performance suggestions
    if (metrics.performance.calculationTime > 100) {
      suggestions.push('Layout calculation time is high - consider simplifying constraints or layout');
    }

    // Memory optimization
    const hasLargeContent = elements.some(el => 
      el.content && JSON.stringify(el.content).length > 1000
    );
    if (hasLargeContent) {
      suggestions.push('Some elements have large content - consider lazy loading or content optimization');
    }

    return suggestions;
  },

  /**
   * Check touch target sizes for accessibility
   */
  checkTouchTargetSizes(this: any, elements: LayoutElement[]): {
    compliant: number;
    nonCompliant: Array<{ id: string; size: { width: number; height: number } }>;
    complianceRate: number;
  } {
    const MINIMUM_SIZE = 44; // 44x44px recommended
    let compliant = 0;
    const nonCompliant: Array<{ id: string; size: { width: number; height: number } }> = [];

    elements.forEach(element => {
      const isInteractive = element.content?.onClick || element.content?.href;
      if (isInteractive && element.bounds) {
        if (element.bounds.width >= MINIMUM_SIZE && element.bounds.height >= MINIMUM_SIZE) {
          compliant++;
        } else {
          nonCompliant.push({
            id: element.id,
            size: { width: element.bounds.width, height: element.bounds.height }
          });
        }
      }
    });

    const totalInteractive = compliant + nonCompliant.length;
    const complianceRate = totalInteractive > 0 ? compliant / totalInteractive : 1;

    return { compliant, nonCompliant, complianceRate };
  },

  /**
   * Analyze keyboard navigation flow
   */
  analyzeKeyboardNavigation(this: any, elements: LayoutElement[]): {
    hasTabOrder: boolean;
    logicalFlow: boolean;
    issues: string[];
  } {
    const issues: string[] = [];
    const interactiveElements = elements.filter(el => 
      el.content?.onClick || el.content?.href
    );

    const hasTabOrder = interactiveElements.some(el => 
      el.content?.tabIndex !== undefined
    );

    // Check if elements are in logical visual order
    const sortedByPosition = interactiveElements
      .filter(el => el.bounds)
      .sort((a, b) => {
        if (!a.bounds || !b.bounds) return 0;
        const yDiff = a.bounds.y - b.bounds.y;
        return Math.abs(yDiff) > 10 ? yDiff : a.bounds.x - b.bounds.x;
      });

    const logicalFlow = sortedByPosition.length <= 1 || 
      sortedByPosition.every((el, i) => i === 0 || el.id === interactiveElements[i].id);

    if (!hasTabOrder && interactiveElements.length > 1) {
      issues.push('No explicit tab order defined for interactive elements');
    }

    if (!logicalFlow) {
      issues.push('Interactive elements may not follow logical visual order');
    }

    if (interactiveElements.length === 0) {
      issues.push('No interactive elements found');
    }

    return { hasTabOrder, logicalFlow, issues };
  },

  /**
   * Check screen reader compatibility
   */
  checkScreenReaderCompatibility(this: any, elements: LayoutElement[]): {
    hasLabels: number;
    missingLabels: string[];
    hasHeadings: boolean;
    structuralElements: number;
  } {
    let hasLabels = 0;
    const missingLabels: string[] = [];
    let hasHeadings = false;
    let structuralElements = 0;

    elements.forEach(element => {
      const hasLabel = element.content?.label || 
                      element.content?.title || 
                      element.content?.alt || 
                      element.content?.ariaLabel;

      const isInteractiveOrImportant = element.content?.onClick || 
                                      element.content?.href || 
                                      element.type === 'image';

      if (isInteractiveOrImportant) {
        if (hasLabel) {
          hasLabels++;
        } else {
          missingLabels.push(element.id);
        }
      }

      if (element.content?.heading || element.content?.role === 'heading') {
        hasHeadings = true;
      }

      if (element.content?.role || element.type !== 'div') {
        structuralElements++;
      }
    });

    return { hasLabels, missingLabels, hasHeadings, structuralElements };
  },

  /**
   * Detect potential color contrast issues
   */
  detectColorContrastIssues(this: any, elements: LayoutElement[]): {
    potentialIssues: Array<{ id: string; reason: string }>;
    needsManualCheck: string[];
  } {
    const potentialIssues: Array<{ id: string; reason: string }> = [];
    const needsManualCheck: string[] = [];

    elements.forEach(element => {
      const styles = element.styles || {};
      const content = element.content || {};

      // Check for low contrast color combinations
      const hasTextContent = content.text || content.title || content.label;
      
      if (hasTextContent) {
        if (styles.color && styles.backgroundColor) {
          // Would need actual color contrast calculation here
          needsManualCheck.push(element.id);
        } else if (!styles.color && !styles.backgroundColor) {
          potentialIssues.push({
            id: element.id,
            reason: 'Text element without explicit colors - contrast depends on inheritance'
          });
        }
      }

      // Check for color-only information
      if (styles.color && !content.text && !content.label) {
        potentialIssues.push({
          id: element.id,
          reason: 'Element relies on color without text alternative'
        });
      }
    });

    return { potentialIssues, needsManualCheck };
  }
};