import { describe, test, expect } from '@jest/globals';
import { z } from 'zod';
import {
  ColorConvertInputSchema,
  ColorContrastInputSchema,
  ColorPaletteInputSchema,
  ColorBrandMatchInputSchema,
  ColorBrandLintInputSchema
} from '../src/types/color.js';
import { colorConvertTool } from '../src/tools/colorConvert.js';
import { colorContrastTool } from '../src/tools/colorContrast.js';
import { colorGeneratePaletteTool } from '../src/tools/colorGeneratePalette.js';
import { colorBrandMatchTool } from '../src/tools/colorBrandMatch.js';
import { colorLintBrandTool } from '../src/tools/colorLintBrand.js';
import {
  colorValidateAccessibilityTool,
  ColorValidateAccessibilityInputSchema
} from '../src/tools/colorValidateAccessibility.js';

// The advertised schemas are plain JSON Schema objects; index them freely in assertions.
type JsonSchema = { [key: string]: any };

/** Each tool with the zod schema its handler validates input with */
const tools = [
  [colorConvertTool, ColorConvertInputSchema],
  [colorContrastTool, ColorContrastInputSchema],
  [colorGeneratePaletteTool, ColorPaletteInputSchema],
  [colorBrandMatchTool, ColorBrandMatchInputSchema],
  [colorLintBrandTool, ColorBrandLintInputSchema],
  [colorValidateAccessibilityTool, ColorValidateAccessibilityInputSchema]
] as const;

const objectColor = expect.objectContaining({ type: 'object', required: ['space', 'values'] });
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

  test('every color input accepts object colors, not just strings', () => {
    expect(properties(colorContrastTool).foreground.anyOf).toEqual(expect.arrayContaining([objectColor]));
    expect(properties(colorContrastTool).background.anyOf).toEqual(expect.arrayContaining([objectColor]));
    expect(properties(colorLintBrandTool).palette.items.anyOf).toEqual(expect.arrayContaining([objectColor]));
    expect(properties(colorValidateAccessibilityTool).colors.items.anyOf)
      .toEqual(expect.arrayContaining([objectColor]));
  });

  test('color.lintBrand advertises every rule and the context options', () => {
    const lint = properties(colorLintBrandTool);
    expect(Object.keys(lint.rules.properties)).toEqual(expect.arrayContaining([
      'minContrast', 'allowedColors', 'forbiddenColors', 'maxDeltaE', 'requiredAccessibility'
    ]));
    expect(lint.context.properties).toHaveProperty('includeAPCA');
  });

  test('keeps the field descriptions', () => {
    expect(properties(colorGeneratePaletteTool).count.description).toBe('Total colors, including any lockedColors');
    expect(properties(colorGeneratePaletteTool).options.properties.lightnessRange.description)
      .toMatch(/lightness in percent/);
    expect(properties(colorBrandMatchTool).maxAlternatives.description).toBe('How many runner-up matches to return');
    expect(properties(colorLintBrandTool).rules.properties.maxDeltaE.description).toMatch(/CIEDE2000/);
  });

  test('advertises the defaults the handler applies', () => {
    expect(properties(colorConvertTool).precision.default).toBe(3);
  });
});
