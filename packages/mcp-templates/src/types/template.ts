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
    name: z.string(),
    type: z.nativeEnum(VariableType),
    required: z.boolean(),
    default: z.any().optional(),
    description: z.string().optional(),
    validation: z.array(ValidationRuleSchema).optional(),
    items: VariableDefinitionSchema.optional(),
    properties: z.record(VariableDefinitionSchema).optional()
  })
);

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
  id: z.string(),
  type: z.nativeEnum(ComponentType),
  position: PositionSchema,
  style: StyleSchema.optional(),
  visible: z.boolean().optional(),
  conditional: z.string().optional(),
  repeat: z.string().optional()
});

export const TemplateMetadataSchema = z.object({
  name: z.string(),
  version: z.string(),
  description: z.string().optional(),
  author: z.string().optional(),
  category: z.string().optional(),
  tags: z.array(z.string()).optional(),
  preview: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export const TemplateSchema = z.object({
  id: z.string(),
  metadata: TemplateMetadataSchema,
  variables: z.array(VariableDefinitionSchema),
  components: z.array(z.any()), // Will be validated separately based on type
  layout: z.object({
    width: z.number().min(1),
    height: z.number().min(1),
    background: z.string().optional()
  }),
  extends: z.string().optional(),
  partials: z.record(z.any()).optional()
});

export const ExportOptionsSchema = z.object({
  format: z.nativeEnum(ExportFormat),
  quality: z.number().min(0).max(100).optional(),
  width: z.number().min(1).optional(),
  height: z.number().min(1).optional(),
  scale: z.number().min(0.1).max(10).optional(),
  background: z.string().optional(),
  pageSize: z.enum(['A4', 'A3', 'Letter', 'Legal']).optional(),
  margin: z.number().optional()
});

// ==================== Tool Input Types ====================

export interface TemplateCreateInput {
  template: Omit<Template, 'id'>;
}

export interface TemplateRenderInput {
  template: string | Template; // Template ID or inline template
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
  template: string | RenderedTemplate; // Template ID or rendered template
  variables?: VariableMap;
  options: ExportOptions;
}

export interface TemplateValidateInput {
  template: Template;
  variables?: VariableMap;
}

// Input validation schemas
export const TemplateCreateInputSchema = z.object({
  template: TemplateSchema.omit({ id: true })
});

export const TemplateRenderInputSchema = z.object({
  template: z.union([z.string(), TemplateSchema]),
  variables: z.record(z.any()),
  format: z.nativeEnum(ExportFormat).optional(),
  options: z.object({
    includeMetadata: z.boolean().optional(),
    optimizeOutput: z.boolean().optional(),
    validateVariables: z.boolean().optional()
  }).optional()
});

export const TemplateExportInputSchema = z.object({
  template: z.union([z.string(), z.any()]),
  variables: z.record(z.any()).optional(),
  options: ExportOptionsSchema
});

export const TemplateValidateInputSchema = z.object({
  template: TemplateSchema,
  variables: z.record(z.any()).optional(),
  options: z.object({
    strict: z.boolean().optional(),
    checkPerformance: z.boolean().optional(),
    validateReferences: z.boolean().optional(),
    includeWarnings: z.boolean().optional()
  }).optional()
});