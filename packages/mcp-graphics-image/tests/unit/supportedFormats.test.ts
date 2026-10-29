import { describe, test, expect } from '@jest/globals';
import { imageConvert } from '../../src/tools/imageConvert';
import { SupportedImageFormats } from '../../src/types/image';

// 1x1 white PNG
const testPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

describe('SupportedImageFormats', () => {
  test.each(SupportedImageFormats.map(f => [f]))('converts a PNG to advertised format %s', async (format) => {
    const result = await imageConvert({ image: { data: testPng, format: 'png' }, format });
    expect(result.success).toBe(true);
  });
});
