import { z } from 'zod';
import { SVGError, SVGErrorCode } from '../types/svg.js';

/**
 * Enhanced validation utility for SVG operations with comprehensive error handling
 */
export class SVGValidator {
  /**
   * Validates input against a Zod schema with enhanced error reporting
   */
  static validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
    try {
      return schema.parse(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError: SVGError = {
          code: SVGErrorCode.INVALID_INPUT,
          message: 'Input validation failed',
          details: {
            errors: error.errors.map(err => ({
              path: err.path.join('.'),
              message: err.message,
              received: (err as any).received || 'unknown'
            }))
          },
          suggestions: this.generateValidationSuggestions(error)
        };
        throw new Error(JSON.stringify(validationError));
      }
      throw error;
    }
  }

  /**
   * Validates SVG string format and structure
   */
  static validateSVGString(svgString: string): void {
    if (!svgString || typeof svgString !== 'string') {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_SVG,
        message: 'SVG input must be a non-empty string',
        suggestions: ['Provide a valid SVG string', 'Check that SVG content is not null or undefined']
      }));
    }

    // Basic SVG format validation
    const trimmed = svgString.trim();
    if (!trimmed.includes('<svg') || !trimmed.includes('</svg>')) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_SVG,
        message: 'Invalid SVG format - missing required SVG tags',
        suggestions: [
          'Ensure SVG string contains opening <svg> tag',
          'Ensure SVG string contains closing </svg> tag',
          'Validate SVG syntax using an online validator'
        ]
      }));
    }
  }

  /**
   * Validates SVG dimensions for performance constraints
   */
  static validateDimensions(width: number, height: number): void {
    const maxDimension = 10000;
    const maxArea = 50000000; // 50 megapixels

    if (width <= 0 || height <= 0) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_INPUT,
        message: 'SVG dimensions must be positive numbers',
        details: { width, height },
        suggestions: ['Use positive numbers for width and height']
      }));
    }

    if (width > maxDimension || height > maxDimension) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_INPUT,
        message: `SVG dimensions exceed maximum allowed size (${maxDimension}px)`,
        details: { width, height, maxDimension },
        suggestions: [`Reduce dimensions to ${maxDimension}px or smaller`]
      }));
    }

    if (width * height > maxArea) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_INPUT,
        message: `SVG area exceeds maximum allowed size (${maxArea} pixels)`,
        details: { area: width * height, maxArea },
        suggestions: ['Reduce overall SVG area by decreasing width or height']
      }));
    }
  }

  /**
   * Validates path data syntax
   */
  static validatePathData(pathData: string): void {
    if (!pathData || typeof pathData !== 'string') {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_INPUT,
        message: 'Path data must be a non-empty string',
        suggestions: ['Provide valid SVG path data', 'Check path data format']
      }));
    }

    // Basic path command validation - ensure path starts with M or m and has valid structure
    const pathCommandPattern = /^\s*[Mm]\s*[\d.-]+[\s,][\d.-]+/;
    if (!pathCommandPattern.test(pathData.trim())) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_INPUT,
        message: 'Invalid path data - no valid path commands found',
        details: { pathData: pathData.substring(0, 100) },
        suggestions: [
          'Use valid SVG path commands (M, L, C, Q, A, Z, etc.)',
          'Check SVG path syntax documentation',
          'Validate path data with an SVG path validator'
        ]
      }));
    }
  }

  /**
   * Validates color values (hex, rgb, named colors)
   */
  static validateColor(color: string): void {
    if (!color || typeof color !== 'string') return; // Optional colors are allowed

    const hexPattern = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    const rgbPattern = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/;
    const rgbaPattern = /^rgba\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)$/;
    const hslPattern = /^hsl\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)$/;
    const hslaPattern = /^hsla\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*,\s*([\d.]+)\s*\)$/;
    const namedColors = [
      'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
      'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
      'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue',
      'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgrey', 'darkgreen', 'darkkhaki',
      'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
      'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
      'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick',
      'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
      'gray', 'grey', 'green', 'greenyellow', 'honeydew', 'hotpink', 'indianred', 'indigo',
      'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue',
      'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgrey', 'lightgreen',
      'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
      'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen',
      'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
      'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
      'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite',
      'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
      'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink',
      'plum', 'powderblue', 'purple', 'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon',
      'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue',
      'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle',
      'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen',
      'transparent', 'none'
    ];

    const isValid = 
      hexPattern.test(color) ||
      rgbPattern.test(color) ||
      rgbaPattern.test(color) ||
      hslPattern.test(color) ||
      hslaPattern.test(color) ||
      namedColors.includes(color.toLowerCase());

    if (!isValid) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_INPUT,
        message: 'Invalid color format',
        details: { color },
        suggestions: [
          'Use hex format (#RGB or #RRGGBB)',
          'Use rgb format (rgb(r, g, b))',
          'Use rgba format (rgba(r, g, b, a))',
          'Use hsl format (hsl(h, s%, l%))',
          'Use hsla format (hsla(h, s%, l%, a))',
          'Use named colors (red, blue, green, etc.)'
        ]
      }));
    }
  }

  /**
   * Generates helpful suggestions based on validation errors
   */
  private static generateValidationSuggestions(error: z.ZodError): string[] {
    const suggestions: string[] = [];
    
    for (const issue of error.errors) {
      switch (issue.code) {
        case 'invalid_type':
          suggestions.push(`Expected ${issue.expected} for ${issue.path.join('.')}, received ${issue.received}`);
          break;
        case 'too_small':
          suggestions.push(`Value for ${issue.path.join('.')} must be at least ${issue.minimum}`);
          break;
        case 'too_big':
          suggestions.push(`Value for ${issue.path.join('.')} must be at most ${issue.maximum}`);
          break;
        case 'invalid_enum_value':
          suggestions.push(`Valid options for ${issue.path.join('.')} are: ${issue.options?.join(', ')}`);
          break;
        default:
          suggestions.push(`Fix validation error for ${issue.path.join('.')}: ${issue.message}`);
      }
    }
    
    return suggestions;
  }
}

