import { describe, test, expect } from '@jest/globals';
import {
  LoadFontInputSchema,
  ShapeTextInputSchema,
  MeasureTextInputSchema,
  SubsetFontInputSchema,
  GenerateFallbackInputSchema,
  ValidateFontInputSchema
} from '../../src/types/typography.js';
import { toolInputSchema } from '../../src/util/toolSchema.js';
import { loadFontTool } from '../../src/tools/loadFont.js';
import { shapeTextTool } from '../../src/tools/shapeText.js';
import { measureTextTool } from '../../src/tools/measureText.js';
import { subsetFontTool } from '../../src/tools/subsetFont.js';
import { generateFallbackTool } from '../../src/tools/generateFallback.js';
import { validateFontTool } from '../../src/tools/validateFont.js';

// The advertised schemas are plain JSON Schema objects; index them freely in assertions.
type JsonSchema = { [key: string]: any };

/** Each tool with the zod schema its handler validates input with */
const tools = [
  [loadFontTool, LoadFontInputSchema],
  [shapeTextTool, ShapeTextInputSchema],
  [measureTextTool, MeasureTextInputSchema],
  [subsetFontTool, SubsetFontInputSchema],
  [generateFallbackTool, GenerateFallbackInputSchema],
  [validateFontTool, ValidateFontInputSchema]
] as const;

const schemaOf = (tool: { inputSchema: unknown }) => tool.inputSchema as JsonSchema;

describe('advertised input schemas', () => {
  test.each(tools.map(([tool, schema]) => [tool.name, tool, schema] as const))(
    '%s advertises the schema its handler validates with',
    (_name, tool, schema) => {
      expect(tool.inputSchema).toEqual(toolInputSchema(schema));
      expect(tool.inputSchema).toHaveProperty('type', 'object');
      expect(tool.inputSchema).not.toHaveProperty('anyOf');
    }
  );

  test('type.loadFont flattens the font input union into one object', () => {
    const schema = schemaOf(loadFontTool);
    expect(schema.properties.type.enum).toEqual(['file', 'buffer', 'url', 'system']);
    expect(Object.keys(schema.properties).sort()).toEqual(['data', 'format', 'name', 'path', 'type', 'url']);
    expect(schema.required).toEqual(['type']);
  });

  test('advertises font data as base64 text, not the in-process Buffer alternative', () => {
    expect(schemaOf(loadFontTool).properties.data).toEqual(expect.objectContaining({ type: 'string' }));
    const bufferFont = schemaOf(shapeTextTool).properties.font.anyOf
      .find((member: JsonSchema) => member.properties.type.const === 'buffer');
    expect(bufferFont.properties.data).toEqual(expect.objectContaining({ type: 'string' }));
  });

  test('nested font inputs keep the strict union of the four sources', () => {
    expect(schemaOf(measureTextTool).properties.font.anyOf.map((member: JsonSchema) => member.properties.type.const))
      .toEqual(['file', 'buffer', 'url', 'system']);
  });

  test('keeps the field descriptions', () => {
    expect(schemaOf(loadFontTool).properties.url.description).toMatch(/https:\/\/ URL/);
    expect(schemaOf(loadFontTool).properties.name.description).toMatch(/PostScript name/);
    expect(schemaOf(shapeTextTool).properties.options.properties.script.description).toMatch(/ISO 15924/);
    expect(schemaOf(subsetFontTool).properties.options.properties.desubroutinize.description).toMatch(/subroutines/);
    expect(schemaOf(generateFallbackTool).properties.includeWebFonts.description).toMatch(/web font/);
    expect(schemaOf(validateFontTool).properties.options.properties.maxFileSize.description).toMatch(/bytes/);
  });
});

describe('isError', () => {
  test('flags invalid input as an error', async () => {
    const result = await measureTextTool.invoke({ text: 'Hi', font: { type: 'system', name: 'x' }, fontSize: -1 });
    expect(result.isError).toBe(true);
    expect(JSON.parse(result.content[0].text)).toEqual(expect.objectContaining({ error: true, code: 'INVALID_INPUT' }));
  });
});
