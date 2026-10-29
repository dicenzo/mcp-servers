import {
  LayoutConstraint,
  LayoutElement,
  Rectangle,
  LayoutErrorCode
} from '../types/layout.js';
import { PerformanceMonitor } from './performance.js';
import { LayoutValidator } from './validation.js';

/**
 * Constraint-based layout solver using iterative constraint satisfaction
 */
export class ConstraintSolver {
  private static readonly MAX_ITERATIONS = 1000;
  private static readonly CONVERGENCE_THRESHOLD = 0.1;

  /**
   * Solve layout constraints for a set of elements
   */
  static solve(
    elements: LayoutElement[],
    constraints: LayoutConstraint[],
    bounds: Rectangle,
    monitor?: PerformanceMonitor
  ): Map<string, Rectangle> {
    monitor?.start('constraint-solving');

    try {
      // Validate constraints
      const errors = LayoutValidator.validateConstraints(constraints);
      if (errors.length > 0) {
        throw new Error(`Constraint validation failed: ${errors.map(e => e.message).join(', ')}`);
      }

      // Initialize element positions
      const elementBounds = this.initializeElementBounds(elements, bounds);
      
      // Build constraint graph
      const constraintGraph = this.buildConstraintGraph(constraints, elements);
      
      // Iteratively solve constraints
      const solution = this.iterativeSolve(elementBounds, constraintGraph, bounds, monitor);
      
      return solution;
      
    } finally {
      monitor?.recordIteration();
    }
  }

  /**
   * Initialize element bounds with default positions
   */
  private static initializeElementBounds(
    elements: LayoutElement[],
    containerBounds: Rectangle
  ): Map<string, Rectangle> {
    const bounds = new Map<string, Rectangle>();
    
    elements.forEach((element, index) => {
      if (element.bounds) {
        bounds.set(element.id, { ...element.bounds });
      } else {
        // Default positioning - simple vertical stack
        const defaultHeight = 50;
        const y = containerBounds.y + (index * defaultHeight);
        
        bounds.set(element.id, {
          x: containerBounds.x,
          y,
          width: containerBounds.width,
          height: defaultHeight
        });
      }
    });

    return bounds;
  }

  /**
   * Build constraint dependency graph
   */
  private static buildConstraintGraph(
    constraints: LayoutConstraint[],
    elements: LayoutElement[]
  ): Map<string, Array<{
    constraint: LayoutConstraint;
    dependencies: string[];
  }>> {
    const graph = new Map<string, Array<{
      constraint: LayoutConstraint;
      dependencies: string[];
    }>>();

    // Initialize graph nodes
    elements.forEach(element => {
      graph.set(element.id, []);
    });

    // Add constraints to graph
    constraints.forEach(constraint => {
      const dependencies: string[] = [];
      
      // Add target as dependency if it exists
      if (constraint.target) {
        dependencies.push(constraint.target);
      }

      if (!graph.has(constraint.element)) {
        graph.set(constraint.element, []);
      }

      graph.get(constraint.element)!.push({
        constraint,
        dependencies
      });
    });

    return graph;
  }

  /**
   * Iteratively solve constraints until convergence
   */
  private static iterativeSolve(
    elementBounds: Map<string, Rectangle>,
    constraintGraph: Map<string, Array<{
      constraint: LayoutConstraint;
      dependencies: string[];
    }>>,
    containerBounds: Rectangle,
    monitor?: PerformanceMonitor
  ): Map<string, Rectangle> {
    let iteration = 0;
    let hasConverged = false;
    const previousBounds = new Map<string, Rectangle>();
    // Snapshot of the starting arrangement; spacing constraints use it to pick a side
    // so the choice does not flip as the solver moves elements between iterations.
    const initialBounds = new Map<string, Rectangle>();
    elementBounds.forEach((bounds, elementId) => {
      initialBounds.set(elementId, { ...bounds });
    });

    while (!hasConverged && iteration < ConstraintSolver.MAX_ITERATIONS) {
      monitor?.recordIteration();
      monitor?.checkTimeout();

      // Store previous bounds for convergence checking
      elementBounds.forEach((bounds, elementId) => {
        previousBounds.set(elementId, { ...bounds });
      });

      // Process constraints in dependency order
      const processingOrder = this.getConstraintProcessingOrder(constraintGraph);
      
      processingOrder.forEach(elementId => {
        const elementConstraints = constraintGraph.get(elementId) || [];
        
        elementConstraints.forEach(({ constraint }) => {
          this.applyConstraint(constraint, elementBounds, containerBounds, initialBounds);
        });
      });

      // Check for convergence
      hasConverged = this.checkConvergence(elementBounds, previousBounds);
      iteration++;
    }

    if (!hasConverged) {
      console.warn(`Constraint solver did not converge after ${iteration} iterations`);
    }

    return elementBounds;
  }

