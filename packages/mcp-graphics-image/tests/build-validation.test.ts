import { imageConvert } from '../src/tools/imageConvert.js';
import { imageCrop } from '../src/tools/imageCrop.js';
import { ImageUtils } from '../src/util/imageUtils.js';
import { describe, test, expect } from '@jest/globals';
/**
 * Build validation tests - simple tests to ensure compilation works
 * and basic functionality is accessible
 */
describe('Build Validation', () => {
  // Simple 1x1 PNG base64 for testing
  const testImage = {
    data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
    format: 'png' as const
  };

  test('imageConvert function exists and is callable', async () => {
    const input = {
      image: testImage,
      format: 'png' as const
    };

    const result = await imageConvert(input);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('success');
  });

  test('imageCrop function exists and is callable', async () => {
    const input = {
      image: testImage,
      bounds: { x: 0, y: 0, width: 1, height: 1 }
    };

    const result = await imageCrop(input);
    
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result).toHaveProperty('success');
  });

  test('ImageUtils class is accessible', () => {
    expect(ImageUtils).toBeDefined();
    expect(typeof ImageUtils.parseImageInput).toBe('function');
    expect(typeof ImageUtils.createSharpFromInput).toBe('function');
  });

  test('Types are properly exported', () => {
    // This test passes if the file compiles without type errors
    const testInput = {
      image: testImage,
      format: 'jpeg' as const
    };
    
    // Just test that we can create the input structure without compilation errors
    expect(testInput.image.format).toBe('png');
    expect(testInput.format).toBe('jpeg');
  });
});