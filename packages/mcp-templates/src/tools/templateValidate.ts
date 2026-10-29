import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  TemplateValidateInputSchema,
  Template,
  ValidationReport,
  TemplateError,
  TemplateErrorCode
} from '../types/template.js';
import { TemplateValidator, PerformanceValidator } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

/**
 * Template Validation Tool - Validates template structure and variables
 */
export const templateValidateTool: ExecutableTool = {
  name: 'template.validate',
  description: 'Validate template structure, components, and variable definitions',
  inputSchema: {
    type: 'object',
    properties: {
      template: {
        type: 'object',
        description: 'Template to validate'
      },
      variables: {
        type: 'object',
        description: 'Optional variables to validate against template',
        additionalProperties: true
      },
      options: {
        type: 'object',
        properties: {
          strict: {
            type: 'boolean',
            default: false,
            description: 'Enable strict validation mode'
          },
          checkPerformance: {
            type: 'boolean',
            default: true,
            description: 'Check performance constraints'
          },
          validateReferences: {
            type: 'boolean',
            default: true,
            description: 'Validate variable references in components'
          },
          includeWarnings: {
            type: 'boolean',
            default: true,
            description: 'Include warnings in validation report'
          }
        },
        description: 'Validation options'
      }
    },
    required: ['template']
  },

  async invoke(args: unknown) {
    const monitor = PerformanceMonitor.getInstance();
    const operationId = `validate_${Date.now()}_${Math.random()}`;
    
    monitor.startOperation(operationId, 'template.validate');
    
    try {
      // Validate input
      const validatedInput = TemplateValidateInputSchema.parse(args);
      const { template, variables } = validatedInput;
      const options = (validatedInput as any).options || {};

      // Perform basic template validation
      let validationReport: ValidationReport;
      
      if (variables) {
        validationReport = TemplateValidator.validateTemplateWithVariables(template, variables);
      } else {
        validationReport = TemplateValidator.validateTemplate(template);
      }

      // Check performance constraints if requested
      let performanceIssues: TemplateError[] = [];
      if (options.checkPerformance !== false) {
        performanceIssues = PerformanceValidator.validatePerformanceConstraints(template);
      }

      // Merge performance issues into validation report
      if (performanceIssues.length > 0) {
        validationReport.warnings.push(...performanceIssues);
      }

      const duration = monitor.endOperation(operationId);

      // Calculate validation score
      const validationScore = calculateValidationScore(validationReport, template);

      // Prepare detailed validation result
      const result = {
        success: true,
        validation: {
          valid: validationReport.valid,
          score: validationScore,
          summary: {
            errors: validationReport.errors.length,
            warnings: validationReport.warnings.length,
            components: validationReport.metadata.componentCount,
            variables: validationReport.metadata.variableCount
          },
          errors: validationReport.errors,
          warnings: options.includeWarnings !== false ? validationReport.warnings : [],
          categories: categorizeIssues([...validationReport.errors, ...validationReport.warnings])
        },
        template: {
          id: template.id,
          name: template.metadata?.name,
          complexity: assessComplexity(template),
          structure: {
            componentTypes: getComponentTypes(template),
            variableTypes: getVariableTypes(template),
            hasInheritance: !!template.extends,
            hasPartials: !!(template.partials && Object.keys(template.partials).length > 0)
          }
        },
        performance: {
          validationTime: duration,
          performanceIssues: performanceIssues.length,
          recommendations: getPerformanceRecommendations(template, performanceIssues)
        },
        metadata: {
          validatedAt: validationReport.metadata.validatedAt,
          validator: 'TemplateValidator v1.0',
          options: {
            strict: options.strict || false,
            checkPerformance: options.checkPerformance !== false,
            validateReferences: options.validateReferences !== false,
            includeWarnings: options.includeWarnings !== false
          }
        }
      };

      // Add suggestions if there are issues
      if (validationReport.errors.length > 0 || validationReport.warnings.length > 0) {
        (result as any).suggestions = generateSuggestions(validationReport, template);
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
        error: error instanceof Error ? error.message : 'Unknown validation error',
        code: TemplateErrorCode.VALIDATION_ERROR,
        performance: {
          validationTime: duration
        },
        suggestions: [
          'Check template structure and format',
          'Ensure all required fields are present',
          'Validate JSON syntax if using inline templates',
          'Check component and variable definitions'
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
 * Calculate overall validation score (0-100)
 */
function calculateValidationScore(report: ValidationReport, template: Template): number {
    let score = 100;
    
    // Deduct points for errors (major issues)
    score -= report.errors.length * 15;
    
    // Deduct points for warnings (minor issues)
    score -= report.warnings.length * 5;
    
    // Bonus points for good practices
    if (template.metadata?.description) score += 2;
    if (template.metadata?.author) score += 1;
    if (template.metadata?.tags?.length) score += 1;
    
    // Ensure score is between 0 and 100
    return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * Categorize validation issues by type
 */
function categorizeIssues(issues: TemplateError[]): Record<string, number> {
    const categories: Record<string, number> = {
      structure: 0,
      components: 0,
      variables: 0,
      references: 0,
      performance: 0,
      other: 0
    };

    for (const issue of issues) {
      if (issue.componentId) {
        categories.components++;
      } else if (issue.variableName) {
        categories.variables++;
      } else if (issue.message.includes('reference') || issue.message.includes('undefined')) {
        categories.references++;
      } else if (issue.message.includes('performance') || issue.message.includes('complex')) {
        categories.performance++;
      } else if (issue.code === TemplateErrorCode.INVALID_TEMPLATE) {
        categories.structure++;
      } else {
        categories.other++;
      }
    }

    return categories;
}

  /**
   * Assess template complexity
   */
function assessComplexity(template: Template): 'low' | 'medium' | 'high' | 'very-high' {
    let score = 0;
    
    // Component count
    score += template.components.length;
    
    // Variable count
    score += template.variables.length * 0.5;
    
    // Layout size
    score += (template.layout.width * template.layout.height) / 100000;
    
    // Features
    if (template.extends) score += 10;
    if (template.partials) score += Object.keys(template.partials).length * 5;
    
    if (score < 20) return 'low';
    if (score < 50) return 'medium';
    if (score < 100) return 'high';
    return 'very-high';
}

  /**
   * Get component types used in template
   */
function getComponentTypes(template: Template): Record<string, number> {
    const types: Record<string, number> = {};
    
    const countComponents = (components: any[]) => {
      for (const component of components) {
        types[component.type] = (types[component.type] || 0) + 1;
        
        // Recursively count group children
        if (component.type === 'group' && component.children) {
          countComponents(component.children);
        }
      }
    };
    
    countComponents(template.components);
    return types;
}

  /**
   * Get variable types used in template
   */
function getVariableTypes(template: Template): Record<string, number> {
    const types: Record<string, number> = {};
    
    for (const variable of template.variables) {
      types[variable.type] = (types[variable.type] || 0) + 1;
    }
    
    return types;
}

  /**
   * Get performance recommendations
   */
function getPerformanceRecommendations(template: Template, issues: TemplateError[]): string[] {
    const recommendations: string[] = [];
    
    if (template.components.length > 500) {
      recommendations.push('Consider reducing component count or using groups to optimize rendering');
    }
    
    if (template.variables.length > 50) {
      recommendations.push('Consider using object/array variables to group related data');
    }
    
    if (template.layout.width * template.layout.height > 10000000) {
      recommendations.push('Large template dimensions may impact performance');
    }
    
    if (issues.some(i => i.message.includes('complex'))) {
      recommendations.push('Simplify template structure to improve rendering performance');
    }
    
    return recommendations;
}

  /**
   * Generate helpful suggestions based on validation results
   */
function generateSuggestions(report: ValidationReport, template: Template): string[] {
    const suggestions: string[] = [];
    
    // Structure suggestions
    if (report.errors.some(e => e.code === TemplateErrorCode.INVALID_TEMPLATE)) {
      suggestions.push('Review template structure and ensure all required fields are present');
    }
    
    // Variable suggestions
    if (report.errors.some(e => e.code === TemplateErrorCode.MISSING_VARIABLE)) {
      suggestions.push('Provide values for all required variables or set default values');
    }
    
    if (report.errors.some(e => e.code === TemplateErrorCode.INVALID_VARIABLE)) {
      suggestions.push('Check variable types and values match template expectations');
    }
    
    // Component suggestions
    if (report.errors.some(e => e.componentId)) {
      suggestions.push('Review component definitions and ensure all required properties are set');
    }
    
    // Performance suggestions
    if (report.warnings.some(w => w.message.includes('performance'))) {
      suggestions.push('Consider optimizing template for better performance');
    }
    
    // General suggestions
    if (!template.metadata?.description) {
      suggestions.push('Add a description to improve template documentation');
    }
    
    return suggestions;
}
