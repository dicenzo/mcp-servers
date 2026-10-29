import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { 
  FlexConfigSchema,
  FlexElementListSchema,
  RectangleSchema,
  FlexConfig,
  FlexElement,
  Rectangle,
  FlexLayout
} from '../types/layout.js';
import { FlexEngine } from '../util/flexEngine.js';
import { PerformanceMonitor } from '../util/performance.js';
import { LayoutValidator } from '../util/validation.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<CallToolResult>;
  // Helper methods live on the tool object; SDK >= 1.18 no longer types Tool as passthrough
  [helper: string]: unknown;
}

/**
 * Flexbox Layout Creation Tool
 */
export const createFlexTool: ExecutableTool = {
  name: 'layout.createFlex',
  description: 'Create a Flexbox layout with specified configuration and elements',
  inputSchema: {
    type: 'object',
    properties: {
      config: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['row', 'row-reverse', 'column', 'column-reverse'],
            default: 'row',
            description: 'flex-direction value'
          },
          wrap: {
            type: 'string',
            enum: ['nowrap', 'wrap', 'wrap-reverse'],
            default: 'nowrap',
            description: 'flex-wrap value'
          },
          justifyContent: {
            type: 'string',
            enum: ['flex-start', 'flex-end', 'center', 'space-between', 'space-around', 'space-evenly'],
            default: 'flex-start',
            description: 'justify-content value for main axis alignment'
          },
          alignItems: {
            type: 'string',
            enum: ['flex-start', 'flex-end', 'center', 'stretch', 'baseline'],
            default: 'stretch',
            description: 'align-items value for cross axis alignment'
          },
          alignContent: {
            type: 'string',
            enum: ['flex-start', 'flex-end', 'center', 'stretch', 'space-between', 'space-around'],
            default: 'stretch',
            description: 'align-content value for multi-line alignment'
          },
          gap: {
            type: 'string',
            default: '0',
            description: 'Gap value (e.g., "16px", "1rem")'
          },
          rowGap: {
            type: 'string',
            description: 'Row-specific gap (overrides gap for rows)'
          },
          columnGap: {
            type: 'string',
            description: 'Column-specific gap (overrides gap for columns)'
          }
        }
      },
      elements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              description: 'Unique identifier for the element'
            },
            flexGrow: {
              type: 'number',
              minimum: 0,
              default: 0,
              description: 'flex-grow value - how much element should grow'
            },
            flexShrink: {
              type: 'number',
              minimum: 0,
              default: 1,
              description: 'flex-shrink value - how much element can shrink'
            },
            flexBasis: {
              oneOf: [
                { type: 'number', minimum: 0 },
                { type: 'string' }
              ],
              default: 'auto',
              description: 'flex-basis value - initial main size (e.g., "200px", "50%", "auto")'
            },
            alignSelf: {
              type: 'string',
              enum: ['auto', 'flex-start', 'flex-end', 'center', 'stretch', 'baseline'],
              description: 'align-self override for individual element'
            },
            order: {
              type: 'number',
              description: 'Visual order of the element (lower numbers first)'
            },
            content: {
              type: 'object',
              description: 'Element content for size calculation and rendering'
            },
            minWidth: {
              type: 'number',
              minimum: 0,
              description: 'Minimum width constraint in pixels'
            },
            minHeight: {
              type: 'number',
              minimum: 0,
              description: 'Minimum height constraint in pixels'
            },
            maxWidth: {
              type: 'number',
              minimum: 0,
              description: 'Maximum width constraint in pixels'
            },
            maxHeight: {
              type: 'number',
              minimum: 0,
              description: 'Maximum height constraint in pixels'
            }
          },
          required: ['id']
        },
        minItems: 1,
        description: 'Array of elements to place in the flex container'
      },
      bounds: {
        type: 'object',
        properties: {
          x: { type: 'number', description: 'Container X position' },
          y: { type: 'number', description: 'Container Y position' },
          width: { type: 'number', minimum: 1, description: 'Container width' },
          height: { type: 'number', minimum: 1, description: 'Container height' }
        },
        required: ['x', 'y', 'width', 'height'],
        description: 'Container bounds for the flex layout'
      },
      optimize: {
        type: 'boolean',
        default: true,
        description: 'Whether to optimize the layout for performance'
      }
    },
    required: ['config', 'elements', 'bounds']
  },

  async invoke(args: unknown): Promise<CallToolResult> {
    const monitor = new PerformanceMonitor();
    monitor.start('flex-creation');

    try {
      // Parse and validate inputs
      const input = args as {
        config: FlexConfig;
        elements: FlexElement[];
        bounds: Rectangle;
        optimize?: boolean;
      };

      // Validate with Zod schemas
      const config = FlexConfigSchema.parse(input.config);
      const elements = FlexElementListSchema.parse(input.elements);
      const bounds = RectangleSchema.parse(input.bounds);

      // Additional validation
      const configErrors = LayoutValidator.validateFlexConfig(config);
      const elementErrors = LayoutValidator.validateFlexElements(elements);
      const boundsErrors = LayoutValidator.validateRectangle(bounds);

      const allErrors = [...configErrors, ...elementErrors, ...boundsErrors];
      if (allErrors.length > 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Validation failed',
              details: allErrors.map(e => ({
                code: e.code,
                message: e.message,
                element: e.element
              }))
            }, null, 2)
          }]
        };
      }

      // Create flex layout
      let layout = FlexEngine.createLayout(config, elements, bounds, monitor);

      // Optimize if requested
      if (input.optimize !== false) {
        layout = FlexEngine.optimizeLayout(layout);
      }

      // Calculate metrics
      const metrics = FlexEngine.calculateMetrics(layout);
      const performance = monitor.end();

      const result = {
        success: true,
        layout,
        metrics: {
          ...metrics,
          performance: {
            duration: performance.duration,
            iterations: performance.iterations,
            operations: performance.operations
          }
        },
        css: 'CSS generation temporarily disabled',
        warnings: allErrors.filter(e => e.code !== 'INVALID_CONFIG').map(e => e.message)
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };

    } catch (error) {
      console.error('[MCP Layout] Flex creation error:', error);
      
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        performance: monitor.snapshot()
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(errorResult, null, 2)
        }]
      };
    }
  },

  /**
   * Generate CSS for the flex layout
   */
  generateFlexCSS(layout: FlexLayout): string {
    const { config } = layout;
    
    let css = '.flex-container {\n';
    css += '  display: flex;\n';
    css += `  flex-direction: ${config.direction};\n`;
    css += `  flex-wrap: ${config.wrap};\n`;
    css += `  justify-content: ${config.justifyContent};\n`;
    css += `  align-items: ${config.alignItems};\n`;
    
    if (config.alignContent !== 'stretch') {
      css += `  align-content: ${config.alignContent};\n`;
    }
    
    if (config.gap !== '0') {
      css += `  gap: ${config.gap};\n`;
    }
    
    if (config.rowGap) {
      css += `  row-gap: ${config.rowGap};\n`;
    }
    
    if (config.columnGap) {
      css += `  column-gap: ${config.columnGap};\n`;
    }
    
    css += '}\n\n';

    // Generate CSS for individual elements
    layout.elements.forEach(element => {
      css += `.flex-item-${element.id} {\n`;
      
      if (element.flexGrow !== 0) {
        css += `  flex-grow: ${element.flexGrow};\n`;
      }
      
      if (element.flexShrink !== 1) {
        css += `  flex-shrink: ${element.flexShrink};\n`;
      }
      
      if (element.flexBasis !== 'auto') {
        const basis = typeof element.flexBasis === 'number' ? 
          `${element.flexBasis}px` : element.flexBasis;
        css += `  flex-basis: ${basis};\n`;
      }

      // Shorthand flex property
      const grow = element.flexGrow || 0;
      const shrink = element.flexShrink || 1;
      const basis = element.flexBasis === 'auto' ? 'auto' : 
        typeof element.flexBasis === 'number' ? `${element.flexBasis}px` : element.flexBasis;
      
      if (grow !== 0 || shrink !== 1 || basis !== 'auto') {
        css += `  flex: ${grow} ${shrink} ${basis};\n`;
      }
      
      if (element.alignSelf && element.alignSelf !== 'auto') {
        css += `  align-self: ${element.alignSelf};\n`;
      }
      
      if (element.order !== undefined) {
        css += `  order: ${element.order};\n`;
      }
      
      if (element.minWidth !== undefined) {
        css += `  min-width: ${element.minWidth}px;\n`;
      }
      
      if (element.maxWidth !== undefined) {
        css += `  max-width: ${element.maxWidth}px;\n`;
      }
      
      if (element.minHeight !== undefined) {
        css += `  min-height: ${element.minHeight}px;\n`;
      }
      
      if (element.maxHeight !== undefined) {
        css += `  max-height: ${element.maxHeight}px;\n`;
      }
      
      css += '}\n\n';
    });

    return css.trim();
  }
};