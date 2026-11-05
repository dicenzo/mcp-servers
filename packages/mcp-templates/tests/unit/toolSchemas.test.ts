import { z } from 'zod';
import {
  TemplateCreateInputSchema,
  TemplateRenderInputSchema,
  TemplateValidateInputSchema,
  TemplateExportInputSchema,
  TemplateLibraryComposeInputSchema
} from '../../src/types/template.js';
import { templateCreateTool } from '../../src/tools/templateCreate.js';
import { templateRenderTool } from '../../src/tools/templateRender.js';
import { templateValidateTool } from '../../src/tools/templateValidate.js';
import { templateExportTool } from '../../src/tools/templateExport.js';
import { templateLibraryAddTool, LibraryAddArgsSchema } from '../../src/tools/templateLibraryAdd.js';
import { templateLibraryComposeTool } from '../../src/tools/templateLibraryCompose.js';

// The advertised schemas are plain JSON Schema objects; index them freely in assertions.
type JsonSchema = { [key: string]: any };

/** Each tool with the zod schema its handler validates input with */
const tools = [
  [templateCreateTool, TemplateCreateInputSchema],
  [templateRenderTool, TemplateRenderInputSchema],
  [templateValidateTool, TemplateValidateInputSchema],
  [templateExportTool, TemplateExportInputSchema],
  [templateLibraryAddTool, LibraryAddArgsSchema],
  [templateLibraryComposeTool, TemplateLibraryComposeInputSchema]
] as const;

const properties = (tool: { inputSchema: unknown }) => (tool.inputSchema as JsonSchema).properties;

const call = async (tool: { invoke: (args: unknown) => Promise<unknown> }, args: unknown) => {
  const response = await tool.invoke(args) as { isError?: boolean; content: Array<{ text: string }> };
  return { isError: response.isError, result: JSON.parse(response.content[0].text) };
};

const template = {
  id: 'template_1',
  metadata: { name: 'Card', version: '1.0.0', createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  variables: [],
  components: [{ id: 'title', type: 'text', position: { x: 0, y: 20, width: 200, height: 30 }, content: 'Hi' }],
  layout: { width: 300, height: 100 }
};

describe('advertised input schemas', () => {
  test.each(tools.map(([tool, schema]) => [tool.name, tool, schema] as const))(
    '%s advertises the schema its handler validates with',
    (_name, tool, schema) => {
      const { $schema: _draft, ...generated } = z.toJSONSchema(schema, { io: 'input' });
      expect(tool.inputSchema).toEqual(generated);
      expect(tool.inputSchema).toHaveProperty('type', 'object');
    }
  );

  test('render and validate advertise the full template, not an empty object', () => {
    for (const tool of [templateRenderTool, templateValidateTool]) {
      expect(Object.keys(properties(tool).template.properties)).toEqual(expect.arrayContaining([
        'id', 'metadata', 'variables', 'components', 'layout'
      ]));
    }
  });

  test('advertises the component shape that is checked one component at a time', () => {
    const item = properties(templateCreateTool).template.properties.components.items;
    expect(item.required).toEqual(['id', 'type', 'position']);
    expect(item.properties.type.enum).toContain('text');
  });

  test('names the recursive variable definition', () => {
    expect(properties(templateCreateTool).template.properties.variables.items).toEqual({ $ref: '#/$defs/VariableDefinition' });
  });

  test('advertises the defaults the handlers apply', () => {
    expect(properties(templateRenderTool).format.default).toBe('svg');
    expect(properties(templateRenderTool).options.properties.includeMetadata.default).toBe(true);
    expect(properties(templateValidateTool).options.properties.strict.default).toBe(false);
    expect(properties(templateLibraryAddTool).library.default).toBe('default');
    expect(properties(templateLibraryComposeTool).layout.properties.type.default).toBe('absolute');
  });

  test('keeps the field descriptions', () => {
    expect(properties(templateRenderTool).template.description).toMatch(/returned by template.create/);
    expect(properties(templateExportTool).options.properties.margin.description).toMatch(/points/);
    expect(properties(templateLibraryAddTool).component.properties.preview.description).toMatch(/preview/);
    expect(properties(templateLibraryComposeTool).components.description).toMatch(/Component IDs/);
    expect(properties(templateExportTool).template.type).toBe('object');
  });
});

describe('template.library.compose validates its input', () => {
  test('rejects a layout without a width', async () => {
    const { isError, result } = await call(templateLibraryComposeTool, {
      components: ['x'],
      layout: { height: 100 },
      metadata: { name: 'Composed' }
    });
    expect(isError).toBe(true);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/layout\.width/);
  });

  test('rejects an empty component list', async () => {
    const { isError } = await call(templateLibraryComposeTool, {
      components: [],
      layout: { width: 100, height: 100 },
      metadata: { name: 'Composed' }
    });
    expect(isError).toBe(true);
  });
});

describe('isError', () => {
  test('flags a schema failure as an error in every tool', async () => {
    for (const [tool] of tools) {
      const { isError, result } = await call(tool, {});
      expect({ tool: tool.name, isError, success: result.success })
        .toEqual({ tool: tool.name, isError: true, success: false });
    }
  });

  test('flags a template that fails validation in template.create', async () => {
    const { id: _id, ...definition } = template;
    const { isError } = await call(templateCreateTool, {
      template: { ...definition, metadata: { name: 'Card', version: '1.0.0' }, components: [{ id: 'x', type: 'nope', position: { x: 0, y: 0, width: 1, height: 1 } }] }
    });
    expect(isError).toBe(true);
  });

  test('does not flag a validation report: an invalid template is still a successful template.validate call', async () => {
    const { isError, result } = await call(templateValidateTool, {
      template: { ...template, components: [{ id: 'x', type: 'nope', position: { x: 0, y: 0, width: 1, height: 1 } }] }
    });
    expect(isError).toBeUndefined();
    expect(result.success).toBe(true);
  });

  test('does not flag a successful render', async () => {
    const { isError, result } = await call(templateRenderTool, { template, variables: {} });
    expect(result.success).toBe(true);
    expect(isError).toBeUndefined();
  });
});
