import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  ComponentLibraryItem,
  ComponentLibrary,
  TemplateError,
  TemplateErrorCode,
  ComponentType,
  TemplateComponent,
  PositionSchema
} from '../types/template.js';
import { z } from 'zod';
import { PerformanceMonitor } from '../util/performance.js';
import { generateId, getCurrentTimestamp } from '../util/helpers.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<CallToolResult>;
}

/** Component as supplied to template.library.add (id is generated; version and tags default) */
type LibraryComponentInput = Omit<ComponentLibraryItem, 'id' | 'version' | 'tags'> & {
  version?: string;
  tags?: string[];
};

export const MAX_LIBRARIES = 50;
export const MAX_COMPONENTS_PER_LIBRARY = 500;
/** Max serialized size of one library item */
export const MAX_LIBRARY_ITEM_BYTES = 256 * 1024;

/**
 * Structural schema for template.library.add input. Always enforced (the
 * `validate` option only toggles the friendlier semantic checks below).
 */
const LibraryAddArgsSchema = z.object({
  component: z.object({
    name: z.string().max(100),
    description: z.string().max(500).optional(),
    category: z.string().max(100),
    tags: z.array(z.string().max(50)).max(20).optional(),
    component: z.object({
      id: z.string().max(200),
      type: z.nativeEnum(ComponentType),
      position: PositionSchema
    }).passthrough(),
    preview: z.string().max(MAX_LIBRARY_ITEM_BYTES).optional(),
    version: z.string().max(50).optional(),
    author: z.string().max(200).optional(),
    dependencies: z.array(z.string().max(200)).max(50).optional()
  }),
  library: z.string().max(64).regex(/^[a-zA-Z0-9-_]+$/).optional(),
  options: z.object({
    validate: z.boolean().optional(),
    overwrite: z.boolean().optional(),
    generatePreview: z.boolean().optional()
  }).optional()
});

// In-memory component library storage (in production, this would be persistent)
const componentLibraries: Map<string, ComponentLibrary> = new Map();

/**
 * Validate component for library addition
 */
function validateComponent(componentData: Partial<LibraryComponentInput>): TemplateError[] {
  const errors: TemplateError[] = [];

  // Required fields
  if (!componentData.name || typeof componentData.name !== 'string') {
    errors.push({
      code: TemplateErrorCode.LIBRARY_ERROR,
      message: 'Component name is required and must be a string',
      suggestions: ['Provide a valid component name']
    });
  }

  if (!componentData.category || typeof componentData.category !== 'string') {
    errors.push({
      code: TemplateErrorCode.LIBRARY_ERROR,
      message: 'Component category is required and must be a string',
      suggestions: ['Provide a component category']
    });
  }

  if (!componentData.component || typeof componentData.component !== 'object') {
    errors.push({
      code: TemplateErrorCode.LIBRARY_ERROR,
      message: 'Component definition is required',
      suggestions: ['Provide a valid component definition object']
    });
  } else {
    // Validate component structure
    const component = componentData.component;
    
    if (!component.id || typeof component.id !== 'string') {
      errors.push({
        code: TemplateErrorCode.LIBRARY_ERROR,
        message: 'Component ID is required',
        suggestions: ['Provide a unique component ID']
      });
    }

    if (!Object.values(ComponentType).includes(component.type)) {
      errors.push({
        code: TemplateErrorCode.LIBRARY_ERROR,
        message: `Invalid component type: ${component.type}`,
        suggestions: [`Use one of: ${Object.values(ComponentType).join(', ')}`]
      });
    }

    if (!component.position || typeof component.position !== 'object') {
      errors.push({
        code: TemplateErrorCode.LIBRARY_ERROR,
        message: 'Component position is required',
        suggestions: ['Provide position with x, y, width, height']
      });
    } else {
      const pos = component.position;
      if (typeof pos.x !== 'number' || typeof pos.y !== 'number' || 
          typeof pos.width !== 'number' || typeof pos.height !== 'number') {
        errors.push({
          code: TemplateErrorCode.LIBRARY_ERROR,
          message: 'Position must have numeric x, y, width, height',
          suggestions: ['Ensure all position values are numbers']
        });
      }
    }
  }

  // Name validation
  if (componentData.name && (componentData.name.length > 100 || componentData.name.length === 0)) {
    errors.push({
      code: TemplateErrorCode.LIBRARY_ERROR,
      message: 'Component name must be between 1 and 100 characters',
      suggestions: ['Use a shorter, descriptive name']
    });
  }

  // Tags validation
  if (componentData.tags && Array.isArray(componentData.tags)) {
    if (componentData.tags.length > 20) {
      errors.push({
        code: TemplateErrorCode.LIBRARY_ERROR,
        message: 'Too many tags (maximum 20)',
        suggestions: ['Reduce number of tags to 20 or fewer']
      });
    }
    
    for (const tag of componentData.tags) {
      if (typeof tag !== 'string' || tag.length > 50) {
        errors.push({
          code: TemplateErrorCode.LIBRARY_ERROR,
          message: 'Tags must be strings with maximum 50 characters',
          suggestions: ['Use shorter, descriptive tags']
        });
        break;
      }
    }
  }

  return errors;
}

