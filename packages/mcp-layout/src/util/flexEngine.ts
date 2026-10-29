import {
  FlexConfig,
  FlexElement,
  FlexLayout,
  Rectangle,
  LayoutError,
  LayoutErrorCode
} from '../types/layout.js';
import { PerformanceMonitor } from './performance.js';
import { LayoutValidator } from './validation.js';

/**
 * CSS Flexbox layout computation engine
 */
export class FlexEngine {
  
  /**
   * Create a Flexbox layout with computed positions
   */
  static createLayout(
    config: FlexConfig,
    elements: FlexElement[],
    bounds: Rectangle,
    monitor?: PerformanceMonitor
  ): FlexLayout {
    monitor?.start('flex-layout-creation');
    
    try {
      // Validate configuration
      const configErrors = LayoutValidator.validateFlexConfig(config);
      const elementErrors = LayoutValidator.validateFlexElements(elements);
      
      if (configErrors.length > 0 || elementErrors.length > 0) {
        throw new Error(`Flex validation failed: ${[...configErrors, ...elementErrors].map(e => e.message).join(', ')}`);
      }

      // Determine main and cross axes
      const axes = this.determineAxes(config.direction);
      monitor?.recordIteration();

      // Calculate element sizes and positions
      const computedFlex = this.computeFlexLayout(config, elements, bounds, axes, monitor);
      
      const layout: FlexLayout = {
        type: 'flex',
        config,
        elements,
        bounds,
        computedFlex
      };

      return layout;
      
    } finally {
      monitor?.recordIteration();
    }
  }

  /**
   * Determine main and cross axes based on flex-direction
   */
  private static determineAxes(direction: FlexConfig['direction']): {
    main: 'horizontal' | 'vertical';
    cross: 'horizontal' | 'vertical';
    reversed: boolean;
  } {
    switch (direction) {
    case 'row':
      return { main: 'horizontal', cross: 'vertical', reversed: false };
    case 'row-reverse':
      return { main: 'horizontal', cross: 'vertical', reversed: true };
    case 'column':
      return { main: 'vertical', cross: 'horizontal', reversed: false };
    case 'column-reverse':
      return { main: 'vertical', cross: 'horizontal', reversed: true };
    default:
      return { main: 'horizontal', cross: 'vertical', reversed: false };
    }
  }

  /**
   * Compute complete flexbox layout
   */
  private static computeFlexLayout(
    config: FlexConfig,
    elements: FlexElement[],
    bounds: Rectangle,
    axes: { main: 'horizontal' | 'vertical'; cross: 'horizontal' | 'vertical'; reversed: boolean },
    monitor?: PerformanceMonitor
  ): {
    mainAxis: 'horizontal' | 'vertical';
    crossAxis: 'horizontal' | 'vertical';
    elementPositions: Array<{
      id: string;
      bounds: Rectangle;
      flexValues: { grow: number; shrink: number; basis: number };
    }>;
  } {
    // Parse gap values
    const gap = this.parseGap(config);
    
    // Sort elements by order
    const sortedElements = [...elements].sort((a, b) => (a.order || 0) - (b.order || 0));
    if (axes.reversed) {
      sortedElements.reverse();
    }

    // Calculate main axis size (container size minus gaps)
    const totalGap = Math.max(0, (sortedElements.length - 1) * gap.main);
    const availableMainSize = this.getMainAxisSize(bounds, axes.main) - totalGap;
    const availableCrossSize = this.getCrossAxisSize(bounds, axes.cross);

    monitor?.recordIteration();

    // Phase 1: Calculate flex basis and resolve flexibility
    const flexItems = this.calculateFlexBasis(sortedElements, availableMainSize, axes, monitor);
    
    // Phase 2: Resolve flexible lengths
    const resolvedItems = this.resolveFlexibleLengths(flexItems, availableMainSize, monitor);
    
    // Phase 3: Determine cross-axis sizes
    const crossSizedItems = this.determineCrossAxisSizes(resolvedItems, availableCrossSize, axes, monitor);
    
    // Phase 4: Handle multi-line flexbox (if wrap is enabled)
    const lines = this.handleFlexWrap(config, crossSizedItems, availableMainSize, axes, gap);
    
    // Phase 5: Position elements within each line
    const elementPositions = this.positionElements(config, lines, bounds, axes, gap, monitor);

    return {
      mainAxis: axes.main,
      crossAxis: axes.cross,
      elementPositions
    };
  }

