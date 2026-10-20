import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { TypographyValidator, PerformanceValidator } from '../../src/util/validation.js';
import { TypographyErrorCode } from '../../src/types/typography.js';
import { z } from 'zod';

describe('TypographyValidator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    const testSchema = z.object({
      text: z.string(),
      fontSize: z.number().positive()
    });

    test('should validate correct input', () => {
      const validInput = { text: 'Hello', fontSize: 16 };
      
      expect(() => {
        TypographyValidator.validateInput(testSchema, validInput);
      }).not.toThrow();
    });

    test('should reject invalid input type', () => {
      const invalidInput = { text: 'Hello', fontSize: 'invalid' };
      
      expect(() => {
        TypographyValidator.validateInput(testSchema, invalidInput);
      }).toThrow();
    });

    test('should provide detailed error information', () => {
      const invalidInput = { fontSize: -1 };
      
      try {
        TypographyValidator.validateInput(testSchema, invalidInput);
      } catch (error) {
        const errorData = JSON.parse((error as Error).message);
        expect(errorData.code).toBe(TypographyErrorCode.INVALID_INPUT);
        expect(errorData.details).toBeDefined();
        expect(errorData.suggestions).toBeDefined();
      }
    });
  });

  describe('Font File Validation', () => {
    test('should accept valid TTF signature', () => {
      const ttfBuffer = Buffer.from([0x00, 0x01, 0x00, 0x00, ...Array(1020).fill(0)]);
      
      expect(() => {
        TypographyValidator.validateFontFile(ttfBuffer);
      }).not.toThrow();
    });

    test('should accept valid OTF signature', () => {
      const otfBuffer = Buffer.from([0x4F, 0x54, 0x54, 0x4F, ...Array(1020).fill(0)]);
      
      expect(() => {
        TypographyValidator.validateFontFile(otfBuffer);
      }).not.toThrow();
    });

    test('should reject empty buffer', () => {
      const emptyBuffer = Buffer.alloc(0);
      
      expect(() => {
        TypographyValidator.validateFontFile(emptyBuffer);
      }).toThrow();
    });

    test('should reject oversized buffer', () => {
      const oversizedBuffer = Buffer.alloc(50 * 1024 * 1024); // 50MB
      
      expect(() => {
        TypographyValidator.validateFontFile(oversizedBuffer);
      }).toThrow();
    });

    test('should reject invalid font signature', () => {
      const invalidBuffer = Buffer.from([0xFF, 0xFF, 0xFF, 0xFF, ...Array(1020).fill(0)]);
      
      expect(() => {
        TypographyValidator.validateFontFile(invalidBuffer, 'test.font');
      }).toThrow();
    });
  });

  describe('Text Input Validation', () => {
    test('should accept valid text', () => {
      expect(() => {
        TypographyValidator.validateTextInput('Hello, World!');
      }).not.toThrow();
    });

    test('should reject empty text', () => {
      expect(() => {
        TypographyValidator.validateTextInput('');
      }).toThrow();
    });

    test('should reject text that is too long', () => {
      const longText = 'a'.repeat(20000);
      
      expect(() => {
        TypographyValidator.validateTextInput(longText);
      }).toThrow();
    });

    test('should warn about control characters', () => {
      const consoleWarn = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const textWithControl = 'Hello\x00World';
      
      TypographyValidator.validateTextInput(textWithControl);
      
      expect(consoleWarn).toHaveBeenCalled();
    });
  });

  describe('Unicode Range Validation', () => {
    test('should accept valid ranges', () => {
      const validRanges = [
        { start: 0x0000, end: 0x007F },
        { start: 0x0080, end: 0x00FF }
      ];
      
      expect(() => {
        TypographyValidator.validateUnicodeRanges(validRanges);
      }).not.toThrow();
    });

    test('should reject negative values', () => {
      const invalidRanges = [{ start: -1, end: 100 }];
      
      expect(() => {
        TypographyValidator.validateUnicodeRanges(invalidRanges);
      }).toThrow();
    });

    test('should reject inverted ranges', () => {
      const invalidRanges = [{ start: 100, end: 50 }];
      
      expect(() => {
        TypographyValidator.validateUnicodeRanges(invalidRanges);
      }).toThrow();
    });

    test('should reject values exceeding Unicode maximum', () => {
      const invalidRanges = [{ start: 0, end: 0x200000 }];
      
      expect(() => {
        TypographyValidator.validateUnicodeRanges(invalidRanges);
      }).toThrow();
    });
  });

  describe('Feature Tag Validation', () => {
    test('should accept valid feature tags', () => {
      const validFeatures = {
        'kern': true,
        'liga': false,
        'smcp': 1
      };
      
      expect(() => {
        TypographyValidator.validateFeatureTags(validFeatures);
      }).not.toThrow();
    });

    test('should reject invalid tag length', () => {
      const invalidFeatures = { 'k': true };
      
      expect(() => {
        TypographyValidator.validateFeatureTags(invalidFeatures);
      }).toThrow();
    });

    test('should reject invalid tag format', () => {
      const invalidFeatures = { 'ke$n': true };
      
      expect(() => {
        TypographyValidator.validateFeatureTags(invalidFeatures);
      }).toThrow();
    });

    test('should reject negative feature values', () => {
      const invalidFeatures = { 'kern': -1 };
      
      expect(() => {
        TypographyValidator.validateFeatureTags(invalidFeatures);
      }).toThrow();
    });
  });

  describe('Script and Language Validation', () => {
    test('should accept valid script and language codes', () => {
      expect(() => {
        TypographyValidator.validateScriptLanguage('latn', 'en');
      }).not.toThrow();
    });

    test('should reject invalid script code length', () => {
      expect(() => {
        TypographyValidator.validateScriptLanguage('lat', 'en');
      }).toThrow();
    });

    test('should reject invalid language code length', () => {
      expect(() => {
        TypographyValidator.validateScriptLanguage('latn', 'e');
      }).toThrow();
    });
  });
});

