import { describe, test, expect } from '@jest/globals';
import { execFileSync } from 'child_process';
import { loadFontTool } from '../../src/tools/loadFont.js';
import { shapeTextTool } from '../../src/tools/shapeText.js';
import { measureTextTool } from '../../src/tools/measureText.js';
import { subsetFontTool } from '../../src/tools/subsetFont.js';
import { generateFallbackTool } from '../../src/tools/generateFallback.js';
import { validateFontTool } from '../../src/tools/validateFont.js';

// subsetFont shells out to `python3 -m fontTools.subset`; skip its tests when
// fontTools is not installed.
const hasFontTools = (() => {
  try {
    execFileSync('python3', ['-c', 'import fontTools'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
const testIfFontTools = hasFontTools ? test : test.skip;

// Fixtures (global.testFontPath etc.) are generated in tests/jest.setup.ts.
describe('Typography Integration Tests', () => {
  const testFontInput = {
    type: 'file',
    path: global.testFontPath
  };

  describe('Font Loading and Analysis Workflow', () => {
    test('should load font and extract metadata', async () => {
      const result = await loadFontTool.invoke(testFontInput);
      
      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      
      expect(response.font).toBeDefined();
      expect(response.font.family).toBe('Test Font');
      expect(response.font.format).toBeDefined();
      expect(response.font.numGlyphs).toBeDefined();
    });

    test('should validate loaded font', async () => {
      const validateInput = {
        font: testFontInput,
        options: {
          checkLicense: true,
          checkPerformance: true,
          checkCompatibility: true
        }
      };

      const result = await validateFontTool.invoke(validateInput);
      
      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      
      expect(response.validation).toBeDefined();
      expect(response.validation.isValid).toBeDefined();
      expect(response.validation.format).toBeDefined();
      expect(response.validation.metadata).toBeDefined();
    });
  });

  describe('Text Processing Workflow', () => {
    test('should shape and measure text', async () => {
      const testText = 'Hello, Typography!';
      
      // Shape text
      const shapeInput = {
        text: testText,
        font: testFontInput,
        options: {
          fontSize: 16,
          direction: 'ltr',
          script: 'latn',
          language: 'en'
        }
      };

      const shapeResult = await shapeTextTool.invoke(shapeInput);
      expect(shapeResult.content).toBeDefined();
      
      const shapeResponse = JSON.parse(shapeResult.content[0].text);
      expect(shapeResponse.shapedText).toBeDefined();
      expect(shapeResponse.shapedText.glyphs).toBeInstanceOf(Array);

      // Measure text
      const measureInput = {
        text: testText,
        font: testFontInput,
        fontSize: 16,
        options: {
          includeCharacterMetrics: true
        }
      };

      const measureResult = await measureTextTool.invoke(measureInput);
      expect(measureResult.content).toBeDefined();
      
      const measureResponse = JSON.parse(measureResult.content[0].text);
      expect(measureResponse.metrics).toBeDefined();
      expect(measureResponse.metrics.width).toBeDefined();
      expect(measureResponse.metrics.height).toBeDefined();
    });

    test('should handle different text directions', async () => {
      const testText = 'مرحبا بالعالم'; // Arabic text
      
      const shapeInput = {
        text: testText,
        font: testFontInput,
        options: {
          fontSize: 16,
          direction: 'rtl',
          script: 'arab',
          language: 'ar'
        }
      };

      const result = await shapeTextTool.invoke(shapeInput);
      expect(result.content).toBeDefined();
      
      const response = JSON.parse(result.content[0].text);
      expect(response.shapedText.direction).toBe('rtl');
      expect(response.shapedText.script).toBe('arab');
    });
  });

  describe('Font Optimization Workflow', () => {
    // Skipped unless python3 can import fontTools (see hasFontTools above).
    testIfFontTools('should create font subset', async () => {
      const subsetInput = {
        font: testFontInput,
        options: {
          characters: 'Hello, World!',
          hinting: true,
          optimize: true
        }
      };

      const result = await subsetFontTool.invoke(subsetInput);
      expect(result.content).toBeDefined();
      
      const response = JSON.parse(result.content[0].text);
      expect(response.subset).toBeDefined();
      expect(response.subset.fontData).toBeDefined();
      expect(response.subset.compressionRatio).toBeDefined();
      expect(response.subset.charactersIncluded).toBeInstanceOf(Array);
    });

    test('should generate fallback font stack', async () => {
      const fallbackInput = {
        primaryFont: testFontInput,
        targetPlatforms: ['web', 'windows', 'macos'],
        textContent: 'Sample text for analysis',
        preferredGenericFamily: 'sans-serif'
      };

      const result = await generateFallbackTool.invoke(fallbackInput);
      expect(result.content).toBeDefined();
      
      const response = JSON.parse(result.content[0].text);
      expect(response.fontStack).toBeDefined();
      expect(response.fontStack.primaryFont).toBeDefined();
      expect(response.fontStack.fallbackStack).toBeInstanceOf(Array);
      expect(response.fontStack.cssDeclaration).toBeDefined();
    });
  });

  describe('End-to-End Typography Workflow', () => {
    test('should complete full typography analysis', async () => {
      const testText = 'The quick brown fox jumps over the lazy dog.';
      
      // 1. Load and validate font
      const loadResult = await loadFontTool.invoke(testFontInput);
      const loadResponse = JSON.parse(loadResult.content[0].text);
      expect(loadResponse.font).toBeDefined();

      // 2. Shape text
      const shapeResult = await shapeTextTool.invoke({
        text: testText,
        font: testFontInput,
        options: { fontSize: 16 }
      });
      const shapeResponse = JSON.parse(shapeResult.content[0].text);
      expect(shapeResponse.shapedText.glyphs.length).toBeGreaterThan(0);

      // 3. Measure text
      const measureResult = await measureTextTool.invoke({
        text: testText,
        font: testFontInput,
        fontSize: 16
      });
      const measureResponse = JSON.parse(measureResult.content[0].text);
      expect(measureResponse.metrics.width).toBeGreaterThan(0);

      // 4. Create subset (only when python3 can import fontTools; see hasFontTools)
      if (hasFontTools) {
        const subsetResult = await subsetFontTool.invoke({
          font: testFontInput,
          options: { characters: testText }
        });
        const subsetResponse = JSON.parse(subsetResult.content[0].text);
        expect(subsetResponse.subset.compressionRatio).toBeGreaterThan(0);
      }

      // 5. Generate fallback stack
      const fallbackResult = await generateFallbackTool.invoke({
        primaryFont: testFontInput,
        targetPlatforms: ['web']
      });
      const fallbackResponse = JSON.parse(fallbackResult.content[0].text);
      expect(fallbackResponse.fontStack.fallbackStack.length).toBeGreaterThan(0);

      // 6. Validate font
      const validateResult = await validateFontTool.invoke({
        font: testFontInput
      });
      const validateResponse = JSON.parse(validateResult.content[0].text);
      expect(validateResponse.validation.isValid).toBeDefined();
    });
  });

  describe('Error Handling and Recovery', () => {
    test('should handle corrupted font gracefully', async () => {
      // A real .ttf file inside the allowed directory whose bytes are not a font.
      const corruptedFontInput = {
        type: 'file',
        path: global.corruptedFontPath
      };

      const result = await loadFontTool.invoke(corruptedFontInput);
      expect(result.isError).toBe(true);
      
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe(true);
      expect(response.suggestions).toBeDefined();
    });

    test('should handle missing fonts gracefully', async () => {
      // Nonexistent file inside the allowed directory.
      const missingFontInput = {
        type: 'file',
        path: global.missingFontPath
      };

      const result = await loadFontTool.invoke(missingFontInput);
      expect(result.isError).toBe(true);
    });

    // Rewritten: the original faked a network failure with jest.mock('node-fetch'),
    // which can't intercept loadFont's ESM dynamic import. Tests must not hit the
    // network, so this checks that non-public URLs are refused before any request.
    test('should refuse private-network URL fonts without fetching', async () => {
      const urlFontInput = {
        type: 'url',
        url: 'https://10.0.0.1/font.ttf'
      };

      const result = await loadFontTool.invoke(urlFontInput);
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.message).toBe('Font URL must be a public https:// address');
    });
  });

  describe('Performance and Memory Management', () => {
    test('should complete operations within performance limits', async () => {
      const testText = 'A'.repeat(1000); // Moderately long text
      
      const measureInput = {
        text: testText,
        font: testFontInput,
        fontSize: 16
      };

      const startTime = Date.now();
      const result = await measureTextTool.invoke(measureInput);
      const duration = Date.now() - startTime;

      expect(result.content).toBeDefined();
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });

    test('should handle multiple concurrent operations', async () => {
      const operations = [
        loadFontTool.invoke(testFontInput),
        shapeTextTool.invoke({
          text: 'Test 1',
          font: testFontInput
        }),
        measureTextTool.invoke({
          text: 'Test 2',
          font: testFontInput,
          fontSize: 16
        })
      ];

      const results = await Promise.all(operations);
      
      expect(results).toHaveLength(3);
      results.forEach(result => {
        expect(result.content).toBeDefined();
      });
    });
  });

  describe('Unicode and Internationalization', () => {
    test('should handle various Unicode scripts', async () => {
      const multiScriptText = 'Hello мир 世界 مرحبا';
      
      const shapeInput = {
        text: multiScriptText,
        font: testFontInput,
        options: {
          fontSize: 16,
          script: 'latn', // Start with Latin
          language: 'und'
        }
      };

      const result = await shapeTextTool.invoke(shapeInput);
      expect(result.content).toBeDefined();
      
      const response = JSON.parse(result.content[0].text);
      expect(response.shapedText.glyphs.length).toBeGreaterThan(0);
    });

    test('should handle emoji and complex Unicode', async () => {
      const emojiText = 'Hello 👋 World 🌍!';
      
      const measureInput = {
        text: emojiText,
        font: testFontInput,
        fontSize: 16
      };

      const result = await measureTextTool.invoke(measureInput);
      expect(result.content).toBeDefined();
      
      const response = JSON.parse(result.content[0].text);
      expect(response.metrics.width).toBeGreaterThan(0);
    });
  });
});