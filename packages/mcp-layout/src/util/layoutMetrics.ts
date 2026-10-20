import {
  Layout,
  LayoutMetrics,
  Rectangle,
  LayoutElement,
  ResponsiveLayout,
  GridLayout,
  FlexLayout
} from '../types/layout.js';
import { PerformanceMonitor } from './performance.js';

/**
 * Layout measurement and metrics calculation utilities
 */
export class LayoutMetricsCalculator {
  
  /**
   * Calculate comprehensive metrics for a layout
   */
  static calculateMetrics(
    layout: Layout,
    elements: LayoutElement[],
    monitor?: PerformanceMonitor
  ): LayoutMetrics {
    monitor?.start('metrics-calculation');

    try {
      const startTime = performance.now();
      
      // Calculate basic bounds metrics
      const boundsMetrics = this.calculateBoundsMetrics(layout, elements, monitor);
      
      // Calculate element distribution metrics
      const distributionMetrics = this.calculateDistributionMetrics(layout, elements, monitor);
      
      // Calculate spacing and alignment metrics
      const spacingMetrics = this.calculateSpacingMetrics(layout, elements, monitor);
      
      // Calculate efficiency metrics
      const efficiencyMetrics = this.calculateEfficiencyMetrics(layout, elements, monitor);
      
      // Calculate accessibility metrics
      const accessibilityMetrics = this.calculateAccessibilityMetrics(layout, elements, monitor);
      
      const calculationTime = performance.now() - startTime;
      
      return {
        totalBounds: boundsMetrics.totalBounds,
        elementCount: elements.length,
        overflowElements: boundsMetrics.overflowElements,
        performance: {
          calculationTime,
          constraintsSolved: 0, // Would be filled by constraint solver
          iterationsRequired: 0 // Would be filled by layout engine
        },
        warnings: [
          ...boundsMetrics.warnings,
          ...distributionMetrics.warnings,
          ...spacingMetrics.warnings,
          ...efficiencyMetrics.warnings,
          ...accessibilityMetrics.warnings
        ]
      };
      
    } finally {
      monitor?.recordIteration();
    }
  }

  /**
   * Calculate bounds-related metrics
   */
  private static calculateBoundsMetrics(
    layout: Layout,
    elements: LayoutElement[],
    monitor?: PerformanceMonitor
  ): {
    totalBounds: Rectangle;
    overflowElements: string[];
    warnings: string[];
  } {
    const warnings: string[] = [];
    const overflowElements: string[] = [];
    
    // Calculate the union of all element bounds
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    // Get computed element positions
    const elementPositions = this.getElementPositions(layout);
    
    elementPositions.forEach(({ elementId, bounds }) => {
      monitor?.recordIteration();
      
      minX = Math.min(minX, bounds.x);
      minY = Math.min(minY, bounds.y);
      maxX = Math.max(maxX, bounds.x + bounds.width);
      maxY = Math.max(maxY, bounds.y + bounds.height);
      
      // Check for overflow beyond container
      if (bounds.x < layout.bounds.x || 
          bounds.y < layout.bounds.y ||
          bounds.x + bounds.width > layout.bounds.x + layout.bounds.width ||
          bounds.y + bounds.height > layout.bounds.y + layout.bounds.height) {
        overflowElements.push(elementId);
      }
    });

    const totalBounds: Rectangle = {
      x: isFinite(minX) ? minX : layout.bounds.x,
      y: isFinite(minY) ? minY : layout.bounds.y,
      width: isFinite(maxX) && isFinite(minX) ? maxX - minX : layout.bounds.width,
      height: isFinite(maxY) && isFinite(minY) ? maxY - minY : layout.bounds.height
    };

    if (overflowElements.length > 0) {
      warnings.push(`${overflowElements.length} elements overflow container bounds`);
    }

    if (totalBounds.width > layout.bounds.width * 1.2) {
      warnings.push('Layout width significantly exceeds container width');
    }

    if (totalBounds.height > layout.bounds.height * 1.2) {
      warnings.push('Layout height significantly exceeds container height');
    }

    return { totalBounds, overflowElements, warnings };
  }

