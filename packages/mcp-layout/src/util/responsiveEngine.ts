import {
  Breakpoint,
  Layout,
  ResponsiveLayout,
  Rectangle,
  LayoutElement,
  GridConfig,
  FlexConfig,
} from '../types/layout.js';
import { PerformanceMonitor } from './performance.js';
import { GridEngine } from './gridEngine.js';
import { FlexEngine } from './flexEngine.js';
import { LayoutValidator } from './validation.js';

/**
 * Responsive layout engine for multi-breakpoint layouts
 */
export class ResponsiveEngine {
  private static readonly DEFAULT_BREAKPOINTS: Breakpoint[] = [
    { name: 'mobile', minWidth: 0, maxWidth: 767, columns: 1, gutter: 16 },
    { name: 'tablet', minWidth: 768, maxWidth: 1023, columns: 2, gutter: 24 },
    { name: 'desktop', minWidth: 1024, maxWidth: 1439, columns: 3, gutter: 32 },
    { name: 'wide', minWidth: 1440, columns: 4, gutter: 40 }
  ];

  /**
   * Create responsive layout for multiple breakpoints
   */
  static createResponsiveLayout(
    elements: LayoutElement[],
    baseLayout: Layout,
    breakpoints: Breakpoint[],
    monitor?: PerformanceMonitor
  ): ResponsiveLayout {
    monitor?.start('responsive-layout-creation');

    try {
      // Validate breakpoints
      const breakpointErrors = LayoutValidator.validateBreakpoints(breakpoints);
      if (breakpointErrors.length > 0) {
        throw new Error(`Breakpoint validation failed: ${breakpointErrors.map(e => e.message).join(', ')}`);
      }

      // Sort breakpoints by min-width for consistent processing
      const sortedBreakpoints = [...breakpoints].sort((a, b) => a.minWidth - b.minWidth);
      
      // Generate layouts for each breakpoint
      const layouts: Record<string, Layout> = {};
      
      sortedBreakpoints.forEach(breakpoint => {
        monitor?.recordIteration();
        
        const breakpointBounds = this.calculateBreakpointBounds(baseLayout.bounds, breakpoint);
        const adaptedLayout = this.adaptLayoutForBreakpoint(
          baseLayout,
          elements,
          breakpoint,
          breakpointBounds,
          monitor
        );
        
        layouts[breakpoint.name] = adaptedLayout;
      });

      return {
        breakpoints: sortedBreakpoints,
        layouts
      };
      
    } finally {
      monitor?.recordIteration();
    }
  }

  /**
   * Calculate bounds for a specific breakpoint
   */
  private static calculateBreakpointBounds(baseBounds: Rectangle, breakpoint: Breakpoint): Rectangle {
    // Use breakpoint width constraints to determine optimal bounds
    const targetWidth = breakpoint.maxWidth || breakpoint.minWidth;
    
    // Maintain aspect ratio while respecting breakpoint constraints
    const scale = targetWidth / baseBounds.width;
    const scaledHeight = baseBounds.height * scale;
    
    return {
      x: baseBounds.x,
      y: baseBounds.y,
      width: targetWidth,
      height: scaledHeight
    };
  }

  /**
   * Adapt layout configuration for specific breakpoint
   */
  private static adaptLayoutForBreakpoint(
    baseLayout: Layout,
    elements: LayoutElement[],
    breakpoint: Breakpoint,
    bounds: Rectangle,
    monitor?: PerformanceMonitor
  ): Layout {
    monitor?.start(`adapting-layout-for-${breakpoint.name}`);

    try {
      switch (baseLayout.type) {
      case 'grid':
        return this.adaptGridLayout(baseLayout, elements, breakpoint, bounds, monitor);
      case 'flex':
        return this.adaptFlexLayout(baseLayout, elements, breakpoint, bounds, monitor);
      default:
        throw new Error(`Unsupported layout type for responsive adaptation: ${(baseLayout as any).type}`);
      }
    } finally {
      monitor?.recordIteration();
    }
  }

  /**
   * Adapt grid layout for breakpoint
   */
  private static adaptGridLayout(
    baseLayout: Layout,
    elements: LayoutElement[],
    breakpoint: Breakpoint,
    bounds: Rectangle,
    monitor?: PerformanceMonitor
  ): Layout {
    if (baseLayout.type !== 'grid') {
      throw new Error('Expected grid layout');
    }

    const adaptedConfig = this.adaptGridConfig(baseLayout.config, breakpoint, bounds);
    const adaptedElements = this.adaptGridElements(baseLayout.elements, breakpoint, bounds);

    return GridEngine.createLayout(adaptedConfig, adaptedElements, bounds, monitor);
  }

