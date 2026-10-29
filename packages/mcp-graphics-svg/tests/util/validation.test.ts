import { z } from 'zod';
import { SVGValidator, PerformanceValidator, SVGSanitizer } from '../../src/util/validation';
import { SVGErrorCode } from '../../src/types/svg';

describe('Validation Utilities', () => {
  describe('SVGValidator', () => {
    describe('validateInput', () => {
      const testSchema = z.object({
        name: z.string(),
        age: z.number().min(0).max(150),
        category: z.enum(['A', 'B', 'C'])
      });

      it('should validate correct input successfully', () => {
        const validInput = { name: 'John', age: 25, category: 'A' };
        const result = SVGValidator.validateInput(testSchema, validInput);
        expect(result).toEqual(validInput);
      });

      it('should throw structured error for invalid type', () => {
        const invalidInput = { name: 123, age: 25, category: 'A' };
        
        expect(() => SVGValidator.validateInput(testSchema, invalidInput)).toThrow();
        
        try {
          SVGValidator.validateInput(testSchema, invalidInput);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.code).toBe('INVALID_INPUT');
          expect(parsedError.message).toBe('Input validation failed');
          expect(parsedError.details.errors).toHaveLength(1);
          expect(parsedError.suggestions).toContain('Expected string for name, received number');
        }
      });

      it('should throw structured error for too small value', () => {
        const invalidInput = { name: 'John', age: -5, category: 'A' };
        
        try {
          SVGValidator.validateInput(testSchema, invalidInput);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.suggestions).toContain('Value for age must be at least 0');
        }
      });

      it('should throw structured error for too big value', () => {
        const invalidInput = { name: 'John', age: 200, category: 'A' };
        
        try {
          SVGValidator.validateInput(testSchema, invalidInput);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.suggestions).toContain('Value for age must be at most 150');
        }
      });

      it('should throw structured error for invalid enum value', () => {
        const invalidInput = { name: 'John', age: 25, category: 'D' };
        
        try {
          SVGValidator.validateInput(testSchema, invalidInput);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.suggestions).toContain('Valid options for category are: A, B, C');
        }
      });

      it('should handle multiple validation errors', () => {
        const invalidInput = { name: 123, age: -5, category: 'D' };
        
        try {
          SVGValidator.validateInput(testSchema, invalidInput);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.details.errors).toHaveLength(3);
        }
      });

      it('should handle non-ZodError exceptions', () => {
        const throwingSchema = {
          parse: () => { throw new Error('Custom error'); }
        } as any;
        
        expect(() => SVGValidator.validateInput(throwingSchema, {})).toThrow('Custom error');
      });

      it('should handle unknown validation issue codes', () => {
        const customSchema = z.object({}).refine(() => false, { message: 'Custom validation' });
        
        try {
          SVGValidator.validateInput(customSchema, {});
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.suggestions.some((s: string) => s.includes('Fix validation error'))).toBe(true);
        }
      });
    });

    describe('validateSVGString', () => {
      it('should validate correct SVG string', () => {
        const validSVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/></svg>';
        expect(() => SVGValidator.validateSVGString(validSVG)).not.toThrow();
      });

      it('should throw error for null/undefined input', () => {
        expect(() => SVGValidator.validateSVGString(null as any)).toThrow();
        expect(() => SVGValidator.validateSVGString(undefined as any)).toThrow();
        
        try {
          SVGValidator.validateSVGString(null as any);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.code).toBe('INVALID_SVG');
          expect(parsedError.message).toBe('SVG input must be a non-empty string');
        }
      });

      it('should throw error for non-string input', () => {
        expect(() => SVGValidator.validateSVGString(123 as any)).toThrow();
        
        try {
          SVGValidator.validateSVGString(123 as any);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.suggestions).toContain('Provide a valid SVG string');
        }
      });

      it('should throw error for empty string', () => {
        expect(() => SVGValidator.validateSVGString('')).toThrow();
      });

      it('should throw error for missing opening tag', () => {
        const invalidSVG = '<rect width="100" height="100"/></svg>';
        
        try {
          SVGValidator.validateSVGString(invalidSVG);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.message).toBe('Invalid SVG format - missing required SVG tags');
          expect(parsedError.suggestions).toContain('Ensure SVG string contains opening <svg> tag');
        }
      });

      it('should throw error for missing closing tag', () => {
        const invalidSVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="100"/>';
        
        try {
          SVGValidator.validateSVGString(invalidSVG);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.suggestions).toContain('Ensure SVG string contains closing </svg> tag');
        }
      });

      it('should handle SVG with whitespace', () => {
        const validSVG = '\n  <svg xmlns="http://www.w3.org/2000/svg">\n    <rect width="100" height="100"/>\n  </svg>\n  ';
        expect(() => SVGValidator.validateSVGString(validSVG)).not.toThrow();
      });
    });

    describe('validateDimensions', () => {
      it('should validate correct dimensions', () => {
        expect(() => SVGValidator.validateDimensions(100, 200)).not.toThrow();
        expect(() => SVGValidator.validateDimensions(1, 1)).not.toThrow();
        // Near the per-side limit (10000px) while staying under the 50MP area limit
        expect(() => SVGValidator.validateDimensions(9999, 5000)).not.toThrow();
      });

      it('should throw error for zero or negative dimensions', () => {
        expect(() => SVGValidator.validateDimensions(0, 100)).toThrow();
        expect(() => SVGValidator.validateDimensions(100, 0)).toThrow();
        expect(() => SVGValidator.validateDimensions(-50, 100)).toThrow();
        expect(() => SVGValidator.validateDimensions(100, -50)).toThrow();
        
        try {
          SVGValidator.validateDimensions(-10, -20);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.code).toBe('INVALID_INPUT');
          expect(parsedError.message).toBe('SVG dimensions must be positive numbers');
          expect(parsedError.details.width).toBe(-10);
          expect(parsedError.details.height).toBe(-20);
        }
      });

      it('should throw error for dimensions exceeding maximum', () => {
        expect(() => SVGValidator.validateDimensions(10001, 100)).toThrow();
        expect(() => SVGValidator.validateDimensions(100, 10001)).toThrow();
        
        try {
          SVGValidator.validateDimensions(15000, 100);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.message).toContain('SVG dimensions exceed maximum allowed size (10000px)');
          expect(parsedError.details.maxDimension).toBe(10000);
        }
      });

      it('should throw error for area exceeding maximum', () => {
        // 8000 * 7000 = 56,000,000 > 50,000,000
        expect(() => SVGValidator.validateDimensions(8000, 7000)).toThrow();
        
        try {
          SVGValidator.validateDimensions(8000, 7000);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.message).toContain('SVG area exceeds maximum allowed size (50000000 pixels)');
          expect(parsedError.details.area).toBe(56000000);
          expect(parsedError.details.maxArea).toBe(50000000);
        }
      });
    });

    describe('validatePathData', () => {
      it('should validate correct path data', () => {
        const validPaths = [
          'M 10 10 L 20 20',
          'M10,10 L20,20 Z',
          'm 0 0 l 10 10',
          'M 10 10 C 20 20, 30 30, 40 40',
          'M 10.5 20.7 L 30.2 40.1'
        ];
        
        validPaths.forEach(path => {
          expect(() => SVGValidator.validatePathData(path)).not.toThrow();
        });
      });

      it('should throw error for null/undefined input', () => {
        expect(() => SVGValidator.validatePathData(null as any)).toThrow();
        expect(() => SVGValidator.validatePathData(undefined as any)).toThrow();
        
        try {
          SVGValidator.validatePathData(null as any);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.message).toBe('Path data must be a non-empty string');
        }
      });

      it('should throw error for non-string input', () => {
        expect(() => SVGValidator.validatePathData(123 as any)).toThrow();
      });

      it('should throw error for empty string', () => {
        expect(() => SVGValidator.validatePathData('')).toThrow();
      });

      it('should throw error for invalid path data', () => {
        const invalidPaths = [
          'invalid path',
          'L 10 10', // Missing moveto command
          'just text',
          'X 10 10' // Invalid command
        ];
        
        invalidPaths.forEach(path => {
          try {
            SVGValidator.validatePathData(path);
          } catch (error) {
            const parsedError = JSON.parse((error as Error).message);
            expect(parsedError.message).toBe('Invalid path data - no valid path commands found');
            expect(parsedError.suggestions).toContain('Use valid SVG path commands (M, L, C, Q, A, Z, etc.)');
          }
        });
      });

      it('should handle path data with whitespace', () => {
        const pathWithWhitespace = '   M 10 10 L 20 20   ';
        expect(() => SVGValidator.validatePathData(pathWithWhitespace)).not.toThrow();
      });

      it('should truncate long path data in error details', () => {
        const longInvalidPath = 'X '.repeat(60); // 120 characters
        
        try {
          SVGValidator.validatePathData(longInvalidPath);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.details.pathData).toHaveLength(100);
        }
      });
    });

    describe('validateColor', () => {
      it('should validate hex colors', () => {
        const validHexColors = ['#FF0000', '#00ff00', '#0000FF', '#fff', '#000', '#123456'];
        validHexColors.forEach(color => {
          expect(() => SVGValidator.validateColor(color)).not.toThrow();
        });
      });

      it('should validate RGB colors', () => {
        const validRgbColors = ['rgb(255, 0, 0)', 'rgb(0,255,0)', 'rgb( 0 , 0 , 255 )'];
        validRgbColors.forEach(color => {
          expect(() => SVGValidator.validateColor(color)).not.toThrow();
        });
      });

      it('should validate RGBA colors', () => {
        const validRgbaColors = ['rgba(255, 0, 0, 1)', 'rgba(0,255,0,0.5)', 'rgba( 0 , 0 , 255 , 0.3 )'];
        validRgbaColors.forEach(color => {
          expect(() => SVGValidator.validateColor(color)).not.toThrow();
        });
      });

      it('should validate HSL colors', () => {
        const validHslColors = ['hsl(360, 100%, 50%)', 'hsl(0,0%,0%)', 'hsl( 180 , 50% , 25% )'];
        validHslColors.forEach(color => {
          expect(() => SVGValidator.validateColor(color)).not.toThrow();
        });
      });

      it('should validate HSLA colors', () => {
        const validHslaColors = ['hsla(360, 100%, 50%, 1)', 'hsla(0,0%,0%,0.5)', 'hsla( 180 , 50% , 25% , 0.8 )'];
        validHslaColors.forEach(color => {
          expect(() => SVGValidator.validateColor(color)).not.toThrow();
        });
      });

      it('should validate named colors', () => {
        const validNamedColors = ['red', 'blue', 'green', 'white', 'black', 'transparent', 'none', 'cornflowerblue'];
        validNamedColors.forEach(color => {
          expect(() => SVGValidator.validateColor(color)).not.toThrow();
        });
      });

      it('should validate named colors case-insensitively', () => {
        expect(() => SVGValidator.validateColor('RED')).not.toThrow();
        expect(() => SVGValidator.validateColor('Blue')).not.toThrow();
        expect(() => SVGValidator.validateColor('WHITE')).not.toThrow();
      });

      it('should allow empty/null colors (optional)', () => {
        expect(() => SVGValidator.validateColor('')).not.toThrow();
        expect(() => SVGValidator.validateColor(null as any)).not.toThrow();
        expect(() => SVGValidator.validateColor(undefined as any)).not.toThrow();
      });

      it('should throw error for invalid colors', () => {
        const invalidColors = ['#gg0000', 'rgb(256, 0, 0)', 'invalidcolor', '#12345', 'hsl(361, 100%, 50%)'];
        
        invalidColors.forEach(color => {
          try {
            SVGValidator.validateColor(color);
          } catch (error) {
            const parsedError = JSON.parse((error as Error).message);
            expect(parsedError.message).toBe('Invalid color format');
            expect(parsedError.details.color).toBe(color);
            expect(parsedError.suggestions).toContain('Use hex format (#RGB or #RRGGBB)');
          }
        });
      });

      it('should throw error for non-string colors', () => {
        expect(() => SVGValidator.validateColor(123 as any)).toThrow();
      });
    });
  });

  describe('PerformanceValidator', () => {
    describe('validateComplexity', () => {
      it('should allow operations under complexity limits', () => {
        expect(() => PerformanceValidator.validateComplexity(100, 'transform')).not.toThrow();
        expect(() => PerformanceValidator.validateComplexity(999, 'optimization')).not.toThrow();
        expect(() => PerformanceValidator.validateComplexity(499, 'other')).not.toThrow();
      });

      it('should throw error for optimization operations exceeding limit', () => {
        try {
          PerformanceValidator.validateComplexity(1001, 'optimization');
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.code).toBe('PERFORMANCE_TIMEOUT');
          expect(parsedError.message).toContain('Operation complexity exceeds limits for optimization');
          expect(parsedError.details.elementCount).toBe(1001);
          expect(parsedError.details.maxElements).toBe(1000);
          expect(parsedError.details.operationType).toBe('optimization');
        }
      });

      it('should throw error for other operations exceeding limit', () => {
        try {
          PerformanceValidator.validateComplexity(501, 'transform');
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.details.maxElements).toBe(500);
          expect(parsedError.suggestions).toContain('Reduce number of elements to 500 or fewer');
        }
      });

      it('should provide helpful suggestions', () => {
        try {
          PerformanceValidator.validateComplexity(600, 'test');
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.suggestions).toContain('Consider breaking complex operations into smaller batches');
          expect(parsedError.suggestions).toContain('Use simpler elements where possible');
        }
      });
    });

    describe('withTimeout', () => {
      it('should resolve successful operations within timeout', async () => {
        const quickOperation = Promise.resolve('success');
        const result = await PerformanceValidator.withTimeout(quickOperation, 1000, 'test');
        expect(result).toBe('success');
      });

      it('should reject operations that exceed timeout', async () => {
        const slowOperation = new Promise(resolve => setTimeout(() => resolve('too slow'), 200));
        
        try {
          await PerformanceValidator.withTimeout(slowOperation, 50, 'slow-test');
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.code).toBe('PERFORMANCE_TIMEOUT');
          expect(parsedError.message).toContain("Operation 'slow-test' timed out after 50ms");
          expect(parsedError.suggestions).toContain('Reduce operation complexity');
        }
      });

      it('should reject operations that fail before timeout', async () => {
        const failingOperation = Promise.reject(new Error('Operation failed'));
        
        await expect(
          PerformanceValidator.withTimeout(failingOperation, 1000, 'failing-test')
        ).rejects.toThrow('Operation failed');
      });

      it('should provide helpful timeout suggestions', async () => {
        const slowOperation = new Promise(resolve => setTimeout(resolve, 200));
        
        try {
          await PerformanceValidator.withTimeout(slowOperation, 50, 'timeout-test');
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.suggestions).toContain('Break operation into smaller parts');
          expect(parsedError.suggestions).toContain('Optimize input data');
        }
      });
    });
  });

  describe('SVGSanitizer', () => {
    describe('sanitizeSVG', () => {
      it('should return clean SVG unchanged', () => {
        const cleanSVG = '<svg><rect width="100" height="100" fill="red"/></svg>';
        const result = SVGSanitizer.sanitizeSVG(cleanSVG);
        expect(result).toBe(cleanSVG);
      });

      it('should remove script tags', () => {
        const maliciousSVG = '<svg><script>alert("xss")</script><rect width="100" height="100"/></svg>';
        const result = SVGSanitizer.sanitizeSVG(maliciousSVG);
        expect(result).not.toContain('<script');
        expect(result).not.toContain('alert');
        expect(result).toContain('<rect');
      });

      it('should remove event handlers', () => {
        const maliciousSVG = '<svg><rect onclick="alert(\'xss\')" width="100" height="100"/></svg>';
        const result = SVGSanitizer.sanitizeSVG(maliciousSVG);
        expect(result).not.toContain('onclick');
        expect(result).toContain('<rect');
      });

      it('should remove javascript: URLs', () => {
        const maliciousSVG = '<svg><a href="javascript:alert(\'xss\')"><rect width="100" height="100"/></a></svg>';
        const result = SVGSanitizer.sanitizeSVG(maliciousSVG);
        expect(result).not.toContain('javascript:');
        expect(result).toContain('<rect');
      });

      it('should remove data:text/html URLs', () => {
        const maliciousSVG = '<svg><image href="data:text/html,<script>alert(1)</script>"/></svg>';
        const result = SVGSanitizer.sanitizeSVG(maliciousSVG);
        expect(result).not.toContain('data:text/html');
        expect(result).toContain('<image');
      });

      it('should handle multiple malicious patterns', () => {
        const maliciousSVG = `
          <svg>
            <script>alert('xss')</script>
            <rect onclick="alert('click')" onmouseover="alert('hover')" width="100" height="100"/>
            <a href="javascript:void(0)">Link</a>
            <image href="data:text/html,<script>evil()</script>"/>
          </svg>
        `;
        const result = SVGSanitizer.sanitizeSVG(maliciousSVG);
        expect(result).not.toContain('<script');
        expect(result).not.toContain('onclick');
        expect(result).not.toContain('onmouseover');
        expect(result).not.toContain('javascript:');
        expect(result).not.toContain('data:text/html');
      });

      it('should preserve safe attributes and elements', () => {
        const safeSVG = `
          <svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">
            <rect x="10" y="10" width="50" height="50" fill="red" stroke="blue"/>
            <circle cx="50" cy="50" r="25" fill="green"/>
            <text x="25" y="75" font-family="Arial" font-size="12">Hello</text>
          </svg>
        `;
        const result = SVGSanitizer.sanitizeSVG(safeSVG);
        expect(result).toContain('xmlns="http://www.w3.org/2000/svg"');
        expect(result).toContain('fill="red"');
        expect(result).toContain('font-family="Arial"');
        expect(result).toContain('Hello');
      });
    });

    describe('validateSafeSVG', () => {
      it('should pass validation for clean SVG', () => {
        const cleanSVG = '<svg><rect width="100" height="100" fill="red"/></svg>';
        expect(() => SVGSanitizer.validateSafeSVG(cleanSVG)).not.toThrow();
      });

      it('should throw error for SVG with script tags', () => {
        const maliciousSVG = '<svg><script>alert("xss")</script><rect width="100" height="100"/></svg>';
        
        try {
          SVGSanitizer.validateSafeSVG(maliciousSVG);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.code).toBe('INVALID_SVG');
          expect(parsedError.message).toBe('SVG content contains potentially unsafe elements');
          expect(parsedError.suggestions).toContain('Remove script tags from SVG content');
        }
      });

      it('should throw error for SVG with event handlers', () => {
        const maliciousSVG = '<svg><rect onclick="alert(\'xss\')" width="100" height="100"/></svg>';
        
        try {
          SVGSanitizer.validateSafeSVG(maliciousSVG);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.suggestions).toContain('Remove event handlers (onclick, onload, etc.)');
        }
      });

      it('should throw error for SVG with javascript: URLs', () => {
        const maliciousSVG = '<svg><a href="javascript:alert(\'xss\')"><rect width="100"/></a></svg>';
        
        try {
          SVGSanitizer.validateSafeSVG(maliciousSVG);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.suggestions).toContain('Remove javascript: URLs');
        }
      });

      it('should throw error for SVG with data:text/html', () => {
        const maliciousSVG = '<svg><image href="data:text/html,<script>alert(1)</script>"/></svg>';
        
        try {
          SVGSanitizer.validateSafeSVG(maliciousSVG);
        } catch (error) {
          const parsedError = JSON.parse((error as Error).message);
          expect(parsedError.suggestions).toContain('Use only standard SVG elements and attributes');
        }
      });
    });
  });
});