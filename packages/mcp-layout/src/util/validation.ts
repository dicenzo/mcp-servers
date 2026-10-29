import { 
  GridConfig, 
  FlexConfig, 
  LayoutConstraint,
  Rectangle,
  GridElement,
  FlexElement,
  LayoutError,
  LayoutErrorCode,
  Breakpoint
} from '../types/layout.js';

/**
 * Validation utilities for layout configurations and constraints
 */
export class LayoutValidator {
  
  /**
   * Validate CSS Grid configuration
   */
  static validateGridConfig(config: GridConfig): LayoutError[] {
    const errors: LayoutError[] = [];

    // Validate grid template columns/rows syntax
    if (!this.isValidCSSGridTemplate(config.columns)) {
      errors.push({
        code: LayoutErrorCode.INVALID_CONFIG,
        message: `Invalid grid-template-columns value: ${config.columns}`
      });
    }

    if (!this.isValidCSSGridTemplate(config.rows)) {
      errors.push({
        code: LayoutErrorCode.INVALID_CONFIG,
        message: `Invalid grid-template-rows value: ${config.rows}`
      });
    }

    // Validate gap values
    if (!this.isValidCSSLength(config.gap)) {
      errors.push({
        code: LayoutErrorCode.INVALID_CONFIG,
        message: `Invalid gap value: ${config.gap}`
      });
    }

    // Validate grid areas if provided
    if (config.areas) {
      const areaErrors = this.validateGridAreas(config.areas);
      errors.push(...areaErrors);
    }

    return errors;
  }

  /**
   * Validate Flexbox configuration
   */
  static validateFlexConfig(config: FlexConfig): LayoutError[] {
    const errors: LayoutError[] = [];

    // Validate gap values
    if (!this.isValidCSSLength(config.gap)) {
      errors.push({
        code: LayoutErrorCode.INVALID_CONFIG,
        message: `Invalid gap value: ${config.gap}`
      });
    }

    if (config.rowGap && !this.isValidCSSLength(config.rowGap)) {
      errors.push({
        code: LayoutErrorCode.INVALID_CONFIG,
        message: `Invalid row-gap value: ${config.rowGap}`
      });
    }

    if (config.columnGap && !this.isValidCSSLength(config.columnGap)) {
      errors.push({
        code: LayoutErrorCode.INVALID_CONFIG,
        message: `Invalid column-gap value: ${config.columnGap}`
      });
    }

    return errors;
  }

  /**
   * Validate layout constraints for conflicts and circular dependencies
   */
  static validateConstraints(constraints: LayoutConstraint[]): LayoutError[] {
    const errors: LayoutError[] = [];
    const dependencyGraph = new Map<string, Set<string>>();

    // Build dependency graph
    constraints.forEach(constraint => {
      if (constraint.target) {
        if (!dependencyGraph.has(constraint.element)) {
          dependencyGraph.set(constraint.element, new Set());
        }
        dependencyGraph.get(constraint.element)!.add(constraint.target);
      }
    });

    // Check for circular dependencies
    const circularDeps = this.detectCircularDependencies(dependencyGraph);
    circularDeps.forEach(cycle => {
      errors.push({
        code: LayoutErrorCode.CIRCULAR_DEPENDENCY,
        message: `Circular dependency detected: ${cycle.join(' -> ')}`
      });
    });

    // Check for conflicting constraints on same element/property
    const constraintMap = new Map<string, LayoutConstraint[]>();
    constraints.forEach(constraint => {
      const key = `${constraint.element}.${constraint.property}`;
      if (!constraintMap.has(key)) {
        constraintMap.set(key, []);
      }
      constraintMap.get(key)!.push(constraint);
    });

    constraintMap.forEach((elementConstraints, key) => {
      if (elementConstraints.length > 1) {
        const conflicts = this.detectConstraintConflicts(elementConstraints);
        conflicts.forEach(conflict => {
          errors.push({
            code: LayoutErrorCode.CONSTRAINT_CONFLICT,
            message: `Conflicting constraints on ${key}: ${conflict}`,
            element: elementConstraints[0].element
          });
        });
      }
    });

    return errors;
  }