  /**
   * Calculate element distribution metrics
   */
  private static calculateDistributionMetrics(
    layout: Layout,
    elements: LayoutElement[],
    monitor?: PerformanceMonitor
  ): {
    density: number;
    coverage: number;
    balance: { horizontal: number; vertical: number };
    warnings: string[];
  } {
    const warnings: string[] = [];
    const elementPositions = this.getElementPositions(layout);
    
    if (elementPositions.length === 0) {
      warnings.push('No element positions available for distribution analysis');
      return {
        density: 0,
        coverage: 0,
        balance: { horizontal: 0, vertical: 0 },
        warnings
      };
    }

    // Calculate density (elements per unit area)
    const totalElementArea = elementPositions.reduce((sum, { bounds }) => {
      monitor?.recordIteration();
      return sum + (bounds.width * bounds.height);
    }, 0);
    
    const containerArea = layout.bounds.width * layout.bounds.height;
    const density = containerArea > 0 ? totalElementArea / containerArea : 0;

    // Calculate coverage (how much of container is occupied)
    const coverage = density; // Simplified - actual coverage would account for overlaps

    // Calculate balance (distribution across axes)
    const centerX = layout.bounds.x + layout.bounds.width / 2;
    const centerY = layout.bounds.y + layout.bounds.height / 2;
    
    let leftWeight = 0, rightWeight = 0, topWeight = 0, bottomWeight = 0;
    
    elementPositions.forEach(({ bounds }) => {
      const elementCenterX = bounds.x + bounds.width / 2;
      const elementCenterY = bounds.y + bounds.height / 2;
      const elementArea = bounds.width * bounds.height;
      
      if (elementCenterX < centerX) {
        leftWeight += elementArea;
      } else {
        rightWeight += elementArea;
      }
      
      if (elementCenterY < centerY) {
        topWeight += elementArea;
      } else {
        bottomWeight += elementArea;
      }
    });

    const horizontalBalance = leftWeight + rightWeight > 0 ? 
      1 - Math.abs(leftWeight - rightWeight) / (leftWeight + rightWeight) : 1;
    const verticalBalance = topWeight + bottomWeight > 0 ?
      1 - Math.abs(topWeight - bottomWeight) / (topWeight + bottomWeight) : 1;

    // Generate warnings
    if (density < 0.1) {
      warnings.push('Layout density is very low - consider smaller container or more content');
    } else if (density > 0.9) {
      warnings.push('Layout density is very high - elements may appear cramped');
    }

    if (coverage < 0.3) {
      warnings.push('Poor space utilization - large areas of container are empty');
    }

    if (horizontalBalance < 0.6) {
      warnings.push('Poor horizontal balance - elements heavily weighted to one side');
    }

    if (verticalBalance < 0.6) {
      warnings.push('Poor vertical balance - elements heavily weighted to top or bottom');
    }

    return {
      density,
      coverage,
      balance: { horizontal: horizontalBalance, vertical: verticalBalance },
      warnings
    };
  }

