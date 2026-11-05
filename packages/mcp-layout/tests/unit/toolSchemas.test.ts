/// <reference types="jest" />
import { z } from 'zod';
import {
  CreateGridInputSchema,
  CreateFlexInputSchema,
  AddConstraintsInputSchema,
  AutoLayoutInputSchema,
  ResponsiveInputSchema,
  MeasureInputSchema
} from '../../src/types/layout.js';
import { createGridTool } from '../../src/tools/createGrid.js';
import { createFlexTool } from '../../src/tools/createFlex.js';
import { addConstraintsTool } from '../../src/tools/addConstraints.js';
import { autoLayoutTool } from '../../src/tools/autoLayout.js';
import { responsiveTool } from '../../src/tools/responsive.js';
import { measureTool } from '../../src/tools/measure.js';

// The advertised schemas are plain JSON Schema objects; index them freely in assertions.
type JsonSchema = { [key: string]: any };

/** Each tool with the zod schema its handler validates input with */
const tools = [
  [createGridTool, CreateGridInputSchema],
  [createFlexTool, CreateFlexInputSchema],
  [addConstraintsTool, AddConstraintsInputSchema],
  [autoLayoutTool, AutoLayoutInputSchema],
  [responsiveTool, ResponsiveInputSchema],
  [measureTool, MeasureInputSchema]
] as const;

const properties = (tool: { inputSchema: unknown }) => (tool.inputSchema as JsonSchema).properties;
const bounds = { x: 0, y: 0, width: 800, height: 600 };

const call = async (tool: { invoke: (args: unknown) => Promise<unknown> }, args: unknown) => {
  const response = await tool.invoke(args) as { isError?: boolean; content: Array<{ text: string }> };
  return { isError: response.isError, result: JSON.parse(response.content[0].text) };
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

  test('advertises the options each handler reads', () => {
    expect(properties(createGridTool).optimize).toEqual(expect.objectContaining({ type: 'boolean', default: true }));
    expect(properties(createFlexTool).optimize).toEqual(expect.objectContaining({ type: 'boolean', default: true }));
    expect(Object.keys(properties(responsiveTool))).toEqual(expect.arrayContaining([
      'breakpoints', 'generateOptimal', 'minViewport', 'maxViewport'
    ]));
    expect(Object.keys(properties(measureTool))).toEqual(expect.arrayContaining([
      'includeQualityReport', 'includeAccessibilityCheck', 'includePerformanceAnalysis'
    ]));
  });

  test('does not advertise options no handler reads', () => {
    expect(properties(addConstraintsTool)).not.toHaveProperty('maxIterations');
    expect(properties(addConstraintsTool)).not.toHaveProperty('convergenceThreshold');
  });

  test('advertises the limits that are enforced', () => {
    expect(properties(createGridTool).elements.maxItems).toBe(1000);
    expect(properties(createGridTool).config.properties.columns.maxLength).toBe(1000);
    expect(properties(addConstraintsTool).constraints.maxItems).toBe(5000);
  });

  test('keeps the field descriptions and examples', () => {
    const columns = properties(createGridTool).config.properties.columns;
    expect(columns.description).toMatch(/grid-template-columns/);
    expect(columns.examples).toContain('repeat(3, 1fr)');
    expect(properties(createFlexTool).elements.items.properties.flexBasis.description).toMatch(/flex-basis/);
    expect(properties(addConstraintsTool).constraints.items.properties.priority.description)
      .toMatch(/higher = more important/);
    expect(properties(measureTool).includeQualityReport.description).toMatch(/quality/);
  });
});

describe('limits that were advertised but not enforced', () => {
  test('rejects a negative element minWidth', async () => {
    const { isError } = await call(createGridTool, {
      config: { columns: '1fr', rows: 'auto' },
      elements: [{ id: 'a', minWidth: -10 }],
      bounds
    });
    expect(isError).toBe(true);
  });

  test('rejects a minViewport below 200', async () => {
    const { isError } = await call(responsiveTool, {
      elements: [{ id: 'a' }],
      baseLayout: { type: 'flex', config: {}, elements: [{ id: 'a' }], bounds },
      generateOptimal: true,
      minViewport: 100
    });
    expect(isError).toBe(true);
  });
});

describe('isError', () => {
  test('flags invalid input as an error', async () => {
    const { isError, result } = await call(createGridTool, {
      config: { columns: 'expx', rows: 'auto' },
      elements: [{ id: 'a' }],
      bounds
    });
    expect(isError).toBe(true);
    expect(result.success).toBe(false);
  });

  test('flags a schema failure as an error in every tool', async () => {
    for (const [tool] of tools) {
      const { isError } = await call(tool, {});
      expect({ tool: tool.name, isError }).toEqual({ tool: tool.name, isError: true });
    }
  });

  test('flags failed constraint validation as an error', async () => {
    const { isError } = await call(addConstraintsTool, {
      elements: [{ id: 'a' }],
      // Two equal-priority values for the same property conflict
      constraints: [
        { type: 'position', element: 'a', property: 'x', value: 10 },
        { type: 'position', element: 'a', property: 'x', value: 20 }
      ],
      bounds
    });
    expect(isError).toBe(true);
  });

  test('does not flag a successful call', async () => {
    const { isError, result } = await call(createGridTool, {
      config: { columns: '1fr 1fr', rows: 'auto' },
      elements: [{ id: 'a' }],
      bounds
    });
    expect(result.success).toBe(true);
    expect(isError).toBeUndefined();
  });
});

describe('layouts passed back in advertise only the fields each tool reads', () => {
  const size = (tool: { inputSchema: unknown }) => JSON.stringify(tool.inputSchema).length;
  const gridLayout = async () => (await call(createGridTool, {
    config: { columns: '1fr 1fr', rows: 'auto' },
    elements: [{ id: 'a' }, { id: 'b' }],
    bounds
  })).result.layout;

  test('layout.measure takes a layout of type, bounds and computed positions', async () => {
    const variants = properties(measureTool).layout.anyOf as JsonSchema[];
    for (const variant of variants) {
      expect(variant.properties).not.toHaveProperty('config');
      expect(variant.properties).not.toHaveProperty('elements');
      expect(variant.required).toEqual(['type', 'bounds']);
    }
    expect(size(measureTool)).toBeLessThan(5500);

    const { isError, result } = await call(measureTool, {
      layout: {
        type: 'grid',
        bounds,
        computedGrid: { elementPositions: [{ id: 'a', bounds: { x: 0, y: 0, width: 400, height: 100 } }] }
      },
      elements: [{ id: 'a' }]
    });
    expect(isError).toBeUndefined();
    expect(result.success).toBe(true);
  });

  test('layout.measure still accepts the full layout returned by layout.createGrid', async () => {
    const { isError, result } = await call(measureTool, { layout: await gridLayout(), elements: [{ id: 'a' }, { id: 'b' }] });
    expect(isError).toBeUndefined();
    expect(result.metrics.elementCount).toBe(2);
  });

  test('layout.responsive takes a base layout without computed positions', async () => {
    const variants = properties(responsiveTool).baseLayout.anyOf as JsonSchema[];
    expect(variants.map(variant => Object.keys(variant.properties).sort())).toEqual([
      ['bounds', 'config', 'elements', 'type'],
      ['bounds', 'config', 'elements', 'type']
    ]);
    expect(size(responsiveTool)).toBeLessThan(10500);

    const { isError, result } = await call(responsiveTool, { elements: [{ id: 'a' }, { id: 'b' }], baseLayout: await gridLayout() });
    expect(isError).toBeUndefined();
    expect(result.success).toBe(true);
  });
});