  /**
   * Determine optimal constraint processing order using topological sort
   */
  private static getConstraintProcessingOrder(
    constraintGraph: Map<string, Array<{
      constraint: LayoutConstraint;
      dependencies: string[];
    }>>
  ): string[] {
    const visited = new Set<string>();
    const processing = new Set<string>();
    const order: string[] = [];

    const visit = (elementId: string) => {
      if (processing.has(elementId)) {
        // Circular dependency - use original order
        return;
      }
      
      if (visited.has(elementId)) {
        return;
      }

      processing.add(elementId);
      visited.add(elementId);

      // Visit dependencies first
      const elementConstraints = constraintGraph.get(elementId) || [];
      const dependencies = new Set<string>();
      
      elementConstraints.forEach(({ constraint }) => {
        if (constraint.target) {
          dependencies.add(constraint.target);
        }
      });

      dependencies.forEach(dep => {
        if (constraintGraph.has(dep)) {
          visit(dep);
        }
      });

      processing.delete(elementId);
      order.push(elementId);
    };

    // Visit all elements
    constraintGraph.forEach((_, elementId) => {
      visit(elementId);
    });

    return order;
  }

  /**
   * Apply a single constraint to element bounds
   */
  private static applyConstraint(
    constraint: LayoutConstraint,
    elementBounds: Map<string, Rectangle>,
    containerBounds: Rectangle,
    initialBounds: Map<string, Rectangle>
  ): void {
    const elementBound = elementBounds.get(constraint.element);
    if (!elementBound) {
      return;
    }

    const targetBound = constraint.target ? elementBounds.get(constraint.target) || null : null;

    switch (constraint.type) {
    case 'position':
      this.applyPositionConstraint(constraint, elementBound, targetBound, containerBounds);
      break;
    case 'size':
      this.applySizeConstraint(constraint, elementBound, targetBound, containerBounds);
      break;
    case 'spacing':
      this.applySpacingConstraint(
        constraint,
        elementBound,
        targetBound,
        containerBounds,
        initialBounds.get(constraint.element) ?? elementBound,
        (constraint.target && initialBounds.get(constraint.target)) || targetBound
      );
      break;
    case 'alignment':
      this.applyAlignmentConstraint(constraint, elementBound, targetBound, containerBounds);
      break;
    }
  }

  /**
   * Apply position constraint
   */
  private static applyPositionConstraint(
    constraint: LayoutConstraint,
    elementBound: Rectangle,
    targetBound: Rectangle | null,
    containerBounds: Rectangle
  ): void {
    const value = typeof constraint.value === 'number' ? constraint.value : parseFloat(String(constraint.value));
    
    switch (constraint.property) {
    case 'x':
    case 'left':
      if (targetBound) {
        switch (constraint.relation) {
        case 'equal':
          elementBound.x = targetBound.x + value;
          break;
        case 'greater':
          elementBound.x = Math.max(elementBound.x, targetBound.x + value);
          break;
        case 'less':
          elementBound.x = Math.min(elementBound.x, targetBound.x + value);
          break;
        }
      } else {
        const absolute = containerBounds.x + value;
        switch (constraint.relation) {
        case 'greater':
          elementBound.x = Math.max(elementBound.x, absolute);
          break;
        case 'less':
          elementBound.x = Math.min(elementBound.x, absolute);
          break;
        default:
          elementBound.x = absolute;
        }
      }
      break;

    case 'y':
    case 'top':
      if (targetBound) {
        switch (constraint.relation) {
        case 'equal':
          elementBound.y = targetBound.y + value;
          break;
        case 'greater':
          elementBound.y = Math.max(elementBound.y, targetBound.y + value);
          break;
        case 'less':
          elementBound.y = Math.min(elementBound.y, targetBound.y + value);
          break;
        }
      } else {
        const absolute = containerBounds.y + value;
        switch (constraint.relation) {
        case 'greater':
          elementBound.y = Math.max(elementBound.y, absolute);
          break;
        case 'less':
          elementBound.y = Math.min(elementBound.y, absolute);
          break;
        default:
          elementBound.y = absolute;
        }
      }
      break;

    case 'right':
      if (targetBound) {
        const targetRight = targetBound.x + targetBound.width;
        elementBound.x = targetRight + value;
      } else {
        const containerRight = containerBounds.x + containerBounds.width;
        // value is the distance from the container's right edge
        const atDistance = containerRight - elementBound.width - value;
        switch (constraint.relation) {
        case 'greater':
          elementBound.x = Math.min(elementBound.x, atDistance);
          break;
        case 'less':
          elementBound.x = Math.max(elementBound.x, atDistance);
          break;
        default:
          elementBound.x = atDistance;
        }
      }
      break;

    case 'bottom':
      if (targetBound) {
        const targetBottom = targetBound.y + targetBound.height;
        elementBound.y = targetBottom + value;
      } else {
        const containerBottom = containerBounds.y + containerBounds.height;
        // value is the distance from the container's bottom edge
        const atDistance = containerBottom - elementBound.height - value;
        switch (constraint.relation) {
        case 'greater':
          elementBound.y = Math.min(elementBound.y, atDistance);
          break;
        case 'less':
          elementBound.y = Math.max(elementBound.y, atDistance);
          break;
        default:
          elementBound.y = atDistance;
        }
      }
      break;
    }
  }

