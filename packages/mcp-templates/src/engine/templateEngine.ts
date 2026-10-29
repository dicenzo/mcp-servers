import Handlebars from 'handlebars';
import {
  Template,
  TemplateComponent,
  TextComponent,
  ImageComponent,
  ShapeComponent,
  GroupComponent,
  SvgComponent,
  HtmlComponent,
  VariableMap,
  VariableDefinition,
  VariableType,
  RenderedTemplate,
  ComponentType,
  TemplateError,
  TemplateErrorCode,
  MAX_LAYOUT_DIMENSION,
  MAX_RENDERED_CONTENT_LENGTH
} from '../types/template.js';
import { evaluateValidationRules } from '../util/validationRules.js';

/**
 * Hard limits on rendering work. Enforced inside the engine (not only by optional
 * validation) so caller-supplied templates and variables can't blow up memory.
 */
export interface RenderLimits {
  /** Max items a single `repeat` or `{{#each}}` may iterate */
  maxRepeatItems: number;
  /** Max group nesting depth */
  maxNestingDepth: number;
  /** Max components emitted by one render, across repeats and groups */
  maxRenderedComponents: number;
  /** Max characters of Handlebars output per render, and of the final SVG / HTML */
  maxOutputLength: number;
  /** Max layout width / height in px */
  maxLayoutDimension: number;
}

export const RENDER_LIMITS: Readonly<RenderLimits> = {
  maxRepeatItems: 1000,
  maxNestingDepth: 16,
  maxRenderedComponents: 10000,
  maxOutputLength: MAX_RENDERED_CONTENT_LENGTH,
  maxLayoutDimension: MAX_LAYOUT_DIMENSION
};

export class RenderLimitError extends Error {
  constructor(message: string) {
    super(`Render limit exceeded: ${message}`);
    this.name = 'RenderLimitError';
  }
}

/** Mutable counters shared by every component in one renderTemplate call */
interface RenderState {
  componentCount: number;
  outputLength: number;
}

