import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  TemplateExportInputSchema,
  RenderedTemplate,
  Template,
  ExportFormat,
  ExportOptions,
  ExportResult,
  TemplateErrorCode
} from '../types/template.js';
import { TemplateExporter } from '../util/export.js';
import { templateRender } from './templateRender.js';
import { PerformanceMonitor } from '../util/performance.js';
import { formatBytes } from '../util/helpers.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

/**
 * Template Export Tool - Exports rendered templates to multiple formats
 */
export const templateExportTool: ExecutableTool = {
  name: 'template.export',
  description: 'Export rendered template to multiple formats (SVG, PNG, PDF, HTML, etc.)',
  inputSchema: {
    type: 'object',
    properties: {
      template: {
        oneOf: [
          {
            type: 'string',
            description: 'Template ID or rendered template ID'
          },
          {
            type: 'object',
            description: 'Rendered template object or template definition'
          }
        ],
        description: 'Template or rendered template to export'
      },
      variables: {
        type: 'object',
        description: 'Variables for template rendering (if template not already rendered)',
        additionalProperties: true
      },
      options: {
        type: 'object',
        properties: {
          format: {
            enum: ['svg', 'png', 'jpeg', 'pdf', 'html', 'webp'],
            default: 'png',
            description: 'Export format'
          },
          quality: {
            type: 'number',
            minimum: 0,
            maximum: 100,
            default: 80,
            description: 'Quality for JPEG/WebP (0-100)'
          },
          width: {
            type: 'number',
            minimum: 1,
            maximum: 8192,
            description: 'Output width in pixels'
          },
          height: {
            type: 'number',
            minimum: 1,
            maximum: 8192,
            description: 'Output height in pixels'
          },
          scale: {
            type: 'number',
            minimum: 0.1,
            maximum: 10,
            default: 1,
            description: 'Scaling factor'
          },
          background: {
            type: 'string',
            description: 'Background color (for formats that support transparency)'
          },
          pageSize: {
            enum: ['A4', 'A3', 'Letter', 'Legal'],
            description: 'Page size for PDF export'
          },
          margin: {
            type: 'number',
            minimum: 0,
            description: 'Margin for PDF export (in points)'
          }
        },
        description: 'Export options'
      }
    },
    required: ['template', 'options']
  },

  async invoke(args: unknown) {
    const monitor = PerformanceMonitor.getInstance();
    const operationId = `export_${Date.now()}_${Math.random()}`;
    
    monitor.startOperation(operationId, 'template.export');
    
    try {
      // Validate input
      const validatedInput = TemplateExportInputSchema.parse(args);
      const { template: templateInput, variables, options } = validatedInput;

      // Validate export options
      const validationErrors = TemplateExporter.validateExportOptions(options);
      if (validationErrors.length > 0) {
        const duration = monitor.endOperation(operationId);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Invalid export options',
              details: {
                errors: validationErrors
              },
              performance: {
                exportTime: duration
              }
            }, null, 2)
          }]
        };
      }

      // Determine if we have a rendered template or need to render
      let renderedTemplate: RenderedTemplate;
      
      if (typeof templateInput === 'string') {
        // Template ID - would need to load and render
        throw new Error(`Template lookup by ID not implemented: ${templateInput}`);
      } else if (isRenderedTemplate(templateInput)) {
        // Already rendered template
        renderedTemplate = templateInput as RenderedTemplate;
      } else {
        // Template definition - need to render first
        if (!variables) {
          throw new Error('Variables required when providing template definition');
        }
        renderedTemplate = await templateRender(templateInput as Template, variables);
      }

      // Export the rendered template
      const exportResult = await TemplateExporter.exportTemplate(renderedTemplate, options);
      
      const duration = monitor.endOperation(operationId);

      // Prepare success result
      if (exportResult.success) {
        const result = {
          success: true,
          export: {
            format: exportResult.format,
            data: exportResult.data, // Base64 encoded
            mimeType: getMimeType(exportResult.format),
            filename: generateFilename(renderedTemplate, options),
            size: {
              width: exportResult.size.width,
              height: exportResult.size.height,
              bytes: exportResult.size.bytes,
              formatted: formatBytes(exportResult.size.bytes)
            }
          },
          template: {
            id: renderedTemplate.templateId,
            renderedId: renderedTemplate.id
          },
          performance: {
            exportTime: duration,
            renderTime: exportResult.metadata.exportTime,
            totalTime: (duration || 0) + exportResult.metadata.exportTime
          },
          metadata: {
            exportedAt: new Date().toISOString(),
            exporter: 'TemplateExporter v1.0',
            options: exportResult.metadata.options
          }
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        };
      } else {
        // Export failed
        const errorResult = {
          success: false,
          error: exportResult.error || 'Export failed',
          code: TemplateErrorCode.EXPORT_ERROR,
          format: exportResult.format,
          performance: {
            exportTime: duration,
            attemptTime: exportResult.metadata.exportTime
          },
          suggestions: [
            'Check export format is supported',
            'Verify template content is valid',
            'Ensure sufficient system resources',
            'Try a different export format'
          ]
        };

        return {
          content: [{
            type: 'text',
            text: JSON.stringify(errorResult, null, 2)
          }]
        };
      }

    } catch (error) {
      const duration = monitor.endOperation(operationId);
      
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown export error',
        code: TemplateErrorCode.EXPORT_ERROR,
        performance: {
          exportTime: duration
        },
        suggestions: [
          'Check template and variable inputs',
          'Validate export options and format',
          'Ensure template is properly rendered',
          'Check system resources and dependencies'
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
 * Check if input is a rendered template
 */
function isRenderedTemplate(obj: any): boolean {
    return obj && 
           typeof obj === 'object' && 
           obj.id && 
           obj.templateId && 
           obj.content && 
           obj.generatedAt;
}

  /**
   * Get MIME type for export format
   */
function getMimeType(format: ExportFormat): string {
    const mimeTypes: Record<ExportFormat, string> = {
      [ExportFormat.SVG]: 'image/svg+xml',
      [ExportFormat.PNG]: 'image/png',
      [ExportFormat.JPEG]: 'image/jpeg',
      [ExportFormat.WEBP]: 'image/webp',
      [ExportFormat.PDF]: 'application/pdf',
      [ExportFormat.HTML]: 'text/html'
    };
    
    return mimeTypes[format] || 'application/octet-stream';
}

  /**
   * Generate filename for export
   */
function generateFilename(renderedTemplate: RenderedTemplate, options: ExportOptions): string {
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
    const templateName = renderedTemplate.templateId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const extension = options.format.toLowerCase();
    
    return `${templateName}_${timestamp}.${extension}`;
}

/**
 * Direct export function for programmatic use
 */
export async function exportTemplate(
  renderedTemplate: RenderedTemplate,
  options: ExportOptions
): Promise<ExportResult> {
  return await TemplateExporter.exportTemplate(renderedTemplate, options);
}

/**
 * Get supported export formats
 */
export function getSupportedFormats(): ExportFormat[] {
  return TemplateExporter.getSupportedFormats();
}
