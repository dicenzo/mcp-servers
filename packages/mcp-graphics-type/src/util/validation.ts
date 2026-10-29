import { z } from 'zod';
import { TypographyErrorCode, PERFORMANCE_LIMITS } from '../types/typography.js';

/**
 * Typography Validator - Handles input validation and font validation
 */
export class TypographyValidator {
  /**
   * Validates input against a Zod schema
   */
  static validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
    try {
      return schema.parse(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const details = error.errors.map(err => ({
          path: err.path.join('.'),
          message: err.message,
          received: err.code === 'invalid_type' ? (err as any).received : undefined
        }));
        
        const errorMessage = JSON.stringify({
          code: TypographyErrorCode.INVALID_INPUT,
          message: 'Input validation failed',
          details: details,
          suggestions: [
            'Check the input format against the expected schema',
            'Ensure all required fields are provided',
            'Verify data types match the schema requirements'
          ]
        });
        throw new Error(errorMessage);
      }
      throw error;
    }
  }

  /**
   * Validates font file size and format
   */
  static validateFontFile(buffer: Buffer, filename?: string): void {
    if (buffer.length === 0) {
      throw new Error(JSON.stringify({
        code: TypographyErrorCode.FONT_LOAD_FAILED,
        message: 'Empty font file',
        suggestions: ['Verify the font file is not corrupted', 'Check file path is correct']
      }));
    }

    if (buffer.length > PERFORMANCE_LIMITS.MAX_FONT_FILE_SIZE) {
      throw new Error(JSON.stringify({
        code: TypographyErrorCode.FONT_LOAD_FAILED,
        message: `Font file too large: ${buffer.length} bytes (max: ${PERFORMANCE_LIMITS.MAX_FONT_FILE_SIZE} bytes)`,
        suggestions: [
          'Use font subsetting to reduce file size',
          'Consider using a more compressed format like WOFF2',
          'Split large font families into separate files'
        ]
      }));
    }

    // Validate basic font signatures
    const signature = buffer.subarray(0, 4);
    const validSignatures = [
      Buffer.from([0x00, 0x01, 0x00, 0x00]), // TrueType
      Buffer.from([0x4F, 0x54, 0x54, 0x4F]), // OpenType (OTTO)
      Buffer.from([0x74, 0x72, 0x75, 0x65]), // TrueType ('true')
      Buffer.from([0x77, 0x4F, 0x46, 0x46]), // WOFF
      Buffer.from([0x77, 0x4F, 0x46, 0x32])  // WOFF2
    ];

    const isValidSignature = validSignatures.some(validSig => signature.equals(validSig));
    if (!isValidSignature) {
      const signatureHex = signature.toString('hex');
      throw new Error(JSON.stringify({
        code: TypographyErrorCode.UNSUPPORTED_FORMAT,
        message: `Invalid font file signature: ${signatureHex}`,
        details: { filename, signature: signatureHex },
        suggestions: [
          'Ensure the file is a valid font format (TTF, OTF, WOFF, WOFF2)',
          'Check if the file is corrupted during transfer',
          'Verify the file extension matches the actual format'
        ]
      }));
    }
  }

  /**
   * Validates text input for processing
   */
  static validateTextInput(text: string): void {
    if (text.length === 0) {
      throw new Error(JSON.stringify({
        code: TypographyErrorCode.INVALID_INPUT,
        message: 'Empty text input',
        suggestions: ['Provide non-empty text for processing']
      }));
    }

    if (text.length > PERFORMANCE_LIMITS.MAX_TEXT_LENGTH) {
      throw new Error(JSON.stringify({
        code: TypographyErrorCode.INVALID_INPUT,
        message: `Text too long: ${text.length} characters (max: ${PERFORMANCE_LIMITS.MAX_TEXT_LENGTH})`,
        suggestions: [
          'Split long text into smaller chunks',
          'Process text in segments for better performance'
        ]
      }));
    }

    // Check for potentially problematic characters
    // Matching control characters is the point of this check
    // eslint-disable-next-line no-control-regex
    const controlChars = text.match(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g);
    if (controlChars) {
      console.warn(`[Typography Validator] Text contains control characters: ${controlChars.map(c => c.charCodeAt(0).toString(16)).join(', ')}`);
    }
  }

  /**
   * Validates Unicode ranges for subsetting
   */
  static validateUnicodeRanges(ranges: { start: number; end: number }[]): void {
    for (const range of ranges) {
      if (range.start < 0 || range.end < 0) {
        throw new Error(JSON.stringify({
          code: TypographyErrorCode.INVALID_INPUT,
          message: 'Unicode range values cannot be negative',
          details: { range },
          suggestions: ['Use valid Unicode codepoint values (0-0x10FFFF)']
        }));
      }

      if (range.start > range.end) {
        throw new Error(JSON.stringify({
          code: TypographyErrorCode.INVALID_INPUT,
          message: 'Unicode range start cannot be greater than end',
          details: { range },
          suggestions: ['Ensure start <= end for all ranges']
        }));
      }

      if (range.end > 0x10FFFF) {
        throw new Error(JSON.stringify({
          code: TypographyErrorCode.INVALID_INPUT,
          message: 'Unicode range end exceeds maximum Unicode value',
          details: { range, maxValue: 0x10FFFF },
          suggestions: ['Use Unicode codepoints within the valid range (0-0x10FFFF)']
        }));
      }
    }
  }

  /**
   * Validates font feature tags
   */
  static validateFeatureTags(features: Record<string, boolean | number>): void {
    const validTagPattern = /^[a-zA-Z0-9]{4}$/;
    
    for (const [tag, value] of Object.entries(features)) {
      if (!validTagPattern.test(tag)) {
        throw new Error(JSON.stringify({
          code: TypographyErrorCode.INVALID_INPUT,
          message: `Invalid feature tag format: ${tag}`,
          details: { tag, expectedFormat: 'Four alphanumeric characters' },
          suggestions: [
            'Use standard OpenType feature tags (e.g., "kern", "liga", "smcp")',
            'Ensure tag is exactly 4 characters long',
            'Use only alphanumeric characters'
          ]
        }));
      }

      if (typeof value === 'number' && (value < 0 || !Number.isInteger(value))) {
        throw new Error(JSON.stringify({
          code: TypographyErrorCode.INVALID_INPUT,
          message: `Invalid feature value: ${value}`,
          details: { tag, value },
          suggestions: [
            'Use boolean values (true/false) or positive integers',
            'Negative values are not supported for feature settings'
          ]
        }));
      }
    }
  }

  /**
   * Validates script and language codes
   */
  static validateScriptLanguage(script: string, language: string): void {
    // Script codes are 4 characters
    if (script.length !== 4) {
      throw new Error(JSON.stringify({
        code: TypographyErrorCode.INVALID_INPUT,
        message: `Invalid script code length: ${script}`,
        details: { script, expectedLength: 4 },
        suggestions: [
          'Use ISO 15924 script codes (4 characters)',
          'Common examples: "latn", "arab", "cyrl", "grek"'
        ]
      }));
    }

    // Language codes are typically 2-3 characters, 'und' for undefined
    if (language.length < 2 || language.length > 3) {
      throw new Error(JSON.stringify({
        code: TypographyErrorCode.INVALID_INPUT,
        message: `Invalid language code length: ${language}`,
        details: { language, expectedLength: '2-3 characters' },
        suggestions: [
          'Use ISO 639 language codes (2-3 characters)',
          'Use "und" for undefined language',
          'Common examples: "en", "fr", "de", "zh"'
        ]
      }));
    }
  }
}

