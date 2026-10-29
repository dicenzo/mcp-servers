import { ColorUtils } from '../../src/util/colorUtils.js';
import { describe, test, expect } from '@jest/globals';

// hsla and rgba are hsl and rgb with alpha; the Color object carries alpha separately.
describe('hsla and rgba color spaces', () => {
  const halfRed = { space: 'srgb' as const, values: [1, 0, 0], alpha: 0.5 };

  test('converts to hsla, keeping alpha', () => {
    const result = ColorUtils.convertColor(halfRed, 'hsla');
    expect(result.space).toBe('hsla');
    expect(result.values).toEqual([0, 1, 0.5]);
    expect(result.alpha).toBe(0.5);
  });

  test('converts to rgba, keeping alpha', () => {
    const result = ColorUtils.convertColor(halfRed, 'rgba');
    expect(result.space).toBe('rgba');
    expect(result.values).toEqual([1, 0, 0]);
    expect(result.alpha).toBe(0.5);
  });

  test('converts from hsla', () => {
    const result = ColorUtils.convertColor({ space: 'hsla', values: [120, 1, 0.5], alpha: 0.25 }, 'rgb');
    expect(result.values).toEqual([0, 1, 0]);
    expect(result.alpha).toBe(0.25);
  });

  test('converts from rgba', () => {
    const result = ColorUtils.convertColor({ space: 'rgba', values: [0, 0, 1], alpha: 0.75 }, 'hsl');
    expect(result.values).toEqual([240, 1, 0.5]);
    expect(result.alpha).toBe(0.75);
  });
});
