import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  TemplateRenderInput,
  TemplateRenderInputSchema,
  Template,
  RenderedTemplate,
  TemplateError,
  TemplateErrorCode,
  ExportFormat
} from '../types/template.js';
import { TemplateEngine } from '../engine/templateEngine.js';
import { TemplateValidator } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

/**
 * Template Render Tool - Renders templates with variables to SVG/HTML
 */
export const templateRenderTool: ExecutableTool = {
  name: 'template.render',
  description: 'Render template with provided variables to SVG/HTML output',
  inputSchema: {
    type: 'object',
    properties: {
      template: {
        oneOf: [
          {
            type: 'string',
            description: 'Template ID or name to render'
          },
          {
            type: 'object',
            description: 'Inline template definition'
          }
        ],
        description: 'Template to render'
      },
      variables: {
        type: 'object',
        description: 'Variable values for template substitution',
        additionalProperties: true
      },
      format: {
        enum: ['svg', 'png', 'jpeg', 'pdf', 'html', 'webp'],
        default: 'svg',
        description: 'Output format'
      },
      options: {
        type: 'object',
        properties: {
          includeMetadata: {
            type: 'boolean',
            default: true,
            description: 'Include rendering metadata in output'
          },
          optimizeOutput: {
            type: 'boolean',
            default: true,
            description: 'Apply output optimizations'
          },
          validateVariables: {
            type: 'boolean',
            default: true,
            description: 'Validate variables before rendering'
          }
        },
        description: 'Rendering options'
      }
    },
    required: ['template', 'variables']
  },

  async invoke(args: unknown) {
    const monitor = PerformanceMonitor.getInstance();
    const operationId = `render_${Date.now()}_${Math.random()}`;
    
    monitor.startOperation(operationId, 'template.render');
    
    try {
      // Validate input
      const validatedInput = TemplateRenderInputSchema.parse(args);
      const { template: templateInput, variables, format = ExportFormat.SVG } = validatedInput;
      const options = (validatedInput as any).options || {};

      // Handle template input (string ID or inline template object)
      let template: Template;
      if (typeof templateInput === 'string') {
        // In a real implementation, this would load the template from storage
        // For now, return an error
        throw new Error(`Template lookup not implemented. Template ID: ${templateInput}`);
      } else {
        template = templateInput as Template;
      }

      // Validate template if requested
      if (options.validateVariables !== false) {
        const validationReport = TemplateValidator.validateTemplateWithVariables(template, variables);
        
        if (!validationReport.valid) {
          const duration = monitor.endOperation(operationId);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Template validation failed',
                details: {
                  errors: validationReport.errors,
                  warnings: validationReport.warnings
                },
                performance: {
                  renderTime: duration
                }
              }, null, 2)
            }]
          };
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

      const result = {
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
        (result as any).metadata = {
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

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(errorResult, null, 2)
        }]
      };
    }
  }
};

/**
 * Template render handler function for direct use
 */
export async function templateRender(
  template: Template | string,
  variables: Record<string, any>,
  options: {
    format?: ExportFormat;
    validateVariables?: boolean;
    includeMetadata?: boolean;
  } = {}
): Promise<RenderedTemplate> {
  const engine = new TemplateEngine();
  
  // Handle template input
  let templateObj: Template;
  if (typeof template === 'string') {
    throw new Error('Template lookup by ID not implemented');
  } else {
    templateObj = template;
  }
  
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
