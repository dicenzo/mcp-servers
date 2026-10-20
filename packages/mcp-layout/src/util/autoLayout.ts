import {
  LayoutElement,
  AutoLayoutConfig,
  Rectangle,
  LayoutConstraint,
  LayoutError,
  LayoutErrorCode
} from '../types/layout.js';
import { PerformanceMonitor } from './performance.js';
import { ConstraintSolver } from './constraintSolver.js';

/**
 * Automatic layout engine with content-aware spacing and intelligent positioning
 */
export class AutoLayoutEngine {
  
  /**
   * Create automatic layout for elements with intelligent positioning
   */
  static createLayout(
    elements: LayoutElement[],
    bounds: Rectangle,
    config: AutoLayoutConfig,
    monitor?: PerformanceMonitor
  ): Map<string, Rectangle> {
    monitor?.start('auto-layout-creation');

    try {
      // Analyze element content for sizing hints
      const analyzedElements = this.analyzeElementContent(elements, monitor);
      
      // Generate automatic constraints based on configuration
      const autoConstraints = this.generateAutoConstraints(analyzedElements, config, bounds, monitor);
      
      // Apply content-aware spacing
      const spacingConstraints = this.generateSpacingConstraints(analyzedElements, config, monitor);
      
      // Combine all constraints
      const allConstraints = [...autoConstraints, ...spacingConstraints];
      
      // Solve constraints to get final positions
      const solution = ConstraintSolver.solve(elements, allConstraints, bounds, monitor);
      
      // Apply responsive adjustments if enabled
      if (config.responsive) {
        return this.applyResponsiveAdjustments(solution, bounds, config, monitor);
      }
      
      return solution;
      
    } finally {
      monitor?.recordIteration();
    }
  }

  /**
   * Analyze element content to determine optimal sizes and relationships
   */
  private static analyzeElementContent(
    elements: LayoutElement[],
    monitor?: PerformanceMonitor
  ): Array<{
    element: LayoutElement;
    naturalSize: { width: number; height: number };
    contentType: 'text' | 'image' | 'container' | 'empty';
    priority: number;
    flexibility: { horizontal: number; vertical: number };
  }> {
    return elements.map(element => {
      monitor?.recordIteration();
      
      const analysis = {
        element,
        naturalSize: { width: 100, height: 50 }, // Default
        contentType: 'empty' as 'text' | 'image' | 'container' | 'empty',
        priority: 500, // Default priority
        flexibility: { horizontal: 1, vertical: 1 } // Default flexibility
      };

      // Analyze content
      if (element.content) {
        analysis.contentType = this.determineContentType(element.content);
        analysis.naturalSize = this.calculateContentSize(element.content, element.type);
        analysis.priority = this.calculateContentPriority(element.content, element.type);
        analysis.flexibility = this.calculateContentFlexibility(element.content, element.type);
      }

      // Analyze element type
      if (element.children && element.children.length > 0) {
        analysis.contentType = 'container';
        analysis.priority += 100; // Containers get higher priority
        analysis.flexibility.vertical = 2; // More flexible vertically
      }

      // Apply explicit bounds if provided
      if (element.bounds) {
        analysis.naturalSize.width = element.bounds.width;
        analysis.naturalSize.height = element.bounds.height;
        analysis.flexibility.horizontal = 0.1; // Less flexible with explicit size
        analysis.flexibility.vertical = 0.1;
      }

      return analysis;
    });
  }

  /**
   * Determine content type from element content
   */
  private static determineContentType(content: Record<string, any>): 'text' | 'image' | 'container' | 'empty' {
    if (content.text || content.title || content.label) {
      return 'text';
    }
    
    if (content.src || content.image || content.url) {
      return 'image';
    }
    
    if (content.children || content.items) {
      return 'container';
    }
    
    return 'empty';
  }