  /**
   * Calculate spacing and alignment metrics
   */
  private static calculateSpacingMetrics(
    layout: Layout,
    elements: LayoutElement[],
    monitor?: PerformanceMonitor
  ): {
    averageSpacing: { horizontal: number; vertical: number };
    spacingConsistency: number;
    alignment: { horizontal: number; vertical: number };
    warnings: string[];
  } {
    const warnings: string[] = [];
    const elementPositions = this.getElementPositions(layout);
    
    if (elementPositions.length < 2) {
      return {
        averageSpacing: { horizontal: 0, vertical: 0 },
        spacingConsistency: 1,
        alignment: { horizontal: 1, vertical: 1 },
        warnings
      };
    }

    // Calculate spacing between adjacent elements
    const horizontalSpacings: number[] = [];
    const verticalSpacings: number[] = [];
    
    // Sort elements for spacing analysis
    const sortedByX = [...elementPositions].sort((a, b) => a.bounds.x - b.bounds.x);
    const sortedByY = [...elementPositions].sort((a, b) => a.bounds.y - b.bounds.y);

    // Calculate horizontal spacings
    for (let i = 0; i < sortedByX.length - 1; i++) {
      monitor?.recordIteration();
      
      const current = sortedByX[i].bounds;
      const next = sortedByX[i + 1].bounds;
      
      const spacing = next.x - (current.x + current.width);
      if (spacing >= 0) {
        horizontalSpacings.push(spacing);
      }
    }

    // Calculate vertical spacings
    for (let i = 0; i < sortedByY.length - 1; i++) {
      const current = sortedByY[i].bounds;
      const next = sortedByY[i + 1].bounds;
      
      const spacing = next.y - (current.y + current.height);
      if (spacing >= 0) {
        verticalSpacings.push(spacing);
      }
    }

    // Average spacings
    const avgHorizontalSpacing = horizontalSpacings.length > 0 ?
      horizontalSpacings.reduce((a, b) => a + b, 0) / horizontalSpacings.length : 0;
    const avgVerticalSpacing = verticalSpacings.length > 0 ?
      verticalSpacings.reduce((a, b) => a + b, 0) / verticalSpacings.length : 0;

    // Spacing consistency (coefficient of variation)
    const horizontalVariance = horizontalSpacings.length > 1 ?
      this.calculateVariance(horizontalSpacings, avgHorizontalSpacing) : 0;
    const verticalVariance = verticalSpacings.length > 1 ?
      this.calculateVariance(verticalSpacings, avgVerticalSpacing) : 0;
    
    const horizontalCV = avgHorizontalSpacing > 0 ? 
      Math.sqrt(horizontalVariance) / avgHorizontalSpacing : 0;
    const verticalCV = avgVerticalSpacing > 0 ?
      Math.sqrt(verticalVariance) / avgVerticalSpacing : 0;
    
    const spacingConsistency = 1 - Math.min(1, (horizontalCV + verticalCV) / 2);

    // Alignment metrics
    const horizontalAlignment = this.calculateAlignmentScore(elementPositions, 'horizontal');
    const verticalAlignment = this.calculateAlignmentScore(elementPositions, 'vertical');

    // Generate warnings
    if (spacingConsistency < 0.7) {
      warnings.push('Inconsistent spacing between elements');
    }

    if (horizontalAlignment < 0.6) {
      warnings.push('Poor horizontal alignment - elements not well aligned');
    }

    if (verticalAlignment < 0.6) {
      warnings.push('Poor vertical alignment - elements not well aligned');
    }

    if (avgHorizontalSpacing < 8 && horizontalSpacings.length > 0) {
      warnings.push('Horizontal spacing is very tight - may impact readability');
    }

    if (avgVerticalSpacing < 8 && verticalSpacings.length > 0) {
      warnings.push('Vertical spacing is very tight - may impact readability');
    }

    return {
      averageSpacing: { horizontal: avgHorizontalSpacing, vertical: avgVerticalSpacing },
      spacingConsistency,
      alignment: { horizontal: horizontalAlignment, vertical: verticalAlignment },
      warnings
    };
  }

  /**
   * Calculate efficiency metrics
   */
  private static calculateEfficiencyMetrics(
    layout: Layout,
    elements: LayoutElement[],
    monitor?: PerformanceMonitor
  ): {
    spaceUtilization: number;
    layoutComplexity: number;
    renderingEfficiency: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const elementPositions = this.getElementPositions(layout);
    
    // Space utilization
    const totalElementArea = elementPositions.reduce((sum, { bounds }) => {
      return sum + (bounds.width * bounds.height);
    }, 0);
    const containerArea = layout.bounds.width * layout.bounds.height;
    const spaceUtilization = containerArea > 0 ? totalElementArea / containerArea : 0;

    // Layout complexity (number of unique positions)
    const uniquePositions = new Set(
      elementPositions.map(({ bounds }) => `${bounds.x},${bounds.y}`)
    );
    const layoutComplexity = elementPositions.length > 0 ? 
      uniquePositions.size / elementPositions.length : 0;

    // Rendering efficiency (fewer overlaps = higher efficiency)
    let overlapCount = 0;
    for (let i = 0; i < elementPositions.length; i++) {
      for (let j = i + 1; j < elementPositions.length; j++) {
        monitor?.recordIteration();
        
        if (this.rectanglesOverlap(elementPositions[i].bounds, elementPositions[j].bounds)) {
          overlapCount++;
        }
      }
    }
    
    const maxPossibleOverlaps = (elementPositions.length * (elementPositions.length - 1)) / 2;
    const renderingEfficiency = maxPossibleOverlaps > 0 ? 
      1 - (overlapCount / maxPossibleOverlaps) : 1;

    // Generate warnings
    if (spaceUtilization < 0.2) {
      warnings.push('Very low space utilization - consider optimizing layout');
    } else if (spaceUtilization > 0.95) {
      warnings.push('Very high space utilization - layout may appear cramped');
    }

    if (layoutComplexity < 0.5) {
      warnings.push('Many elements share the same position - check for overlaps');
    }

    if (renderingEfficiency < 0.8) {
      warnings.push(`${overlapCount} element overlaps detected - may impact performance`);
    }

    return {
      spaceUtilization,
      layoutComplexity,
      renderingEfficiency,
      warnings
    };
  }