/**
 * Performance Validator - Handles performance constraints and monitoring
 */
export class PerformanceValidator {
  private static memoryUsage = 0;

  /**
   * Validates operation complexity to prevent performance issues
   */
  static validateComplexity(itemCount: number, operation: string): void {
    let maxItems: number;
    
    switch (operation) {
      case 'font-loading':
        maxItems = 10; // Max fonts to load simultaneously
        break;
      case 'text-shaping':
        maxItems = PERFORMANCE_LIMITS.MAX_TEXT_LENGTH;
        break;
      case 'font-subsetting':
        maxItems = PERFORMANCE_LIMITS.MAX_GLYPHS_PER_FONT;
        break;
      default:
        maxItems = 1000;
    }

    if (itemCount > maxItems) {
      throw new Error(JSON.stringify({
        code: TypographyErrorCode.PERFORMANCE_TIMEOUT,
        message: `Operation complexity too high: ${itemCount} items (max: ${maxItems} for ${operation})`,
        details: { operation, itemCount, maxItems },
        suggestions: [
          'Reduce the scope of the operation',
          'Process items in smaller batches',
          'Consider using a more efficient approach'
        ]
      }));
    }
  }

  /**
   * Tracks memory usage for operations
   */
  static trackMemoryUsage(operation: string, size: number): void {
    this.memoryUsage += size;
    
    if (this.memoryUsage > PERFORMANCE_LIMITS.MAX_MEMORY_USAGE) {
      throw new Error(JSON.stringify({
        code: TypographyErrorCode.MEMORY_LIMIT_EXCEEDED,
        message: `Memory limit exceeded: ${this.memoryUsage} bytes (max: ${PERFORMANCE_LIMITS.MAX_MEMORY_USAGE} bytes)`,
        details: { operation, currentUsage: this.memoryUsage, maxUsage: PERFORMANCE_LIMITS.MAX_MEMORY_USAGE },
        suggestions: [
          'Process smaller batches of data',
          'Release unused font resources',
          'Use streaming for large operations'
        ]
      }));
    }
  }

  /**
   * Releases tracked memory usage
   */
  static releaseMemory(size: number): void {
    this.memoryUsage = Math.max(0, this.memoryUsage - size);
  }

  /**
   * Gets current memory usage
   */
  static getMemoryUsage(): number {
    return this.memoryUsage;
  }

  /**
   * Resets memory tracking
   */
  static resetMemoryTracking(): void {
    this.memoryUsage = 0;
  }

  /**
   * Validates timeout constraints
   */
  static validateTimeout(operation: string, startTime: number): void {
    const elapsed = Date.now() - startTime;
    let maxTime: number;

    switch (operation) {
      case 'font-loading':
        maxTime = PERFORMANCE_LIMITS.FONT_LOADING_TIMEOUT;
        break;
      case 'text-shaping':
        maxTime = PERFORMANCE_LIMITS.TEXT_SHAPING_TIMEOUT;
        break;
      case 'font-subsetting':
        maxTime = PERFORMANCE_LIMITS.FONT_SUBSETTING_TIMEOUT;
        break;
      default:
        maxTime = 1000; // Default 1 second
    }

    if (elapsed > maxTime) {
      throw new Error(JSON.stringify({
        code: TypographyErrorCode.PERFORMANCE_TIMEOUT,
        message: `Operation timeout: ${elapsed}ms (max: ${maxTime}ms for ${operation})`,
        details: { operation, elapsed, maxTime },
        suggestions: [
          'Reduce the complexity of the operation',
          'Use smaller input data',
          'Consider caching results for similar operations'
        ]
      }));
    }
  }
}