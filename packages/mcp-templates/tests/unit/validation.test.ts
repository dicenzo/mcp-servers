import { TemplateValidator, PerformanceValidator } from '../../src/util/validation.js';
import {
  Template,
  VariableType,
  ComponentType,
  TemplateErrorCode
} from '../../src/types/template.js';

describe('TemplateValidator', () => {
  describe('Template Structure Validation', () => {
    test('should validate valid template', () => {
      const template: Template = {
        id: 'valid-template',
        metadata: {
          name: 'Valid Template',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [{
          name: 'title',
          type: VariableType.STRING,
          required: true,
          description: 'Template title'
        }],
        components: [{
          id: 'title-text',
          type: ComponentType.TEXT,
          position: { x: 10, y: 10, width: 200, height: 30 },
          content: '{{title}}',
          style: {
            fontSize: 24,
            fontFamily: 'Arial',
            fill: '#000000'
          }
        }],
        layout: {
          width: 800,
          height: 600
        }
      };

      const report = TemplateValidator.validateTemplate(template);
      expect(report.valid).toBe(true);
      expect(report.errors).toHaveLength(0);
    });

    test('should catch missing template ID', () => {
      const template = {
        metadata: { name: 'Test' },
        variables: [],
        components: [],
        layout: { width: 100, height: 100 }
      } as any;

      const report = TemplateValidator.validateTemplate(template);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.message.includes('Template ID is required'))).toBe(true);
    });

    test('should catch missing template name', () => {
      const template = {
        id: 'test',
        metadata: {},
        variables: [],
        components: [],
        layout: { width: 100, height: 100 }
      } as any;

      const report = TemplateValidator.validateTemplate(template);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.message.includes('Template name is required'))).toBe(true);
    });

    test('should catch invalid dimensions', () => {
      const template: Template = {
        id: 'test',
        metadata: {
          name: 'Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [],
        components: [],
        layout: {
          width: -100,
          height: 0
        }
      };

      const report = TemplateValidator.validateTemplate(template);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.message.includes('dimensions must be positive'))).toBe(true);
    });

    test('should catch dimensions too large', () => {
      const template: Template = {
        id: 'test',
        metadata: {
          name: 'Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [],
        components: [],
        layout: {
          width: 15000,
          height: 15000
        }
      };

      const report = TemplateValidator.validateTemplate(template);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.message.includes('too large'))).toBe(true);
    });
  });

  describe('Component Validation', () => {
    test('should catch duplicate component IDs', () => {
      const template: Template = {
        id: 'test',
        metadata: {
          name: 'Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [],
        components: [
          {
            id: 'duplicate',
            type: ComponentType.TEXT,
            position: { x: 0, y: 0, width: 100, height: 30 },
            content: 'Text 1',
            style: {
              fontSize: 16,
              fontFamily: 'Arial'
            }
          },
          {
            id: 'duplicate', // Same ID
            type: ComponentType.TEXT,
            position: { x: 0, y: 40, width: 100, height: 30 },
            content: 'Text 2',
            style: {
              fontSize: 16,
              fontFamily: 'Arial'
            }
          }
        ],
        layout: {
          width: 200,
          height: 100
        }
      };

      const report = TemplateValidator.validateTemplate(template);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.message.includes('Duplicate component ID'))).toBe(true);
    });

    test('should validate text components', () => {
      const template: Template = {
        id: 'test',
        metadata: {
          name: 'Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [],
        components: [{
          id: 'text-1',
          type: ComponentType.TEXT,
          position: { x: 0, y: 0, width: 100, height: 30 },
          content: '',  // Empty content should generate warning
          style: {
            fontSize: -10,  // Invalid font size should generate error
            fontFamily: 'Arial'
          }
        }],
        layout: {
          width: 200,
          height: 100
        }
      };

      const report = TemplateValidator.validateTemplate(template);
      expect(report.warnings.some(w => w.message.includes('has no content'))).toBe(true);
      expect(report.errors.some(e => e.message.includes('invalid font size'))).toBe(true);
    });

    test('should validate image components', () => {
      const template: Template = {
        id: 'test',
        metadata: {
          name: 'Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [],
        components: [{
          id: 'img-1',
          type: ComponentType.IMAGE,
          position: { x: 0, y: 0, width: 100, height: 100 },
          // Missing source should generate error
          fit: 'invalid-fit' // Invalid fit should generate warning
        } as any],
        layout: {
          width: 200,
          height: 200
        }
      };

      const report = TemplateValidator.validateTemplate(template);
      expect(report.errors.some(e => e.message.includes('missing source'))).toBe(true);
      expect(report.warnings.some(w => w.message.includes('invalid fit'))).toBe(true);
    });

    test('should validate shape components', () => {
      const template: Template = {
        id: 'test',
        metadata: {
          name: 'Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [],
        components: [{
          id: 'shape-1',
          type: ComponentType.SHAPE,
          position: { x: 0, y: 0, width: 100, height: 100 },
          shape: 'invalid-shape', // Invalid shape
          // Missing shapeData
        } as any],
        layout: {
          width: 200,
          height: 200
        }
      };

      const report = TemplateValidator.validateTemplate(template);
      expect(report.errors.some(e => e.message.includes('invalid shape type'))).toBe(true);
      expect(report.errors.some(e => e.message.includes('missing shapeData'))).toBe(true);
    });
  });

  describe('Variable Validation', () => {
    test('should catch duplicate variable names', () => {
      const template: Template = {
        id: 'test',
        metadata: {
          name: 'Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [
          {
            name: 'duplicate',
            type: VariableType.STRING,
            required: true
          },
          {
            name: 'duplicate', // Same name
            type: VariableType.NUMBER,
            required: false
          }
        ],
        components: [],
        layout: {
          width: 200,
          height: 100
        }
      };

      const report = TemplateValidator.validateTemplate(template);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.message.includes('Duplicate variable name'))).toBe(true);
    });

    test('should catch invalid variable names', () => {
      const template: Template = {
        id: 'test',
        metadata: {
          name: 'Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [{
          name: '123invalid', // Starts with number
          type: VariableType.STRING,
          required: true
        }],
        components: [],
        layout: {
          width: 200,
          height: 100
        }
      };

      const report = TemplateValidator.validateTemplate(template);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.message.includes('Invalid variable name'))).toBe(true);
    });

    test('should warn about required variables without defaults', () => {
      const template: Template = {
        id: 'test',
        metadata: {
          name: 'Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [{
          name: 'required_no_default',
          type: VariableType.STRING,
          required: true
          // No default value
        }],
        components: [],
        layout: {
          width: 200,
          height: 100
        }
      };

      const report = TemplateValidator.validateTemplate(template);
      expect(report.warnings.some(w => w.message.includes('no default value'))).toBe(true);
    });
  });

  describe('Variable Value Validation', () => {
    test('should validate variables with values', () => {
      const template: Template = {
        id: 'test',
        metadata: {
          name: 'Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [
          { name: 'title', type: VariableType.STRING, required: true },
          { name: 'count', type: VariableType.NUMBER, required: true },
          { name: 'visible', type: VariableType.BOOLEAN, required: false }
        ],
        components: [],
        layout: { width: 200, height: 100 }
      };

      const variables = {
        title: 'Hello World',
        count: 42,
        visible: true
      };

      const report = TemplateValidator.validateTemplateWithVariables(template, variables);
      expect(report.valid).toBe(true);
      expect(report.errors).toHaveLength(0);
    });

    test('should catch type mismatches', () => {
      const template: Template = {
        id: 'test',
        metadata: {
          name: 'Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [
          { name: 'count', type: VariableType.NUMBER, required: true }
        ],
        components: [],
        layout: { width: 200, height: 100 }
      };

      const variables = {
        count: 'not-a-number' // Wrong type
      };

      const report = TemplateValidator.validateTemplateWithVariables(template, variables);
      expect(report.valid).toBe(false);
      expect(report.errors.some(e => e.code === TemplateErrorCode.INVALID_VARIABLE)).toBe(true);
    });
  });
});