  /**
   * Parse gap values from config
   */
  private static parseGap(config: FlexConfig): { main: number; cross: number } {
    const parseGapValue = (value: string): number => {
      const match = value.match(/^(\d*\.?\d+)(px|em|rem|%)?$/);
      if (match) {
        return parseFloat(match[1]);
      }
      return 0;
    };

    const gap = parseGapValue(config.gap);
    const rowGap = config.rowGap ? parseGapValue(config.rowGap) : gap;
    const columnGap = config.columnGap ? parseGapValue(config.columnGap) : gap;

    return {
      main: config.direction.startsWith('row') ? columnGap : rowGap,
      cross: config.direction.startsWith('row') ? rowGap : columnGap
    };
  }

  /**
   * Get container size along main axis
   */
  private static getMainAxisSize(bounds: Rectangle, mainAxis: 'horizontal' | 'vertical'): number {
    return mainAxis === 'horizontal' ? bounds.width : bounds.height;
  }

  /**
   * Get container size along cross axis
   */
  private static getCrossAxisSize(bounds: Rectangle, crossAxis: 'horizontal' | 'vertical'): number {
    return crossAxis === 'horizontal' ? bounds.width : bounds.height;
  }

  /**
   * Calculate flex basis for all elements
   */
  private static calculateFlexBasis(
    elements: FlexElement[],
    availableMainSize: number,
    axes: { main: 'horizontal' | 'vertical'; cross: 'horizontal' | 'vertical' },
    monitor?: PerformanceMonitor
  ): Array<{
    element: FlexElement;
    flexBasis: number;
    minSize: number;
    maxSize: number;
    naturalSize: number;
  }> {
    return elements.map(element => {
      monitor?.recordIteration();
      
      const flexBasis = this.resolveFlexBasis(element.flexBasis, availableMainSize);
      const minSize = this.getMinSize(element, axes.main);
      const maxSize = this.getMaxSize(element, axes.main);
      const naturalSize = this.calculateNaturalSize(element, axes.main);

      return {
        element,
        flexBasis: Math.max(minSize, Math.min(maxSize, flexBasis)),
        minSize,
        maxSize,
        naturalSize
      };
    });
  }

  /**
   * Resolve flex-basis value
   */
  private static resolveFlexBasis(flexBasis: number | string, availableSize: number): number {
    if (typeof flexBasis === 'number') {
      return flexBasis;
    }

    if (flexBasis === 'auto' || flexBasis === 'content') {
      return 100; // Simplified content-based sizing
    }

    if (typeof flexBasis === 'string' && flexBasis.endsWith('%')) {
      const percentage = parseFloat(flexBasis.slice(0, -1));
      return (percentage / 100) * availableSize;
    }

    if (typeof flexBasis === 'string' && flexBasis.endsWith('px')) {
      return parseFloat(flexBasis.slice(0, -2));
    }

    return 100; // Default fallback
  }

  /**
   * Get minimum size constraint for element
   */
  private static getMinSize(element: FlexElement, mainAxis: 'horizontal' | 'vertical'): number {
    const minProp = mainAxis === 'horizontal' ? element.minWidth : element.minHeight;
    return minProp || 0;
  }

  /**
   * Get maximum size constraint for element
   */
  private static getMaxSize(element: FlexElement, mainAxis: 'horizontal' | 'vertical'): number {
    const maxProp = mainAxis === 'horizontal' ? element.maxWidth : element.maxHeight;
    return maxProp || Infinity;
  }

  /**
   * Calculate natural (intrinsic) size of element
   */
  private static calculateNaturalSize(element: FlexElement, mainAxis: 'horizontal' | 'vertical'): number {
    // Simplified calculation based on content
    // In a real implementation, this would analyze text content, images, etc.
    if (element.content) {
      const contentStr = JSON.stringify(element.content);
      return Math.max(50, Math.min(300, contentStr.length * 8));
    }
    return 100;
  }