  /**
   * Calculate natural size based on content
   */
  private static calculateContentSize(content: Record<string, any>, elementType: string): { width: number; height: number } {
    const baseSize = { width: 100, height: 50 };

    // Text content sizing
    if (content.text) {
      const textLength = String(content.text).length;
      baseSize.width = Math.max(50, Math.min(400, textLength * 8));
      baseSize.height = Math.max(30, Math.ceil(textLength / 50) * 20);
    }

    // Image sizing
    if (content.width && content.height) {
      baseSize.width = Number(content.width) || baseSize.width;
      baseSize.height = Number(content.height) || baseSize.height;
    }

    // Container sizing based on children count
    if (content.children || content.items) {
      const itemCount = Array.isArray(content.children) ? content.children.length : 
                        Array.isArray(content.items) ? content.items.length : 1;
      baseSize.height = Math.max(baseSize.height, itemCount * 40);
      baseSize.width = Math.max(baseSize.width, 200);
    }

    // Element type adjustments
    switch (elementType) {
      case 'span':
        baseSize.height = Math.min(baseSize.height, 30);
        break;
      case 'image':
        baseSize.width = Math.max(baseSize.width, 100);
        baseSize.height = Math.max(baseSize.height, 100);
        break;
      case 'svg':
        baseSize.width = Math.max(baseSize.width, 50);
        baseSize.height = Math.max(baseSize.height, 50);
        break;
    }

    return baseSize;
  }

  /**
   * Calculate content priority for layout ordering
   */
  private static calculateContentPriority(content: Record<string, any>, elementType: string): number {
    let priority = 500; // Base priority

    // Higher priority for titles and headings
    if (content.title || content.heading) {
      priority += 200;
    }

    // Higher priority for images
    if (content.src || content.image) {
      priority += 100;
    }

    // Higher priority for interactive elements
    if (content.onClick || content.href || content.action) {
      priority += 150;
    }

    // Priority based on element importance
    if (content.important || content.primary) {
      priority += 100;
    }

    // Element type priority adjustments
    switch (elementType) {
      case 'text':
        priority += 50;
        break;
      case 'image':
        priority += 75;
        break;
      case 'svg':
        priority += 25;
        break;
    }

    return priority;
  }

  /**
   * Calculate content flexibility for responsive behavior
   */
  private static calculateContentFlexibility(content: Record<string, any>, elementType: string): { horizontal: number; vertical: number } {
    const flexibility = { horizontal: 1, vertical: 1 };

    // Text is more flexible horizontally
    if (content.text) {
      flexibility.horizontal = 2;
      flexibility.vertical = 0.5;
    }

    // Images are less flexible
    if (content.src || content.image) {
      flexibility.horizontal = 0.3;
      flexibility.vertical = 0.3;
    }

    // Containers are more flexible vertically
    if (content.children || content.items) {
      flexibility.horizontal = 1.5;
      flexibility.vertical = 3;
    }

    // Fixed size content is inflexible
    if (content.width || content.height) {
      flexibility.horizontal *= 0.2;
      flexibility.vertical *= 0.2;
    }

    return flexibility;
  }

  /**
   * Generate automatic positioning constraints
   */
  private static generateAutoConstraints(
    analyzedElements: Array<{
      element: LayoutElement;
      naturalSize: { width: number; height: number };
      contentType: string;
      priority: number;
    }>,
    config: AutoLayoutConfig,
    bounds: Rectangle,
    monitor?: PerformanceMonitor
  ): LayoutConstraint[] {
    const constraints: LayoutConstraint[] = [];
    
    // Sort elements by priority for layout ordering
    const sortedElements = [...analyzedElements].sort((a, b) => b.priority - a.priority);

    switch (config.direction) {
      case 'vertical':
        constraints.push(...this.generateVerticalLayoutConstraints(sortedElements, config, bounds, monitor));
        break;
      case 'horizontal':
        constraints.push(...this.generateHorizontalLayoutConstraints(sortedElements, config, bounds, monitor));
        break;
      case 'grid':
        constraints.push(...this.generateGridLayoutConstraints(sortedElements, config, bounds, monitor));
        break;
    }

    // Apply padding constraints
    constraints.push(...this.generatePaddingConstraints(sortedElements, config, bounds));

    return constraints;
  }

