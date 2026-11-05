import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  AutoLayoutInputSchema
} from '../types/layout.js';
import { AutoLayoutEngine } from '../util/autoLayout.js';
import { PerformanceMonitor } from '../util/performance.js';
import { failureResult } from '../util/toolResult.js';
import { toolInputSchema } from '../util/toolSchema.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<CallToolResult>;
}

/**
 * Auto Layout Tool
 */
export const autoLayoutTool: ExecutableTool = {
  name: 'layout.autoLayout',
  description: 'Automatically position elements with intelligent content-aware spacing',
  inputSchema: toolInputSchema(AutoLayoutInputSchema),

  async invoke(args: unknown): Promise<CallToolResult> {
    const monitor = new PerformanceMonitor();
    monitor.start('auto-layout');

    try {
      const input = AutoLayoutInputSchema.parse(args);
      const { elements, bounds } = input;
      const config = input.config ?? {
        direction: 'vertical' as const,
        spacing: 8,
        padding: { top: 0, right: 0, bottom: 0, left: 0 },
        alignment: 'start' as const,
        distribution: 'start' as const,
        responsive: false
      };

      const solution = AutoLayoutEngine.createLayout(elements, bounds, config, monitor);
      const recommendations = AutoLayoutEngine.getLayoutRecommendations(elements, bounds);
      const performance = monitor.end();

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
        config,
        recommendations,
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
      console.error('[MCP Layout] Auto layout error:', error);
      
      return failureResult({
        error: error instanceof Error ? error.message : String(error),
        performance: monitor.snapshot()
      });
    }
  }
};