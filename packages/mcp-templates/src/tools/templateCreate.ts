import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  TemplateCreateInputSchema,
  Template,
  TemplateErrorCode
} from '../types/template.js';
import { TemplateValidator, PerformanceValidator } from '../util/validation.js';
import { generateId } from '../util/helpers.js';
import { failureResult, invalidInputResult } from '../util/toolResult.js';
import { toolInputSchema } from '../util/toolSchema.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<CallToolResult>;
}

/**
 * Template Creation Tool - Creates new reusable templates
 */
export const templateCreateTool: ExecutableTool = {
  name: 'template.create',
  description: 'Create a new reusable template with structured definition',
  inputSchema: toolInputSchema(TemplateCreateInputSchema),

  async invoke(args: unknown) {
    try {
      const parsedArgs = TemplateCreateInputSchema.safeParse(args);
      if (!parsedArgs.success) {
        return invalidInputResult('template.create', parsedArgs.error);
      }
      const { template } = parsedArgs.data;

      // Generate ID and timestamps
      const now = new Date().toISOString();
      const completeTemplate: Template = {
        id: generateId('template'),
        ...template,
        metadata: {
          ...template.metadata,
          createdAt: now,
          updatedAt: now
        }
      };

      // Validate template structure
      const validationReport = TemplateValidator.validateTemplate(completeTemplate);
      if (!validationReport.valid) {
        return failureResult({
          success: false,
          error: 'Template validation failed',
          details: {
            errors: validationReport.errors,
            warnings: validationReport.warnings
          }
        });
      }

      // Check performance constraints
      const performanceErrors = PerformanceValidator.validatePerformanceConstraints(completeTemplate);
      if (performanceErrors.length > 0) {
        return failureResult({
          success: false,
          error: 'Template exceeds performance constraints',
          details: {
            errors: performanceErrors
          }
        });
      }

      // Template created successfully
      // Return the whole template: nothing stores it, so callers pass it to template.render
      const result = {
        success: true,
        template: completeTemplate,
        summary: {
          id: completeTemplate.id,
          name: completeTemplate.metadata.name,
          version: completeTemplate.metadata.version,
          componentCount: completeTemplate.components.length,
          variableCount: completeTemplate.variables.length,
          dimensions: {
            width: completeTemplate.layout.width,
            height: completeTemplate.layout.height
          }
        },
        validation: {
          warnings: validationReport.warnings
        },
        metadata: {
          createdAt: completeTemplate.metadata.createdAt,
          performance: {
            componentCount: completeTemplate.components.length,
            variableCount: completeTemplate.variables.length,
            complexityScore: calculateComplexityScore(completeTemplate)
          }
        }
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };

    } catch (error) {
      const errorResult = {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        code: TemplateErrorCode.INVALID_TEMPLATE,
        suggestions: [
          'Check template structure and required fields',
          'Validate component definitions',
          'Ensure variable names are valid identifiers',
          'Verify template dimensions are within limits'
        ]
      };

      return failureResult(errorResult);
    }
  }
};

/**
 * Calculate template complexity score for performance monitoring
 */
function calculateComplexityScore(template: Template): number {
    let score = 0;
    
    // Base score from layout size
    score += (template.layout.width * template.layout.height) / 10000;
    
    // Score from components
    score += template.components.length * 10;
    
    // Score from variables
    score += template.variables.length * 2;
    
    // Score from template features
    if (template.extends) score += 50;
    if (template.partials) score += Object.keys(template.partials).length * 20;
    
    return Math.round(score);
}
