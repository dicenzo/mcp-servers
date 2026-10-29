import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  TemplateCreateInputSchema,
  Template,
  TemplateErrorCode
} from '../types/template.js';
import { TemplateValidator, PerformanceValidator } from '../util/validation.js';
import { generateId } from '../util/helpers.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

/**
 * Template Creation Tool - Creates new reusable templates
 */
export const templateCreateTool: ExecutableTool = {
  name: 'template.create',
  description: 'Create a new reusable template with structured definition',
  inputSchema: {
    type: 'object',
    properties: {
      template: {
        type: 'object',
        properties: {
          metadata: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Template name'
              },
              version: {
                type: 'string',
                default: '1.0.0',
                description: 'Template version'
              },
              description: {
                type: 'string',
                description: 'Template description'
              },
              author: {
                type: 'string',
                description: 'Template author'
              },
              category: {
                type: 'string',
                description: 'Template category'
              },
              tags: {
                type: 'array',
                items: { type: 'string' },
                description: 'Template tags'
              }
            },
            required: ['name', 'version']
          },
          variables: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: {
                  type: 'string',
                  pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$',
                  description: 'Variable name'
                },
                type: {
                  enum: ['string', 'number', 'boolean', 'color', 'image', 'font', 'array', 'object'],
                  description: 'Variable type'
                },
                required: {
                  type: 'boolean',
                  description: 'Whether variable is required'
                },
                default: {
                  description: 'Default value for variable'
                },
                description: {
                  type: 'string',
                  description: 'Variable description'
                },
                validation: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: {
                        enum: ['min', 'max', 'pattern', 'enum', 'custom']
                      },
                      value: {},
                      message: { type: 'string' }
                    },
                    required: ['type', 'value']
                  },
                  description: 'Validation rules'
                }
              },
              required: ['name', 'type', 'required']
            },
            description: 'Template variables'
          },
          components: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Component ID'
                },
                type: {
                  enum: ['text', 'image', 'shape', 'group', 'svg', 'html'],
                  description: 'Component type'
                },
                position: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    width: { type: 'number', minimum: 0 },
                    height: { type: 'number', minimum: 0 }
                  },
                  required: ['x', 'y', 'width', 'height'],
                  description: 'Component position and size'
                },
                style: {
                  type: 'object',
                  description: 'Component styling'
                },
                visible: {
                  type: 'boolean',
                  default: true,
                  description: 'Component visibility'
                },
                conditional: {
                  type: 'string',
                  description: 'Conditional rendering expression'
                },
                repeat: {
                  type: 'string',
                  description: 'Loop/repeat expression'
                }
              },
              required: ['id', 'type', 'position']
            },
            description: 'Template components'
          },
          layout: {
            type: 'object',
            properties: {
              width: {
                type: 'number',
                minimum: 1,
                maximum: 10000,
                description: 'Template width'
              },
              height: {
                type: 'number',
                minimum: 1,
                maximum: 10000,
                description: 'Template height'
              },
              background: {
                type: 'string',
                description: 'Background color'
              }
            },
            required: ['width', 'height'],
            description: 'Template layout configuration'
          },
          extends: {
            type: 'string',
            description: 'Parent template ID for inheritance'
          },
          partials: {
            type: 'object',
            description: 'Reusable sub-templates'
          }
        },
        required: ['metadata', 'variables', 'components', 'layout']
      }
    },
    required: ['template']
  },

  async invoke(args: unknown) {
    try {
      // Validate input
      const validatedInput = TemplateCreateInputSchema.parse(args);
      const { template } = validatedInput;

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
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Template validation failed',
              details: {
                errors: validationReport.errors,
                warnings: validationReport.warnings
              }
            }, null, 2)
          }]
        };
      }

      // Check performance constraints
      const performanceErrors = PerformanceValidator.validatePerformanceConstraints(completeTemplate);
      if (performanceErrors.length > 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'Template exceeds performance constraints',
              details: {
                errors: performanceErrors
              }
            }, null, 2)
          }]
        };
      }

      // Template created successfully
      const result = {
        success: true,
        template: {
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