  /**
   * Calculate accessibility metrics
   */
  private static calculateAccessibilityMetrics(
    layout: Layout,
    elements: LayoutElement[],
    monitor?: PerformanceMonitor
  ): {
    minimumTouchTargets: number;
    readingOrder: number;
    focusFlow: number;
    warnings: string[];
  } {
    const warnings: string[] = [];
    const elementPositions = this.getElementPositions(layout);
    
    // Minimum touch target size (44x44px recommended)
    const RECOMMENDED_TOUCH_SIZE = 44;
    let adequateTouchTargets = 0;
    
    elementPositions.forEach(({ elementId, bounds }) => {
      monitor?.recordIteration();
      
      const element = elements.find(el => el.id === elementId);
      const isInteractive = element?.content?.onClick || 
                           element?.content?.href || 
                           element?.content?.action;
      
      if (isInteractive) {
        if (bounds.width >= RECOMMENDED_TOUCH_SIZE && 
            bounds.height >= RECOMMENDED_TOUCH_SIZE) {
          adequateTouchTargets++;
        } else {
          warnings.push(`Element ${elementId} may be too small for touch interaction`);
        }
      }
    });

    const interactiveElements = elements.filter(el => 
      el.content?.onClick || el.content?.href || el.content?.action
    );
    const minimumTouchTargets = interactiveElements.length > 0 ?
      adequateTouchTargets / interactiveElements.length : 1;

    // Reading order (left-to-right, top-to-bottom flow)
    const readingOrder = this.calculateReadingOrderScore(elementPositions);

    // Focus flow (logical tab order)
    const focusFlow = this.calculateFocusFlowScore(elements, elementPositions);

    // Generate warnings
    if (minimumTouchTargets < 0.8) {
      warnings.push('Some interactive elements may be too small for accessibility');
    }

    if (readingOrder < 0.7) {
      warnings.push('Element positioning may not follow natural reading order');
    }

    if (focusFlow < 0.7) {
      warnings.push('Focus flow may not be logical for keyboard navigation');
    }

    return {
      minimumTouchTargets,
      readingOrder,
      focusFlow,
      warnings
    };
  }

  /**
   * Get element positions from layout
   */
  private static getElementPositions(layout: Layout): Array<{ elementId: string; bounds: Rectangle }> {
    const positions: Array<{ elementId: string; bounds: Rectangle }> = [];
    
    if (layout.type === 'grid' && layout.computedGrid) {
      // For grid layouts, use computed positions or fall back to grid areas
      layout.elements.forEach(element => {
        // This would be filled by the grid engine with actual computed positions
        // For now, use a default position
        positions.push({
          elementId: element.id,
          bounds: { x: 0, y: 0, width: 100, height: 50 }
        });
      });
    } else if (layout.type === 'flex' && layout.computedFlex) {
      // Use computed flex positions
      layout.computedFlex.elementPositions.forEach(pos => {
        positions.push({
          elementId: pos.id,
          bounds: pos.bounds
        });
      });
    }
    
    return positions;
  }

  /**
   * Calculate variance of a number array
   */
  private static calculateVariance(values: number[], mean: number): number {
    return values.reduce((sum, value) => sum + Math.pow(value - mean, 2), 0) / values.length;
  }

