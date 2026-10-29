import {
  Template,
  TemplateComponent,
  TextComponent,
  ImageComponent,
  ShapeComponent,
  GroupComponent,
  SvgComponent,
  HtmlComponent,
  ValidationRule,
  VariableDefinition,
  VariableMap,
  ValidationReport,
  TemplateError,
  TemplateErrorCode,
  ComponentType,
  VariableType
} from '../types/template.js';

/**
 * Template validation utilities
 */
export class TemplateValidator {
  /**
   * Validate a complete template structure
   */
  static validateTemplate(template: Template): ValidationReport {
    const errors: TemplateError[] = [];
    const warnings: TemplateError[] = [];

    try {
      // Validate basic template structure
      this.validateTemplateStructure(template, errors);
      
      // Validate components
      this.validateComponents(template.components, errors, warnings);
      
      // Validate variables
      this.validateVariableDefinitions(template.variables, errors, warnings);
      
      // Validate component/variable references
      this.validateReferences(template, errors);
      
      // Validate layout constraints
      this.validateLayout(template, errors, warnings);
      
    } catch (error) {
      errors.push({
        code: TemplateErrorCode.VALIDATION_ERROR,
        message: `Template validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        suggestions: ['Check template structure and try again']
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      metadata: {
        templateId: template.id,
        validatedAt: new Date().toISOString(),
        componentCount: template.components.length,
        variableCount: template.variables.length
      }
    };
  }

  /**
   * Validate template with variables
   */
  static validateTemplateWithVariables(
    template: Template, 
    variables: VariableMap
  ): ValidationReport {
    const report = this.validateTemplate(template);
    
    // Additional validation with variables
    const variableErrors = this.validateVariableValues(template.variables, variables);
    report.errors.push(...variableErrors);
    report.valid = report.errors.length === 0;
    
    return report;
  }

  /**
   * Validate basic template structure
   */
  private static validateTemplateStructure(template: Template, errors: TemplateError[]): void {
    // Required fields
    if (!template.id) {
      errors.push({
        code: TemplateErrorCode.INVALID_TEMPLATE,
        message: 'Template ID is required',
        suggestions: ['Add a unique ID to the template']
      });
    }

    if (!template.metadata?.name) {
      errors.push({
        code: TemplateErrorCode.INVALID_TEMPLATE,
        message: 'Template name is required',
        suggestions: ['Add a name to template metadata']
      });
    }

    // Layout validation
    if (!template.layout) {
      errors.push({
        code: TemplateErrorCode.INVALID_TEMPLATE,
        message: 'Template layout is required',
        suggestions: ['Define layout with width and height']
      });
    } else {
      if (template.layout.width <= 0 || template.layout.height <= 0) {
        errors.push({
          code: TemplateErrorCode.INVALID_TEMPLATE,
          message: 'Template dimensions must be positive',
          suggestions: ['Set width and height to positive values']
        });
      }
      
      if (template.layout.width > 10000 || template.layout.height > 10000) {
        errors.push({
          code: TemplateErrorCode.INVALID_TEMPLATE,
          message: 'Template dimensions are too large (max 10000px)',
          suggestions: ['Reduce template dimensions to 10000px or less']
        });
      }
    }
  }

  /**
   * Validate component definitions
   */
  private static validateComponents(
    components: TemplateComponent[], 
    errors: TemplateError[], 
    warnings: TemplateError[]
  ): void {
    const componentIds = new Set<string>();
    
    for (const component of components) {
      // Check for duplicate IDs
      if (componentIds.has(component.id)) {
        errors.push({
          code: TemplateErrorCode.INVALID_TEMPLATE,
          message: `Duplicate component ID: ${component.id}`,
          componentId: component.id,
          suggestions: ['Use unique IDs for each component']
        });
      }
      componentIds.add(component.id);
      
      // Validate component structure
      this.validateComponent(component, errors, warnings);
    }
  }

  /**
   * Validate individual component
   */
  private static validateComponent(
    component: TemplateComponent, 
    errors: TemplateError[], 
    warnings: TemplateError[]
  ): void {
    // Validate position
    if (!component.position) {
      errors.push({
        code: TemplateErrorCode.INVALID_TEMPLATE,
        message: `Component ${component.id} missing position`,
        componentId: component.id,
        suggestions: ['Add position with x, y, width, height']
      });
    } else {
      const { position } = component;
      if (position.width < 0 || position.height < 0) {
        errors.push({
          code: TemplateErrorCode.INVALID_TEMPLATE,
          message: `Component ${component.id} has negative dimensions`,
          componentId: component.id,
          suggestions: ['Set width and height to positive values']
        });
      }
    }

    // Type-specific validation
    switch (component.type) {
      case ComponentType.TEXT:
        this.validateTextComponent(component, errors, warnings);
        break;
      case ComponentType.IMAGE:
        this.validateImageComponent(component, errors, warnings);
        break;
      case ComponentType.SHAPE:
        this.validateShapeComponent(component, errors, warnings);
        break;
      case ComponentType.GROUP:
        this.validateGroupComponent(component, errors, warnings);
        break;
      case ComponentType.SVG:
        this.validateSvgComponent(component, errors, warnings);
        break;
      case ComponentType.HTML:
        this.validateHtmlComponent(component, errors, warnings);
        break;
      default:
        errors.push({
          code: TemplateErrorCode.INVALID_TEMPLATE,
          message: `Unknown component type: ${(component as { type: string }).type}`,
          componentId: (component as { id?: string }).id,
          suggestions: ['Use a valid component type: text, image, shape, group, svg, html']
        });
    }
  }

  private static validateTextComponent(component: TextComponent, errors: TemplateError[], warnings: TemplateError[]): void {
    if (!component.content) {
      warnings.push({
        code: TemplateErrorCode.VALIDATION_ERROR,
        message: `Text component ${component.id} has no content`,
        componentId: component.id,
        suggestions: ['Add content to the text component']
      });
    }

    if (component.style?.fontSize && component.style.fontSize <= 0) {
      errors.push({
        code: TemplateErrorCode.INVALID_TEMPLATE,
        message: `Text component ${component.id} has invalid font size`,
        componentId: component.id,
        suggestions: ['Set fontSize to a positive number']
      });
    }
  }

  private static validateImageComponent(component: ImageComponent, errors: TemplateError[], warnings: TemplateError[]): void {
    if (!component.source) {
      errors.push({
        code: TemplateErrorCode.INVALID_TEMPLATE,
        message: `Image component ${component.id} missing source`,
        componentId: component.id,
        suggestions: ['Add source URL or variable reference']
      });
    }

    const validFits = ['contain', 'cover', 'fill', 'scale-down'];
    if (component.fit && !validFits.includes(component.fit)) {
      warnings.push({
        code: TemplateErrorCode.VALIDATION_ERROR,
        message: `Image component ${component.id} has invalid fit value`,
        componentId: component.id,
        suggestions: [`Use one of: ${validFits.join(', ')}`]
      });
    }
  }

  private static validateShapeComponent(component: ShapeComponent, errors: TemplateError[], _warnings: TemplateError[]): void {
    const validShapes = ['rect', 'circle', 'ellipse', 'polygon', 'path'];
    if (!validShapes.includes(component.shape)) {
      errors.push({
        code: TemplateErrorCode.INVALID_TEMPLATE,
        message: `Shape component ${component.id} has invalid shape type`,
        componentId: component.id,
        suggestions: [`Use one of: ${validShapes.join(', ')}`]
      });
    }

    if (!component.shapeData) {
      errors.push({
        code: TemplateErrorCode.INVALID_TEMPLATE,
        message: `Shape component ${component.id} missing shapeData`,
        componentId: component.id,
        suggestions: ['Add shapeData with required properties for the shape type']
      });
    }
  }

  private static validateGroupComponent(component: GroupComponent, errors: TemplateError[], warnings: TemplateError[]): void {
    if (!component.children || !Array.isArray(component.children)) {
      errors.push({
        code: TemplateErrorCode.INVALID_TEMPLATE,
        message: `Group component ${component.id} missing children array`,
        componentId: component.id,
        suggestions: ['Add children array with nested components']
      });
    } else {
      // Recursively validate children
      for (const child of component.children) {
        this.validateComponent(child, errors, warnings);
      }
    }
  }

  private static validateSvgComponent(component: SvgComponent, errors: TemplateError[], _warnings: TemplateError[]): void {
    if (!component.svgContent) {
      errors.push({
        code: TemplateErrorCode.INVALID_TEMPLATE,
        message: `SVG component ${component.id} missing svgContent`,
        componentId: component.id,
        suggestions: ['Add svgContent with valid SVG markup']
      });
    }
  }

  private static validateHtmlComponent(component: HtmlComponent, errors: TemplateError[], _warnings: TemplateError[]): void {
    if (!component.htmlContent) {
      errors.push({
        code: TemplateErrorCode.INVALID_TEMPLATE,
        message: `HTML component ${component.id} missing htmlContent`,
        componentId: component.id,
        suggestions: ['Add htmlContent with valid HTML markup']
      });
    }
  }

  /**
   * Validate variable definitions
   */
  private static validateVariableDefinitions(
    variables: VariableDefinition[], 
    errors: TemplateError[], 
    warnings: TemplateError[]
  ): void {
    const variableNames = new Set<string>();
    
    for (const variable of variables) {
      // Check for duplicate variable names
      if (variableNames.has(variable.name)) {
        errors.push({
          code: TemplateErrorCode.INVALID_TEMPLATE,
          message: `Duplicate variable name: ${variable.name}`,
          variableName: variable.name,
          suggestions: ['Use unique names for each variable']
        });
      }
      variableNames.add(variable.name);
      
      // Validate variable name
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(variable.name)) {
        errors.push({
          code: TemplateErrorCode.INVALID_TEMPLATE,
          message: `Invalid variable name: ${variable.name}`,
          variableName: variable.name,
          suggestions: ['Variable names must start with letter/underscore and contain only letters, numbers, and underscores']
        });
      }
      
      // Validate default value matches type
      if (variable.default !== undefined) {
        const typeErrors = this.validateVariableTypeValue(variable.name, variable.default, variable.type);
        errors.push(...typeErrors);
      }
      
      // Check for required variables without defaults
      if (variable.required && variable.default === undefined) {
        warnings.push({
          code: TemplateErrorCode.VALIDATION_ERROR,
          message: `Required variable '${variable.name}' has no default value`,
          variableName: variable.name,
          suggestions: ['Consider providing a default value for required variables']
        });
      }
    }
  }

  /**
   * Validate variable values against definitions
   */
  private static validateVariableValues(
    definitions: VariableDefinition[], 
    variables: VariableMap
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
          suggestions: [`Provide value for '${def.name}' in variables`]
        });
        continue;
      }
      
      // Skip validation if not provided and not required
      if (value === undefined || value === null) {
        continue;
      }
      
      // Type validation
      const typeErrors = this.validateVariableTypeValue(def.name, value, def.type);
      errors.push(...typeErrors);
      
      // Custom validation rules
      if (def.validation) {
        const validationErrors = this.validateCustomRules(def.name, value, def.validation);
        errors.push(...validationErrors);
      }
    }
    
    return errors;
  }

  private static validateVariableTypeValue(name: string, value: unknown, type: VariableType): TemplateError[] {
    const errors: TemplateError[] = [];
    
    switch (type) {
      case VariableType.STRING:
        if (typeof value !== 'string') {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: `Variable '${name}' must be a string`,
            variableName: name
          });
        }
        break;
        
      case VariableType.NUMBER:
        if (typeof value !== 'number' || isNaN(value)) {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: `Variable '${name}' must be a valid number`,
            variableName: name
          });
        }
        break;
        
      case VariableType.BOOLEAN:
        if (typeof value !== 'boolean') {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: `Variable '${name}' must be a boolean`,
            variableName: name
          });
        }
        break;
        
      case VariableType.COLOR:
        if (typeof value !== 'string' || !this.isValidColor(value)) {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: `Variable '${name}' must be a valid color`,
            variableName: name,
            suggestions: ['Use hex (#FF0000), rgb(255,0,0), hsl(0,100%,50%), or named colors']
          });
        }
        break;
        
      case VariableType.ARRAY:
        if (!Array.isArray(value)) {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: `Variable '${name}' must be an array`,
            variableName: name
          });
        }
        break;
        
      case VariableType.OBJECT:
        if (typeof value !== 'object' || Array.isArray(value) || value === null) {
          errors.push({
            code: TemplateErrorCode.INVALID_VARIABLE,
            message: `Variable '${name}' must be an object`,
            variableName: name
          });
        }
        break;
    }
    
    return errors;
  }

  private static validateCustomRules(_name: string, _value: unknown, _rules: ValidationRule[]): TemplateError[] {
    // Implementation similar to template engine validation
    return [];
  }

  /**
   * Validate component/variable references
   */
  private static validateReferences(template: Template, errors: TemplateError[]): void {
    const variableNames = new Set(template.variables.map(v => v.name));
    
    // Check for variable references in components
    for (const component of template.components) {
      this.checkComponentVariableReferences(component, variableNames, errors);
    }
  }

  private static checkComponentVariableReferences(
    component: TemplateComponent, 
    variableNames: Set<string>, 
    errors: TemplateError[]
  ): void {
    // Check variable references in handlebars expressions
    const checkString = (str: string, context: string) => {
      const variablePattern = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_.]*)\s*\}\}/g;
      let match;
      
      while ((match = variablePattern.exec(str)) !== null) {
        const varName = match[1].split('.')[0]; // Handle nested properties
        if (!variableNames.has(varName)) {
          errors.push({
            code: TemplateErrorCode.MISSING_VARIABLE,
            message: `Undefined variable '${varName}' in ${context}`,
            componentId: component.id,
            variableName: varName,
            suggestions: [`Define variable '${varName}' in template variables`]
          });
        }
      }
    };
    
    switch (component.type) {
      case ComponentType.TEXT: {
        const textComp = component;
        if (textComp.content) checkString(textComp.content, 'text content');
        break;
      }

      case ComponentType.IMAGE: {
        const imageComp = component;
        if (imageComp.source) checkString(imageComp.source, 'image source');
        break;
      }

      case ComponentType.SVG: {
        const svgComp = component;
        if (svgComp.svgContent) checkString(svgComp.svgContent, 'SVG content');
        break;
      }

      case ComponentType.HTML: {
        const htmlComp = component;
        if (htmlComp.htmlContent) checkString(htmlComp.htmlContent, 'HTML content');
        break;
      }

      case ComponentType.GROUP: {
        const groupComp = component;
        if (groupComp.children) {
          for (const child of groupComp.children) {
            this.checkComponentVariableReferences(child, variableNames, errors);
          }
        }
        break;
      }
    }
    
    // Check conditional and repeat expressions
    if (component.conditional) {
      checkString(`{{${component.conditional}}}`, 'conditional expression');
    }
    
    if (component.repeat) {
      checkString(`{{${component.repeat}}}`, 'repeat expression');
    }
  }

  /**
   * Validate layout constraints
   */
  private static validateLayout(
    template: Template, 
    errors: TemplateError[], 
    warnings: TemplateError[]
  ): void {
    const { width, height } = template.layout;
    
    for (const component of template.components) {
      if (component.position) {
        const { x, y, width: cWidth, height: cHeight } = component.position;
        
        // Check if component is within template bounds
        if (x + cWidth > width || y + cHeight > height) {
          warnings.push({
            code: TemplateErrorCode.VALIDATION_ERROR,
            message: `Component ${component.id} extends beyond template bounds`,
            componentId: component.id,
            suggestions: ['Adjust component position or template size']
          });
        }
        
        // Check for negative positions
        if (x < 0 || y < 0) {
          warnings.push({
            code: TemplateErrorCode.VALIDATION_ERROR,
            message: `Component ${component.id} has negative position`,
            componentId: component.id,
            suggestions: ['Use positive coordinates for component position']
          });
        }
      }
    }
  }

  /**
   * Basic color validation
   */
  private static isValidColor(color: string): boolean {
    const hexPattern = /^#([0-9A-F]{3}){1,2}$/i;
    const rgbPattern = /^rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\)$/i;
    const hslPattern = /^hsl\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*\)$/i;
    const namedColors = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'brown', 'black', 'white', 'gray', 'transparent'];
    
    return hexPattern.test(color) || 
           rgbPattern.test(color) || 
           hslPattern.test(color) || 
           namedColors.includes(color.toLowerCase());
  }
}

/**
 * Performance validation utilities
 */
export class PerformanceValidator {
  private static readonly MAX_COMPONENTS = 1000;
  private static readonly MAX_TEMPLATE_SIZE = 50 * 1024 * 1024; // 50MB
  private static readonly MAX_VARIABLE_COUNT = 100;
  
  static validatePerformanceConstraints(template: Template): TemplateError[] {
    const errors: TemplateError[] = [];
    
    // Check component count
    const totalComponents = this.countComponents(template.components);
    if (totalComponents > this.MAX_COMPONENTS) {
      errors.push({
        code: TemplateErrorCode.VALIDATION_ERROR,
        message: `Template has too many components (${totalComponents} > ${this.MAX_COMPONENTS})`,
        suggestions: ['Reduce number of components or use groups to optimize rendering']
      });
    }
    
    // Check variable count
    if (template.variables.length > this.MAX_VARIABLE_COUNT) {
      errors.push({
        code: TemplateErrorCode.VALIDATION_ERROR,
        message: `Template has too many variables (${template.variables.length} > ${this.MAX_VARIABLE_COUNT})`,
        suggestions: ['Reduce number of variables or use object/array types to group related data']
      });
    }
    
    // Check template complexity
    const complexityScore = this.calculateComplexityScore(template);
    if (complexityScore > 1000) {
      errors.push({
        code: TemplateErrorCode.VALIDATION_ERROR,
        message: `Template is too complex (score: ${complexityScore})`,
        suggestions: ['Simplify template structure or split into multiple templates']
      });
    }
    
    return errors;
  }
  
  private static countComponents(components: TemplateComponent[]): number {
    let count = components.length;
    
    for (const component of components) {
      if (component.type === ComponentType.GROUP) {
        const groupComp = component;
        if (groupComp.children) {
          count += this.countComponents(groupComp.children);
        }
      }
    }
    
    return count;
  }
  
  private static calculateComplexityScore(template: Template): number {
    let score = 0;
    
    // Base score from layout size
    score += (template.layout.width * template.layout.height) / 10000;
    
    // Score from components
    for (const component of template.components) {
      score += this.getComponentComplexity(component);
    }
    
    // Score from variables
    score += template.variables.length * 2;
    
    // Score from template features
    if (template.extends) score += 50;
    if (template.partials) score += Object.keys(template.partials).length * 20;
    
    return Math.round(score);
  }
  
  private static getComponentComplexity(component: TemplateComponent): number {
    let score = 10; // Base component score
    
    // Add complexity based on type
    switch (component.type) {
      case ComponentType.TEXT:
        score += 5;
        break;
      case ComponentType.IMAGE:
        score += 15;
        break;
      case ComponentType.SHAPE:
        score += 8;
        break;
      case ComponentType.SVG:
        score += 20;
        break;
      case ComponentType.HTML:
        score += 25;
        break;
      case ComponentType.GROUP: {
        const groupComp = component;
        score += 5;
        if (groupComp.children) {
          for (const child of groupComp.children) {
            score += this.getComponentComplexity(child);
          }
        }
        break;
      }
    }
    
    // Add complexity for conditions and loops
    if (component.conditional) score += 15;
    if (component.repeat) score += 25;
    
    return score;
  }
}