describe('PerformanceValidator', () => {
  beforeEach(() => {
    PerformanceValidator.resetMemoryTracking();
    jest.clearAllMocks();
  });

  describe('Complexity Validation', () => {
    test('should accept reasonable complexity', () => {
      expect(() => {
        PerformanceValidator.validateComplexity(100, 'text-shaping');
      }).not.toThrow();
    });

    test('should reject high complexity for font loading', () => {
      expect(() => {
        PerformanceValidator.validateComplexity(20, 'font-loading');
      }).toThrow();
    });

    test('should reject high complexity for text shaping', () => {
      expect(() => {
        PerformanceValidator.validateComplexity(20000, 'text-shaping');
      }).toThrow();
    });
  });

  describe('Memory Usage Tracking', () => {
    test('should track memory usage', () => {
      PerformanceValidator.trackMemoryUsage('test-operation', 1024);
      
      expect(PerformanceValidator.getMemoryUsage()).toBe(1024);
    });

    test('should release memory', () => {
      PerformanceValidator.trackMemoryUsage('test-operation', 2048);
      PerformanceValidator.releaseMemory(1024);
      
      expect(PerformanceValidator.getMemoryUsage()).toBe(1024);
    });

    test('should prevent negative memory usage', () => {
      PerformanceValidator.trackMemoryUsage('test-operation', 1024);
      PerformanceValidator.releaseMemory(2048);
      
      expect(PerformanceValidator.getMemoryUsage()).toBe(0);
    });

    test('should reject excessive memory usage', () => {
      const largeSize = 100 * 1024 * 1024; // 100MB
      
      expect(() => {
        PerformanceValidator.trackMemoryUsage('test-operation', largeSize);
      }).toThrow();
    });

    test('should reset memory tracking', () => {
      PerformanceValidator.trackMemoryUsage('test-operation', 1024);
      PerformanceValidator.resetMemoryTracking();
      
      expect(PerformanceValidator.getMemoryUsage()).toBe(0);
    });
  });

  describe('Timeout Validation', () => {
    test('should accept operations within timeout', () => {
      const recentTime = Date.now() - 50; // 50ms ago
      
      expect(() => {
        PerformanceValidator.validateTimeout('font-loading', recentTime);
      }).not.toThrow();
    });

    test('should reject operations exceeding timeout', () => {
      const oldTime = Date.now() - 5000; // 5 seconds ago
      
      expect(() => {
        PerformanceValidator.validateTimeout('font-loading', oldTime);
      }).toThrow();
    });

    test('should use appropriate timeouts for different operations', () => {
      const recentTime = Date.now() - 100; // 100ms ago
      
      // Should pass for font-loading (200ms timeout)
      expect(() => {
        PerformanceValidator.validateTimeout('font-loading', recentTime);
      }).not.toThrow();
      
      // Should fail for text-shaping (50ms timeout)
      expect(() => {
        PerformanceValidator.validateTimeout('text-shaping', recentTime);
      }).toThrow();
    });
  });
});