  /**
   * Resolve flexible lengths using flexbox algorithm
   */
  private static resolveFlexibleLengths(
    flexItems: Array<{
      element: FlexElement;
      flexBasis: number;
      minSize: number;
      maxSize: number;
      naturalSize: number;
    }>,
    availableMainSize: number,
    monitor?: PerformanceMonitor
  ): Array<{
    element: FlexElement;
    finalSize: number;
    flexBasis: number;
    minSize: number;
    maxSize: number;
  }> {
    // Calculate total flex basis
    const totalFlexBasis = flexItems.reduce((sum, item) => sum + item.flexBasis, 0);
    const remainingSpace = availableMainSize - totalFlexBasis;

    monitor?.recordIteration();

    if (remainingSpace > 0) {
      // Distribute positive free space using flex-grow
      return this.distributePositiveSpace(flexItems, remainingSpace, monitor);
    } else if (remainingSpace < 0) {
      // Distribute negative free space using flex-shrink
      return this.distributeNegativeSpace(flexItems, -remainingSpace, monitor);
    } else {
      // No free space to distribute
      return flexItems.map(item => ({
        element: item.element,
        finalSize: item.flexBasis,
        flexBasis: item.flexBasis,
        minSize: item.minSize,
        maxSize: item.maxSize
      }));
    }
  }

  /**
   * Distribute positive free space using flex-grow
   */
  private static distributePositiveSpace(
    flexItems: Array<{
      element: FlexElement;
      flexBasis: number;
      minSize: number;
      maxSize: number;
      naturalSize: number;
    }>,
    positiveSpace: number,
    monitor?: PerformanceMonitor
  ): Array<{
    element: FlexElement;
    finalSize: number;
    flexBasis: number;
    minSize: number;
    maxSize: number;
  }> {
    // Calculate total flex grow
    const totalFlexGrow = flexItems.reduce((sum, item) => sum + item.element.flexGrow, 0);
    
    if (totalFlexGrow === 0) {
      // No flex growth, keep flex basis
      return flexItems.map(item => ({
        element: item.element,
        finalSize: item.flexBasis,
        flexBasis: item.flexBasis,
        minSize: item.minSize,
        maxSize: item.maxSize
      }));
    }

    const result: Array<{
      element: FlexElement;
      finalSize: number;
      flexBasis: number;
      minSize: number;
      maxSize: number;
    }> = [];

    let remainingSpace = positiveSpace;
    const remainingItems = [...flexItems];

    // Distribute space iteratively, handling max-size constraints
    while (remainingSpace > 0.01 && remainingItems.length > 0) {
      monitor?.recordIteration();

      const totalGrow = remainingItems.reduce((sum, item) => sum + item.element.flexGrow, 0);
      if (totalGrow === 0) break;

      const spacePerGrowUnit = remainingSpace / totalGrow;
      const newItems: typeof remainingItems = [];

      remainingItems.forEach(item => {
        const growth = item.element.flexGrow * spacePerGrowUnit;
        const proposedSize = item.flexBasis + growth;
        const clampedSize = Math.min(item.maxSize, proposedSize);

        if (clampedSize === proposedSize) {
          // Item can grow to proposed size
          newItems.push(item);
        } else {
          // Item hit max constraint, finalize it
          result.push({
            element: item.element,
            finalSize: clampedSize,
            flexBasis: item.flexBasis,
            minSize: item.minSize,
            maxSize: item.maxSize
          });
          remainingSpace -= (clampedSize - item.flexBasis);
        }
      });

      if (newItems.length === remainingItems.length) {
        // No constraints hit, finalize all remaining items
        newItems.forEach(item => {
          const growth = item.element.flexGrow * spacePerGrowUnit;
          result.push({
            element: item.element,
            finalSize: item.flexBasis + growth,
            flexBasis: item.flexBasis,
            minSize: item.minSize,
            maxSize: item.maxSize
          });
        });
        // Every remaining item is finalized; clear so the fallback below does not re-add them.
        remainingItems.length = 0;
        break;
      }

      remainingItems.length = 0;
      remainingItems.push(...newItems);
    }

    // Finalize any remaining items
    remainingItems.forEach(item => {
      result.push({
        element: item.element,
        finalSize: item.flexBasis,
        flexBasis: item.flexBasis,
        minSize: item.minSize,
        maxSize: item.maxSize
      });
    });

    return result;
  }