  /**
   * Generate vertical layout constraints
   */
  private static generateVerticalLayoutConstraints(
    elements: Array<{ element: LayoutElement; naturalSize: { width: number; height: number } }>,
    config: AutoLayoutConfig,
    bounds: Rectangle,
    monitor?: PerformanceMonitor
  ): LayoutConstraint[] {
    const constraints: LayoutConstraint[] = [];
    
    let currentY = bounds.y + config.padding.top;

    elements.forEach((item, index) => {
      monitor?.recordIteration();

      // Size constraints
      constraints.push({
        type: 'size',
        element: item.element.id,
        property: 'width',
        value: config.maxWidth ? Math.min(item.naturalSize.width, config.maxWidth) : item.naturalSize.width,
        relation: 'equal',
        priority: 800
      });

      constraints.push({
        type: 'size',
        element: item.element.id,
        property: 'height',
        value: item.naturalSize.height,
        relation: 'equal',
        priority: 800
      });

      // Position constraints
      constraints.push({
        type: 'position',
        element: item.element.id,
        property: 'y',
        value: currentY,
        relation: 'equal',
        priority: 900
      });

      // Horizontal alignment
      switch (config.alignment) {
        case 'start':
          constraints.push({
            type: 'position',
            element: item.element.id,
            property: 'x',
            value: bounds.x + config.padding.left,
            relation: 'equal',
            priority: 700
          });
          break;
        case 'center':
          constraints.push({
            type: 'alignment',
            element: item.element.id,
            property: 'center-x',
            value: 0,
            priority: 700
          });
          break;
        case 'end':
          constraints.push({
            type: 'position',
            element: item.element.id,
            property: 'right',
            value: config.padding.right,
            relation: 'equal',
            priority: 700
          });
          break;
      }

      currentY += item.naturalSize.height + config.spacing;
    });

    return constraints;
  }

  /**
   * Generate horizontal layout constraints
   */
  private static generateHorizontalLayoutConstraints(
    elements: Array<{ element: LayoutElement; naturalSize: { width: number; height: number } }>,
    config: AutoLayoutConfig,
    bounds: Rectangle,
    monitor?: PerformanceMonitor
  ): LayoutConstraint[] {
    const constraints: LayoutConstraint[] = [];
    
    let currentX = bounds.x + config.padding.left;

    elements.forEach((item, index) => {
      monitor?.recordIteration();

      // Size constraints
      constraints.push({
        type: 'size',
        element: item.element.id,
        property: 'width',
        value: item.naturalSize.width,
        relation: 'equal',
        priority: 800
      });

      constraints.push({
        type: 'size',
        element: item.element.id,
        property: 'height',
        value: config.maxHeight ? Math.min(item.naturalSize.height, config.maxHeight) : item.naturalSize.height,
        relation: 'equal',
        priority: 800
      });

      // Position constraints
      constraints.push({
        type: 'position',
        element: item.element.id,
        property: 'x',
        value: currentX,
        relation: 'equal',
        priority: 900
      });

      // Vertical alignment
      switch (config.alignment) {
        case 'start':
          constraints.push({
            type: 'position',
            element: item.element.id,
            property: 'y',
            value: bounds.y + config.padding.top,
            relation: 'equal',
            priority: 700
          });
          break;
        case 'center':
          constraints.push({
            type: 'alignment',
            element: item.element.id,
            property: 'center-y',
            value: 0,
            priority: 700
          });
          break;
        case 'end':
          constraints.push({
            type: 'position',
            element: item.element.id,
            property: 'bottom',
            value: config.padding.bottom,
            relation: 'equal',
            priority: 700
          });
          break;
      }

      currentX += item.naturalSize.width + config.spacing;
    });

    return constraints;
  }

