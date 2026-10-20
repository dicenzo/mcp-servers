import { ConstraintSolver } from '../../src/util/constraintSolver.js';
import { LayoutElement, LayoutConstraint, Rectangle } from '../../src/types/layout.js';
import { PerformanceMonitor } from '../../src/util/performance.js';

describe('ConstraintSolver', () => {
  const defaultBounds: Rectangle = { x: 0, y: 0, width: 600, height: 400 };
  const monitor = new PerformanceMonitor();

  beforeEach(() => {
    monitor.start('test');
  });

  describe('solve', () => {
    it('should solve basic position constraints', () => {
      const elements: LayoutElement[] = [
        { id: 'element1', type: 'div' },
        { id: 'element2', type: 'div' }
      ];

      const constraints: LayoutConstraint[] = [
        {
          type: 'position',
          element: 'element1',
          property: 'x',
          value: 50,
          relation: 'equal',
          priority: 500
        },
        {
          type: 'position',
          element: 'element1',
          property: 'y',
          value: 100,
          relation: 'equal',
          priority: 500
        },
        {
          type: 'position',
          element: 'element2',
          property: 'x',
          value: 200,
          relation: 'equal',
          priority: 500
        }
      ];

      const solution = ConstraintSolver.solve(elements, constraints, defaultBounds, monitor);

      const element1Bounds = solution.get('element1');
      const element2Bounds = solution.get('element2');

      expect(element1Bounds).toBeDefined();
      expect(element2Bounds).toBeDefined();
      expect(element1Bounds!.x).toBe(50);
      expect(element1Bounds!.y).toBe(100);
      expect(element2Bounds!.x).toBe(200);
    });

    it('should solve size constraints', () => {
      const elements: LayoutElement[] = [
        { id: 'element1', type: 'div' }
      ];

      const constraints: LayoutConstraint[] = [
        {
          type: 'size',
          element: 'element1',
          property: 'width',
          value: 300,
          relation: 'equal',
          priority: 500
        },
        {
          type: 'size',
          element: 'element1',
          property: 'height',
          value: 150,
          relation: 'equal',
          priority: 500
        }
      ];

      const solution = ConstraintSolver.solve(elements, constraints, defaultBounds, monitor);

      const element1Bounds = solution.get('element1');
      expect(element1Bounds!.width).toBe(300);
      expect(element1Bounds!.height).toBe(150);
    });

    it('should solve relative position constraints', () => {
      const elements: LayoutElement[] = [
        { id: 'anchor', type: 'div' },
        { id: 'relative', type: 'div' }
      ];

      const constraints: LayoutConstraint[] = [
        // Position anchor
        {
          type: 'position',
          element: 'anchor',
          property: 'x',
          value: 100,
          relation: 'equal',
          priority: 600
        },
        {
          type: 'position',
          element: 'anchor',
          property: 'y',
          value: 100,
          relation: 'equal',
          priority: 600
        },
        // Position relative element relative to anchor
        {
          type: 'position',
          element: 'relative',
          property: 'x',
          value: 50, // 50px to the right of anchor
          target: 'anchor',
          relation: 'equal',
          priority: 500
        },
        {
          type: 'position',
          element: 'relative',
          property: 'y',
          value: 0, // Same Y as anchor
          target: 'anchor',
          relation: 'equal',
          priority: 500
        }
      ];

      const solution = ConstraintSolver.solve(elements, constraints, defaultBounds, monitor);

      const anchorBounds = solution.get('anchor');
      const relativeBounds = solution.get('relative');

      expect(anchorBounds!.x).toBe(100);
      expect(anchorBounds!.y).toBe(100);
      expect(relativeBounds!.x).toBe(150); // anchor.x + 50
      expect(relativeBounds!.y).toBe(100); // anchor.y + 0
    });

    it('should solve spacing constraints', () => {
      const elements: LayoutElement[] = [
        { id: 'first', type: 'div' },
        { id: 'second', type: 'div' }
      ];

      const constraints: LayoutConstraint[] = [
        // Position first element
        {
          type: 'position',
          element: 'first',
          property: 'x',
          value: 50,
          relation: 'equal',
          priority: 600
        },
        // Size first element
        {
          type: 'size',
          element: 'first',
          property: 'width',
          value: 100,
          relation: 'equal',
          priority: 600
        },
        // Space second element horizontally from first
        {
          type: 'spacing',
          element: 'second',
          property: 'horizontal',
          value: 20,
          target: 'first',
          relation: 'equal',
          priority: 500
        }
      ];

      const solution = ConstraintSolver.solve(elements, constraints, defaultBounds, monitor);

      const firstBounds = solution.get('first');
      const secondBounds = solution.get('second');

      expect(firstBounds!.x).toBe(50);
      expect(firstBounds!.width).toBe(100);
      expect(secondBounds!.x).toBe(170); // first.x + first.width + spacing (50 + 100 + 20)
    });

    it('should solve alignment constraints', () => {
      const elements: LayoutElement[] = [
        { id: 'reference', type: 'div' },
        { id: 'aligned', type: 'div' }
      ];

      const constraints: LayoutConstraint[] = [
        // Position and size reference element
        {
          type: 'position',
          element: 'reference',
          property: 'x',
          value: 100,
          relation: 'equal',
          priority: 600
        },
        {
          type: 'position',
          element: 'reference',
          property: 'y',
          value: 100,
          relation: 'equal',
          priority: 600
        },
        {
          type: 'size',
          element: 'reference',
          property: 'width',
          value: 200,
          relation: 'equal',
          priority: 600
        },
        {
          type: 'size',
          element: 'reference',
          property: 'height',
          value: 100,
          relation: 'equal',
          priority: 600
        },
        // Size aligned element
        {
          type: 'size',
          element: 'aligned',
          property: 'width',
          value: 150,
          relation: 'equal',
          priority: 600
        },
        {
          type: 'size',
          element: 'aligned',
          property: 'height',
          value: 80,
          relation: 'equal',
          priority: 600
        },
        // Center align with reference
        {
          type: 'alignment',
          element: 'aligned',
          property: 'center-x',
          value: 0,
          target: 'reference',
          priority: 500
        },
        {
          type: 'alignment',
          element: 'aligned',
          property: 'center-y',
          value: 0,
          target: 'reference',
          priority: 500
        }
      ];

      const solution = ConstraintSolver.solve(elements, constraints, defaultBounds, monitor);

      const referenceBounds = solution.get('reference');
      const alignedBounds = solution.get('aligned');

      // Calculate expected center alignment
      const referenceCenterX = referenceBounds!.x + referenceBounds!.width / 2;
      const referenceCenterY = referenceBounds!.y + referenceBounds!.height / 2;
      const expectedAlignedX = referenceCenterX - alignedBounds!.width / 2;
      const expectedAlignedY = referenceCenterY - alignedBounds!.height / 2;

      expect(alignedBounds!.x).toBeCloseTo(expectedAlignedX, 1);
      expect(alignedBounds!.y).toBeCloseTo(expectedAlignedY, 1);
    });

    it('should handle constraint priorities', () => {
      const elements: LayoutElement[] = [
        { id: 'element1', type: 'div' }
      ];

      // Conflicting constraints with different priorities
      const constraints: LayoutConstraint[] = [
        {
          type: 'position',
          element: 'element1',
          property: 'x',
          value: 100,
          relation: 'equal',
          priority: 300 // Lower priority
        },
        {
          type: 'position',
          element: 'element1',
          property: 'x',
          value: 200,
          relation: 'equal',
          priority: 700 // Higher priority - should win
        }
      ];

      const solution = ConstraintSolver.solve(elements, constraints, defaultBounds, monitor);
      const elementBounds = solution.get('element1');

      // Higher priority constraint should be respected
      expect(elementBounds!.x).toBe(200);
    });

    it('should handle greater/less than constraints', () => {
      const elements: LayoutElement[] = [
        { id: 'element1', type: 'div' }
      ];

      const constraints: LayoutConstraint[] = [
        // Initial position
        {
          type: 'position',
          element: 'element1',
          property: 'x',
          value: 50,
          relation: 'equal',
          priority: 500
        },
        // Must be at least 100px from left
        {
          type: 'position',
          element: 'element1',
          property: 'x',
          value: 100,
          relation: 'greater',
          priority: 600
        },
        // Must be less than 500px from left
        {
          type: 'position',
          element: 'element1',
          property: 'x',
          value: 500,
          relation: 'less',
          priority: 600
        }
      ];

      const solution = ConstraintSolver.solve(elements, constraints, defaultBounds, monitor);
      const elementBounds = solution.get('element1');

      expect(elementBounds!.x).toBeGreaterThanOrEqual(100);
      expect(elementBounds!.x).toBeLessThan(500);
    });

    it('should detect and handle constraint conflicts', () => {
      const elements: LayoutElement[] = [
        { id: 'element1', type: 'div' }
      ];

      // Impossible constraints
      const constraints: LayoutConstraint[] = [
        {
          type: 'position',
          element: 'element1',
          property: 'x',
          value: 100,
          relation: 'greater',
          priority: 500
        },
        {
          type: 'position',
          element: 'element1',
          property: 'x',
          value: 50,
          relation: 'less',
          priority: 500
        }
      ];

      expect(() => {
        ConstraintSolver.solve(elements, constraints, defaultBounds, monitor);
      }).toThrow();
    });
  });

  describe('addConstraint', () => {
    it('should add new constraint to existing solution', () => {
      const elements: LayoutElement[] = [
        { 
          id: 'element1',
          type: 'div',
          constraints: [
            {
              type: 'position',
              element: 'element1',
              property: 'x',
              value: 100,
              relation: 'equal',
              priority: 500
            }
          ]
        }
      ];

      // Initial solution
      const initialSolution = ConstraintSolver.solve(elements, [], defaultBounds, monitor);

      // Add new constraint
      const newConstraint: LayoutConstraint = {
        type: 'position',
        element: 'element1',
        property: 'y',
        value: 150,
        relation: 'equal',
        priority: 500
      };

      const updatedSolution = ConstraintSolver.addConstraint(
        elements,
        initialSolution,
        newConstraint,
        defaultBounds,
        monitor
      );

      const elementBounds = updatedSolution.get('element1');
      expect(elementBounds!.x).toBe(100);
      expect(elementBounds!.y).toBe(150);
    });
  });

  describe('getConstraintStats', () => {
    it('should calculate constraint statistics', () => {
      const constraints: LayoutConstraint[] = [
        {
          type: 'position',
          element: 'element1',
          property: 'x',
          value: 100,
          relation: 'equal',
          priority: 600
        },
        {
          type: 'size',
          element: 'element1',
          property: 'width',
          value: 200,
          relation: 'equal',
          priority: 400
        },
        {
          type: 'position',
          element: 'element2',
          property: 'x',
          value: 50,
          relation: 'greater',
          priority: 800
        }
      ];

      const stats = ConstraintSolver.getConstraintStats(constraints);

      expect(stats.totalConstraints).toBe(3);
      expect(stats.byType.position).toBe(2);
      expect(stats.byType.size).toBe(1);
      expect(stats.byProperty.x).toBe(2);
      expect(stats.byProperty.width).toBe(1);
      expect(stats.maxPriority).toBe(800);
      expect(stats.minPriority).toBe(400);
    });
  });

  describe('performance', () => {
    it('should handle many constraints efficiently', () => {
      const elements: LayoutElement[] = Array.from({ length: 20 }, (_, i) => ({
        id: `element${i + 1}`,
        type: 'div'
      }));

      // Create constraints for positioning elements in a grid
      const constraints: LayoutConstraint[] = [];
      const gridSize = Math.ceil(Math.sqrt(elements.length));
      
      elements.forEach((element, index) => {
        const row = Math.floor(index / gridSize);
        const col = index % gridSize;
        const spacing = 50;
        
        constraints.push({
          type: 'position',
          element: element.id,
          property: 'x',
          value: col * spacing,
          relation: 'equal',
          priority: 500
        });
        
        constraints.push({
          type: 'position',
          element: element.id,
          property: 'y',
          value: row * spacing,
          relation: 'equal',
          priority: 500
        });
        
        constraints.push({
          type: 'size',
          element: element.id,
          property: 'width',
          value: 40,
          relation: 'equal',
          priority: 500
        });
        
        constraints.push({
          type: 'size',
          element: element.id,
          property: 'height',
          value: 40,
          relation: 'equal',
          priority: 500
        });
      });

      const startTime = performance.now();
      const solution = ConstraintSolver.solve(elements, constraints, defaultBounds, monitor);
      const endTime = performance.now();

      expect(solution.size).toBe(elements.length);
      expect(endTime - startTime).toBeLessThan(200); // Should solve within 200ms
    });

    it('should handle complex constraint dependencies efficiently', () => {
      const elements: LayoutElement[] = Array.from({ length: 10 }, (_, i) => ({
        id: `element${i + 1}`,
        type: 'div'
      }));

      // Create chain of dependencies: each element positioned relative to previous
      const constraints: LayoutConstraint[] = [
        // First element absolute position
        {
          type: 'position',
          element: 'element1',
          property: 'x',
          value: 50,
          relation: 'equal',
          priority: 600
        }
      ];

      // Chain remaining elements
      for (let i = 1; i < elements.length; i++) {
        constraints.push({
          type: 'spacing',
          element: `element${i + 1}`,
          property: 'horizontal',
          value: 30,
          target: `element${i}`,
          relation: 'equal',
          priority: 500
        });
      }

      const startTime = performance.now();
      const solution = ConstraintSolver.solve(elements, constraints, defaultBounds, monitor);
      const endTime = performance.now();

      expect(solution.size).toBe(elements.length);
      expect(endTime - startTime).toBeLessThan(100); // Chain resolution should be fast
      
      // Verify chain positioning
      const positions = Array.from(solution.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([, bounds]) => bounds.x);
        
      for (let i = 1; i < positions.length; i++) {
        expect(positions[i]).toBeGreaterThan(positions[i - 1]);
      }
    });
  });

  describe('edge cases', () => {
    it('should handle empty constraint list', () => {
      const elements: LayoutElement[] = [
        { id: 'element1', type: 'div' }
      ];

      const solution = ConstraintSolver.solve(elements, [], defaultBounds, monitor);
      
      expect(solution.size).toBe(1);
      expect(solution.get('element1')).toBeDefined();
    });

    it('should handle constraints referencing non-existent elements', () => {
      const elements: LayoutElement[] = [
        { id: 'element1', type: 'div' }
      ];

      const constraints: LayoutConstraint[] = [
        {
          type: 'position',
          element: 'element1',
          property: 'x',
          value: 50,
          target: 'non-existent',
          relation: 'equal',
          priority: 500
        }
      ];

      expect(() => {
        ConstraintSolver.solve(elements, constraints, defaultBounds, monitor);
      }).not.toThrow(); // Should handle gracefully
    });

    it('should handle very small container bounds', () => {
      const elements: LayoutElement[] = [
        { id: 'element1', type: 'div' }
      ];

      const constraints: LayoutConstraint[] = [
        {
          type: 'size',
          element: 'element1',
          property: 'width',
          value: 100,
          relation: 'equal',
          priority: 500
        }
      ];

      const smallBounds: Rectangle = { x: 0, y: 0, width: 50, height: 50 };

      const solution = ConstraintSolver.solve(elements, constraints, smallBounds, monitor);
      const elementBounds = solution.get('element1');

      expect(elementBounds).toBeDefined();
      expect(elementBounds!.width).toBe(100); // Constraint should be respected even if larger than container
    });
  });
});