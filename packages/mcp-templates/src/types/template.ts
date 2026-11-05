import { z } from 'zod';

/**
 * Template System Types
 * Defines all interfaces and schemas for the MCP Templates server
 */

// ==================== Variable System Types ====================

export enum VariableType {
  STRING = 'string',
  NUMBER = 'number',
  BOOLEAN = 'boolean',
  COLOR = 'color',
  IMAGE = 'image',
  FONT = 'font',
  ARRAY = 'array',
  OBJECT = 'object'
}

export interface ValidationRule {
  type: 'min' | 'max' | 'pattern' | 'enum' | 'custom';
  value?: unknown;
  message?: string;
}

export interface VariableDefinition {
  name: string;
  type: VariableType;
  required: boolean;
  default?: unknown;
  description?: string;
  validation?: ValidationRule[];
  // For array types
  items?: VariableDefinition;
  // For object types
  properties?: Record<string, VariableDefinition>;
}

export interface VariableMap {
  [key: string]: unknown;
}

// Validation schemas for variables
export const ValidationRuleSchema: z.ZodType<ValidationRule> = z.object({
  type: z.enum(['min', 'max', 'pattern', 'enum', 'custom']),
  value: z.any(),
  message: z.string().optional()
});

export const VariableDefinitionSchema: z.ZodType<VariableDefinition> = z.lazy(() => 
  z.object({
    name: z.string().describe('Variable name'),
    type: z.nativeEnum(VariableType).describe('Variable type'),
    required: z.boolean().describe('Whether variable is required'),
    default: z.any().optional().describe('Default value for variable'),
    description: z.string().optional().describe('Variable description'),
    validation: z.array(ValidationRuleSchema).optional().describe('Validation rules'),
    items: VariableDefinitionSchema.optional().describe('Definition of each item (array variables)'),
    properties: z.record(z.string(), VariableDefinitionSchema).optional().describe('Definitions of the properties (object variables)')
  })
// Named, so advertised schemas refer to the recursive definition as #/$defs/VariableDefinition
).meta({ id: 'VariableDefinition' });

// ==================== Template Component Types ====================

export enum ComponentType {
  TEXT = 'text',
  IMAGE = 'image',
  SHAPE = 'shape',
  GROUP = 'group',
  SVG = 'svg',
  HTML = 'html'
}