/**
 * Generate preview for component (placeholder implementation)
 */
async function generatePreview(_component: TemplateComponent): Promise<string | undefined> {
  // In a real implementation, this would render the component to create a preview
  // For now, return undefined to indicate no preview generated
  return undefined;
}

/**
 * Template Library Add Tool - Adds components to reusable library
 */
export const templateLibraryAddTool: ExecutableTool = {
  name: 'template.library.add',
  description: 'Add component to reusable component library',
  inputSchema: {
    type: 'object',
    properties: {
      component: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            minLength: 1,
            maxLength: 100,
            description: 'Component name'
          },
          description: {
            type: 'string',
            maxLength: 500,
            description: 'Component description'
          },
          category: {
            type: 'string',
            description: 'Component category'
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
              maxLength: 50
            },
            maxItems: 20,
            description: 'Component tags for searchability'
          },
          component: {
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
                required: ['x', 'y', 'width', 'height']
              }
            },
            required: ['id', 'type', 'position'],
            description: 'Component definition'
          },
          preview: {
            type: 'string',
            description: 'Base64 preview image or SVG'
          },
          version: {
            type: 'string',
            default: '1.0.0',
            description: 'Component version'
          },
          author: {
            type: 'string',
            description: 'Component author'
          },
          dependencies: {
            type: 'array',
            items: {
              type: 'string'
            },
            description: 'Required component dependencies'
          }
        },
        required: ['name', 'category', 'component'],
        description: 'Component library item to add'
      },
      library: {
        type: 'string',
        default: 'default',
        pattern: '^[a-zA-Z0-9-_]+$',
        description: 'Library name to add component to'
      },
      options: {
        type: 'object',
        properties: {
          overwrite: {
            type: 'boolean',
            default: false,
            description: 'Overwrite existing component with same name'
          },
          validate: {
            type: 'boolean',
            default: true,
            description: 'Validate component before adding'
          },
          generatePreview: {
            type: 'boolean',
            default: false,
            description: 'Auto-generate preview image'
          }
        },
        description: 'Add operation options'
      }
    },
    required: ['component']
  },

  async invoke(args: unknown) {
    const monitor = PerformanceMonitor.getInstance();
    const operationId = `library_add_${Date.now()}_${Math.random()}`;
    
    monitor.startOperation(operationId, 'template.library.add');
    
    try {
      // Parse and validate input
      const parsedArgs = LibraryAddArgsSchema.safeParse(args);
      if (!parsedArgs.success) {
        throw new Error(`Invalid input: ${parsedArgs.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      }
      const { library: libraryName = 'default', options = {} } = parsedArgs.data;
      // The schema checks structure; per-type component fields are checked semantically below
      const componentData = parsedArgs.data.component as unknown as LibraryComponentInput;

      if (Buffer.byteLength(JSON.stringify(componentData), 'utf8') > MAX_LIBRARY_ITEM_BYTES) {
        throw new Error(`Component exceeds the size limit of ${MAX_LIBRARY_ITEM_BYTES} bytes`);
      }
      
      // Validate component if requested
      if (options.validate !== false) {
        const validationErrors = validateComponent(componentData);
        if (validationErrors.length > 0) {
          const duration = monitor.endOperation(operationId);
          
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                success: false,
                error: 'Component validation failed',
                details: {
                  errors: validationErrors
                },
                performance: {
                  addTime: duration
                }
              }, null, 2)
            }]
          };
        }
      }

      // Get or create library
      let library = componentLibraries.get(libraryName);
      if (!library) {
        if (componentLibraries.size >= MAX_LIBRARIES) {
          throw new Error(`Library limit reached (max ${MAX_LIBRARIES} libraries)`);
        }
        library = {
          name: libraryName,
          version: '1.0.0',
          components: [],
          categories: [],
          metadata: {
            createdAt: getCurrentTimestamp(),
            updatedAt: getCurrentTimestamp(),
            totalComponents: 0
          }
        };
        componentLibraries.set(libraryName, library);
      }

      // Check for existing component
      const existingIndex = library.components.findIndex(c => c.name === componentData.name);
      if (existingIndex >= 0 && !options.overwrite) {
        const duration = monitor.endOperation(operationId);
        
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Component '${componentData.name}' already exists in library '${libraryName}'`,
              code: TemplateErrorCode.LIBRARY_ERROR,
              suggestions: [
                'Use different component name',
                'Set overwrite option to true',
                'Use different library name'
              ],
              performance: {
                addTime: duration
              }
            }, null, 2)
          }]
        };
      }

      if (existingIndex < 0 && library.components.length >= MAX_COMPONENTS_PER_LIBRARY) {
        throw new Error(`Component limit reached for library '${libraryName}' (max ${MAX_COMPONENTS_PER_LIBRARY} components)`);
      }

      // Create library item
      const libraryItem: ComponentLibraryItem = {
        id: generateId('comp'),
        name: componentData.name,
        description: componentData.description,
        category: componentData.category,
        tags: componentData.tags || [],
        component: componentData.component,
        preview: componentData.preview,
        version: componentData.version || '1.0.0',
        author: componentData.author,
        dependencies: componentData.dependencies || []
      };

      // Generate preview if requested and not provided
      if (options.generatePreview && !libraryItem.preview) {
        libraryItem.preview = await generatePreview(libraryItem.component);
      }

      // Add or update component
      if (existingIndex >= 0) {
        library.components[existingIndex] = libraryItem;
      } else {
        library.components.push(libraryItem);
      }

      // Update library metadata
      library.metadata.updatedAt = getCurrentTimestamp();
      library.metadata.totalComponents = library.components.length;
      
      // Update categories list
      if (!library.categories.includes(componentData.category)) {
        library.categories.push(componentData.category);
      }

      const duration = monitor.endOperation(operationId);

      // Return success result
      const result = {
        success: true,
        component: {
          id: libraryItem.id,
          name: libraryItem.name,
          category: libraryItem.category,
          version: libraryItem.version,
          type: libraryItem.component.type,
          hasPreview: !!libraryItem.preview,
          dependencyCount: libraryItem.dependencies?.length || 0
        },
        library: {
          name: libraryName,
          totalComponents: library.metadata.totalComponents,
          categories: library.categories.length
        },
        operation: {
          action: existingIndex >= 0 ? 'updated' : 'added',
          overwrite: options.overwrite === true
        },
        performance: {
          addTime: duration,
          validationPerformed: options.validate !== false,
          previewGenerated: options.generatePreview === true && !componentData.preview
        },
        metadata: {
          addedAt: getCurrentTimestamp(),
          libraryUpdatedAt: library.metadata.updatedAt
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
        error: error instanceof Error ? error.message : 'Unknown library operation error',
        code: TemplateErrorCode.LIBRARY_ERROR,
        performance: {
          addTime: duration
        },
        suggestions: [
          'Check component definition and required fields',
          'Ensure library name is valid',
          'Verify component structure matches schema',
          'Check for naming conflicts'
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
 * Get library by name
 */
export function getLibrary(name: string): ComponentLibrary | undefined {
  return componentLibraries.get(name);
}

/**
 * List all libraries
 */
export function listLibraries(): ComponentLibrary[] {
  return Array.from(componentLibraries.values());
}

/**
 * Search components across all libraries
 */
export function searchComponents(query: {
  name?: string;
  category?: string;
  tags?: string[];
  type?: ComponentType;
  library?: string;
}): ComponentLibraryItem[] {
  const results: ComponentLibraryItem[] = [];
  
  const librariesToSearch = query.library ? 
    [componentLibraries.get(query.library)].filter(Boolean) as ComponentLibrary[] :
    Array.from(componentLibraries.values());
  
  for (const library of librariesToSearch) {
    for (const component of library.components) {
      let matches = true;
      
      if (query.name && !component.name.toLowerCase().includes(query.name.toLowerCase())) {
        matches = false;
      }
      
      if (query.category && component.category !== query.category) {
        matches = false;
      }
      
      if (query.type && component.component.type !== query.type) {
        matches = false;
      }
      
      if (query.tags && query.tags.length > 0) {
        const hasAllTags = query.tags.every(tag => 
          component.tags.some(compTag => compTag.toLowerCase().includes(tag.toLowerCase()))
        );
        if (!hasAllTags) {
          matches = false;
        }
      }
      
      if (matches) {
        results.push(component);
      }
    }
  }
  
  return results;
}