  /**
   * Validate rectangle dimensions and positioning
   */
  static validateRectangle(rect: Rectangle): LayoutError[] {
    const errors: LayoutError[] = [];

    if (rect.width < 0) {
      errors.push({
        code: LayoutErrorCode.INVALID_DIMENSIONS,
        message: `Invalid width: ${rect.width} (must be >= 0)`
      });
    }

    if (rect.height < 0) {
      errors.push({
        code: LayoutErrorCode.INVALID_DIMENSIONS,
        message: `Invalid height: ${rect.height} (must be >= 0)`
      });
    }

    if (!Number.isFinite(rect.x) || !Number.isFinite(rect.y)) {
      errors.push({
        code: LayoutErrorCode.INVALID_DIMENSIONS,
        message: `Invalid position: (${rect.x}, ${rect.y}) (must be finite numbers)`
      });
    }

    return errors;
  }

  /**
   * Validate grid elements configuration
   */
  static validateGridElements(elements: GridElement[], config: GridConfig): LayoutError[] {
    const errors: LayoutError[] = [];
    const usedIds = new Set<string>();

    elements.forEach(element => {
      // Check for duplicate IDs
      if (usedIds.has(element.id)) {
        errors.push({
          code: LayoutErrorCode.INVALID_CONFIG,
          message: `Duplicate element ID: ${element.id}`,
          element: element.id
        });
      }
      usedIds.add(element.id);

      // Validate grid area references
      if (element.gridArea && config.areas) {
        const areaExists = config.areas.some(row => 
          row.some(area => area === element.gridArea)
        );
        if (!areaExists) {
          errors.push({
            code: LayoutErrorCode.INVALID_CONFIG,
            message: `Grid area '${element.gridArea}' not defined in grid template`,
            element: element.id
          });
        }
      }

      // Validate dimension constraints
      if (element.minWidth !== undefined && element.maxWidth !== undefined) {
        if (element.minWidth > element.maxWidth) {
          errors.push({
            code: LayoutErrorCode.INVALID_CONFIG,
            message: `minWidth (${element.minWidth}) cannot be greater than maxWidth (${element.maxWidth})`,
            element: element.id
          });
        }
      }

      if (element.minHeight !== undefined && element.maxHeight !== undefined) {
        if (element.minHeight > element.maxHeight) {
          errors.push({
            code: LayoutErrorCode.INVALID_CONFIG,
            message: `minHeight (${element.minHeight}) cannot be greater than maxHeight (${element.maxHeight})`,
            element: element.id
          });
        }
      }
    });

    return errors;
  }

  /**
   * Validate flex elements configuration
   */
  static validateFlexElements(elements: FlexElement[]): LayoutError[] {
    const errors: LayoutError[] = [];
    const usedIds = new Set<string>();

    elements.forEach(element => {
      // Check for duplicate IDs
      if (usedIds.has(element.id)) {
        errors.push({
          code: LayoutErrorCode.INVALID_CONFIG,
          message: `Duplicate element ID: ${element.id}`,
          element: element.id
        });
      }
      usedIds.add(element.id);

      // Validate flex values
      if (element.flexGrow < 0) {
        errors.push({
          code: LayoutErrorCode.INVALID_CONFIG,
          message: `flexGrow must be >= 0, got ${element.flexGrow}`,
          element: element.id
        });
      }

      if (element.flexShrink < 0) {
        errors.push({
          code: LayoutErrorCode.INVALID_CONFIG,
          message: `flexShrink must be >= 0, got ${element.flexShrink}`,
          element: element.id
        });
      }

      // Validate dimension constraints
      if (element.minWidth !== undefined && element.maxWidth !== undefined) {
        if (element.minWidth > element.maxWidth) {
          errors.push({
            code: LayoutErrorCode.INVALID_CONFIG,
            message: `minWidth (${element.minWidth}) cannot be greater than maxWidth (${element.maxWidth})`,
            element: element.id
          });
        }
      }

      if (element.minHeight !== undefined && element.maxHeight !== undefined) {
        if (element.minHeight > element.maxHeight) {
          errors.push({
            code: LayoutErrorCode.INVALID_CONFIG,
            message: `minHeight (${element.minHeight}) cannot be greater than maxHeight (${element.maxHeight})`,
            element: element.id
          });
        }
      }
    });

    return errors;
  }