  /**
   * Distribute negative free space using flex-shrink
   */
  private static distributeNegativeSpace(
    flexItems: Array<{
      element: FlexElement;
      flexBasis: number;
      minSize: number;
      maxSize: number;
      naturalSize: number;
    }>,
    negativeSpace: number,
    monitor?: PerformanceMonitor
  ): Array<{
    element: FlexElement;
    finalSize: number;
    flexBasis: number;
    minSize: number;
    maxSize: number;
  }> {
    // Calculate scaled flex shrink factors
    const scaledShrinkFactors = flexItems.map(item => ({
      item,
      scaledShrink: item.element.flexShrink * item.flexBasis
    }));

    const totalScaledShrink = scaledShrinkFactors.reduce((sum, { scaledShrink }) => sum + scaledShrink, 0);

    if (totalScaledShrink === 0) {
      // No flex shrink, items overflow
      return flexItems.map(item => ({
        element: item.element,
        finalSize: item.flexBasis,
        flexBasis: item.flexBasis,
        minSize: item.minSize,
        maxSize: item.maxSize
      }));
    }

    const result: Array<{
      element: FlexElement;
      finalSize: number;
      flexBasis: number;
      minSize: number;
      maxSize: number;
    }> = [];

    let remainingNegativeSpace = negativeSpace;
    const remainingItems = [...scaledShrinkFactors];

    // Distribute negative space iteratively, handling min-size constraints
    while (remainingNegativeSpace > 0.01 && remainingItems.length > 0) {
      monitor?.recordIteration();

      const totalShrink = remainingItems.reduce((sum, { scaledShrink }) => sum + scaledShrink, 0);
      if (totalShrink === 0) break;

      const newItems: typeof remainingItems = [];

      remainingItems.forEach(({ item, scaledShrink }) => {
        const shrinkRatio = scaledShrink / totalShrink;
        const shrinkage = remainingNegativeSpace * shrinkRatio;
        const proposedSize = item.flexBasis - shrinkage;
        const clampedSize = Math.max(item.minSize, proposedSize);

        if (clampedSize === proposedSize) {
          // Item can shrink to proposed size
          newItems.push({ item, scaledShrink });
        } else {
          // Item hit min constraint, finalize it
          result.push({
            element: item.element,
            finalSize: clampedSize,
            flexBasis: item.flexBasis,
            minSize: item.minSize,
            maxSize: item.maxSize
          });
          remainingNegativeSpace -= (item.flexBasis - clampedSize);
        }
      });

      if (newItems.length === remainingItems.length) {
        // No constraints hit, finalize all remaining items
        newItems.forEach(({ item, scaledShrink }) => {
          const shrinkRatio = scaledShrink / totalShrink;
          const shrinkage = remainingNegativeSpace * shrinkRatio;
          result.push({
            element: item.element,
            finalSize: Math.max(item.minSize, item.flexBasis - shrinkage),
            flexBasis: item.flexBasis,
            minSize: item.minSize,
            maxSize: item.maxSize
          });
        });
        // Every remaining item is finalized; clear so the fallback below does not re-add them.
        remainingItems.length = 0;
        break;
      }

      remainingItems.length = 0;
      remainingItems.push(...newItems);
    }

    // Finalize any remaining items
    remainingItems.forEach(({ item }) => {
      result.push({
        element: item.element,
        finalSize: item.flexBasis,
        flexBasis: item.flexBasis,
        minSize: item.minSize,
        maxSize: item.maxSize
      });
    });

    return result;
  }

  /**
   * Determine cross-axis sizes for flex items
   */
  private static determineCrossAxisSizes(
    resolvedItems: Array<{
      element: FlexElement;
      finalSize: number;
      flexBasis: number;
      minSize: number;
      maxSize: number;
    }>,
    availableCrossSize: number,
    axes: { main: 'horizontal' | 'vertical'; cross: 'horizontal' | 'vertical' },
    monitor?: PerformanceMonitor
  ): Array<{
    element: FlexElement;
    mainSize: number;
    crossSize: number;
    flexBasis: number;
    minSize: number;
    maxSize: number;
  }> {
    return resolvedItems.map(item => {
      monitor?.recordIteration();

      const crossMinSize = this.getMinSize(item.element, axes.cross);
      const crossMaxSize = this.getMaxSize(item.element, axes.cross);
      
      let crossSize: number;
      
      if (item.element.alignSelf === 'stretch' || item.element.alignSelf === undefined) {
        // Stretch to fill cross axis (default behavior)
        crossSize = Math.max(crossMinSize, Math.min(crossMaxSize, availableCrossSize));
      } else {
        // Use natural cross size
        const naturalCrossSize = this.calculateNaturalSize(item.element, axes.cross);
        crossSize = Math.max(crossMinSize, Math.min(crossMaxSize, naturalCrossSize));
      }

      return {
        element: item.element,
        mainSize: item.finalSize,
        crossSize,
        flexBasis: item.flexBasis,
        minSize: item.minSize,
        maxSize: item.maxSize
      };
    });
  }