export interface Position {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Style {
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  textAlign?: 'left' | 'center' | 'right';
  [key: string]: unknown;
}

export interface BaseComponent {
  id: string;
  type: ComponentType;
  position: Position;
  style?: Style;
  visible?: boolean;
  conditional?: string; // Handlebars expression
  repeat?: string; // Loop expression
}

export interface TextComponent extends BaseComponent {
  type: ComponentType.TEXT;
  content: string; // Template string with variables
  style: Style & {
    fontSize: number;
    fontFamily: string;
    textAlign?: 'left' | 'center' | 'right';
  };
}

export interface ImageComponent extends BaseComponent {
  type: ComponentType.IMAGE;
  source: string; // Variable name or URL
  alt?: string;
  fit?: 'contain' | 'cover' | 'fill' | 'scale-down';
}

export interface ShapeComponent extends BaseComponent {
  type: ComponentType.SHAPE;
  shape: 'rect' | 'circle' | 'ellipse' | 'polygon' | 'path';
  shapeData: Record<string, unknown>;
}

export interface GroupComponent extends BaseComponent {
  type: ComponentType.GROUP;
  children: TemplateComponent[];
}

export interface SvgComponent extends BaseComponent {
  type: ComponentType.SVG;
  svgContent: string; // SVG markup with variables
}

export interface HtmlComponent extends BaseComponent {
  type: ComponentType.HTML;
  htmlContent: string; // HTML markup with variables
}

export type TemplateComponent = 
  | TextComponent 
  | ImageComponent 
  | ShapeComponent 
  | GroupComponent 
  | SvgComponent 
  | HtmlComponent;

// ==================== Template Types ====================

export interface TemplateMetadata {
  name: string;
  version: string;
  description?: string;
  author?: string;
  category?: string;
  tags?: string[];
  preview?: string; // Base64 image or URL
  createdAt: string;
  updatedAt: string;
}

export interface Template {
  id: string;
  metadata: TemplateMetadata;
  variables: VariableDefinition[];
  components: TemplateComponent[];
  layout: {
    width: number;
    height: number;
    background?: string;
  };
  // Template inheritance
  extends?: string; // Parent template ID
  partials?: Record<string, Template>; // Reusable sub-templates
}

export interface RenderedTemplate {
  id: string;
  templateId: string;
  variables: VariableMap;
  content: {
    svg?: string;
    html?: string;
    metadata: {
      width: number;
      height: number;
      renderTime: number;
      componentCount: number;
    };
  };
  generatedAt: string;
}

// ==================== Component Library Types ====================

export interface ComponentLibraryItem {
  id: string;
  name: string;
  description?: string;
  category: string;
  tags: string[];
  component: TemplateComponent;
  preview?: string;
  version: string;
  author?: string;
  dependencies?: string[]; // Other component IDs required
}

export interface ComponentLibrary {
  name: string;
  version: string;
  components: ComponentLibraryItem[];
  categories: string[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    totalComponents: number;
  };
}

// ==================== Layout Types ====================

export interface LayoutConstraint {
  type: 'align' | 'distribute' | 'size' | 'position';
  target: string; // Component ID
  reference?: string; // Reference component ID
  value: unknown;
}

export interface Layout {
  type: 'absolute' | 'grid' | 'flex' | 'constraint';
  config: {
    // Grid layout
    rows?: number;
    columns?: number;
    gap?: number;
    // Flex layout
    direction?: 'row' | 'column';
    justify?: 'start' | 'center' | 'end' | 'space-between';
    align?: 'start' | 'center' | 'end' | 'stretch';
    // Constraint layout
    constraints?: LayoutConstraint[];
  };
}

// ==================== Export Types ====================

export enum ExportFormat {
  SVG = 'svg',
  PNG = 'png',
  JPEG = 'jpeg',
  PDF = 'pdf',
  HTML = 'html',
  WEBP = 'webp'
}

export interface ExportOptions {
  format: ExportFormat;
  quality?: number; // For JPEG, WebP
  width?: number; // For raster formats
  height?: number; // For raster formats
  scale?: number; // Scaling factor
  background?: string; // Background color for transparent formats
  // PDF specific
  pageSize?: 'A4' | 'A3' | 'Letter' | 'Legal';
  margin?: number;
}

export interface ExportResult {
  success: boolean;
  data?: string; // Base64 encoded or file path
  format: ExportFormat;
  size: {
    width: number;
    height: number;
    bytes: number;
  };
  metadata: {
    exportTime: number;
    templateId: string;
    options: ExportOptions;
  };
  error?: string;
}

// ==================== Validation and Error Types ====================

export enum TemplateErrorCode {
  INVALID_TEMPLATE = 'INVALID_TEMPLATE',
  MISSING_VARIABLE = 'MISSING_VARIABLE',
  INVALID_VARIABLE = 'INVALID_VARIABLE',
  COMPONENT_NOT_FOUND = 'COMPONENT_NOT_FOUND',
  RENDER_ERROR = 'RENDER_ERROR',
  EXPORT_ERROR = 'EXPORT_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  LIBRARY_ERROR = 'LIBRARY_ERROR'
}

export interface TemplateError {
  code: TemplateErrorCode;
  message: string;
  details?: unknown;
  componentId?: string;
  variableName?: string;
  suggestions?: string[];
}

export interface ValidationReport {
  valid: boolean;
  errors: TemplateError[];
  warnings: TemplateError[];
  metadata: {
    templateId: string;
    validatedAt: string;
    componentCount: number;
    variableCount: number;
  };
}

// ==================== Input Schemas ====================

export const PositionSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().min(0),
  height: z.number().min(0)
});

export const StyleSchema = z.object({
  fill: z.string().optional(),
  stroke: z.string().optional(),
  strokeWidth: z.number().optional(),
  opacity: z.number().min(0).max(1).optional(),
  fontSize: z.number().optional(),
  fontFamily: z.string().optional(),
  fontWeight: z.union([z.string(), z.number()]).optional(),
  textAlign: z.enum(['left', 'center', 'right']).optional()
}).catchall(z.any());

export const BaseComponentSchema = z.object({
  id: z.string().describe('Component ID'),
  type: z.nativeEnum(ComponentType).describe('Component type'),
  position: PositionSchema.describe('Component position and size'),
  style: StyleSchema.optional().describe('Component styling'),
  visible: z.boolean().optional().describe('Component visibility (default true)'),
  conditional: z.string().optional().describe('Conditional rendering expression'),
  repeat: z.string().optional().describe('Loop/repeat expression')
});

