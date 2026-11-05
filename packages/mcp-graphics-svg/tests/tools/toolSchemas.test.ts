import { describe, test, expect } from '@jest/globals';
import { z } from 'zod';
import {
  SVGCreateInputSchema,
  SVGOptimizeInputSchema,
  SVGTransformInputSchema,
  SVGPathOperationsInputSchema
} from '../../src/types/svg.js';
import { svgCreateTool } from '../../src/tools/svgCreate.js';
import { svgOptimizeTool } from '../../src/tools/svgOptimize.js';
import { svgTransformTool } from '../../src/tools/svgTransform.js';
import { svgPathOperationsTool } from '../../src/tools/svgPathOperations.js';
import { wireframeToSvgTool, WireframeToSvgSchema } from '../../src/tools/wireframeToSvg.js';
import { svgbobToSvgTool, SvgbobToSvgSchema } from '../../src/tools/svgbobToSvg.js';

// The advertised schemas are plain JSON Schema objects; index them freely in assertions.
type JsonSchema = { [key: string]: any };

/** Each tool with the zod schema its handler validates input with */
const tools = [
  [svgCreateTool, SVGCreateInputSchema],
  [svgOptimizeTool, SVGOptimizeInputSchema],
  [svgTransformTool, SVGTransformInputSchema],
  [svgPathOperationsTool, SVGPathOperationsInputSchema],
  [wireframeToSvgTool, WireframeToSvgSchema],
  [svgbobToSvgTool, SvgbobToSvgSchema]
] as const;

const properties = (tool: { inputSchema: unknown }) => (tool.inputSchema as JsonSchema).properties;

describe('advertised input schemas', () => {
  test.each(tools.map(([tool, schema]) => [tool.name, tool, schema] as const))(
    '%s advertises the schema its handler validates with',
    (_name, tool, schema) => {
      const { $schema: _draft, ...generated } = z.toJSONSchema(schema, { io: 'input' });
      expect(tool.inputSchema).toEqual(generated);
      expect(tool.inputSchema).toHaveProperty('type', 'object');
    }
  );

  test('svg.create advertises the 10000px dimension limit it enforces', () => {
    expect(properties(svgCreateTool).width.maximum).toBe(10000);
    expect(properties(svgCreateTool).height.maximum).toBe(10000);
  });

  test('svg.create describes nested group elements with a named definition', () => {
    const schema = svgCreateTool.inputSchema as JsonSchema;
    expect(properties(svgCreateTool).elements.items).toEqual({ $ref: '#/$defs/SVGElement' });
    expect(schema.$defs.SVGElement.oneOf.length).toBeGreaterThan(5);
  });

  test('does not advertise options no handler reads', () => {
    expect(properties(svgPathOperationsTool)).not.toHaveProperty('precision');
    expect(properties(svgPathOperationsTool)).not.toHaveProperty('tolerance');
  });

  test('keeps the field descriptions', () => {
    expect(properties(svgCreateTool).width.description).toBe('SVG width in pixels');
    expect(properties(svgOptimizeTool).svg.description).toMatch(/DOCTYPE\/ENTITY declarations are rejected/);
    expect(properties(svgOptimizeTool).options.properties.precision.description).toMatch(/precision/);
    expect(properties(svgTransformTool).transforms.items.properties.element.description).toMatch(/ID selectors must match/);
    expect(properties(svgPathOperationsTool).operation.description).toMatch(/Boolean operation/);
  });
});

describe('svg.transform matrix', () => {
  test('applies a matrix transform, which was advertised and implemented but rejected', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect id="r" x="0" y="0" width="10" height="10"/></svg>';
    const result = await svgTransformTool.invoke({
      svg,
      transforms: [{ type: 'matrix', values: [1, 0, 0, 1, 10, 20], element: '#r' }]
    });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse(result.content[0].text).svg).toMatch(/transform="matrix\(1,\s*0,\s*0,\s*1,\s*10,\s*20\)"/);
  });
});

describe('isError', () => {
  const invalidCalls: Array<[string, typeof svgbobToSvgTool, unknown]> = [
    ['wireframe.to.svg', wireframeToSvgTool, { wireframe_text: 123 }],
    ['svgbob.to.svg', svgbobToSvgTool, { ascii_art: '+-+', stroke_color: 'not-a-color' }]
  ];

  test.each(invalidCalls)('%s returns invalid input as a structured error result', async (name, tool, args) => {
    const result = await tool.invoke(args);
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual(expect.objectContaining({
      error: true,
      code: 'INVALID_INPUT',
      tool: name
    }));
  });

  test('does not flag a successful conversion', async () => {
    const result = await svgbobToSvgTool.invoke({ ascii_art: '+-+\n| |\n+-+' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('<svg');
  });
});