describe('PerformanceValidator', () => {
  test('should pass for simple template', () => {
    const template: Template = {
      id: 'simple',
      metadata: {
        name: 'Simple Template',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      variables: [{ name: 'test', type: VariableType.STRING, required: false }],
      components: [{
        id: 'text-1',
        type: ComponentType.TEXT,
        position: { x: 0, y: 0, width: 100, height: 30 },
        content: 'Hello',
        style: {
          fontSize: 16,
          fontFamily: 'Arial'
        }
      }],
      layout: { width: 400, height: 300 }
    };

    const errors = PerformanceValidator.validatePerformanceConstraints(template);
    expect(errors).toHaveLength(0);
  });

  test('should warn for too many components', () => {
    const template: Template = {
      id: 'complex',
      metadata: {
        name: 'Complex Template',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      variables: [],
      components: Array.from({ length: 1500 }, (_, i) => ({
        id: `component-${i}`,
        type: ComponentType.TEXT,
        position: { x: 0, y: i * 20, width: 100, height: 20 },
        content: `Item ${i}`,
        style: {
          fontSize: 12,
          fontFamily: 'Arial'
        }
      })),
      layout: { width: 400, height: 30000 }
    };

    const errors = PerformanceValidator.validatePerformanceConstraints(template);
    expect(errors.some(e => e.message.includes('too many components'))).toBe(true);
  });

  test('should warn for too many variables', () => {
    const template: Template = {
      id: 'many-vars',
      metadata: {
        name: 'Many Variables',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      variables: Array.from({ length: 150 }, (_, i) => ({
        name: `var${i}`,
        type: VariableType.STRING,
        required: false
      })),
      components: [],
      layout: { width: 400, height: 300 }
    };

    const errors = PerformanceValidator.validatePerformanceConstraints(template);
    expect(errors.some(e => e.message.includes('too many variables'))).toBe(true);
  });
});