  /**
   * Validate breakpoint configuration
   */
  static validateBreakpoints(breakpoints: Breakpoint[]): LayoutError[] {
    const errors: LayoutError[] = [];
    const names = new Set<string>();

    // Sort breakpoints by minWidth for validation
    const sortedBreakpoints = [...breakpoints].sort((a, b) => a.minWidth - b.minWidth);

    sortedBreakpoints.forEach((breakpoint, index) => {
      // Check for duplicate names
      if (names.has(breakpoint.name)) {
        errors.push({
          code: LayoutErrorCode.INVALID_CONFIG,
          message: `Duplicate breakpoint name: ${breakpoint.name}`
        });
      }
      names.add(breakpoint.name);

      // Validate maxWidth vs minWidth
      if (breakpoint.maxWidth !== undefined && breakpoint.maxWidth <= breakpoint.minWidth) {
        errors.push({
          code: LayoutErrorCode.INVALID_CONFIG,
          message: `Breakpoint ${breakpoint.name}: maxWidth (${breakpoint.maxWidth}) must be greater than minWidth (${breakpoint.minWidth})`
        });
      }

      // Check for overlapping ranges
      if (index > 0) {
        const prevBreakpoint = sortedBreakpoints[index - 1];
        if (prevBreakpoint.maxWidth !== undefined && prevBreakpoint.maxWidth > breakpoint.minWidth) {
          errors.push({
            code: LayoutErrorCode.INVALID_CONFIG,
            message: `Overlapping breakpoints: ${prevBreakpoint.name} and ${breakpoint.name}`
          });
        }
      }
    });

    return errors;
  }

  // Private helper methods
  
  private static isValidCSSGridTemplate(value: string): boolean {
    // Basic validation for CSS grid template values
    // This could be expanded with more sophisticated CSS parsing
    if (!value || value.trim() === '') return false;
    
    // Common valid patterns
    const validPatterns = [
      /^\d+px(\s+\d+px)*$/, // px values
      /^\d+fr(\s+\d+fr)*$/, // fr values
      /^repeat\(.+\)$/, // repeat function
      /^minmax\(.+\)$/, // minmax function
      /^auto$/, // auto keyword
      /^min-content$/, // min-content
      /^max-content$/, // max-content
      /^\[.+\]\s*\d+(px|fr|%)/, // named lines
    ];

    return validPatterns.some(pattern => pattern.test(value)) || 
           value.includes('repeat(') || 
           value.includes('minmax(') ||
           value.includes('fr') ||
           value.includes('px') ||
           value.includes('%');
  }

  private static isValidCSSLength(value: string): boolean {
    if (!value || value.trim() === '') return false;
    
    const lengthPattern = /^(\d*\.?\d+)(px|em|rem|%|vh|vw|fr|ch|ex)$|^0$|^auto$/;
    return lengthPattern.test(value.trim());
  }

  private static validateGridAreas(areas: string[][]): LayoutError[] {
    const errors: LayoutError[] = [];
    
    if (areas.length === 0) {
      errors.push({
        code: LayoutErrorCode.INVALID_CONFIG,
        message: 'Grid areas cannot be empty'
      });
      return errors;
    }

    const columnCount = areas[0].length;
    
    // Check that all rows have the same number of columns
    areas.forEach((row, index) => {
      if (row.length !== columnCount) {
        errors.push({
          code: LayoutErrorCode.INVALID_CONFIG,
          message: `Grid area row ${index} has ${row.length} columns, expected ${columnCount}`
        });
      }
    });

    // Check that areas form rectangular regions
    const areaMap = new Map<string, Array<{row: number, col: number}>>();
    
    areas.forEach((row, rowIndex) => {
      row.forEach((area, colIndex) => {
        if (area !== '.') { // '.' represents empty cells
          if (!areaMap.has(area)) {
            areaMap.set(area, []);
          }
          areaMap.get(area)!.push({row: rowIndex, col: colIndex});
        }
      });
    });

    areaMap.forEach((positions, areaName) => {
      if (!this.isRectangularArea(positions)) {
        errors.push({
          code: LayoutErrorCode.INVALID_CONFIG,
          message: `Grid area '${areaName}' does not form a rectangular region`
        });
      }
    });

    return errors;
  }

