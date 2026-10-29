import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  Template,
  VariableDefinition,
  ComponentLibraryItem,
  TemplateErrorCode
} from '../types/template.js';
import { searchComponents } from './templateLibraryAdd.js';
import { TemplateValidator } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';
import { generateId, getCurrentTimestamp, deepClone } from '../util/helpers.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

/**
 * Template Library Compose Tool - Creates templates from library components
 */
export const templateLibraryComposeTool: ExecutableTool = {
  name: 'template.library.compose',
  description: 'Create template from library components with specified layout',
  inputSchema: {
    type: 'object',
    properties: {
      components: {
        type: 'array',
        items: {
          oneOf: [
            {
              type: 'string',
              description: 'Component ID from library'
            },
            {
              type: 'object',
              properties: {
                id: {
                  type: 'string',
                  description: 'Component ID from library'
                },
                position: {
                  type: 'object',
                  properties: {
                    x: { type: 'number' },
                    y: { type: 'number' },
                    width: { type: 'number', minimum: 0 },
                    height: { type: 'number', minimum: 0 }
                  },
                  description: 'Override component position'
                },
                style: {
                  type: 'object',
                  description: 'Override component style'
                },
                variables: {
                  type: 'object',
                  description: 'Component-specific variables'
                }
              },
              required: ['id']
            }
          ]
        },
        minItems: 1,
        description: 'Component IDs or component configurations to include'
      },
      layout: {
        type: 'object',
        properties: {
          type: {
            enum: ['absolute', 'grid', 'flex', 'constraint'],
            default: 'absolute',
            description: 'Layout system to use'
          },
          config: {
            type: 'object',
            properties: {
              rows: {
                type: 'number',
                minimum: 1,
                description: 'Grid rows'
              },
              columns: {
                type: 'number',
                minimum: 1,
                description: 'Grid columns'
              },
              gap: {
                type: 'number',
                minimum: 0,
                description: 'Grid/flex gap'
              },
              direction: {
                enum: ['row', 'column'],
                description: 'Flex direction'
              },
              justify: {
                enum: ['start', 'center', 'end', 'space-between'],
                description: 'Flex justify content'
              },
              align: {
                enum: ['start', 'center', 'end', 'stretch'],
                description: 'Flex align items'
              }
            },
            description: 'Layout configuration'
          },
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
            description: 'Template background color'
          }
        },
        required: ['width', 'height'],
        description: 'Template layout configuration'
      },
      variables: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              pattern: '^[a-zA-Z_][a-zA-Z0-9_]*$'
            },
            type: {
              enum: ['string', 'number', 'boolean', 'color', 'image', 'font', 'array', 'object']
            },
            required: {
              type: 'boolean'
            },
            default: {},
            description: {
              type: 'string'
            }
          },
          required: ['name', 'type', 'required']
        },
        description: 'Template variables'
      },
      metadata: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            minLength: 1,
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
            items: {
              type: 'string'
            },
            description: 'Template tags'
          }
        },
        required: ['name'],
        description: 'Template metadata'
      },
      options: {
        type: 'object',
        properties: {
          autoLayout: {
            type: 'boolean',
            default: false,
            description: 'Auto-arrange components using layout system'
          },
          mergeVariables: {
            type: 'boolean',
            default: true,
            description: 'Merge variables from component dependencies'
          },
          validateComposition: {
            type: 'boolean',
            default: true,
            description: 'Validate composed template'
          },
          resolveDependencies: {
            type: 'boolean',
            default: true,
            description: 'Auto-include component dependencies'
          }
        },
        description: 'Composition options'
      }
    },
    required: ['components', 'layout', 'metadata']
  },

  async invoke(args: unknown) {
    const monitor = PerformanceMonitor.getInstance();
    const operationId = `library_compose_${Date.now()}_${Math.random()}`;
    
    monitor.startOperation(operationId, 'template.library.compose');
    
    try {
      // Parse input
      const {
        components: componentSpecs,
        layout: layoutSpec,
        variables = [],
        metadata,
        options = {}
      } = args as any;

      // Resolve components from library
      const resolvedComponents = await (templateLibraryComposeTool as any).resolveComponents(
        componentSpecs,
        options.resolveDependencies !== false
      );

      if (resolvedComponents.length === 0) {
        const duration = monitor.endOperation(operationId);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: 'No components could be resolved from library',
              code: TemplateErrorCode.COMPONENT_NOT_FOUND,
              suggestions: [
                'Check that component IDs exist in the library',
                'Verify component library is properly initialized',
                'Use template.library.add to add components first'
              ],
              performance: {
                composeTime: duration
              }
            }, null, 2)
          }]
        };
      }

      // Apply layout system
      const layoutedComponents = options.autoLayout ? 
        await (templateLibraryComposeTool as any).applyAutoLayout(resolvedComponents, layoutSpec) :
        resolvedComponents;

      // Merge variables from components if requested
      const mergedVariables = options.mergeVariables !== false ?
        (templateLibraryComposeTool as any).mergeComponentVariables(variables, layoutedComponents) :
        variables;

      // Create template
      const template: Template = {
        id: generateId('template'),
        metadata: {
          ...metadata,
          createdAt: getCurrentTimestamp(),
          updatedAt: getCurrentTimestamp(),
          version: metadata.version || '1.0.0'
        },
        variables: mergedVariables,
        components: layoutedComponents.map((item: ComponentLibraryItem) => item.component),
        layout: {
          width: layoutSpec.width,
          height: layoutSpec.height,
          background: layoutSpec.background
        }
      };

      // Validate composed template if requested
      if (options.validateComposition !== false) {
        const validationReport = TemplateValidator.validateTemplate(template);
        if (!validationReport.valid) {
          const duration = monitor.endOperation(operationId);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Composed template validation failed',
                details: {
                  errors: validationReport.errors,
                  warnings: validationReport.warnings
                },
                performance: {
                  composeTime: duration
                }
              }, null, 2)
            }]
          };
        }
      }

      const duration = monitor.endOperation(operationId);

      // Success result
      const result = {
        success: true,
        template: {
          id: template.id,
          name: template.metadata.name,
          version: template.metadata.version,
          componentCount: template.components.length,
          variableCount: template.variables.length,
          dimensions: {
            width: template.layout.width,
            height: template.layout.height
          }
        },
        composition: {
          sourceComponents: resolvedComponents.map((item: ComponentLibraryItem) => ({
            id: item.id,
            name: item.name,
            type: item.component.type,
            category: item.category
          })),
          layoutSystem: layoutSpec.type || 'absolute',
          autoLayoutApplied: options.autoLayout === true,
          dependenciesResolved: options.resolveDependencies !== false,
          variablesMerged: options.mergeVariables !== false
        },
        performance: {
          composeTime: duration,
          componentsResolved: resolvedComponents.length,
          layoutCalculationTime: options.autoLayout ? 'included' : 'skipped'
        },
        metadata: {
          composedAt: getCurrentTimestamp(),
          composer: 'TemplateLibraryCompose v1.0'
        }
      };

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
        error: error instanceof Error ? error.message : 'Unknown composition error',
        code: TemplateErrorCode.LIBRARY_ERROR,
        performance: {
          composeTime: duration
        },
        suggestions: [
          'Check that all component IDs exist in the library',
          'Verify layout configuration is valid',
          'Ensure template metadata is complete',
          'Check for component dependency conflicts'
        ]
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(errorResult, null, 2)
        }]
      };
    }
  },

  /**
   * Resolve components from library by IDs
   */
  async resolveComponents(
    componentSpecs: (string | { id: string; [key: string]: any })[],
    resolveDependencies: boolean
  ): Promise<ComponentLibraryItem[]> {
    const resolved: ComponentLibraryItem[] = [];
    const processed = new Set<string>();
    
    const resolveComponent = async (spec: string | object): Promise<void> => {
      const id = typeof spec === 'string' ? spec : (spec as any).id;
      
      if (processed.has(id)) return;
      processed.add(id);
      
      // Search for component in all libraries
      const searchResult = searchComponents({ name: id });
      let component = searchResult.find(c => c.id === id || c.name === id);
      
      if (!component) {
        throw new Error(`Component '${id}' not found in any library`);
      }
      
      // Apply overrides if provided
      if (typeof spec === 'object' && spec) {
        component = deepClone(component);
        const overrideSpec = spec as any;
        
        if (overrideSpec.position) {
          component.component.position = { ...component.component.position, ...overrideSpec.position };
        }
        
        if (overrideSpec.style) {
          component.component.style = { ...component.component.style, ...overrideSpec.style };
        }
      }
      
      resolved.push(component);
      
      // Resolve dependencies recursively
      if (resolveDependencies && component.dependencies) {
        for (const depId of component.dependencies) {
          await resolveComponent(depId);
        }
      }
    };
    
    // Resolve all specified components
    for (const spec of componentSpecs) {
      await resolveComponent(spec);
    }
    
    return resolved;
  },

  /**
   * Apply automatic layout to components
   */
  async applyAutoLayout(
    components: ComponentLibraryItem[],
    layoutSpec: any
  ): Promise<ComponentLibraryItem[]> {
    const layoutType = layoutSpec.type || 'absolute';
    const config = layoutSpec.config || {};
    
    switch (layoutType) {
      case 'grid':
        return (templateLibraryComposeTool as any).applyGridLayout(components, config, layoutSpec.width, layoutSpec.height);
      case 'flex':
        return (templateLibraryComposeTool as any).applyFlexLayout(components, config, layoutSpec.width, layoutSpec.height);
      case 'constraint':
        return (templateLibraryComposeTool as any).applyConstraintLayout(components, config, layoutSpec.width, layoutSpec.height);
      default:
        return components; // Return as-is for absolute positioning
    }
  },

  /**
   * Apply grid layout to components
   */
  applyGridLayout(
    components: ComponentLibraryItem[],
    config: any,
    templateWidth: number,
    templateHeight: number
  ): ComponentLibraryItem[] {
    const rows = config.rows || Math.ceil(Math.sqrt(components.length));
    const columns = config.columns || Math.ceil(components.length / rows);
    const gap = config.gap || 10;
    
    const cellWidth = (templateWidth - gap * (columns - 1)) / columns;
    const cellHeight = (templateHeight - gap * (rows - 1)) / rows;
    
    return components.map((component, index) => {
      const row = Math.floor(index / columns);
      const col = index % columns;
      
      const x = col * (cellWidth + gap);
      const y = row * (cellHeight + gap);
      
      const updatedComponent = deepClone(component);
      updatedComponent.component.position = {
        x,
        y,
        width: cellWidth,
        height: cellHeight
      };
      
      return updatedComponent;
    });
  },

  /**
   * Apply flex layout to components
   */
  applyFlexLayout(
    components: ComponentLibraryItem[],
    config: any,
    templateWidth: number,
    templateHeight: number
  ): ComponentLibraryItem[] {
    const direction = config.direction || 'row';
    const gap = config.gap || 10;
    // config.justify is not applied yet: components always fill the axis from the start
    
    const isRow = direction === 'row';
    const availableSpace = isRow ? 
      templateWidth - gap * (components.length - 1) :
      templateHeight - gap * (components.length - 1);
    
    const componentSize = availableSpace / components.length;
    
    return components.map((component, index) => {
      const updatedComponent = deepClone(component);
      
      if (isRow) {
        const x = index * (componentSize + gap);
        updatedComponent.component.position = {
          x,
          y: 0,
          width: componentSize,
          height: templateHeight
        };
      } else {
        const y = index * (componentSize + gap);
        updatedComponent.component.position = {
          x: 0,
          y,
          width: templateWidth,
          height: componentSize
        };
      }
      
      return updatedComponent;
    });
  },

  /**
   * Apply constraint-based layout (placeholder)
   */
  applyConstraintLayout(
    components: ComponentLibraryItem[],
    _config: any,
    _templateWidth: number,
    _templateHeight: number
  ): ComponentLibraryItem[] {
    // Placeholder - in a real implementation, this would solve layout constraints
    return components;
  },

  /**
   * Merge variables from component dependencies
   */
  mergeComponentVariables(
    baseVariables: VariableDefinition[],
    _components: ComponentLibraryItem[]
  ): VariableDefinition[] {
    const merged = [...baseVariables];
    
    // For now, just return base variables
    // In a real implementation, this would extract variables from component templates
    
    return merged;
  }
};
