import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  TemplateRenderInputSchema,
  Template,
  RenderedTemplate,
  TemplateErrorCode,
  ExportFormat,
  VariableMap
} from '../types/template.js';
import { TemplateEngine } from '../engine/templateEngine.js';
import { TemplateValidator } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';
import { rejectTemplateId } from '../util/helpers.js';
import { failureResult } from '../util/toolResult.js';
import { toolInputSchema } from '../util/toolSchema.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<CallToolResult>;
}

/**
 * Template Render Tool - Renders templates with variables to SVG/HTML
 */
export const templateRenderTool: ExecutableTool = {
  name: 'template.render',
  description: 'Render template with provided variables to SVG/HTML output',
  inputSchema: toolInputSchema(TemplateRenderInputSchema),

  async invoke(args: unknown) {
    const monitor = PerformanceMonitor.getInstance();
    const operationId = `render_${Date.now()}_${Math.random()}`;
    
    monitor.startOperation(operationId, 'template.render');
    
    try {
      // Validate input
      rejectTemplateId((args as { template?: unknown } | undefined)?.template);
      const validatedInput = TemplateRenderInputSchema.parse(args);
      const { variables, format = ExportFormat.SVG } = validatedInput;
      const template = validatedInput.template as Template;
      const { options } = validatedInput;

      // Validate template if requested
      if (options.validateVariables !== false) {
        const validationReport = TemplateValidator.validateTemplateWithVariables(template, variables);
        
        if (!validationReport.valid) {
          const duration = monitor.endOperation(operationId);
          
          return failureResult({
            success: false,
            error: 'Template validation failed',
            details: {
              errors: validationReport.errors,
              warnings: validationReport.warnings
            },
            performance: {
              renderTime: duration
            }
          });
        }
      }

      // Create template engine and render
      const engine = new TemplateEngine();
      const renderedTemplate = await engine.renderTemplate(template, variables);
      
      const duration = monitor.endOperation(operationId);

      // Prepare result based on format
      let outputContent: string;
      let mimeType: string;
      
      switch (format) {
        case ExportFormat.SVG:
          outputContent = renderedTemplate.content.svg || '';
          mimeType = 'image/svg+xml';
          break;
        case ExportFormat.HTML:
          outputContent = renderedTemplate.content.html || '';
          mimeType = 'text/html';
          break;
        default:
          // For other formats, return SVG and note that export tool should be used
          outputContent = renderedTemplate.content.svg || '';
          mimeType = 'image/svg+xml';
      }

      const result: Record<string, unknown> = {
        success: true,
        rendered: {
          id: renderedTemplate.id,
          templateId: renderedTemplate.templateId,
          format,
          content: outputContent,
          mimeType,
          dimensions: {
            width: renderedTemplate.content.metadata.width,
            height: renderedTemplate.content.metadata.height
          }
        },
        variables: Object.keys(variables),
        performance: {
          renderTime: duration || renderedTemplate.content.metadata.renderTime,
          componentCount: renderedTemplate.content.metadata.componentCount,
          variablesUsed: Object.keys(variables).length
        }
      };

      // Include metadata if requested
      if (options.includeMetadata !== false) {
        result.metadata = {
          generatedAt: renderedTemplate.generatedAt,
          templateMetadata: template.metadata,
          renderingDetails: {
            engine: 'TemplateEngine v1.0',
            variableValidation: options.validateVariables !== false,
            outputOptimization: options.optimizeOutput !== false
          }
        };
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };

    } catch (error) {
      const duration = monitor.endOperation(operationId);
      
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown rendering error',
        code: TemplateErrorCode.RENDER_ERROR,
        performance: {
          renderTime: duration
        },
        suggestions: [
          'Check template structure and variable definitions',
          'Ensure all required variables are provided',
          'Validate variable types match template expectations',
          'Check for syntax errors in template expressions'
        ]
      };

      return failureResult(errorResult);
    }
  }
};

/**
 * Template render handler function for direct use
 */
export async function templateRender(
  template: Template,
  variables: VariableMap,
  options: {
    format?: ExportFormat;
    validateVariables?: boolean;
    includeMetadata?: boolean;
  } = {}
): Promise<RenderedTemplate> {
  const engine = new TemplateEngine();
  
  const templateObj = template;

  // Validate if requested
  if (options.validateVariables !== false) {
    const validationReport = TemplateValidator.validateTemplateWithVariables(templateObj, variables);
    if (!validationReport.valid) {
      throw new Error(`Template validation failed: ${validationReport.errors.map(e => e.message).join(', ')}`);
    }
  }
  
  // Render template
  return await engine.renderTemplate(templateObj, variables);
}