  private static isRectangularArea(positions: Array<{row: number, col: number}>): boolean {
    if (positions.length === 0) return false;
    if (positions.length === 1) return true;

    const rows = positions.map(p => p.row);
    const cols = positions.map(p => p.col);
    
    const minRow = Math.min(...rows);
    const maxRow = Math.max(...rows);
    const minCol = Math.min(...cols);
    const maxCol = Math.max(...cols);
    
    const expectedCells = (maxRow - minRow + 1) * (maxCol - minCol + 1);
    
    return positions.length === expectedCells;
  }

  private static detectCircularDependencies(graph: Map<string, Set<string>>): string[][] {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();
    const cycles: string[][] = [];

    const dfs = (node: string, path: string[]): void => {
      visited.add(node);
      recursionStack.add(node);
      path.push(node);

      const neighbors = graph.get(node) || new Set();
      for (const neighbor of neighbors) {
        if (recursionStack.has(neighbor)) {
          // Found a cycle
          const cycleStart = path.indexOf(neighbor);
          cycles.push([...path.slice(cycleStart), neighbor]);
        } else if (!visited.has(neighbor)) {
          dfs(neighbor, [...path]);
        }
      }

      recursionStack.delete(node);
    };

    for (const node of graph.keys()) {
      if (!visited.has(node)) {
        dfs(node, []);
      }
    }

    return cycles;
  }

  private static detectConstraintConflicts(constraints: LayoutConstraint[]): string[] {
    const conflicts: string[] = [];

    // Group constraints by relation type
    const equalConstraints = constraints.filter(c => !c.relation || c.relation === 'equal');
    const greaterConstraints = constraints.filter(c => c.relation === 'greater');
    const lessConstraints = constraints.filter(c => c.relation === 'less');

    // Check for conflicting equal values
    if (equalConstraints.length > 1) {
      const values = equalConstraints.map(c => c.value);
      const uniqueValues = new Set(values);
      if (uniqueValues.size > 1) {
        conflicts.push(`Multiple equal constraints with different values: ${Array.from(uniqueValues).join(', ')}`);
      }
    }

    // Check for impossible greater/less combinations
    if (greaterConstraints.length > 0 && lessConstraints.length > 0) {
      const maxGreater = Math.max(...greaterConstraints.map(c => Number(c.value)));
      const minLess = Math.min(...lessConstraints.map(c => Number(c.value)));
      
      if (maxGreater >= minLess) {
        conflicts.push(`Impossible constraint: value must be > ${maxGreater} and < ${minLess}`);
      }
    }

    return conflicts;
  }
}

/**
 * Performance validation for layout operations
 */
export class PerformanceValidator {
  
  /**
   * Validate that layout complexity is within acceptable bounds
   */
  static validateComplexity(elementCount: number, constraintCount: number): LayoutError[] {
    const errors: LayoutError[] = [];

    // Maximum recommended element count for performance
    const MAX_ELEMENTS = 1000;
    const MAX_CONSTRAINTS = 5000;

    if (elementCount > MAX_ELEMENTS) {
      errors.push({
        code: LayoutErrorCode.PERFORMANCE_TIMEOUT,
        message: `Layout has ${elementCount} elements (max recommended: ${MAX_ELEMENTS})`
      });
    }

    if (constraintCount > MAX_CONSTRAINTS) {
      errors.push({
        code: LayoutErrorCode.PERFORMANCE_TIMEOUT,
        message: `Layout has ${constraintCount} constraints (max recommended: ${MAX_CONSTRAINTS})`
      });
    }

    return errors;
  }

  /**
   * Estimate calculation complexity
   */
  static estimateComplexity(elementCount: number, constraintCount: number): {
    score: number;
    category: 'simple' | 'moderate' | 'complex' | 'extreme';
    estimatedTime: number;
  } {
    // Complexity score based on element and constraint counts
    const elementWeight = 1;
    const constraintWeight = 3; // Constraints are more expensive than elements
    
    const score = (elementCount * elementWeight) + (constraintCount * constraintWeight);
    
    let category: 'simple' | 'moderate' | 'complex' | 'extreme';
    let estimatedTime: number; // in milliseconds

    if (score < 100) {
      category = 'simple';
      estimatedTime = 10;
    } else if (score < 500) {
      category = 'moderate';
      estimatedTime = 50;
    } else if (score < 2000) {
      category = 'complex';
      estimatedTime = 150;
    } else {
      category = 'extreme';
      estimatedTime = 300;
    }

    return { score, category, estimatedTime };
  }
}