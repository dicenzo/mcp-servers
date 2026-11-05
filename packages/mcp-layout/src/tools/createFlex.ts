import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  CreateFlexInputSchema,
  FlexLayout
} from '../types/layout.js';
import { FlexEngine } from '../util/flexEngine.js';
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
 * Flexbox Layout Creation Tool
 */
export const createFlexTool: ExecutableTool = {
  name: 'layout.createFlex',
  description: 'Create a Flexbox layout with specified configuration and elements',
  inputSchema: toolInputSchema(CreateFlexInputSchema),

  async invoke(args: unknown): Promise<CallToolResult> {
    const monitor = new PerformanceMonitor();
    monitor.start('flex-creation');

    try {
      // Validate with the same schema the tool advertises
      const { config, elements, bounds, optimize } = CreateFlexInputSchema.parse(args);

      // Additional validation
      const configErrors = LayoutValidator.validateFlexConfig(config);
      const elementErrors = LayoutValidator.validateFlexElements(elements);
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

      // Create flex layout
      let layout = FlexEngine.createLayout(config, elements, bounds, monitor);

      // Optimize if requested
      if (optimize) {
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
      
      return failureResult({
        error: error instanceof Error ? error.message : String(error),
        performance: monitor.snapshot()
      });
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