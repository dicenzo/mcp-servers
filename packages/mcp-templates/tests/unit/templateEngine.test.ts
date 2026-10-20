import { TemplateEngine } from '../../src/engine/templateEngine.js';
import {
  Template,
  VariableType,
  ComponentType,
  TemplateErrorCode
} from '../../src/types/template.js';

describe('TemplateEngine', () => {
  let engine: TemplateEngine;

  beforeEach(() => {
    engine = new TemplateEngine();
  });

  describe('Variable Validation', () => {
    test('should validate required string variable', () => {
      const variables = { name: 'John Doe' };
      const definitions = [{
        name: 'name',
        type: VariableType.STRING,
        required: true
      }];

      const errors = engine.validateVariables(variables, definitions);
      expect(errors).toHaveLength(0);
    });

    test('should catch missing required variable', () => {
      const variables = {};
      const definitions = [{
        name: 'name',
        type: VariableType.STRING,
        required: true
      }];

      const errors = engine.validateVariables(variables, definitions);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe(TemplateErrorCode.MISSING_VARIABLE);
      expect(errors[0].variableName).toBe('name');
    });

    test('should validate number type', () => {
      const variables = { count: 42 };
      const definitions = [{
        name: 'count',
        type: VariableType.NUMBER,
        required: true
      }];

      const errors = engine.validateVariables(variables, definitions);
      expect(errors).toHaveLength(0);
    });

    test('should catch invalid number type', () => {
      const variables = { count: 'not-a-number' };
      const definitions = [{
        name: 'count',
        type: VariableType.NUMBER,
        required: true
      }];

      const errors = engine.validateVariables(variables, definitions);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe(TemplateErrorCode.INVALID_VARIABLE);
    });

    test('should validate color type', () => {
      const variables = { 
        color1: '#FF0000',
        color2: 'rgb(255, 0, 0)',
        color3: 'red'
      };
      const definitions = [
        { name: 'color1', type: VariableType.COLOR, required: true },
        { name: 'color2', type: VariableType.COLOR, required: true },
        { name: 'color3', type: VariableType.COLOR, required: true }
      ];

      const errors = engine.validateVariables(variables, definitions);
      expect(errors).toHaveLength(0);
    });

    test('should catch invalid color', () => {
      const variables = { color: 'not-a-color' };
      const definitions = [{
        name: 'color',
        type: VariableType.COLOR,
        required: true
      }];

      const errors = engine.validateVariables(variables, definitions);
      expect(errors).toHaveLength(1);
      expect(errors[0].code).toBe(TemplateErrorCode.INVALID_VARIABLE);
    });
  });

  describe('Template Rendering', () => {
    test('should render simple text template', async () => {
      const template: Template = {
        id: 'test-1',
        metadata: {
          name: 'Test Template',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [{
          name: 'message',
          type: VariableType.STRING,
          required: true
        }],
        components: [{
          id: 'text-1',
          type: ComponentType.TEXT,
          position: { x: 10, y: 10, width: 200, height: 30 },
          content: 'Hello {{message}}!',
          style: {
            fontSize: 16,
            fontFamily: 'Arial',
            fill: '#000000'
          }
        }],
        layout: {
          width: 400,
          height: 300
        }
      };

      const variables = { message: 'World' };
      const result = await engine.renderTemplate(template, variables);

      expect(result.templateId).toBe('test-1');
      expect(result.content.svg).toContain('Hello World!');
      expect(result.content.metadata.width).toBe(400);
      expect(result.content.metadata.height).toBe(300);
    });

    test('should handle template with background', async () => {
      const template: Template = {
        id: 'test-2',
        metadata: {
          name: 'Background Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [],
        components: [],
        layout: {
          width: 200,
          height: 200,
          background: '#FF0000'
        }
      };

      const result = await engine.renderTemplate(template, {});
      expect(result.content.svg).toContain('fill="#FF0000"');
    });

    test('should render shape components', async () => {
      const template: Template = {
        id: 'test-3',
        metadata: {
          name: 'Shape Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [],
        components: [{
          id: 'rect-1',
          type: ComponentType.SHAPE,
          position: { x: 50, y: 50, width: 100, height: 100 },
          shape: 'rect',
          shapeData: {},
          style: {
            fill: '#0000FF',
            stroke: '#000000',
            strokeWidth: 2
          }
        }],
        layout: {
          width: 200,
          height: 200
        }
      };

      const result = await engine.renderTemplate(template, {});
      expect(result.content.svg).toContain('<rect');
      expect(result.content.svg).toContain('fill="#0000FF"');
      expect(result.content.svg).toContain('stroke="#000000"');
    });

    test('should handle conditional rendering', async () => {
      const template: Template = {
        id: 'test-4',
        metadata: {
          name: 'Conditional Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [{
          name: 'showMessage',
          type: VariableType.BOOLEAN,
          required: true
        }],
        components: [{
          id: 'conditional-text',
          type: ComponentType.TEXT,
          position: { x: 10, y: 10, width: 200, height: 30 },
          content: 'This is conditional',
          conditional: 'showMessage',
          style: {
            fontSize: 16,
            fontFamily: 'Arial'
          }
        }],
        layout: {
          width: 400,
          height: 300
        }
      };

      // Test with showMessage = true
      const resultTrue = await engine.renderTemplate(template, { showMessage: true });
      expect(resultTrue.content.svg).toContain('This is conditional');

      // Test with showMessage = false
      const resultFalse = await engine.renderTemplate(template, { showMessage: false });
      expect(resultFalse.content.svg).not.toContain('This is conditional');
    });

    test('should handle repeated components', async () => {
      const template: Template = {
        id: 'test-5',
        metadata: {
          name: 'Repeat Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [{
          name: 'items',
          type: VariableType.ARRAY,
          required: true
        }],
        components: [{
          id: 'repeated-text',
          type: ComponentType.TEXT,
          position: { x: 10, y: 10, width: 200, height: 30 },
          content: '{{item}}',
          repeat: 'item in items',
          style: {
            fontSize: 16,
            fontFamily: 'Arial'
          }
        }],
        layout: {
          width: 400,
          height: 300
        }
      };

      const variables = { items: ['Apple', 'Banana', 'Cherry'] };
      const result = await engine.renderTemplate(template, variables);
      
      expect(result.content.svg).toContain('Apple');
      expect(result.content.svg).toContain('Banana');
      expect(result.content.svg).toContain('Cherry');
    });
  });

  describe('Error Handling', () => {
    test('should fail for invalid template', async () => {
      const invalidTemplate = {
        id: 'invalid',
        // Missing required fields
      } as any;

      await expect(engine.renderTemplate(invalidTemplate, {})).rejects.toThrow();
    });

    test('should fail for missing required variables', async () => {
      const template: Template = {
        id: 'test-fail',
        metadata: {
          name: 'Fail Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [{
          name: 'required',
          type: VariableType.STRING,
          required: true
        }],
        components: [],
        layout: {
          width: 400,
          height: 300
        }
      };

      await expect(engine.renderTemplate(template, {})).rejects.toThrow('Template validation failed');
    });
  });

  describe('Performance', () => {
    test('should complete simple render within performance target', async () => {
      const template: Template = {
        id: 'perf-test',
        metadata: {
          name: 'Performance Test',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        },
        variables: [],
        components: Array.from({ length: 50 }, (_, i) => ({
          id: `component-${i}`,
          type: ComponentType.TEXT,
          position: { x: i * 10, y: i * 5, width: 100, height: 20 },
          content: `Item ${i}`,
          style: {
            fontSize: 12,
            fontFamily: 'Arial'
          }
        })),
        layout: {
          width: 800,
          height: 600
        }
      };

      const startTime = Date.now();
      const result = await engine.renderTemplate(template, {});
      const duration = Date.now() - startTime;

      expect(result.content.metadata.componentCount).toBe(50);
      expect(duration).toBeLessThan(500); // Should complete within 500ms target
    });
  });
});
