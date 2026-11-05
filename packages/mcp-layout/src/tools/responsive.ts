import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  ResponsiveInputSchema,
  Breakpoint
} from '../types/layout.js';
import { ResponsiveEngine } from '../util/responsiveEngine.js';
import { PerformanceMonitor } from '../util/performance.js';
import { failureResult } from '../util/toolResult.js';
import { toolInputSchema } from '../util/toolSchema.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<CallToolResult>;
}

/**
 * Responsive Layout Tool
 */
export const responsiveTool: ExecutableTool = {
  name: 'layout.responsive',
  description: 'Create responsive layout that adapts across multiple breakpoints',
  inputSchema: toolInputSchema(ResponsiveInputSchema),

  async invoke(args: unknown): Promise<CallToolResult> {
    const monitor = new PerformanceMonitor();
    monitor.start('responsive-layout');

    try {
      const input = ResponsiveInputSchema.parse(args);
      const { elements, baseLayout } = input;

      let breakpoints: Breakpoint[];
      if (input.generateOptimal) {
        breakpoints = ResponsiveEngine.generateOptimalBreakpoints(
          elements,
          input.minViewport,
          input.maxViewport
        );
      } else if (input.breakpoints) {
        breakpoints = input.breakpoints;
      } else {
        // Use default breakpoints
        breakpoints = [
          { name: 'mobile', minWidth: 0, maxWidth: 767, columns: 1, gutter: 16 },
          { name: 'tablet', minWidth: 768, maxWidth: 1023, columns: 2, gutter: 24 },
          { name: 'desktop', minWidth: 1024, columns: 3, gutter: 32 }
        ];
      }

      const responsiveLayout = ResponsiveEngine.createResponsiveLayout(
        elements,
        baseLayout,
        breakpoints,
        monitor
      );

      const optimizedLayout = ResponsiveEngine.optimizeResponsiveLayout(responsiveLayout);
      const metrics = ResponsiveEngine.calculateResponsiveMetrics(optimizedLayout);
      const mediaQueries = ResponsiveEngine.generateMediaQueries(optimizedLayout);
      const performance = monitor.end();

      const result = {
        success: true,
        responsiveLayout: optimizedLayout,
        metrics,
        mediaQueries,
        performance: {
          duration: performance.duration,
          iterations: performance.iterations,
          operations: performance.operations
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };

    } catch (error) {
      console.error('[MCP Layout] Responsive layout error:', error);
      
      return failureResult({
        error: error instanceof Error ? error.message : String(error),
        performance: monitor.snapshot()
      });
    }
  }
};