/**
 * The advertised shape of a template component. Components are parsed as any
 * value and checked one at a time by TemplateValidator, so template.validate
 * can report every problem instead of failing on the first; this tells clients
 * the shape those checks expect (type-specific fields such as `content` are
 * allowed on top).
 */
const advertisedComponent = (() => {
  const json = z.toJSONSchema(BaseComponentSchema, { io: 'input' });
  delete json.$schema;
  return json;
})();

export const TemplateMetadataSchema = z.object({
  name: z.string().describe('Template name'),
  version: z.string().describe('Template version'),
  description: z.string().optional().describe('Template description'),
  author: z.string().optional().describe('Template author'),
  category: z.string().optional().describe('Template category'),
  tags: z.array(z.string()).optional().describe('Template tags'),
  preview: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

/** Max template layout width / height in px */
export const MAX_LAYOUT_DIMENSION = 10000;

const LayoutDimensionSchema = z.number().min(1).max(MAX_LAYOUT_DIMENSION);

export const TemplateSchema = z.object({
  id: z.string(),
  metadata: TemplateMetadataSchema,
  variables: z.array(VariableDefinitionSchema).describe('Template variables'),
  components: z.array(z.any().meta(advertisedComponent)).describe('Template components'),
  layout: z.object({
    width: LayoutDimensionSchema.describe('Template width'),
    height: LayoutDimensionSchema.describe('Template height'),
    background: z.string().optional().describe('Background color')
  }).describe('Template layout configuration'),
  extends: z.string().optional().describe('Parent template ID for inheritance'),
  partials: z.record(z.string(), z.any()).optional().describe('Reusable sub-templates')
});

/** Max export width / height in px */
export const MAX_EXPORT_DIMENSION = 8192;

/** Max length of caller-supplied rendered SVG / HTML (matches the engine's output limit) */
export const MAX_RENDERED_CONTENT_LENGTH = 5_000_000;

export const ExportOptionsSchema = z.object({
  format: z.nativeEnum(ExportFormat).describe('Export format'),
  quality: z.number().int().min(1).max(100).optional().describe('Quality for JPEG/WebP (1-100, default 80)'),
  width: z.number().min(1).max(MAX_EXPORT_DIMENSION).optional().describe('Output width in pixels'),
  height: z.number().min(1).max(MAX_EXPORT_DIMENSION).optional().describe('Output height in pixels'),
  scale: z.number().min(0.1).max(10).optional().describe('Scaling factor (default 1)'),
  background: z.string().optional().describe('Background color (for formats that support transparency)'),
  pageSize: z.enum(['A4', 'A3', 'Letter', 'Legal']).optional().describe('Page size for PDF export'),
  margin: z.number().min(0).optional().describe('Margin for PDF export (in points)')
});

/** Schema for caller-supplied, already-rendered templates passed to template.export */
export const RenderedTemplateSchema = z.object({
  id: z.string().min(1).max(200),
  templateId: z.string().min(1).max(200),
  variables: z.record(z.string(), z.any()).default({}),
  content: z.object({
    svg: z.string().max(MAX_RENDERED_CONTENT_LENGTH).optional(),
    html: z.string().max(MAX_RENDERED_CONTENT_LENGTH).optional(),
    metadata: z.object({
      width: z.number().min(1).max(MAX_LAYOUT_DIMENSION),
      height: z.number().min(1).max(MAX_LAYOUT_DIMENSION),
      renderTime: z.number().min(0),
      componentCount: z.number().int().min(0)
    })
  }),
  generatedAt: z.string().max(100)
});

// ==================== Tool Input Types ====================

export interface TemplateCreateInput {
  template: Omit<Template, 'id'>;
}

export interface TemplateRenderInput {
  template: Template;
  variables: VariableMap;
  format?: ExportFormat;
}

export interface TemplateLibraryAddInput {
  component: Omit<ComponentLibraryItem, 'id'>;
  library?: string; // Library name, defaults to 'default'
}

export interface TemplateLibraryComposeInput {
  components: string[]; // Component IDs from library
  layout: Layout;
  variables?: VariableDefinition[];
  metadata: Omit<TemplateMetadata, 'createdAt' | 'updatedAt'>;
}

export interface TemplateExportInput {
  template: Template | RenderedTemplate;
  variables?: VariableMap;
  options: ExportOptions;
}

export interface TemplateValidateInput {
  template: Template;
  variables?: VariableMap;
}

// Input validation schemas
// template.create sets the id and timestamps itself
export const TemplateCreateInputSchema = z.object({
  template: TemplateSchema.omit({ id: true }).extend({
    metadata: TemplateMetadataSchema.omit({ createdAt: true, updatedAt: true })
  })
});

export const TemplateRenderInputSchema = z.object({
  template: TemplateSchema
    .describe('Template to render: the `template` object returned by template.create or template.library.compose, or an inline template definition'),
  variables: z.record(z.string(), z.any()).describe('Variable values for template substitution'),
  format: z.nativeEnum(ExportFormat).default(ExportFormat.SVG).describe('Output format'),
  options: z.object({
    includeMetadata: z.boolean().default(true).describe('Include rendering metadata in output'),
    optimizeOutput: z.boolean().default(true).describe('Apply output optimizations'),
    validateVariables: z.boolean().default(true).describe('Validate variables before rendering')
  }).prefault({}).describe('Rendering options')
});

export const TemplateExportInputSchema = z.object({
  // Either a rendered template or a definition; templateExport tells them apart (and explains
  // what to pass instead of an id), so it is parsed as any value and advertised as an object
  template: z.any().meta({
    type: 'object',
    description: 'A rendered template from template.render, or a template definition (such as the `template` returned by template.create) to render with `variables`'
  }),
  variables: z.record(z.string(), z.any()).optional()
    .describe('Variables for template rendering (if template not already rendered)'),
  options: ExportOptionsSchema.describe('Export options')
});

export const TemplateValidateInputSchema = z.object({
  template: TemplateSchema.describe('Template to validate'),
  variables: z.record(z.string(), z.any()).optional().describe('Optional variables to validate against template'),
  options: z.object({
    strict: z.boolean().default(false).describe('Enable strict validation mode'),
    checkPerformance: z.boolean().default(true).describe('Check performance constraints'),
    validateReferences: z.boolean().default(true).describe('Validate variable references in components'),
    includeWarnings: z.boolean().default(true).describe('Include warnings in validation report')
  }).prefault({}).describe('Validation options')
});


/** Max components in one composition, the same cap TemplateValidator puts on a template */
export const MAX_COMPOSE_COMPONENTS = 1000;

/** A library component ID, or an ID with position and style overrides */
const ComposeComponentSchema = z.union([
  z.string().describe('Component ID from library'),
  z.looseObject({
    id: z.string().describe('Component ID from library'),
    position: PositionSchema.partial().optional().describe('Override component position'),
    style: StyleSchema.optional().describe('Override component style'),
    variables: z.record(z.string(), z.any()).optional().describe('Component-specific variables')
  })
]);

export const TemplateLibraryComposeInputSchema = z.object({
  components: z.array(ComposeComponentSchema).min(1).max(MAX_COMPOSE_COMPONENTS)
    .describe('Component IDs or component configurations to include'),
  layout: z.object({
    type: z.enum(['absolute', 'grid', 'flex', 'constraint']).default('absolute').describe('Layout system to use'),
    config: z.object({
      rows: z.number().int().min(1).optional().describe('Grid rows'),
      columns: z.number().int().min(1).optional().describe('Grid columns'),
      gap: z.number().min(0).optional().describe('Grid/flex gap'),
      direction: z.enum(['row', 'column']).optional().describe('Flex direction'),
      justify: z.enum(['start', 'center', 'end', 'space-between']).optional().describe('Flex justify content'),
      align: z.enum(['start', 'center', 'end', 'stretch']).optional().describe('Flex align items')
    }).optional().describe('Layout configuration'),
    width: LayoutDimensionSchema.describe('Template width'),
    height: LayoutDimensionSchema.describe('Template height'),
    background: z.string().optional().describe('Template background color')
  }).describe('Template layout configuration'),
  variables: z.array(VariableDefinitionSchema).optional().describe('Template variables'),
  metadata: TemplateMetadataSchema.omit({ createdAt: true, updatedAt: true }).extend({
    name: z.string().min(1).describe('Template name'),
    version: z.string().default('1.0.0').describe('Template version')
  }).describe('Template metadata'),
  options: z.object({
    resolveDependencies: z.boolean().default(true).describe('Auto-include component dependencies'),
    autoLayout: z.boolean().default(false).describe('Auto-arrange components using layout system'),
    mergeVariables: z.boolean().default(true).describe('Merge variables from component dependencies'),
    validateComposition: z.boolean().default(true).describe('Validate composed template')
  }).optional().describe('Composition options')
});