  /**
   * Generate grid layout constraints
   */
  private static generateGridLayoutConstraints(
    elements: Array<{ element: LayoutElement; naturalSize: { width: number; height: number } }>,
    config: AutoLayoutConfig,
    bounds: Rectangle,
    monitor?: PerformanceMonitor
  ): LayoutConstraint[] {
    const constraints: LayoutConstraint[] = [];
    
    // Calculate optimal grid dimensions
    const elementCount = elements.length;
    const columns = Math.ceil(Math.sqrt(elementCount));
    const rows = Math.ceil(elementCount / columns);
    
    const cellWidth = (bounds.width - config.padding.left - config.padding.right - ((columns - 1) * config.spacing)) / columns;
    const cellHeight = (bounds.height - config.padding.top - config.padding.bottom - ((rows - 1) * config.spacing)) / rows;

    elements.forEach((item, index) => {
      monitor?.recordIteration();

      const row = Math.floor(index / columns);
      const col = index % columns;
      
      const x = bounds.x + config.padding.left + (col * (cellWidth + config.spacing));
      const y = bounds.y + config.padding.top + (row * (cellHeight + config.spacing));

      // Position constraints
      constraints.push({
        type: 'position',
        element: item.element.id,
        property: 'x',
        value: x,
        relation: 'equal',
        priority: 900
      });

      constraints.push({
        type: 'position',
        element: item.element.id,
        property: 'y',
        value: y,
        relation: 'equal',
        priority: 900
      });

      // Size constraints - use smaller of natural size or cell size
      const width = Math.min(item.naturalSize.width, cellWidth);
      const height = Math.min(item.naturalSize.height, cellHeight);

      constraints.push({
        type: 'size',
        element: item.element.id,
        property: 'width',
        value: width,
        relation: 'equal',
        priority: 800
      });

      constraints.push({
        type: 'size',
        element: item.element.id,
        property: 'height',
        value: height,
        relation: 'equal',
        priority: 800
      });
    });

    return constraints;
  }

  /**
   * Generate content-aware spacing constraints
   */
  private static generateSpacingConstraints(
    elements: Array<{
      element: LayoutElement;
      contentType: string;
      flexibility: { horizontal: number; vertical: number };
    }>,
    config: AutoLayoutConfig,
    monitor?: PerformanceMonitor
  ): LayoutConstraint[] {
    const constraints: LayoutConstraint[] = [];

    // Create adaptive spacing based on content relationships
    for (let i = 0; i < elements.length - 1; i++) {
      monitor?.recordIteration();

      const current = elements[i];
      const next = elements[i + 1];

      // Calculate adaptive spacing
      const baseSpacing = config.spacing;
      const adaptiveSpacing = this.calculateAdaptiveSpacing(current, next, baseSpacing);

      if (config.direction === 'vertical') {
        constraints.push({
          type: 'spacing',
          element: next.element.id,
          property: 'vertical',
          target: current.element.id,
          value: adaptiveSpacing,
          relation: 'equal',
          priority: 600
        });
      } else if (config.direction === 'horizontal') {
        constraints.push({
          type: 'spacing',
          element: next.element.id,
          property: 'horizontal',
          target: current.element.id,
          value: adaptiveSpacing,
          relation: 'equal',
          priority: 600
        });
      }
    }

    return constraints;
  }

  /**
   * Calculate adaptive spacing between two elements
   */
  private static calculateAdaptiveSpacing(
    current: { contentType: string; flexibility: { horizontal: number; vertical: number } },
    next: { contentType: string; flexibility: { horizontal: number; vertical: number } },
    baseSpacing: number
  ): number {
    let multiplier = 1;

    // Increase spacing between different content types
    if (current.contentType !== next.contentType) {
      multiplier += 0.5;
    }

    // Increase spacing around images
    if (current.contentType === 'image' || next.contentType === 'image') {
      multiplier += 0.3;
    }

    // Increase spacing around containers
    if (current.contentType === 'container' || next.contentType === 'container') {
      multiplier += 0.2;
    }

    // Reduce spacing between similar text elements
    if (current.contentType === 'text' && next.contentType === 'text') {
      multiplier -= 0.2;
    }

    return Math.max(baseSpacing * 0.5, baseSpacing * multiplier);
  }

  /**
   * Generate padding constraints
   */
  private static generatePaddingConstraints(
    elements: Array<{ element: LayoutElement }>,
    config: AutoLayoutConfig,
    bounds: Rectangle
  ): LayoutConstraint[] {
    const constraints: LayoutConstraint[] = [];

    elements.forEach(item => {
      // Minimum distance from container edges
      constraints.push({
        type: 'position',
        element: item.element.id,
        property: 'left',
        value: config.padding.left,
        relation: 'greater',
        priority: 400
      });

      constraints.push({
        type: 'position',
        element: item.element.id,
        property: 'top',
        value: config.padding.top,
        relation: 'greater',
        priority: 400
      });

      constraints.push({
        type: 'position',
        element: item.element.id,
        property: 'right',
        value: config.padding.right,
        relation: 'greater',
        priority: 400
      });

      constraints.push({
        type: 'position',
        element: item.element.id,
        property: 'bottom',
        value: config.padding.bottom,
        relation: 'greater',
        priority: 400
      });
    });

    return constraints;
  }

