import Handlebars from 'handlebars';
import Mustache from 'mustache';
import {
  Template,
  TemplateComponent,
  VariableMap,
  VariableDefinition,
  VariableType,
  RenderedTemplate,
  ComponentType,
  TemplateError,
  TemplateErrorCode,
  ValidationRule
} from '../types/template.js';
import { PerformanceMonitor } from '../util/performance.js';

/**
 * Template Engine - Core template processing and variable substitution
 */
export class TemplateEngine {
  private handlebars: typeof Handlebars;
  private templateCache: Map<string, any> = new Map();
  private libraryComponents: Map<string, TemplateComponent> = new Map();

  constructor() {
    // Initialize Handlebars with custom helpers
    this.handlebars = Handlebars.create();
    this.registerHelpers();
  }

  /**
   * Register custom Handlebars helpers for template rendering
   */
  private registerHelpers(): void {
    // Conditional helper
    this.handlebars.registerHelper('if', function(this: any, conditional, options) {
      if (conditional) {
        return options.fn(this);
      } else {
        return options.inverse(this);
      }
    });

    // Each loop helper
    this.handlebars.registerHelper('each', function(context, options) {
      let ret = '';
      if (Array.isArray(context)) {
        for (let i = 0; i < context.length; i++) {
          ret += options.fn({ ...context[i], '@index': i, '@first': i === 0, '@last': i === context.length - 1 });
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
    this.handlebars.registerHelper('lighten', (color, amount) => {
      // Basic color lightening - in production, use chroma-js
      return color; // Placeholder
    });

    this.handlebars.registerHelper('darken', (color, amount) => {
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
    this.handlebars.registerHelper('date', (date, format = 'YYYY-MM-DD') => {
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
        const validationErrors = this.validateRules(def.name, value, def.validation);
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
    value: any, 
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
        if (!this.isValidColor(value)) {
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
   * Validate variable against custom rules
   */
  private validateRules(
    name: string, 
    value: any, 
    rules: ValidationRule[]
  ): TemplateError[] {
    const errors: TemplateError[] = [];

    for (const rule of rules) {
      switch (rule.type) {
        case 'min':
          if (typeof value === 'number' && value < rule.value) {
            errors.push({
              code: TemplateErrorCode.INVALID_VARIABLE,
              message: rule.message || `Variable '${name}' must be at least ${rule.value}`,
              variableName: name
            });
          } else if (typeof value === 'string' && value.length < rule.value) {
            errors.push({
              code: TemplateErrorCode.INVALID_VARIABLE,
              message: rule.message || `Variable '${name}' must be at least ${rule.value} characters long`,
              variableName: name
            });
          }
          break;

        case 'max':
          if (typeof value === 'number' && value > rule.value) {
            errors.push({
              code: TemplateErrorCode.INVALID_VARIABLE,
              message: rule.message || `Variable '${name}' must be at most ${rule.value}`,
              variableName: name
            });
          } else if (typeof value === 'string' && value.length > rule.value) {
            errors.push({
              code: TemplateErrorCode.INVALID_VARIABLE,
              message: rule.message || `Variable '${name}' must be at most ${rule.value} characters long`,
              variableName: name
            });
          }
          break;

        case 'pattern':
          if (typeof value === 'string') {
            const regex = new RegExp(rule.value);
            if (!regex.test(value)) {
              errors.push({
                code: TemplateErrorCode.INVALID_VARIABLE,
                message: rule.message || `Variable '${name}' does not match required pattern`,
                variableName: name
              });
            }
          }
          break;

        case 'enum':
          if (Array.isArray(rule.value) && !rule.value.includes(value)) {
            errors.push({
              code: TemplateErrorCode.INVALID_VARIABLE,
              message: rule.message || `Variable '${name}' must be one of: ${rule.value.join(', ')}`,
              variableName: name,
              suggestions: rule.value.map(v => `Use "${v}"`)
            });
          }
          break;
      }
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

      // Render components
      // Repeating components render to arrays; flatten so each item is emitted.
      const renderedComponents = (await Promise.all(
        processedTemplate.components.map(component => 
          this.renderComponent(component, mergedVariables)
        )
      )).flat();

      // Generate SVG content
      const svgContent = this.generateSVG(processedTemplate, renderedComponents);

      // Generate HTML content (for web display)
      const htmlContent = this.generateHTML(processedTemplate, renderedComponents);

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
    variables: VariableMap
  ): Promise<any> {
    try {
      // Check conditional rendering
      if (component.conditional) {
        const shouldRender = this.evaluateCondition(component.conditional, variables);
        if (!shouldRender) {
          return null;
        }
      }

      // Handle repeating components
      if (component.repeat) {
        return this.renderRepeatingComponent(component, variables);
      }

      // Process component based on type
      switch (component.type) {
        case ComponentType.TEXT:
          return this.renderTextComponent(component as any, variables);
        
        case ComponentType.IMAGE:
          return this.renderImageComponent(component as any, variables);
          
        case ComponentType.SHAPE:
          return this.renderShapeComponent(component as any, variables);
          
        case ComponentType.GROUP:
          return this.renderGroupComponent(component as any, variables);
          
        case ComponentType.SVG:
          return this.renderSvgComponent(component as any, variables);
          
        case ComponentType.HTML:
          return this.renderHtmlComponent(component as any, variables);
          
        default:
          throw new Error(`Unsupported component type: ${(component as any).type}`);
      }
    } catch (error) {
      throw new Error(`Component rendering failed for ${component.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Render text component with variable substitution
   */
  private renderTextComponent(component: any, variables: VariableMap): any {
    const template = this.handlebars.compile(component.content);
    const renderedContent = template(variables);

    return {
      ...component,
      content: renderedContent,
      style: this.processStyle(component.style, variables)
    };
  }

  /**
   * Render image component
   */
  private renderImageComponent(component: any, variables: VariableMap): any {
    let imageSource = component.source;
    
    // If source is a variable reference, resolve it
    if (imageSource.startsWith('{{') && imageSource.endsWith('}}')) {
      const varName = imageSource.slice(2, -2).trim();
      imageSource = variables[varName] || component.source;
    }

    return {
      ...component,
      source: imageSource,
      style: this.processStyle(component.style, variables)
    };
  }

  /**
   * Render shape component
   */
  private renderShapeComponent(component: any, variables: VariableMap): any {
    return {
      ...component,
      shapeData: this.processObjectWithVariables(component.shapeData, variables),
      style: this.processStyle(component.style, variables)
    };
  }

  /**
   * Render group component recursively
   */
  private async renderGroupComponent(component: any, variables: VariableMap): Promise<any> {
    const renderedChildren = await Promise.all(
      component.children.map((child: TemplateComponent) => 
        this.renderComponent(child, variables)
      )
    );

    return {
      ...component,
      children: renderedChildren.flat().filter(child => child !== null),
      style: this.processStyle(component.style, variables)
    };
  }

  /**
   * Render SVG component with variable substitution
   */
  private renderSvgComponent(component: any, variables: VariableMap): any {
    const template = this.handlebars.compile(component.svgContent);
    const renderedSvg = template(variables);

    return {
      ...component,
      svgContent: renderedSvg,
      style: this.processStyle(component.style, variables)
    };
  }

  /**
   * Render HTML component with variable substitution
   */
  private renderHtmlComponent(component: any, variables: VariableMap): any {
    const template = this.handlebars.compile(component.htmlContent);
    const renderedHtml = template(variables);

    return {
      ...component,
      htmlContent: renderedHtml,
      style: this.processStyle(component.style, variables)
    };
  }

  /**
   * Render repeating component (loops)
   */
  private async renderRepeatingComponent(
    component: TemplateComponent, 
    variables: VariableMap
  ): Promise<any[]> {
    // Parse repeat expression (e.g., "item in items")
    const repeatMatch = component.repeat!.match(/(\w+)\s+in\s+(\w+)/);
    if (!repeatMatch) {
      throw new Error(`Invalid repeat expression: ${component.repeat}`);
    }

    const itemVar = repeatMatch[1];
    const arrayVar = repeatMatch[2];
    const items = variables[arrayVar];

    if (!Array.isArray(items)) {
      throw new Error(`Repeat variable '${arrayVar}' must be an array`);
    }

    const renderedItems = [];
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
      const rendered = await this.renderComponent(itemComponent, itemVariables);
      if (rendered) {
        renderedItems.push(rendered);
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
      console.warn(`Failed to evaluate condition: ${condition}`);
      return true; // Default to showing component if condition fails
    }
  }

  /**
   * Process style object with variable substitution
   */
  private processStyle(style: any, variables: VariableMap): any {
    if (!style) return style;

    return this.processObjectWithVariables(style, variables);
  }

  /**
   * Process any object with variable substitution
   */
  private processObjectWithVariables(obj: any, variables: VariableMap): any {
    if (typeof obj === 'string') {
      // Process string with Handlebars
      try {
        const template = this.handlebars.compile(obj);
        return template(variables);
      } catch (error) {
        return obj; // Return original if template processing fails
      }
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.processObjectWithVariables(item, variables));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const processed: any = {};
      for (const [key, value] of Object.entries(obj)) {
        processed[key] = this.processObjectWithVariables(value, variables);
      }
      return processed;
    }
    
    return obj;
  }

  /**
   * Generate SVG content from rendered components
   */
  private generateSVG(template: Template, components: any[]): string {
    const { width, height, background } = template.layout;
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">\n`;
    
    // Add background if specified
    if (background) {
      svg += `  <rect width="100%" height="100%" fill="${background}"/>\n`;
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
  private generateHTML(template: Template, components: any[]): string {
    const { width, height, background } = template.layout;
    
    let html = `<div style="width: ${width}px; height: ${height}px; position: relative;`;
    if (background) {
      html += ` background: ${background};`;
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
   * Convert component to SVG markup
   */
  private componentToSVG(component: any): string {
    const { position, style = {} } = component;
    
    switch (component.type) {
      case ComponentType.TEXT:
        return `  <text x="${position.x}" y="${position.y + (style.fontSize || 12)}" ` +
               `font-family="${style.fontFamily || 'Arial'}" font-size="${style.fontSize || 12}" ` +
               `fill="${style.fill || '#000000'}">${this.escapeXML(component.content)}</text>\n`;
      
      case ComponentType.SHAPE:
        if (component.shape === 'rect') {
          return `  <rect x="${position.x}" y="${position.y}" width="${position.width}" height="${position.height}" ` +
                 `fill="${style.fill || 'transparent'}" stroke="${style.stroke || 'none'}" ` +
                 `stroke-width="${style.strokeWidth || 0}"/>\n`;
        } else if (component.shape === 'circle') {
          const radius = Math.min(position.width, position.height) / 2;
          const cx = position.x + position.width / 2;
          const cy = position.y + position.height / 2;
          return `  <circle cx="${cx}" cy="${cy}" r="${radius}" ` +
                 `fill="${style.fill || 'transparent'}" stroke="${style.stroke || 'none'}" ` +
                 `stroke-width="${style.strokeWidth || 0}"/>\n`;
        }
        break;
      
      case ComponentType.SVG:
        // Wrap in group with position
        return `  <g transform="translate(${position.x}, ${position.y})">\n${component.svgContent}\n  </g>\n`;
      
      case ComponentType.GROUP:
        let groupSvg = `  <g transform="translate(${position.x}, ${position.y})">\n`;
        for (const child of component.children) {
          groupSvg += this.componentToSVG(child).replace(/^  /gm, '    ');
        }
        groupSvg += '  </g>\n';
        return groupSvg;
      
      case ComponentType.IMAGE:
        return `  <image x="${position.x}" y="${position.y}" width="${position.width}" ` +
               `height="${position.height}" href="${component.source}"/>\n`;
    }
    
    return '';
  }

  /**
   * Convert component to HTML markup
   */
  private componentToHTML(component: any): string {
    const { position, style = {} } = component;
    const positionStyle = `position: absolute; left: ${position.x}px; top: ${position.y}px; width: ${position.width}px; height: ${position.height}px;`;
    
    switch (component.type) {
      case ComponentType.TEXT:
        const textStyle = `font-family: ${style.fontFamily || 'Arial'}; font-size: ${style.fontSize || 12}px; color: ${style.fill || '#000000'};`;
        return `  <div style="${positionStyle} ${textStyle}">${component.content}</div>\n`;
      
      case ComponentType.IMAGE:
        return `  <img src="${component.source}" style="${positionStyle} object-fit: ${component.fit || 'cover'};" alt="${component.alt || ''}"/>\n`;
      
      case ComponentType.SHAPE:
        const bgColor = style.fill || 'transparent';
        const border = style.stroke ? `border: ${style.strokeWidth || 1}px solid ${style.stroke};` : '';
        const borderRadius = component.shape === 'circle' ? '50%' : '0';
        return `  <div style="${positionStyle} background: ${bgColor}; ${border} border-radius: ${borderRadius};"></div>\n`;
      
      case ComponentType.HTML:
        return `  <div style="${positionStyle}">${component.htmlContent}</div>\n`;
      
      case ComponentType.GROUP:
        let groupHtml = `  <div style="${positionStyle}">\n`;
        for (const child of component.children) {
          groupHtml += this.componentToHTML(child).replace(/^  /gm, '    ');
        }
        groupHtml += '  </div>\n';
        return groupHtml;
    }
    
    return '';
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