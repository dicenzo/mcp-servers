import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  TemplateExportInputSchema,
  RenderedTemplateSchema,
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
import { formatBytes, rejectTemplateId } from '../util/helpers.js';
import { failureResult } from '../util/toolResult.js';
import { toolInputSchema } from '../util/toolSchema.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<CallToolResult>;
}

/**
 * Template Export Tool - Exports rendered templates to multiple formats
 */
export const templateExportTool: ExecutableTool = {
  name: 'template.export',
  description: 'Export rendered template to multiple formats (SVG, PNG, PDF, HTML, etc.)',
  inputSchema: toolInputSchema(TemplateExportInputSchema),

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
        
        return failureResult({
          success: false,
          error: 'Invalid export options',
          details: {
            errors: validationErrors
          },
          performance: {
            exportTime: duration
          }
        });
      }

      // Determine if we have a rendered template or need to render
      let renderedTemplate: RenderedTemplate;
      
      rejectTemplateId(templateInput);
      if (looksLikeRenderedTemplate(templateInput)) {
        // Already rendered template: validate fully (sizes included) before trusting it
        const parsed = RenderedTemplateSchema.safeParse(templateInput);
        if (!parsed.success) {
          throw new Error(`Invalid rendered template: ${parsed.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
        }
        renderedTemplate = parsed.data;
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

        return failureResult(errorResult);
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

      return failureResult(errorResult);
    }
  }
};

/**
 * Check if input is shaped like a rendered template (it is then validated with RenderedTemplateSchema)
 */
function looksLikeRenderedTemplate(obj: unknown): boolean {
    if (!obj || typeof obj !== 'object') return false;
    const candidate = obj as Partial<RenderedTemplate>;
    return Boolean(candidate.content || candidate.generatedAt);
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
