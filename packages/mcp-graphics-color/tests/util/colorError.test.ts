import { ColorProcessingError } from '../../src/util/colorError.js';
import { ColorErrorCode } from '../../src/types/color.js';
import { describe, test, expect } from '@jest/globals';

describe('ColorProcessingError', () => {
  test('is an Error whose message is the plain message, not JSON', () => {
    const error = new ColorProcessingError({
      code: ColorErrorCode.INVALID_COLOR,
      message: 'Failed to parse color input'
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ColorProcessingError');
    expect(error.message).toBe('Failed to parse color input');
    expect(error.code).toBe(ColorErrorCode.INVALID_COLOR);
  });

  test('round-trips all fields through toColorError', () => {
    const colorError = {
      code: ColorErrorCode.PROCESSING_FAILED,
      message: 'Failed to calculate Delta E',
      details: { error: 'boom' },
      suggestions: ['Ensure both colors are valid']
    };

    expect(new ColorProcessingError(colorError).toColorError()).toEqual(colorError);
  });

  test('omits absent optional fields from toColorError', () => {
    const result = new ColorProcessingError({
      code: ColorErrorCode.INVALID_COLOR,
      message: 'Bad color'
    }).toColorError();

    expect(Object.keys(result).sort()).toEqual(['code', 'message']);
  });
});