const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;
const FUNCTIONAL_COLOR = /^(rgb|rgba|hsl|hsla)\(\s*[-+0-9.%,\s/]+\)$/i;
const NAMED_COLOR = /^[a-z]{1,30}$/i;
const FONT_FAMILY = /^[A-Za-z0-9 ,'"_-]{1,200}$/;
const DATA_IMAGE_URI = /^data:image\/[a-z0-9.+-]+(;[a-z0-9=.+-]+)*;base64,[A-Za-z0-9+/]*={0,2}$/i;
const RELATIVE_PATH = /^[A-Za-z0-9._~-][A-Za-z0-9._~\-/]*(\?[A-Za-z0-9._~\-=&%]*)?$/;
const IMAGE_FITS = ['contain', 'cover', 'fill', 'scale-down'];

/**
 * Template Engine - Core template processing and variable substitution
 */
export class TemplateEngine {
  private handlebars: typeof Handlebars;
  private templateCache: Map<string, Template> = new Map();
  private libraryComponents: Map<string, TemplateComponent> = new Map();
  private readonly limits: RenderLimits;

  constructor(limits: Partial<RenderLimits> = {}) {
    this.limits = { ...RENDER_LIMITS, ...limits };
    // Initialize Handlebars with custom helpers
    this.handlebars = Handlebars.create();
    this.registerHelpers();
  }

  /**
   * Register custom Handlebars helpers for template rendering
   */
  private registerHelpers(): void {
    // Conditional helper
    this.handlebars.registerHelper('if', function(this: unknown, conditional, options) {
      if (conditional) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });

    // Each loop helper (bounded: nested {{#each}} would otherwise multiply output)
    const limits = this.limits;
    this.handlebars.registerHelper('each', function(context, options) {
      let ret = '';
      if (Array.isArray(context)) {
        if (context.length > limits.maxRepeatItems) {
          throw new RenderLimitError(`{{#each}} over ${context.length} items (max ${limits.maxRepeatItems})`);
        }
        for (let i = 0; i < context.length; i++) {
          ret += options.fn({ ...context[i], '@index': i, '@first': i === 0, '@last': i === context.length - 1 });
          if (ret.length > limits.maxOutputLength) {
            throw new RenderLimitError(`{{#each}} output exceeds ${limits.maxOutputLength} characters`);
          }
        }
      }
      return ret;
    });

    // Math helpers
    this.handlebars.registerHelper('add', (a, b) => Number(a) + Number(b));
    this.handlebars.registerHelper('subtract', (a, b) => Number(a) - Number(b));
    this.handlebars.registerHelper('multiply', (a, b) => Number(a) * Number(b));
    this.handlebars.registerHelper('divide', (a, b) => Number(a) / Number(b));

    // String helpers
    this.handlebars.registerHelper('uppercase', (str) => String(str).toUpperCase());
    this.handlebars.registerHelper('lowercase', (str) => String(str).toLowerCase());
    this.handlebars.registerHelper('capitalize', (str) => 
      String(str).charAt(0).toUpperCase() + String(str).slice(1).toLowerCase()
    );

    // Color helpers
    this.handlebars.registerHelper('lighten', (color, _amount) => {
      // Basic color lightening - in production, use chroma-js
      return color; // Placeholder
    });

    this.handlebars.registerHelper('darken', (color, _amount) => {
      // Basic color darkening - in production, use chroma-js
      return color; // Placeholder
    });

    // Format helpers
    this.handlebars.registerHelper('number', (num, decimals = 0) => 
      Number(num).toFixed(decimals)
    );

    this.handlebars.registerHelper('currency', (num, symbol = '$') => 
      `${symbol}${Number(num).toFixed(2)}`
    );

    // Date helpers
    this.handlebars.registerHelper('date', (date, _format = 'YYYY-MM-DD') => {
      const d = new Date(date);
      // Simple date formatting - in production, use moment.js or date-fns
      return d.toISOString().split('T')[0];
    });
  }

  /**
   * Validate template variables against their definitions
   */
  public validateVariables(
    variables: VariableMap, 
    definitions: VariableDefinition[]
  ): TemplateError[] {
    const errors: TemplateError[] = [];

    for (const def of definitions) {
      const value = variables[def.name];

      // Check required variables
      if (def.required && (value === undefined || value === null)) {
        errors.push({
          code: TemplateErrorCode.MISSING_VARIABLE,
          message: `Required variable '${def.name}' is missing`,
          variableName: def.name,
          suggestions: [`Add '${def.name}' to your variables object`]
        });
        continue;
      }

      // Skip validation if variable is not provided and not required
      if (value === undefined || value === null) {
        continue;
      }

      // Type validation
      const typeErrors = this.validateVariableType(def.name, value, def.type);
      errors.push(...typeErrors);

      // Custom validation rules
      if (def.validation) {
        const validationErrors = evaluateValidationRules(def.name, value, def.validation);
        errors.push(...validationErrors);
      }
    }

    return errors;
  }

  /**
   * Validate a single variable's type
   */
  private validateVariableType(
    name: string, 
    value: unknown, 
    expectedType: VariableType
  ): TemplateError[] {
    const errors: TemplateError[] = [];

    switch (expectedType) {
      case VariableType.STRING:
        if (typeof value !== 'string') {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: `Variable '${name}' must be a string, got ${typeof value}`,
            variableName: name
          });
        }
        break;

      case VariableType.NUMBER:
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: `Variable '${name}' must be a number, got ${typeof value}`,
            variableName: name
          });
        }
        break;

      case VariableType.BOOLEAN:
        if (typeof value !== 'boolean') {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: `Variable '${name}' must be a boolean, got ${typeof value}`,
            variableName: name
          });
        }
        break;

      case VariableType.COLOR:
        if (typeof value !== 'string' || !this.isValidColor(value)) {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: `Variable '${name}' must be a valid color (hex, rgb, hsl, or named color)`,
            variableName: name,
            suggestions: ['Use format like #FF0000, rgb(255,0,0), hsl(0,100%,50%), or "red"']
          });
        }
        break;

      case VariableType.IMAGE:
        if (typeof value !== 'string') {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: `Variable '${name}' must be an image URL or base64 string`,
            variableName: name
          });
        }
        break;

      case VariableType.FONT:
        if (typeof value !== 'string') {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: `Variable '${name}' must be a font family name`,
            variableName: name
          });
        }
        break;

      case VariableType.ARRAY:
        if (!Array.isArray(value)) {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: `Variable '${name}' must be an array, got ${typeof value}`,
            variableName: name
          });
        }
        break;

      case VariableType.OBJECT:
        if (typeof value !== 'object' || Array.isArray(value) || value === null) {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: `Variable '${name}' must be an object, got ${typeof value}`,
            variableName: name
          });
        }
        break;
    }

    return errors;
  }

  /**
   * Render a template with provided variables
   */
  public async renderTemplate(
    template: Template, 
    variables: VariableMap
  ): Promise<RenderedTemplate> {
    const startTime = Date.now();

    try {
      // Validate variables
      const validationErrors = this.validateVariables(variables, template.variables);
      if (validationErrors.length > 0) {
        throw new Error(`Template validation failed: ${validationErrors.map(e => e.message).join(', ')}`);
      }

      // Merge with defaults
      const mergedVariables = this.mergeWithDefaults(variables, template.variables);

      // Process template inheritance
      const processedTemplate = await this.processInheritance(template);

      const { width, height } = processedTemplate.layout;
      for (const dimension of [width, height]) {
        if (!Number.isFinite(dimension) || dimension < 1 || dimension > this.limits.maxLayoutDimension) {
          throw new Error(`Template layout dimensions must be between 1 and ${this.limits.maxLayoutDimension}px`);
        }
      }

      // Render components
      // Repeating components render to arrays; flatten so each item is emitted.
      const state: RenderState = { componentCount: 0, outputLength: 0 };
      const renderedComponents = (await Promise.all(
        processedTemplate.components.map(component => 
          this.renderComponent(component, mergedVariables, state, 0)
        )
      )).flat();

      // Generate SVG content
      const svgContent = this.checkOutputLength(this.generateSVG(processedTemplate, renderedComponents), 'SVG');

      // Generate HTML content (for web display)
      const htmlContent = this.checkOutputLength(this.generateHTML(processedTemplate, renderedComponents), 'HTML');

      const renderTime = Date.now() - startTime;

      return {
        id: `${template.id}_${Date.now()}`,
        templateId: template.id,
        variables: mergedVariables,
        content: {
          svg: svgContent,
          html: htmlContent,
          metadata: {
            width: processedTemplate.layout.width,
            height: processedTemplate.layout.height,
            renderTime,
            componentCount: renderedComponents.length
          }
        },
        generatedAt: new Date().toISOString()
      };

    } catch (error) {
      throw new Error(`Template rendering failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Process template inheritance and composition
   */
  private async processInheritance(template: Template): Promise<Template> {
    // For now, return the template as-is
    // In a full implementation, this would:
    // 1. Load parent templates if template.extends exists
    // 2. Merge components from parent
    // 3. Process partials
    // 4. Handle overrides
    
    return template;
  }

  /**
   * Merge variables with default values
   */
  private mergeWithDefaults(
    variables: VariableMap, 
    definitions: VariableDefinition[]
  ): VariableMap {
    const merged = { ...variables };

    for (const def of definitions) {
      if (merged[def.name] === undefined && def.default !== undefined) {
        merged[def.name] = def.default;
      }
    }

    return merged;
  }

  /**
   * Render a single component with variables
   */
  private async renderComponent(
    component: TemplateComponent, 
    variables: VariableMap,
    state: RenderState,
    depth: number
  ): Promise<TemplateComponent | TemplateComponent[] | null> {
    try {
      if (depth > this.limits.maxNestingDepth) {
        throw new RenderLimitError(`group nesting depth exceeds ${this.limits.maxNestingDepth}`);
      }

      // Check conditional rendering
      if (component.conditional) {
        const shouldRender = this.evaluateCondition(component.conditional, variables);
        if (!shouldRender) {
          return null;
        }
      }

      // Handle repeating components
      if (component.repeat) {
        return this.renderRepeatingComponent(component, variables, state, depth);
      }

      state.componentCount++;
      if (state.componentCount > this.limits.maxRenderedComponents) {
        throw new RenderLimitError(`more than ${this.limits.maxRenderedComponents} rendered components`);
      }

      // Process component based on type
      switch (component.type) {
        case ComponentType.TEXT:
          return this.renderTextComponent(component, variables, state);
        
        case ComponentType.IMAGE:
          return this.renderImageComponent(component, variables, state);
          
        case ComponentType.SHAPE:
          return this.renderShapeComponent(component, variables, state);
          
        case ComponentType.GROUP:
          return this.renderGroupComponent(component, variables, state, depth);
          
        case ComponentType.SVG:
          return this.renderSvgComponent(component, variables, state);
          
        case ComponentType.HTML:
          return this.renderHtmlComponent(component, variables, state);
          
        default:
          throw new Error(`Unsupported component type: ${(component as { type: string }).type}`);
      }
    } catch (error) {
      // Limit errors propagate unwrapped so nested groups don't repeat the prefix
      if (error instanceof RenderLimitError) throw error;
      throw new Error(`Component rendering failed for ${component.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Compile and run a Handlebars template string, charging its output to the render budget
   */
  private renderString(source: string, variables: VariableMap, state: RenderState): string {
    const output = this.handlebars.compile(source)(variables);
    state.outputLength += output.length;
    if (state.outputLength > this.limits.maxOutputLength) {
      throw new RenderLimitError(`rendered output exceeds ${this.limits.maxOutputLength} characters`);
    }
    return output;
  }

  /**
   * Render text component with variable substitution
   */
  private renderTextComponent(component: TextComponent, variables: VariableMap, state: RenderState): TextComponent {
    return {
      ...component,
      content: this.renderString(component.content, variables, state),
      style: this.processStyle(component.style, variables, state)
    };
  }

  /**
   * Render image component
   */
  private renderImageComponent(component: ImageComponent, variables: VariableMap, state: RenderState): ImageComponent {
    let imageSource = component.source;
    
    // If source is a variable reference, resolve it (an unset variable renders no image)
    if (imageSource.startsWith('{{') && imageSource.endsWith('}}')) {
      const varName = imageSource.slice(2, -2).trim();
      const resolved = variables[varName];
      imageSource = resolved === undefined || resolved === null ? '' : String(resolved);
    }

    return {
      ...component,
      source: imageSource === '' ? '' : this.sanitizeImageSource(imageSource, component.id),
      style: this.processStyle(component.style, variables, state)
    };
  }

  /**
   * Render shape component
   */
  private renderShapeComponent(component: ShapeComponent, variables: VariableMap, state: RenderState): ShapeComponent {
    return {
      ...component,
      shapeData: this.processObjectWithVariables(component.shapeData, variables, state),
      style: this.processStyle(component.style, variables, state)
    };
  }

  /**
   * Render group component recursively
   */
  private async renderGroupComponent(
    component: GroupComponent,
    variables: VariableMap,
    state: RenderState,
    depth: number
  ): Promise<GroupComponent> {
    const renderedChildren = await Promise.all(
      component.children.map((child: TemplateComponent) => 
        this.renderComponent(child, variables, state, depth + 1)
      )
    );

    return {
      ...component,
      children: renderedChildren.flat().filter((child): child is TemplateComponent => child !== null),
      style: this.processStyle(component.style, variables, state)
    };
  }

  /**
   * Render SVG component with variable substitution
   */
  private renderSvgComponent(component: SvgComponent, variables: VariableMap, state: RenderState): SvgComponent {
    return {
      ...component,
      svgContent: this.renderString(component.svgContent, variables, state),
      style: this.processStyle(component.style, variables, state)
    };
  }

  /**
   * Render HTML component with variable substitution
   */
  private renderHtmlComponent(component: HtmlComponent, variables: VariableMap, state: RenderState): HtmlComponent {
    return {
      ...component,
      htmlContent: this.renderString(component.htmlContent, variables, state),
      style: this.processStyle(component.style, variables, state)
    };
  }

  /**
   * Render repeating component (loops)
   */
  private async renderRepeatingComponent(
    component: TemplateComponent, 
    variables: VariableMap,
    state: RenderState,
    depth: number
  ): Promise<TemplateComponent[]> {
    // Parse repeat expression (e.g., "item in items")
    const repeatMatch = component.repeat?.match(/(\w+)\s+in\s+(\w+)/);
    if (!repeatMatch) {
      throw new Error(`Invalid repeat expression: ${component.repeat}`);
    }

    const itemVar = repeatMatch[1];
    const arrayVar = repeatMatch[2];
    const items = variables[arrayVar];

    if (!Array.isArray(items)) {
      throw new Error(`Repeat variable '${arrayVar}' must be an array`);
    }

    if (items.length > this.limits.maxRepeatItems) {
      throw new RenderLimitError(`repeat over ${items.length} items (max ${this.limits.maxRepeatItems})`);
    }

    const renderedItems: TemplateComponent[] = [];
    for (let i = 0; i < items.length; i++) {
      const itemVariables = {
        ...variables,
        [itemVar]: items[i],
        [`${itemVar}_index`]: i,
        [`${itemVar}_first`]: i === 0,
        [`${itemVar}_last`]: i === items.length - 1
      };

      // Create a copy of the component without the repeat directive
      const itemComponent = { ...component, repeat: undefined };
      const rendered = await this.renderComponent(itemComponent, itemVariables, state, depth);
      if (rendered) {
        renderedItems.push(...(Array.isArray(rendered) ? rendered : [rendered]));
      }
    }

    return renderedItems;
  }

  /**
   * Evaluate conditional expression
   */
  private evaluateCondition(condition: string, variables: VariableMap): boolean {
    try {
      // Simple condition evaluation using Handlebars
      const template = this.handlebars.compile(`{{#if ${condition}}}true{{else}}false{{/if}}`);
      const result = template(variables);
      return result === 'true';
    } catch (error) {
      if (error instanceof RenderLimitError) throw error;
      console.warn(`Failed to evaluate condition: ${condition}`);
      return true; // Default to showing component if condition fails
    }
  }

  /**
   * Process style object with variable substitution
   */
  private processStyle<T>(style: T, variables: VariableMap, state: RenderState): T {
    if (!style) return style;

    return this.processObjectWithVariables(style, variables, state);
  }

  /**
   * Process any object with variable substitution
   */
  private processObjectWithVariables<T>(obj: T, variables: VariableMap, state: RenderState): T {
    if (typeof obj === 'string') {
      // Process string with Handlebars
      try {
        return this.renderString(obj, variables, state) as T;
      } catch (error) {
        if (error instanceof RenderLimitError) throw error;
        return obj; // Return original if template processing fails
      }
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.processObjectWithVariables(item, variables, state)) as T;
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const processed: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        processed[key] = this.processObjectWithVariables(value, variables, state);
      }
      return processed as T;
    }
    
    return obj;
  }

  /**
   * Reject final SVG / HTML output that exceeds the size limit
   */
  private checkOutputLength(output: string, kind: string): string {
    if (output.length > this.limits.maxOutputLength) {
      throw new RenderLimitError(`${kind} output exceeds ${this.limits.maxOutputLength} characters`);
    }
    return output;
  }

  /**
   * Generate SVG content from rendered components
   */
  private generateSVG(template: Template, components: (TemplateComponent | null)[]): string {
    const width = this.toNumber(template.layout.width, 0);
    const height = this.toNumber(template.layout.height, 0);
    const { background } = template.layout;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
    
    // Add background if specified
    if (background) {
      svg += `  <rect width="100%" height="100%" fill="${this.safeColor(background, 'layout background')}"/>\n`;
    }
    
    // Add components
    for (const component of components) {
      if (component) {
        svg += this.componentToSVG(component);
      }
    }
    
    svg += '</svg>';
    return svg;
  }

  /**
   * Generate HTML content from rendered components
   */
  private generateHTML(template: Template, components: (TemplateComponent | null)[]): string {
    const width = this.toNumber(template.layout.width, 0);
    const height = this.toNumber(template.layout.height, 0);
    const { background } = template.layout;
    
    let html = `<div style="width: ${width}px; height: ${height}px; position: relative;`;
    if (background) {
      html += ` background: ${this.safeColor(background, 'layout background')};`;
    }
    html += '">\n';
    
    // Add components
    for (const component of components) {
      if (component) {
        html += this.componentToHTML(component);
      }
    }
    
    html += '</div>';
    return html;
  }

  /**
   * Convert component to SVG markup.
   * Every interpolated attribute value is a finite number or a validated, escaped string.
   */
  private componentToSVG(component: TemplateComponent): string {
    const { style = {} } = component;
    const position = this.safePosition(component);
    
    switch (component.type) {
      case ComponentType.TEXT: {
        const fontSize = this.toNumber(style.fontSize, 12) || 12;
        return `  <text x="${position.x}" y="${position.y + fontSize}" ` +
               `font-family="${this.safeFontFamily(style.fontFamily)}" font-size="${fontSize}" ` +
               `fill="${this.safeColor(style.fill || '#000000', 'fill')}">${this.escapeXML(component.content)}</text>\n`;
      }
      
      case ComponentType.SHAPE: {
        const paint = `fill="${this.safeColor(style.fill || 'transparent', 'fill')}" ` +
                      `stroke="${this.safeColor(style.stroke || 'none', 'stroke')}" ` +
                      `stroke-width="${this.toNumber(style.strokeWidth, 0)}"/>\n`;
        if (component.shape === 'rect') {
          return `  <rect x="${position.x}" y="${position.y}" width="${position.width}" height="${position.height}" ` + paint;
        } else if (component.shape === 'circle') {
          const radius = Math.min(position.width, position.height) / 2;
          const cx = position.x + position.width / 2;
          const cy = position.y + position.height / 2;
          return `  <circle cx="${cx}" cy="${cy}" r="${radius}" ` + paint;
        }
        break;
      }
      
      case ComponentType.SVG:
        // Wrap in group with position (svgContent is author-supplied markup by design)
        return `  <g transform="translate(${position.x}, ${position.y})">\n${component.svgContent}\n  </g>\n`;
      
      case ComponentType.GROUP: {
        let groupSvg = `  <g transform="translate(${position.x}, ${position.y})">\n`;
        for (const child of component.children) {
          groupSvg += this.componentToSVG(child).replace(/^ {2}/gm, '    ');
        }
        groupSvg += '  </g>\n';
        return groupSvg;
      }

      case ComponentType.IMAGE:
        if (!component.source) return '';
        return `  <image x="${position.x}" y="${position.y}" width="${position.width}" ` +
               `height="${position.height}" href="${this.escapeXML(component.source)}"/>\n`;
    }
    
    return '';
  }

  /**
   * Convert component to HTML markup.
   * Style values are validated before they reach the style attribute (no CSS injection).
   */
  private componentToHTML(component: TemplateComponent): string {
    const { style = {} } = component;
    const position = this.safePosition(component);
    const positionStyle = `position: absolute; left: ${position.x}px; top: ${position.y}px; width: ${position.width}px; height: ${position.height}px;`;
    
    switch (component.type) {
      case ComponentType.TEXT: {
        const fontSize = this.toNumber(style.fontSize, 12) || 12;
        const textStyle = `font-family: ${this.safeFontFamily(style.fontFamily)}; font-size: ${fontSize}px; ` +
                          `color: ${this.safeColor(style.fill || '#000000', 'fill')};`;
        return `  <div style="${positionStyle} ${textStyle}">${component.content}</div>\n`;
      }

      case ComponentType.IMAGE: {
        if (!component.source) return '';
        const fit = IMAGE_FITS.includes(String(component.fit)) ? component.fit : 'cover';
        return `  <img src="${this.escapeXML(component.source)}" style="${positionStyle} object-fit: ${fit};" ` +
               `alt="${this.escapeXML(String(component.alt ?? ''))}"/>\n`;
      }
      
      case ComponentType.SHAPE: {
        const bgColor = this.safeColor(style.fill || 'transparent', 'fill');
        const border = style.stroke
          ? `border: ${this.toNumber(style.strokeWidth, 1) || 1}px solid ${this.safeColor(style.stroke, 'stroke')};`
          : '';
        const borderRadius = component.shape === 'circle' ? '50%' : '0';
        return `  <div style="${positionStyle} background: ${bgColor}; ${border} border-radius: ${borderRadius};"></div>\n`;
      }

      case ComponentType.HTML:
        // htmlContent is author-supplied markup by design
        return `  <div style="${positionStyle}">${component.htmlContent}</div>\n`;
      
      case ComponentType.GROUP: {
        let groupHtml = `  <div style="${positionStyle}">\n`;
        for (const child of component.children) {
          groupHtml += this.componentToHTML(child).replace(/^ {2}/gm, '    ');
        }
        groupHtml += '  </div>\n';
        return groupHtml;
      }
    }
    
    return '';
  }

  /**
   * Coerce a value to a finite number, or return the fallback
   */
  private toNumber(value: unknown, fallback: number): number {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private safePosition(component: TemplateComponent): { x: number; y: number; width: number; height: number } {
    const position = component.position ?? { x: 0, y: 0, width: 0, height: 0 };
    return {
      x: this.toNumber(position.x, 0),
      y: this.toNumber(position.y, 0),
      width: this.toNumber(position.width, 0),
      height: this.toNumber(position.height, 0)
    };
  }

  /**
   * Allow hex, rgb[a]() / hsl[a]() and named colors only; reject anything that could
   * break out of an attribute or CSS declaration.
   */
  private safeColor(value: unknown, field: string): string {
    const color = String(value).trim();
    if (HEX_COLOR.test(color) || FUNCTIONAL_COLOR.test(color) || NAMED_COLOR.test(color)) {
      return this.escapeXML(color);
    }
    throw new Error(`Invalid color value for ${field}: use hex, rgb(), rgba(), hsl(), hsla() or a named color`);
  }

  private safeFontFamily(value: unknown): string {
    if (value === undefined || value === null || value === '') return 'Arial';
    const font = String(value);
    if (FONT_FAMILY.test(font)) {
      return this.escapeXML(font);
    }
    throw new Error('Invalid font family: use letters, digits, spaces, commas, quotes, hyphens and underscores only');
  }

  /**
   * Allow only data:image/* URIs, https: URLs and plain relative paths as image sources
   */
  private sanitizeImageSource(source: string, componentId: string): string {
    const trimmed = source.trim();
    if (DATA_IMAGE_URI.test(trimmed)) {
      return trimmed;
    }
    if (/^https:/i.test(trimmed)) {
      try {
        const url = new URL(trimmed);
        if (url.protocol === 'https:') return url.href;
      } catch {
        // fall through to rejection
      }
    }
    if (RELATIVE_PATH.test(trimmed) && !trimmed.startsWith('//')) {
      return trimmed;
    }
    throw new Error(
      `Unsafe image source for component ${componentId}: only data:image/*, https: URLs and relative paths are allowed`
    );
  }

  /**
   * Escape XML special characters
   */
  private escapeXML(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Validate color format
   */
  private isValidColor(color: string): boolean {
    // Basic color validation - in production, use a more comprehensive validator
    const hexPattern = /^#([0-9A-F]{3}){1,2}$/i;
    const rgbPattern = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i;
    const hslPattern = /^hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\)$/i;
    const namedColors = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'black', 'white', 'gray'];
    
    return hexPattern.test(color) || 
           rgbPattern.test(color) || 
           hslPattern.test(color) || 
           namedColors.includes(color.toLowerCase());
  }
}
