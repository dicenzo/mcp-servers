import { describe, test, expect } from '@jest/globals';
import { z } from 'zod';
import { McpError } from '@modelcontextprotocol/sdk/types.js';
import { imageConvertTool, ImageConvertInputSchema } from '../../src/tools/imageConvert';
import { imageResizeTool, ImageResizeInputSchema } from '../../src/tools/imageResize';
import { imageCropTool, ImageCropInputSchema } from '../../src/tools/imageCrop';
import { imageFilterTool, ImageFilterInputSchema } from '../../src/tools/imageFilter';
import { imageOptimizeTool, ImageOptimizeInputSchema } from '../../src/tools/imageOptimize';
import { imageCompositeTool, ImageCompositeInputSchema } from '../../src/tools/imageComposite';
import { callTool, tools as listedTools } from '../../src/callTool';

// The advertised schemas are plain JSON Schema objects; index them freely in assertions.
type JsonSchema = { [key: string]: any };

/** Each tool with the zod schema its handler validates input with */
const tools = [
  [imageConvertTool, ImageConvertInputSchema],
  [imageResizeTool, ImageResizeInputSchema],
  [imageCropTool, ImageCropInputSchema],
  [imageFilterTool, ImageFilterInputSchema],
  [imageOptimizeTool, ImageOptimizeInputSchema],
  [imageCompositeTool, ImageCompositeInputSchema]
] as const;

const properties = (tool: { inputSchema: unknown }) => (tool.inputSchema as JsonSchema).properties;

/** 1x1 white PNG */
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
const image = { data: tinyPng, format: 'png' };

describe('advertised input schemas', () => {
  test.each(tools.map(([tool, schema]) => [tool.name, tool, schema] as const))(
    '%s advertises the schema its handler validates with',
    (_name, tool, schema) => {
      const { $schema: _draft, ...generated } = z.toJSONSchema(schema, { io: 'input' });
      expect(tool.inputSchema).toEqual(generated);
      expect(tool.inputSchema).toHaveProperty('type', 'object');
    }
  );

  test('lists every tool', () => {
    expect(listedTools.map(tool => tool.name)).toEqual(tools.map(([tool]) => tool.name));
  });

  test('advertises the size limits that are enforced', () => {
    const imageInput = properties(imageResizeTool).image.properties;
    expect(imageInput.data.maxLength).toBeGreaterThan(0);
    expect(imageInput.width.maximum).toBe(8192);
    expect(properties(imageConvertTool).quality.type).toBe('integer');
  });

  test('keeps the field descriptions', () => {
    expect(properties(imageCropTool).image.properties.data.description).toBe('Base64 encoded image data');
    expect(properties(imageResizeTool).method.description).toBe('Interpolation method for resizing');
    expect(properties(imageConvertTool).quality.description).toMatch(/lossy formats/);
    expect(properties(imageCompositeTool).config.properties.background.description).toMatch(/transparent/);
  });
});

describe('callTool', () => {
  test('returns a successful call as JSON text without isError', async () => {
    const result = await callTool('image.convert', { image, format: 'webp' });
    expect(result.isError).toBeUndefined();
    expect(JSON.parse((result.content[0] as { text: string }).text).success).toBe(true);
  });

  test('returns a failed call as a result flagged isError, with the error as text', async () => {
    const result = await callTool('image.resize', { image, dimensions: { width: 1.5, height: 10 } });
    expect(result.isError).toBe(true);
    const error = JSON.parse((result.content[0] as { text: string }).text);
    expect(error).toEqual(expect.objectContaining({ code: 'INVALID_INPUT' }));
    expect(error.message).toContain('dimensions > width');
  });

  test('keeps an unknown tool a protocol error', async () => {
    await expect(callTool('image.nope', {})).rejects.toThrow(McpError);
  });
});
