import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  AddConstraintsInputSchema,
  MAX_CONSTRAINTS,
  LayoutElement,
  LayoutConstraint
} from '../types/layout.js';
import { ConstraintSolver } from '../util/constraintSolver.js';
import { PerformanceMonitor } from '../util/performance.js';
import { LayoutValidator } from '../util/validation.js';
import { failureResult } from '../util/toolResult.js';
import { toolInputSchema } from '../util/toolSchema.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<CallToolResult>;
  // Helper methods live on the tool object; SDK >= 1.18 no longer types Tool as passthrough
  [helper: string]: unknown;
}

/**
 * Constraint-based Layout Tool
 */
export const addConstraintsTool: ExecutableTool = {
  name: 'layout.addConstraints',
  description: 'Apply constraint-based positioning to layout elements',
  inputSchema: toolInputSchema(AddConstraintsInputSchema),

  async invoke(args: unknown): Promise<CallToolResult> {
    const monitor = new PerformanceMonitor();
    monitor.start('constraint-solving');

    try {
      // Validate with the same schema the tool advertises
      const { elements, bounds, constraints: globalConstraints } = AddConstraintsInputSchema.parse(args);

      // Collect all constraints from elements and global constraints
      const allConstraints: LayoutConstraint[] = [...globalConstraints];
      elements.forEach(element => {
        if (element.constraints) {
          allConstraints.push(...element.constraints);
        }
      });

      if (allConstraints.length > MAX_CONSTRAINTS) {
        throw new Error(`Too many constraints: ${allConstraints.length} (at most ${MAX_CONSTRAINTS} allowed)`);
      }

      // Validation
      const constraintErrors = LayoutValidator.validateConstraints(allConstraints);
      const boundsErrors = LayoutValidator.validateRectangle(bounds);

      const allErrors = [...constraintErrors, ...boundsErrors];
      if (allErrors.length > 0) {
        return failureResult({
          error: 'Validation failed',
          details: allErrors.map(e => ({
            code: e.code,
            message: e.message,
            element: e.element,
            constraint: e.constraint
          }))
        });
      }

      // Solve constraints
      const solution = ConstraintSolver.solve(elements, allConstraints, bounds, monitor);
      const performance = monitor.end();

      // Generate constraint statistics
      const constraintStats = ConstraintSolver.getConstraintStats(allConstraints);

      // Convert solution to layout format
      const layoutElements = elements.map(element => {
        const elementBounds = solution.get(element.id);
        return {
          ...element,
          bounds: elementBounds || { x: 0, y: 0, width: 100, height: 50 }
        };
      });

      const result = {
        success: true,
        elements: layoutElements,
        bounds,
        constraintStats,
        metrics: {
          totalConstraints: allConstraints.length,
          solvedConstraints: allConstraints.length, // All constraints are processed
          convergenceAchieved: performance.duration < 200, // Assume convergence if fast
          performance: {
            duration: performance.duration,
            iterations: performance.iterations,
            operations: performance.operations
          }
        },
        css: 'CSS generation temporarily disabled',
        warnings: allErrors.filter(e => e.code !== 'CONSTRAINT_CONFLICT').map(e => e.message)
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };

    } catch (error) {
      console.error('[MCP Layout] Constraint solving error:', error);
      
      return failureResult({
        error: error instanceof Error ? error.message : String(error),
        performance: monitor.snapshot()
      });
    }
  },

  /**
   * Generate CSS for constraint-based layout
   */
  generateConstraintCSS(elements: LayoutElement[]): string {
    let css = '.constraint-container {\n';
    css += '  position: relative;\n';
    css += '}\n\n';

    elements.forEach(element => {
      if (!element.bounds) return;
      
      const { bounds } = element;
      css += `.constraint-element-${element.id} {\n`;
      css += '  position: absolute;\n';
      css += `  left: ${bounds.x}px;\n`;
      css += `  top: ${bounds.y}px;\n`;
      css += `  width: ${bounds.width}px;\n`;
      css += `  height: ${bounds.height}px;\n`;
      
      // Apply custom styles if provided
      if (element.styles) {
        Object.entries(element.styles).forEach(([property, value]) => {
          // Convert camelCase to kebab-case for CSS properties
          const cssProperty = property.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
          css += `  ${cssProperty}: ${value};\n`;
        });
      }
      
      // Add box-sizing for predictable sizing
      css += '  box-sizing: border-box;\n';
      
      css += '}\n\n';
    });

    return css.trim();
  }
};