  /**
   * Adapt grid configuration for breakpoint
   */
  private static adaptGridConfig(config: GridConfig, breakpoint: Breakpoint, bounds: Rectangle): GridConfig {
    const adapted = { ...config };

    // Adjust columns based on breakpoint
    if (breakpoint.columns) {
      const columnWidth = bounds.width / breakpoint.columns;
      adapted.columns = Array(breakpoint.columns).fill(`${columnWidth}px`).join(' ');
    }

    // Adjust gap based on breakpoint
    if (breakpoint.gutter) {
      adapted.gap = `${breakpoint.gutter}px`;
    }

    // Simplify grid areas for smaller screens
    if (breakpoint.minWidth < 768 && adapted.areas) {
      // For mobile, stack areas vertically
      adapted.areas = adapted.areas.map(row => [row[0]]); // Take only first area from each row
      adapted.columns = '1fr'; // Single column for mobile
    }

    // Adjust auto-sizing for different screen sizes
    if (breakpoint.minWidth < 1024) {
      adapted.autoColumns = 'minmax(200px, 1fr)';
      adapted.autoRows = 'auto';
    } else {
      adapted.autoColumns = 'minmax(300px, 1fr)';
      adapted.autoRows = 'minmax(100px, auto)';
    }

    return adapted;
  }

  /**
   * Adapt grid elements for breakpoint
   */
  private static adaptGridElements(elements: any[], breakpoint: Breakpoint, bounds: Rectangle): any[] {
    return elements.map(element => {
      const adapted = { ...element };

      // Adjust grid positioning for smaller screens
      if (breakpoint.minWidth < 768) {
        // Remove complex grid positioning for mobile
        delete adapted.gridColumn;
        delete adapted.gridRow;
        delete adapted.gridColumnStart;
        delete adapted.gridColumnEnd;
        delete adapted.gridRowStart;
        delete adapted.gridRowEnd;
        
        // Use simpler grid area if available
        if (!adapted.gridArea) {
          adapted.gridArea = 'auto';
        }
      }

      // Adjust element constraints for screen size
      if (breakpoint.minWidth < 1024) {
        adapted.minWidth = Math.min(adapted.minWidth || 200, bounds.width * 0.9);
        adapted.maxWidth = bounds.width * 0.95;
      }

      return adapted;
    });
  }

  /**
   * Adapt flex layout for breakpoint
   */
  private static adaptFlexLayout(
    baseLayout: Layout,
    elements: LayoutElement[],
    breakpoint: Breakpoint,
    bounds: Rectangle,
    monitor?: PerformanceMonitor
  ): Layout {
    if (baseLayout.type !== 'flex') {
      throw new Error('Expected flex layout');
    }

    const adaptedConfig = this.adaptFlexConfig(baseLayout.config, breakpoint, bounds);
    const adaptedElements = this.adaptFlexElements(baseLayout.elements, breakpoint, bounds);

    return FlexEngine.createLayout(adaptedConfig, adaptedElements, bounds, monitor);
  }

  /**
   * Adapt flex configuration for breakpoint
   */
  private static adaptFlexConfig(config: FlexConfig, breakpoint: Breakpoint, _bounds: Rectangle): FlexConfig {
    const adapted = { ...config };

    // Change direction based on screen size
    if (breakpoint.minWidth < 768) {
      // Mobile: prefer vertical stacking
      adapted.direction = config.direction.includes('column') ? config.direction : 'column';
      adapted.wrap = 'nowrap';
    } else if (breakpoint.minWidth < 1024) {
      // Tablet: allow wrapping
      adapted.wrap = 'wrap';
      adapted.justifyContent = 'space-around';
    } else {
      // Desktop: use original configuration
      // No changes needed for larger screens
    }

    // Adjust gaps for screen size
    if (breakpoint.gutter) {
      adapted.gap = `${breakpoint.gutter}px`;
      adapted.rowGap = `${breakpoint.gutter}px`;
      adapted.columnGap = `${breakpoint.gutter}px`;
    }

    // Adjust alignment for different screen sizes
    if (breakpoint.minWidth < 768) {
      adapted.alignItems = 'stretch'; // Full width on mobile
      adapted.justifyContent = 'flex-start';
    }

    return adapted;
  }

