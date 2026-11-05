import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  CreateGridInputSchema,
  GridLayout
} from '../types/layout.js';
import { GridEngine } from '../util/gridEngine.js';
import { PerformanceMonitor } from '../util/performance.js';
import { LayoutValidator } from '../util/validation.js';
import { failureResult } from '../util/toolResult.js';
import { toolInputSchema } from '../util/toolSchema.js';

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
  inputSchema: toolInputSchema(CreateGridInputSchema),

  async invoke(args: unknown): Promise<CallToolResult> {
    const monitor = new PerformanceMonitor();
    monitor.start('grid-creation');

    try {
      // Validate with the same schema the tool advertises
      const { config, elements, bounds, optimize } = CreateGridInputSchema.parse(args);

      // Additional validation
      const configErrors = LayoutValidator.validateGridConfig(config);
      const elementErrors = LayoutValidator.validateGridElements(elements, config);
      const boundsErrors = LayoutValidator.validateRectangle(bounds);

      const allErrors = [...configErrors, ...elementErrors, ...boundsErrors];
      if (allErrors.length > 0) {
        return failureResult({
          error: 'Validation failed',
          details: allErrors.map(e => ({
            code: e.code,
            message: e.message,
            element: e.element
          }))
        });
      }

      // Create grid layout
      let layout = GridEngine.createLayout(config, elements, bounds, monitor);

      // Optimize if requested
      if (optimize) {
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
      
      return failureResult({
        error: error instanceof Error ? error.message : String(error),
        performance: monitor.snapshot()
      });
    }
  }
};