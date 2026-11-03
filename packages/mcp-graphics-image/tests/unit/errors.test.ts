import { describe, test, expect } from '@jest/globals';
import { ImageErrorCode } from '../../src/types/image';
import { imageResize } from '../../src/tools/imageResize';
import { imageConvert } from '../../src/tools/imageConvert';
import { imageCrop } from '../../src/tools/imageCrop';
import { imageFilter } from '../../src/tools/imageFilter';
import { imageOptimize } from '../../src/tools/imageOptimize';
import { imageComposite } from '../../src/tools/imageComposite';

/** 1x1 white PNG */
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
const image = { data: tinyPng, format: 'png' };

interface ToolError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
}

describe('validation errors', () => {
  const invalidCalls: Array<[string, () => Promise<{ success: boolean; error?: unknown }>, string]> = [
    ['image.resize', () => imageResize({ image, dimensions: { width: 1.5, height: 10 } }), 'dimensions > width'],
    ['image.convert', () => imageConvert({ image, format: 'bmp' }), 'format'],
    ['image.crop', () => imageCrop({ image, bounds: { x: -1, y: 0, width: 1, height: 1 } }), 'bounds > x'],
    ['image.filter', () => imageFilter({ image, filters: [] }), 'filters'],
    ['image.optimize', () => imageOptimize({ image, options: { target: 'tv' } }), 'options > target'],
    ['image.composite', () => imageComposite({ config: { width: 10, height: 10 } }), 'config > layers']
  ];

  test.each(invalidCalls)('%s returns INVALID_INPUT naming the field', async (_name, call, field) => {
    const result = await call();
    expect(result.success).toBe(false);
    const error = (result as unknown as { error: ToolError }).error;
    expect(error.code).toBe(ImageErrorCode.INVALID_INPUT);
    expect(typeof error.message).toBe('string');
    expect(error.message).toContain(field);
    expect(Array.isArray(error.details?.issues)).toBe(true);
  });
});

describe('processing errors', () => {
  test('a structured error keeps its code and message', async () => {
    const result = await imageCrop({ image, bounds: { x: 0, y: 0, width: 5, height: 5 } });
    expect(result.success).toBe(false);
    const error = (result as unknown as { error: ToolError }).error;
    expect(typeof error.code).toBe('string');
    expect(typeof error.message).toBe('string');
    expect(error.message.startsWith('{')).toBe(false);
  });

  test('undecodable data reports DECODE_ERROR with a plain message', async () => {
    const result = await imageConvert({ image: { data: 'bm90IGFuIGltYWdl', format: 'png' }, format: 'jpeg' });
    expect(result.success).toBe(false);
    const error = (result as unknown as { error: ToolError }).error;
    expect(error.code).toBe(ImageErrorCode.DECODE_ERROR);
    expect(error.message.startsWith('{')).toBe(false);
  });
});