  /**
   * Apply size constraint
   */
  private static applySizeConstraint(
    constraint: LayoutConstraint,
    elementBound: Rectangle,
    targetBound: Rectangle | null,
    _containerBounds: Rectangle
  ): void {
    const value = typeof constraint.value === 'number' ? constraint.value : parseFloat(String(constraint.value));
    
    switch (constraint.property) {
    case 'width':
      if (targetBound) {
        switch (constraint.relation) {
        case 'equal':
          elementBound.width = targetBound.width + value;
          break;
        case 'greater':
          elementBound.width = Math.max(elementBound.width, targetBound.width + value);
          break;
        case 'less':
          elementBound.width = Math.min(elementBound.width, targetBound.width + value);
          break;
        }
      } else {
        switch (constraint.relation) {
        case 'equal':
          elementBound.width = value;
          break;
        case 'greater':
          elementBound.width = Math.max(elementBound.width, value);
          break;
        case 'less':
          elementBound.width = Math.min(elementBound.width, value);
          break;
        }
      }
      break;

    case 'height':
      if (targetBound) {
        switch (constraint.relation) {
        case 'equal':
          elementBound.height = targetBound.height + value;
          break;
        case 'greater':
          elementBound.height = Math.max(elementBound.height, targetBound.height + value);
          break;
        case 'less':
          elementBound.height = Math.min(elementBound.height, targetBound.height + value);
          break;
        }
      } else {
        switch (constraint.relation) {
        case 'equal':
          elementBound.height = value;
          break;
        case 'greater':
          elementBound.height = Math.max(elementBound.height, value);
          break;
        case 'less':
          elementBound.height = Math.min(elementBound.height, value);
          break;
        }
      }
      break;
    }

    // Ensure non-negative dimensions
    elementBound.width = Math.max(0, elementBound.width);
    elementBound.height = Math.max(0, elementBound.height);
  }

  /**
   * Apply spacing constraint
   */
  private static applySpacingConstraint(
    constraint: LayoutConstraint,
    elementBound: Rectangle,
    targetBound: Rectangle | null,
    containerBounds: Rectangle,
    initialElement: Rectangle,
    initialTarget: Rectangle | null
  ): void {
    if (!targetBound || !initialTarget) {
      return; // Spacing constraints require a target
    }

    const value = typeof constraint.value === 'number' ? constraint.value : parseFloat(String(constraint.value));

    switch (constraint.property) {
    case 'horizontal':
    case 'x-spacing':
      // Maintain horizontal spacing between elements
      // Side is decided from the initial arrangement; ties go after the target.
      if (initialElement.x < initialTarget.x) {
        // Element is to the left of target
        elementBound.x = targetBound.x - elementBound.width - value;
      } else {
        // Element is to the right of target
        elementBound.x = targetBound.x + targetBound.width + value;
      }
      break;

    case 'vertical':
    case 'y-spacing':
      // Maintain vertical spacing between elements
      if (initialElement.y < initialTarget.y) {
        // Element is above target
        elementBound.y = targetBound.y - elementBound.height - value;
      } else {
        // Element is below target
        elementBound.y = targetBound.y + targetBound.height + value;
      }
      break;
    }
  }

