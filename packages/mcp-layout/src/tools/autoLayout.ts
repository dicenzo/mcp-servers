import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { 
  LayoutElementSchema,
  AutoLayoutConfigSchema,
  RectangleSchema,
  LayoutElement,
  AutoLayoutConfig,
  Rectangle
} from '../types/layout.js';
import { AutoLayoutEngine } from '../util/autoLayout.js';
import { PerformanceMonitor } from '../util/performance.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

/**
 * Auto Layout Tool
 */
export const autoLayoutTool: ExecutableTool = {
  name: 'layout.autoLayout',
  description: 'Automatically position elements with intelligent content-aware spacing',
  inputSchema: {
    type: 'object',
    properties: {
      elements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            type: {
              type: 'string',
              enum: ['div', 'span', 'text', 'image', 'svg'],
              default: 'div'
            },
            content: { type: 'object' },
            bounds: {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' },
                width: { type: 'number', minimum: 0 },
                height: { type: 'number', minimum: 0 }
              }
            }
          },
          required: ['id']
        },
        minItems: 1
      },
      bounds: {
        type: 'object',
        properties: {
          x: { type: 'number' },
          y: { type: 'number' },
          width: { type: 'number', minimum: 1 },
          height: { type: 'number', minimum: 1 }
        },
        required: ['x', 'y', 'width', 'height']
      },
      config: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['horizontal', 'vertical', 'grid'],
            default: 'vertical'
          },
          spacing: {
            type: 'number',
            minimum: 0,
            default: 8
          },
          padding: {
            type: 'object',
            properties: {
              top: { type: 'number', minimum: 0, default: 0 },
              right: { type: 'number', minimum: 0, default: 0 },
              bottom: { type: 'number', minimum: 0, default: 0 },
              left: { type: 'number', minimum: 0, default: 0 }
            },
            default: { top: 0, right: 0, bottom: 0, left: 0 }
          },
          alignment: {
            type: 'string',
            enum: ['start', 'center', 'end', 'stretch'],
            default: 'start'
          },
          distribution: {
            type: 'string',
            enum: ['start', 'center', 'end', 'space-between', 'space-around', 'space-evenly'],
            default: 'start'
          },
          maxWidth: { type: 'number', minimum: 0 },
          maxHeight: { type: 'number', minimum: 0 },
          responsive: { type: 'boolean', default: false }
        }
      }
    },
    required: ['elements', 'bounds']
  },

  async invoke(args: unknown): Promise<any> {
    const monitor = new PerformanceMonitor();
    monitor.start('auto-layout');

    try {
      const input = args as {
        elements: LayoutElement[];
        bounds: Rectangle;
        config?: AutoLayoutConfig;
      };

      const elements = input.elements.map(el => LayoutElementSchema.parse(el));
      const bounds = RectangleSchema.parse(input.bounds);
      const config = input.config ? AutoLayoutConfigSchema.parse(input.config) : {
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
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: error instanceof Error ? error.message : String(error),
            performance: monitor.snapshot()
          }, null, 2)
        }]
      };
    }
  }
};