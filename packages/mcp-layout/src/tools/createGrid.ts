import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { 
  GridConfigSchema,
  GridElementListSchema,
  RectangleSchema,
  GridConfig,
  GridElement,
  Rectangle,
  GridLayout
} from '../types/layout.js';
import { GridEngine } from '../util/gridEngine.js';
import { PerformanceMonitor } from '../util/performance.js';
import { LayoutValidator } from '../util/validation.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<CallToolResult>;
}

/**
 * Generate CSS for the grid layout
 */
function generateGridCSS(layout: GridLayout): string {
  const { config } = layout;
  
  let css = '.grid-container {\n';
  css += '  display: grid;\n';
  css += `  grid-template-columns: ${config.columns};\n`;
  css += `  grid-template-rows: ${config.rows};\n`;
  
  if (config.gap !== '0') {
    css += `  gap: ${config.gap};\n`;
  }
  
  if (config.rowGap) {
    css += `  row-gap: ${config.rowGap};\n`;
  }
  
  if (config.columnGap) {
    css += `  column-gap: ${config.columnGap};\n`;
  }
  
  if (config.autoColumns) {
    css += `  grid-auto-columns: ${config.autoColumns};\n`;
  }
  
  if (config.autoRows) {
    css += `  grid-auto-rows: ${config.autoRows};\n`;
  }
  
  if (config.autoFlow !== 'row') {
    css += `  grid-auto-flow: ${config.autoFlow};\n`;
  }
  
  if (config.areas && config.areas.length > 0) {
    const areaStrings = config.areas.map(row => `"${row.join(' ')}"`);
    css += `  grid-template-areas:\n    ${areaStrings.join('\n    ')};\n`;
  }
  
  css += '}\n\n';

  // Generate CSS for individual elements
  layout.elements.forEach(element => {
    css += `.grid-item-${element.id} {\n`;
    
    if (element.gridArea) {
      css += `  grid-area: ${element.gridArea};\n`;
    }
    
    if (element.gridColumn) {
      css += `  grid-column: ${element.gridColumn};\n`;
    }
    
    if (element.gridRow) {
      css += `  grid-row: ${element.gridRow};\n`;
    }
    
    if (element.gridColumnStart) {
      css += `  grid-column-start: ${element.gridColumnStart};\n`;
    }
    
    if (element.gridColumnEnd) {
      css += `  grid-column-end: ${element.gridColumnEnd};\n`;
    }
    
    if (element.gridRowStart) {
      css += `  grid-row-start: ${element.gridRowStart};\n`;
    }
    
    if (element.gridRowEnd) {
      css += `  grid-row-end: ${element.gridRowEnd};\n`;
    }
    
    if (element.justifySelf) {
      css += `  justify-self: ${element.justifySelf};\n`;
    }
    
    if (element.alignSelf) {
      css += `  align-self: ${element.alignSelf};\n`;
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

/**
 * Grid Layout Creation Tool
 */
export const createGridTool: ExecutableTool = {
  name: 'layout.createGrid',
  description: 'Create a CSS Grid layout with specified configuration and elements',
  inputSchema: {
    type: 'object',
    properties: {
      config: {
        type: 'object',
        properties: {
          columns: {
            type: 'string',
            description: 'CSS grid-template-columns value (e.g., "1fr 2fr 1fr", "repeat(3, 1fr)")',
            examples: ['1fr 2fr 1fr', 'repeat(3, 1fr)', '200px auto 100px', 'minmax(100px, 1fr) 2fr']
          },
          rows: {
            type: 'string',
            description: 'CSS grid-template-rows value (e.g., "auto 1fr auto")',
            examples: ['auto 1fr auto', 'repeat(4, 100px)', '50px auto 50px']
          },
          gap: {
            type: 'string',
            default: '0',
            description: 'Grid gap value (e.g., "16px", "1rem")'
          },
          rowGap: {
            type: 'string',
            description: 'Row-specific gap (overrides gap for rows)'
          },
          columnGap: {
            type: 'string',
            description: 'Column-specific gap (overrides gap for columns)'
          },
          areas: {
            type: 'array',
            items: {
              type: 'array',
              items: { type: 'string' }
            },
            description: 'Grid template areas as 2D array (e.g., [["header", "header"], ["sidebar", "main"]])'
          },
          autoColumns: {
            type: 'string',
            description: 'grid-auto-columns value for implicit columns'
          },
          autoRows: {
            type: 'string',
            description: 'grid-auto-rows value for implicit rows'
          },
          autoFlow: {
            type: 'string',
            enum: ['row', 'column', 'row dense', 'column dense'],
            default: 'row',
            description: 'grid-auto-flow value'
          }
        },
        required: ['columns', 'rows']
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
            gridArea: {
              type: 'string',
              description: 'Named grid area (must match area in config.areas)'
            },
            gridColumn: {
              type: 'string',
              description: 'grid-column value (e.g., "1 / 3", "span 2")'
            },
            gridRow: {
              type: 'string',
              description: 'grid-row value (e.g., "1 / 3", "span 2")'
            },
            gridColumnStart: {
              oneOf: [
                { type: 'number' },
                { type: 'string' }
              ],
              description: 'grid-column-start value (line number or name)'
            },
            gridColumnEnd: {
              oneOf: [
                { type: 'number' },
                { type: 'string' }
              ],
              description: 'grid-column-end value (line number or name)'
            },
            gridRowStart: {
              oneOf: [
                { type: 'number' },
                { type: 'string' }
              ],
              description: 'grid-row-start value (line number or name)'
            },
            gridRowEnd: {
              oneOf: [
                { type: 'number' },
                { type: 'string' }
              ],
              description: 'grid-row-end value (line number or name)'
            },
            justifySelf: {
              type: 'string',
              enum: ['start', 'end', 'center', 'stretch'],
              description: 'justify-self alignment within grid area'
            },
            alignSelf: {
              type: 'string',
              enum: ['start', 'end', 'center', 'stretch'],
              description: 'align-self alignment within grid area'
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
        description: 'Array of elements to place in the grid'
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
        description: 'Container bounds for the grid layout'
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
    monitor.start('grid-creation');

    try {
      // Parse and validate inputs
      const input = args as {
        config: GridConfig;
        elements: GridElement[];
        bounds: Rectangle;
        optimize?: boolean;
      };

      // Validate with Zod schemas
      const config = GridConfigSchema.parse(input.config);
      const elements = GridElementListSchema.parse(input.elements);
      const bounds = RectangleSchema.parse(input.bounds);

      // Additional validation
      const configErrors = LayoutValidator.validateGridConfig(config);
      const elementErrors = LayoutValidator.validateGridElements(elements, config);
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

      // Create grid layout
      let layout = GridEngine.createLayout(config, elements, bounds, monitor);

      // Optimize if requested
      if (input.optimize !== false) {
        layout = GridEngine.optimizeLayout(layout);
      }

      // Calculate metrics
      const metrics = GridEngine.calculateMetrics(layout);
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
        css: generateGridCSS(layout),
        warnings: allErrors.filter(e => e.code !== 'INVALID_CONFIG').map(e => e.message)
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };

    } catch (error) {
      console.error('[MCP Layout] Grid creation error:', error);
      
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
  }
};