/**
 * Performance validation utilities
 */
export class PerformanceValidator {
  /**
   * Validates operation complexity for performance constraints
   */
  static validateComplexity(elementCount: number, operationType: string): void {
    const maxElements = operationType === 'optimization' ? 1000 : 500;
    
    if (elementCount > maxElements) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.PERFORMANCE_TIMEOUT,
        message: `Operation complexity exceeds limits for ${operationType}`,
        details: { elementCount, maxElements, operationType },
        suggestions: [
          `Reduce number of elements to ${maxElements} or fewer`,
          'Consider breaking complex operations into smaller batches',
          'Use simpler elements where possible'
        ]
      }));
    }
  }

  /**
   * Creates a timeout wrapper for operations
   */
  static async withTimeout<T>(
    operation: Promise<T>, 
    timeoutMs: number, 
    operationName: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(JSON.stringify({
          code: SVGErrorCode.PERFORMANCE_TIMEOUT,
          message: `Operation '${operationName}' timed out after ${timeoutMs}ms`,
          suggestions: [
            'Reduce operation complexity',
            'Break operation into smaller parts',
            'Optimize input data'
          ]
        })));
      }, timeoutMs);
    });

    return Promise.race([operation, timeoutPromise]);
  }
}

/**
 * Sanitization utilities for SVG content
 */
export class SVGSanitizer {
  /**
   * Sanitizes SVG content to prevent XSS and other security issues
   */
  static sanitizeSVG(svgContent: string): string {
    // Remove potentially dangerous elements and attributes
    const dangerous = [
      /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
      /on\w+\s*=\s*["'][^"']*["']/gi, // Remove event handlers
      /javascript:/gi,
      /data:text\/html/gi
    ];

    let sanitized = svgContent;
    for (const pattern of dangerous) {
      sanitized = sanitized.replace(pattern, '');
    }

    return sanitized;
  }

  /**
   * Validates that SVG content is safe for processing
   */
  static validateSafeSVG(svgContent: string): void {
    const originalLength = svgContent.length;
    const sanitized = this.sanitizeSVG(svgContent);
    
    if (sanitized.length !== originalLength) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_SVG,
        message: 'SVG content contains potentially unsafe elements',
        suggestions: [
          'Remove script tags from SVG content',
          'Remove event handlers (onclick, onload, etc.)',
          'Remove javascript: URLs',
          'Use only standard SVG elements and attributes'
        ]
      }));
    }
  }
}