  /**
   * Apply alignment constraint
   */
  private static applyAlignmentConstraint(
    constraint: LayoutConstraint,
    elementBound: Rectangle,
    targetBound: Rectangle | null,
    containerBounds: Rectangle
  ): void {
    const referenceRect = targetBound || containerBounds;

    switch (constraint.property) {
    case 'center-x':
    case 'horizontal-center': {
      const referenceCenterX = referenceRect.x + referenceRect.width / 2;
      elementBound.x = referenceCenterX - elementBound.width / 2;
      break;
    }

    case 'center-y':
    case 'vertical-center': {
      const referenceCenterY = referenceRect.y + referenceRect.height / 2;
      elementBound.y = referenceCenterY - elementBound.height / 2;
      break;
    }

    case 'left':
      elementBound.x = referenceRect.x;
      break;

    case 'right':
      elementBound.x = referenceRect.x + referenceRect.width - elementBound.width;
      break;

    case 'top':
      elementBound.y = referenceRect.y;
      break;

    case 'bottom':
      elementBound.y = referenceRect.y + referenceRect.height - elementBound.height;
      break;

    case 'baseline':
      // Simplified baseline alignment
      elementBound.y = referenceRect.y + referenceRect.height * 0.8;
      break;
    }
  }

  /**
   * Check if constraint solving has converged
   */
  private static checkConvergence(
    currentBounds: Map<string, Rectangle>,
    previousBounds: Map<string, Rectangle>
  ): boolean {
    for (const [elementId, current] of currentBounds) {
      const previous = previousBounds.get(elementId);
      if (!previous) continue;

      const deltaX = Math.abs(current.x - previous.x);
      const deltaY = Math.abs(current.y - previous.y);
      const deltaWidth = Math.abs(current.width - previous.width);
      const deltaHeight = Math.abs(current.height - previous.height);

      if (deltaX > ConstraintSolver.CONVERGENCE_THRESHOLD ||
          deltaY > ConstraintSolver.CONVERGENCE_THRESHOLD ||
          deltaWidth > ConstraintSolver.CONVERGENCE_THRESHOLD ||
          deltaHeight > ConstraintSolver.CONVERGENCE_THRESHOLD) {
        return false;
      }
    }

    return true;
  }

  /**
   * Add constraint to existing layout
   */
  static addConstraint(
    elements: LayoutElement[],
    existingSolution: Map<string, Rectangle>,
    newConstraint: LayoutConstraint,
    bounds: Rectangle,
    monitor?: PerformanceMonitor
  ): Map<string, Rectangle> {
    // Validate the new constraint
    const errors = LayoutValidator.validateConstraints([newConstraint]);
    if (errors.length > 0) {
      throw new Error(`Invalid constraint: ${errors.map(e => e.message).join(', ')}`);
    }

    // Create updated constraint list
    const allConstraints: LayoutConstraint[] = [];
    
    // Extract existing constraints from elements
    elements.forEach(element => {
      if (element.constraints) {
        allConstraints.push(...element.constraints);
      }
    });
    
    // Add new constraint
    allConstraints.push(newConstraint);

    // Solve with updated constraints
    return this.solve(elements, allConstraints, bounds, monitor);
  }

  /**
   * Remove constraint from layout
   */
  static removeConstraint(
    elements: LayoutElement[],
    constraintToRemove: LayoutConstraint,
    bounds: Rectangle,
    monitor?: PerformanceMonitor
  ): Map<string, Rectangle> {
    // Create updated constraint list without the removed constraint
    const allConstraints: LayoutConstraint[] = [];
    
    elements.forEach(element => {
      if (element.constraints) {
        element.constraints.forEach(constraint => {
          // Only add constraints that don't match the one to remove
          if (constraint.element !== constraintToRemove.element ||
              constraint.property !== constraintToRemove.property ||
              constraint.type !== constraintToRemove.type ||
              constraint.target !== constraintToRemove.target) {
            allConstraints.push(constraint);
          }
        });
      }
    });

    // Solve with updated constraints
    return this.solve(elements, allConstraints, bounds, monitor);
  }

  /**
   * Get constraint solving statistics
   */
  static getConstraintStats(constraints: LayoutConstraint[]): {
    totalConstraints: number;
    byType: Record<string, number>;
    byProperty: Record<string, number>;
    circularDependencies: number;
    maxPriority: number;
    minPriority: number;
  } {
    const byType: Record<string, number> = {};
    const byProperty: Record<string, number> = {};
    let maxPriority = 0;
    let minPriority = 1000;

    constraints.forEach(constraint => {
      byType[constraint.type] = (byType[constraint.type] || 0) + 1;
      byProperty[constraint.property] = (byProperty[constraint.property] || 0) + 1;
      maxPriority = Math.max(maxPriority, constraint.priority || 500);
      minPriority = Math.min(minPriority, constraint.priority || 500);
    });

    // Simple circular dependency detection
    const errors = LayoutValidator.validateConstraints(constraints);
    const circularDependencies = errors.filter(e => e.code === LayoutErrorCode.CIRCULAR_DEPENDENCY).length;

    return {
      totalConstraints: constraints.length,
      byType,
      byProperty,
      circularDependencies,
      maxPriority,
      minPriority
    };
  }
}