  /**
   * Handle flex-wrap by grouping items into lines
   */
  private static handleFlexWrap(
    config: FlexConfig,
    items: Array<{
      element: FlexElement;
      mainSize: number;
      crossSize: number;
    }>,
    availableMainSize: number,
    axes: { main: 'horizontal' | 'vertical' },
    gap: { main: number; cross: number }
  ): Array<Array<{
    element: FlexElement;
    mainSize: number;
    crossSize: number;
  }>> {
    if (config.wrap === 'nowrap') {
      // Single line
      return [items];
    }

    const lines: Array<Array<{
      element: FlexElement;
      mainSize: number;
      crossSize: number;
    }>> = [];
    
    let currentLine: typeof items = [];
    let currentLineSize = 0;

    items.forEach(item => {
      const itemSizeWithGap = item.mainSize + (currentLine.length > 0 ? gap.main : 0);
      
      if (currentLineSize + itemSizeWithGap <= availableMainSize || currentLine.length === 0) {
        // Item fits in current line
        currentLine.push(item);
        currentLineSize += itemSizeWithGap;
      } else {
        // Start new line
        if (currentLine.length > 0) {
          lines.push(currentLine);
        }
        currentLine = [item];
        currentLineSize = item.mainSize;
      }
    });

    if (currentLine.length > 0) {
      lines.push(currentLine);
    }

    if (config.wrap === 'wrap-reverse') {
      lines.reverse();
    }

    return lines;
  }

  /**
   * Position elements within the flex container
   */
  private static positionElements(
    config: FlexConfig,
    lines: Array<Array<{
      element: FlexElement;
      mainSize: number;
      crossSize: number;
    }>>,
    bounds: Rectangle,
    axes: { main: 'horizontal' | 'vertical'; cross: 'horizontal' | 'vertical'; reversed: boolean },
    gap: { main: number; cross: number },
    monitor?: PerformanceMonitor
  ): Array<{
    id: string;
    bounds: Rectangle;
    flexValues: { grow: number; shrink: number; basis: number };
  }> {
    const elementPositions: Array<{
      id: string;
      bounds: Rectangle;
      flexValues: { grow: number; shrink: number; basis: number };
    }> = [];

    let crossStart = 0;

    lines.forEach(line => {
      monitor?.recordIteration();

      // Calculate line cross size
      const lineCrossSize = Math.max(...line.map(item => item.crossSize));
      
      // Position items in main axis
      const mainPositions = this.positionItemsInMainAxis(config, line, bounds, axes, gap.main);
      
      // Position items in cross axis
      line.forEach((item, index) => {
        const mainPos = mainPositions[index];
        const crossPos = this.positionItemInCrossAxis(
          config,
          item,
          crossStart,
          lineCrossSize,
          axes
        );

        const elementBounds = this.createElementBounds(
          mainPos,
          crossPos,
          item.mainSize,
          item.crossSize,
          bounds,
          axes
        );

        elementPositions.push({
          id: item.element.id,
          bounds: elementBounds,
          flexValues: {
            grow: item.element.flexGrow,
            shrink: item.element.flexShrink,
            basis: typeof item.element.flexBasis === 'number' ? item.element.flexBasis : 0
          }
        });
      });

      crossStart += lineCrossSize + gap.cross;
    });

    return elementPositions;
  }