  /**
   * Calculate alignment score for elements
   */
  private static calculateAlignmentScore(
    positions: Array<{ elementId: string; bounds: Rectangle }>,
    axis: 'horizontal' | 'vertical'
  ): number {
    if (positions.length < 2) return 1;

    const coordinates = positions.map(p => 
      axis === 'horizontal' ? p.bounds.x : p.bounds.y
    );

    // Find common alignment points
    const alignmentTolerance = 5; // pixels
    const alignmentGroups = new Map<number, number>();

    coordinates.forEach(coord => {
      let foundGroup = false;
      for (const [groupCoord, count] of alignmentGroups) {
        if (Math.abs(coord - groupCoord) <= alignmentTolerance) {
          alignmentGroups.set(groupCoord, count + 1);
          foundGroup = true;
          break;
        }
      }
      if (!foundGroup) {
        alignmentGroups.set(coord, 1);
      }
    });

    // Score based on how many elements align
    const maxGroupSize = Math.max(...alignmentGroups.values());
    return maxGroupSize / positions.length;
  }

  /**
   * Check if two rectangles overlap
   */
  private static rectanglesOverlap(rect1: Rectangle, rect2: Rectangle): boolean {
    return !(rect1.x + rect1.width <= rect2.x ||
             rect2.x + rect2.width <= rect1.x ||
             rect1.y + rect1.height <= rect2.y ||
             rect2.y + rect2.height <= rect1.y);
  }

  /**
   * Calculate reading order score
   */
  private static calculateReadingOrderScore(positions: Array<{ elementId: string; bounds: Rectangle }>): number {
    if (positions.length < 2) return 1;

    const sortedByVisualOrder = [...positions].sort((a, b) => {
      // Primary sort: top to bottom
      const yDiff = a.bounds.y - b.bounds.y;
      if (Math.abs(yDiff) > 10) return yDiff;
      
      // Secondary sort: left to right
      return a.bounds.x - b.bounds.x;
    });

    // Calculate how much the logical order matches DOM order
    let orderMatches = 0;
    for (let i = 0; i < positions.length; i++) {
      if (positions[i].elementId === sortedByVisualOrder[i].elementId) {
        orderMatches++;
      }
    }

    return orderMatches / positions.length;
  }

  /**
   * Calculate focus flow score
   */
  private static calculateFocusFlowScore(
    elements: LayoutElement[],
    positions: Array<{ elementId: string; bounds: Rectangle }>
  ): number {
    const interactiveElements = elements.filter(el => 
      el.content?.onClick || el.content?.href || el.content?.action
    );

    if (interactiveElements.length < 2) return 1;

    const interactivePositions = positions.filter(pos =>
      interactiveElements.some(el => el.id === pos.elementId)
    );

    // Calculate logical tab order (similar to reading order)
    return this.calculateReadingOrderScore(interactivePositions);
  }

  /**
   * Generate layout quality report
   */
  static generateQualityReport(
    layout: Layout,
    elements: LayoutElement[],
    monitor?: PerformanceMonitor
  ): {
    overallScore: number;
    category: 'excellent' | 'good' | 'fair' | 'poor';
    metrics: LayoutMetrics;
    recommendations: string[];
  } {
    const metrics = this.calculateMetrics(layout, elements, monitor);
    const recommendations: string[] = [];

    // Calculate overall score based on various factors
    let score = 100;

    // Deduct for warnings
    score -= (metrics.warnings?.length || 0) * 5;

    // Deduct for overflow
    score -= metrics.overflowElements.length * 10;

    // Deduct for performance issues
    if (metrics.performance.calculationTime > 100) {
      score -= 15;
      recommendations.push('Consider simplifying layout for better performance');
    }

    // Add recommendations based on warnings
    metrics.warnings?.forEach(warning => {
      if (warning.includes('density')) {
        recommendations.push('Adjust element sizes or container dimensions for better density');
      } else if (warning.includes('balance')) {
        recommendations.push('Redistribute elements for better visual balance');
      } else if (warning.includes('spacing')) {
        recommendations.push('Use consistent spacing between elements');
      } else if (warning.includes('accessibility')) {
        recommendations.push('Ensure interactive elements meet accessibility guidelines');
      }
    });

    // Determine quality category
    let category: 'excellent' | 'good' | 'fair' | 'poor';
    if (score >= 90) {
      category = 'excellent';
    } else if (score >= 75) {
      category = 'good';
    } else if (score >= 60) {
      category = 'fair';
    } else {
      category = 'poor';
    }

    return {
      overallScore: Math.max(0, score),
      category,
      metrics,
      recommendations: Array.from(new Set(recommendations)) // Remove duplicates
    };
  }
}