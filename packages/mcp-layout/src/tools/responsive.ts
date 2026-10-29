import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { 
  LayoutElementSchema,
  BreakpointSchema,
  LayoutSchema,
  LayoutElement,
  Breakpoint,
  Layout,
} from '../types/layout.js';
import { ResponsiveEngine } from '../util/responsiveEngine.js';
import { PerformanceMonitor } from '../util/performance.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<CallToolResult>;
}

/**
 * Responsive Layout Tool
 */
export const responsiveTool: ExecutableTool = {
  name: 'layout.responsive',
  description: 'Create responsive layout that adapts across multiple breakpoints',
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
            content: { type: 'object' }
          },
          required: ['id']
        },
        minItems: 1
      },
      baseLayout: {
        oneOf: [
          {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['grid'] },
              config: { type: 'object' },
              elements: { type: 'array' },
              bounds: { type: 'object' }
            },
            required: ['type', 'config', 'elements', 'bounds']
          },
          {
            type: 'object',
            properties: {
              type: { type: 'string', enum: ['flex'] },
              config: { type: 'object' },
              elements: { type: 'array' },
              bounds: { type: 'object' }
            },
            required: ['type', 'config', 'elements', 'bounds']
          }
        ]
      },
      breakpoints: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            minWidth: { type: 'number', minimum: 0 },
            maxWidth: { type: 'number', minimum: 0 },
            columns: { type: 'number', minimum: 1 },
            gutter: { type: 'number', minimum: 0 }
          },
          required: ['name', 'minWidth']
        }
      },
      generateOptimal: {
        type: 'boolean',
        default: false,
        description: 'Generate optimal breakpoints automatically'
      },
      minViewport: {
        type: 'number',
        default: 320,
        minimum: 200
      },
      maxViewport: {
        type: 'number',
        default: 1920,
        minimum: 800
      }
    },
    required: ['elements', 'baseLayout']
  },

  async invoke(args: unknown): Promise<CallToolResult> {
    const monitor = new PerformanceMonitor();
    monitor.start('responsive-layout');

    try {
      const input = args as {
        elements: LayoutElement[];
        baseLayout: Layout;
        breakpoints?: Breakpoint[];
        generateOptimal?: boolean;
        minViewport?: number;
        maxViewport?: number;
      };

      const elements = input.elements.map(el => LayoutElementSchema.parse(el));
      const baseLayout = LayoutSchema.parse(input.baseLayout);

      let breakpoints: Breakpoint[];
      if (input.generateOptimal) {
        breakpoints = ResponsiveEngine.generateOptimalBreakpoints(
          elements,
          input.minViewport || 320,
          input.maxViewport || 1920
        );
      } else if (input.breakpoints) {
        breakpoints = input.breakpoints.map(bp => BreakpointSchema.parse(bp));
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