  /**
   * Adapt flex elements for breakpoint
   */
  private static adaptFlexElements(elements: any[], breakpoint: Breakpoint, bounds: Rectangle): any[] {
    return elements.map(element => {
      const adapted = { ...element };

      // Adjust flex values based on screen size
      if (breakpoint.minWidth < 768) {
        // Mobile: elements should not shrink too much
        adapted.flexShrink = Math.min(adapted.flexShrink, 0.5);
        adapted.flexGrow = Math.max(adapted.flexGrow, 1);
        adapted.flexBasis = 'auto';
      } else if (breakpoint.minWidth < 1024) {
        // Tablet: moderate flexibility
        adapted.flexShrink = Math.min(adapted.flexShrink, 1);
      }

      // Adjust size constraints for screen size
      if (breakpoint.minWidth < 768) {
        adapted.minWidth = 0; // Allow shrinking on mobile
        adapted.maxWidth = bounds.width;
      } else if (breakpoint.minWidth < 1024) {
        adapted.minWidth = Math.min(adapted.minWidth || 200, bounds.width * 0.3);
        adapted.maxWidth = bounds.width * 0.8;
      }

      return adapted;
    });
  }

  /**
   * Get optimal layout for specific viewport width
   */
  static getLayoutForViewport(
    responsiveLayout: ResponsiveLayout,
    viewportWidth: number
  ): { layout: Layout; breakpoint: Breakpoint } | null {
    // Find matching breakpoint
    const matchingBreakpoint = responsiveLayout.breakpoints.find(bp => {
      return viewportWidth >= bp.minWidth && 
             (bp.maxWidth === undefined || viewportWidth <= bp.maxWidth);
    });

    if (!matchingBreakpoint) {
      // Fallback to largest breakpoint
      const fallbackBreakpoint = responsiveLayout.breakpoints
        .slice()
        .sort((a, b) => b.minWidth - a.minWidth)[0];
        
      if (fallbackBreakpoint) {
        const layout = responsiveLayout.layouts[fallbackBreakpoint.name];
        return layout ? { layout, breakpoint: fallbackBreakpoint } : null;
      }
      
      return null;
    }

    const layout = responsiveLayout.layouts[matchingBreakpoint.name];
    return layout ? { layout, breakpoint: matchingBreakpoint } : null;
  }

  /**
   * Calculate responsive metrics for layout performance
   */
  static calculateResponsiveMetrics(responsiveLayout: ResponsiveLayout): {
    breakpointCount: number;
    coverageGaps: Array<{ start: number; end: number }>;
    redundantBreakpoints: string[];
    performanceScore: number;
  } {
    const { breakpoints } = responsiveLayout;
    
    // Check for coverage gaps
    const sortedBreakpoints = [...breakpoints].sort((a, b) => a.minWidth - b.minWidth);
    const coverageGaps: Array<{ start: number; end: number }> = [];
    
    for (let i = 0; i < sortedBreakpoints.length - 1; i++) {
      const current = sortedBreakpoints[i];
      const next = sortedBreakpoints[i + 1];
      
      if (current.maxWidth && current.maxWidth < next.minWidth - 1) {
        coverageGaps.push({
          start: current.maxWidth + 1,
          end: next.minWidth - 1
        });
      }
    }

    // Identify redundant breakpoints (very similar configurations)
    const redundantBreakpoints: string[] = [];
    for (let i = 0; i < breakpoints.length - 1; i++) {
      const current = breakpoints[i];
      const next = breakpoints[i + 1];
      
      if (this.areBreakpointsSimilar(current, next)) {
        redundantBreakpoints.push(current.name);
      }
    }

    // Calculate performance score
    let performanceScore = 100;
    performanceScore -= coverageGaps.length * 15; // Penalty for gaps
    performanceScore -= redundantBreakpoints.length * 10; // Penalty for redundancy
    performanceScore -= Math.max(0, breakpoints.length - 4) * 5; // Penalty for too many breakpoints
    
    return {
      breakpointCount: breakpoints.length,
      coverageGaps,
      redundantBreakpoints,
      performanceScore: Math.max(0, performanceScore)
    };
  }

  /**
   * Check if two breakpoints have similar configurations
   */
  private static areBreakpointsSimilar(bp1: Breakpoint, bp2: Breakpoint): boolean {
    const widthDiff = Math.abs((bp1.maxWidth || 2000) - (bp2.minWidth || 0));
    const columnDiff = Math.abs((bp1.columns || 1) - (bp2.columns || 1));
    const gutterDiff = Math.abs((bp1.gutter || 16) - (bp2.gutter || 16));
    
    return widthDiff < 100 && columnDiff <= 1 && gutterDiff <= 8;
  }