  /**
   * Position items along main axis using justify-content
   */
  private static positionItemsInMainAxis(
    config: FlexConfig,
    line: Array<{ mainSize: number }>,
    bounds: Rectangle,
    axes: { main: 'horizontal' | 'vertical' },
    mainGap: number
  ): number[] {
    const containerSize = this.getMainAxisSize(bounds, axes.main);
    const totalItemSize = line.reduce((sum, item) => sum + item.mainSize, 0);
    const totalGap = Math.max(0, (line.length - 1) * mainGap);
    const freeSpace = containerSize - totalItemSize - totalGap;

    const positions: number[] = [];
    let currentPosition = 0;

    switch (config.justifyContent) {
    case 'flex-start':
      line.forEach((item, index) => {
        positions.push(currentPosition);
        currentPosition += item.mainSize + (index < line.length - 1 ? mainGap : 0);
      });
      break;

    case 'flex-end':
      currentPosition = freeSpace;
      line.forEach((item, index) => {
        positions.push(currentPosition);
        currentPosition += item.mainSize + (index < line.length - 1 ? mainGap : 0);
      });
      break;

    case 'center':
      currentPosition = freeSpace / 2;
      line.forEach((item, index) => {
        positions.push(currentPosition);
        currentPosition += item.mainSize + (index < line.length - 1 ? mainGap : 0);
      });
      break;

    case 'space-between':
      if (line.length === 1) {
        positions.push(0);
      } else {
        const spaceBetween = freeSpace / (line.length - 1);
        line.forEach((item, index) => {
          positions.push(currentPosition);
          currentPosition += item.mainSize + spaceBetween;
        });
      }
      break;

    case 'space-around':
      const spaceAround = freeSpace / line.length;
      currentPosition = spaceAround / 2;
      line.forEach(item => {
        positions.push(currentPosition);
        currentPosition += item.mainSize + spaceAround;
      });
      break;

    case 'space-evenly':
      const spaceEvenly = freeSpace / (line.length + 1);
      currentPosition = spaceEvenly;
      line.forEach(item => {
        positions.push(currentPosition);
        currentPosition += item.mainSize + spaceEvenly;
      });
      break;

    default:
      // Fallback to flex-start
      line.forEach((item, index) => {
        positions.push(currentPosition);
        currentPosition += item.mainSize + (index < line.length - 1 ? mainGap : 0);
      });
    }

    return positions;
  }

  /**
   * Position item along cross axis using align-items/align-self
   */
  private static positionItemInCrossAxis(
    config: FlexConfig,
    item: { element: FlexElement; crossSize: number },
    lineStart: number,
    lineCrossSize: number,
    axes: { cross: 'horizontal' | 'vertical' }
  ): number {
    const alignment = item.element.alignSelf || config.alignItems;

    switch (alignment) {
    case 'flex-start':
      return lineStart;
    case 'flex-end':
      return lineStart + lineCrossSize - item.crossSize;
    case 'center':
      return lineStart + (lineCrossSize - item.crossSize) / 2;
    case 'stretch':
      return lineStart;
    case 'baseline':
      // Simplified baseline alignment
      return lineStart;
    default:
      return lineStart;
    }
  }

  /**
   * Create element bounds rectangle from position and size
   */
  private static createElementBounds(
    mainPos: number,
    crossPos: number,
    mainSize: number,
    crossSize: number,
    containerBounds: Rectangle,
    axes: { main: 'horizontal' | 'vertical'; cross: 'horizontal' | 'vertical' }
  ): Rectangle {
    if (axes.main === 'horizontal') {
      return {
        x: containerBounds.x + mainPos,
        y: containerBounds.y + crossPos,
        width: mainSize,
        height: crossSize
      };
    } else {
      return {
        x: containerBounds.x + crossPos,
        y: containerBounds.y + mainPos,
        width: crossSize,
        height: mainSize
      };
    }
  }

  /**
   * Calculate flexbox layout metrics
   */
  static calculateMetrics(layout: FlexLayout): {
    totalElements: number;
    lineCount: number;
    averageElementSize: number;
    flexGrowTotal: number;
    flexShrinkTotal: number;
  } {
    const totalElements = layout.elements.length;
    const flexGrowTotal = layout.elements.reduce((sum, el) => sum + el.flexGrow, 0);
    const flexShrinkTotal = layout.elements.reduce((sum, el) => sum + el.flexShrink, 0);

    let averageElementSize = 0;
    const lineCount = 1; // Simplified - would need to analyze computed layout

    if (layout.computedFlex?.elementPositions.length) {
      const sizes = layout.computedFlex.elementPositions.map(pos => 
        layout.computedFlex?.mainAxis === 'horizontal' ? pos.bounds.width : pos.bounds.height
      );
      averageElementSize = sizes.reduce((sum, size) => sum + size, 0) / sizes.length;
    }

    return {
      totalElements,
      lineCount,
      averageElementSize,
      flexGrowTotal,
      flexShrinkTotal
    };
  }

  /**
   * Optimize flexbox layout for better performance
   */
  static optimizeLayout(layout: FlexLayout): FlexLayout {
    // Create a copy for optimization
    const optimized = JSON.parse(JSON.stringify(layout));
    
    // Remove elements with zero flex values and no content
    optimized.elements = optimized.elements.filter((element: FlexElement) => {
      return element.flexGrow > 0 || 
             element.flexShrink !== 1 || 
             element.flexBasis !== 'auto' ||
             element.content;
    });

    return optimized;
  }
}