  /**
   * Apply responsive adjustments to layout
   */
  private static applyResponsiveAdjustments(
    solution: Map<string, Rectangle>,
    bounds: Rectangle,
    config: AutoLayoutConfig,
    monitor?: PerformanceMonitor
  ): Map<string, Rectangle> {
    monitor?.start('responsive-adjustments');

    const adjustedSolution = new Map<string, Rectangle>();

    // Calculate container aspect ratio
    const aspectRatio = bounds.width / bounds.height;
    
    solution.forEach((rect, elementId) => {
      monitor?.recordIteration();

      const adjustedRect = { ...rect };

      // Adjust for narrow containers (mobile-like)
      if (aspectRatio < 0.75) {
        // Stack elements more vertically
        adjustedRect.width = Math.min(adjustedRect.width, bounds.width * 0.9);
      }

      // Adjust for wide containers (desktop-like)
      if (aspectRatio > 2) {
        // Allow more horizontal spacing
        adjustedRect.width = Math.max(adjustedRect.width, 200);
      }

      // Prevent overflow
      adjustedRect.x = Math.max(bounds.x, Math.min(adjustedRect.x, bounds.x + bounds.width - adjustedRect.width));
      adjustedRect.y = Math.max(bounds.y, Math.min(adjustedRect.y, bounds.y + bounds.height - adjustedRect.height));

      adjustedSolution.set(elementId, adjustedRect);
    });

    return adjustedSolution;
  }

  /**
   * Get auto-layout recommendations for element arrangement
   */
  static getLayoutRecommendations(
    elements: LayoutElement[],
    bounds: Rectangle
  ): {
    recommendedDirection: 'vertical' | 'horizontal' | 'grid';
    recommendedSpacing: number;
    recommendedAlignment: 'start' | 'center' | 'end';
    reasoning: string[];
  } {
    const reasoning: string[] = [];
    
    // Analyze element count
    const elementCount = elements.length;
    let recommendedDirection: 'vertical' | 'horizontal' | 'grid' = 'vertical';
    
    if (elementCount <= 2) {
      recommendedDirection = bounds.width > bounds.height ? 'horizontal' : 'vertical';
      reasoning.push(`With ${elementCount} elements, ${recommendedDirection} layout works best`);
    } else if (elementCount <= 6) {
      recommendedDirection = 'vertical';
      reasoning.push(`With ${elementCount} elements, vertical stacking provides good readability`);
    } else {
      recommendedDirection = 'grid';
      reasoning.push(`With ${elementCount} elements, grid layout optimizes space usage`);
    }

    // Analyze content types
    const hasImages = elements.some(el => el.content?.src || el.content?.image);
    const hasText = elements.some(el => el.content?.text || el.content?.title);
    
    if (hasImages && hasText) {
      reasoning.push('Mixed content types benefit from grid or vertical layout');
      if (recommendedDirection === 'horizontal') {
        recommendedDirection = 'vertical';
      }
    }

    // Recommend spacing based on content density
    let recommendedSpacing = 16; // Default
    if (hasImages) {
      recommendedSpacing = 24;
      reasoning.push('Images require more spacing for visual breathing room');
    } else if (elements.every(el => el.type === 'text' || el.content?.text)) {
      recommendedSpacing = 12;
      reasoning.push('Text content can use tighter spacing');
    }

    // Recommend alignment based on content and container
    let recommendedAlignment: 'start' | 'center' | 'end' = 'start';
    if (bounds.width > 600 && elementCount <= 3) {
      recommendedAlignment = 'center';
      reasoning.push('Wide containers with few elements work well with center alignment');
    } else if (hasImages && elementCount <= 4) {
      recommendedAlignment = 'center';
      reasoning.push('Images are often visually appealing when centered');
    }

    return {
      recommendedDirection,
      recommendedSpacing,
      recommendedAlignment,
      reasoning
    };
  }
}