  /**
   * Generate optimal breakpoints for given content
   */
  static generateOptimalBreakpoints(
    elements: LayoutElement[],
    minViewport: number = 320,
    maxViewport: number = 1920
  ): Breakpoint[] {
    const breakpoints: Breakpoint[] = [];
    
    // Analyze content to determine optimal breakpoints
    const elementCount = elements.length;
    const hasImages = elements.some(el => el.content?.src || el.content?.image);
    
    // Mobile breakpoint
    breakpoints.push({
      name: 'mobile',
      minWidth: minViewport,
      maxWidth: 767,
      columns: 1,
      gutter: hasImages ? 16 : 12
    });

    // Tablet breakpoint
    breakpoints.push({
      name: 'tablet',
      minWidth: 768,
      maxWidth: 1023,
      columns: Math.min(2, Math.ceil(elementCount / 3)),
      gutter: hasImages ? 24 : 16
    });

    // Desktop breakpoint
    breakpoints.push({
      name: 'desktop',
      minWidth: 1024,
      maxWidth: maxViewport > 1440 ? 1439 : undefined,
      columns: Math.min(3, Math.ceil(elementCount / 2)),
      gutter: hasImages ? 32 : 24
    });

    // Wide screen breakpoint (only if max viewport is large enough)
    if (maxViewport > 1440) {
      breakpoints.push({
        name: 'wide',
        minWidth: 1440,
        columns: Math.min(4, elementCount),
        gutter: hasImages ? 40 : 32
      });
    }

    return breakpoints;
  }

  /**
   * Convert responsive layout to CSS media queries
   */
  static generateMediaQueries(responsiveLayout: ResponsiveLayout): Record<string, string> {
    const mediaQueries: Record<string, string> = {};
    
    responsiveLayout.breakpoints.forEach(breakpoint => {
      const layout = responsiveLayout.layouts[breakpoint.name];
      if (!layout) return;

      // Generate media query condition
      let condition = `(min-width: ${breakpoint.minWidth}px)`;
      if (breakpoint.maxWidth) {
        condition += ` and (max-width: ${breakpoint.maxWidth}px)`;
      }

      // Generate CSS for this breakpoint
      let css = '';
      
      if (layout.type === 'grid' && layout.computedGrid) {
        css += '.container {\n';
        css += '  display: grid;\n';
        css += `  grid-template-columns: ${layout.config.columns};\n`;
        css += `  grid-template-rows: ${layout.config.rows};\n`;
        css += `  gap: ${layout.config.gap};\n`;
        css += '}\n';
      } else if (layout.type === 'flex') {
        css += '.container {\n';
        css += '  display: flex;\n';
        css += `  flex-direction: ${layout.config.direction};\n`;
        css += `  flex-wrap: ${layout.config.wrap};\n`;
        css += `  justify-content: ${layout.config.justifyContent};\n`;
        css += `  align-items: ${layout.config.alignItems};\n`;
        css += `  gap: ${layout.config.gap};\n`;
        css += '}\n';
      }

      mediaQueries[breakpoint.name] = `@media ${condition} {\n${css}}`;
    });

    return mediaQueries;
  }

  /**
   * Optimize responsive layout by removing unnecessary breakpoints
   */
  static optimizeResponsiveLayout(responsiveLayout: ResponsiveLayout): ResponsiveLayout {
    const optimized = JSON.parse(JSON.stringify(responsiveLayout));
    
    // Remove similar consecutive breakpoints
    const filteredBreakpoints: Breakpoint[] = [];
    const filteredLayouts: Record<string, Layout> = {};
    
    optimized.breakpoints.forEach((breakpoint: Breakpoint, index: number) => {
      const isLastBreakpoint = index === optimized.breakpoints.length - 1;
      const nextBreakpoint = isLastBreakpoint ? null : optimized.breakpoints[index + 1];
      
      // Keep breakpoint if it's the first, last, or significantly different from next
      if (index === 0 || isLastBreakpoint || !this.areBreakpointsSimilar(breakpoint, nextBreakpoint!)) {
        filteredBreakpoints.push(breakpoint);
        filteredLayouts[breakpoint.name] = optimized.layouts[breakpoint.name];
      }
    });

    return {
      breakpoints: filteredBreakpoints,
      layouts: filteredLayouts
    };
  }
}