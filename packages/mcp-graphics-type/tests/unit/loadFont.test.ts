import { describe, test, expect, beforeEach, jest } from '@jest/globals';
import { loadFontTool } from '../../src/tools/loadFont.js';

describe('loadFont Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Tool Registration', () => {
    test('should have correct tool name', () => {
      expect(loadFontTool.name).toBe('type.loadFont');
    });

    test('should have proper description', () => {
      expect(loadFontTool.description).toContain('Load a font and extract comprehensive metadata');
    });

    test('should have valid input schema', () => {
      expect(loadFontTool.inputSchema).toBeDefined();
      expect(loadFontTool.inputSchema.type).toBe('object');
      expect(loadFontTool.inputSchema.properties).toBeDefined();
    });
  });

  describe('Font Loading from File', () => {
    test('should load font from file path', async () => {
      const input = {
        type: 'file',
        path: '/test/fonts/test-font.ttf'
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.content).toBeDefined();
      expect(result.content[0].type).toBe('text');
      
      const response = JSON.parse(result.content[0].text);
      expect(response.font).toBeDefined();
      expect(response.font.family).toBe('Test Font');
      expect(response.font.format).toBeDefined();
    });

    test('should handle missing font file', async () => {
      const fs = await import('fs');
      (fs.existsSync as jest.Mock).mockReturnValueOnce(false);

      const input = {
        type: 'file',
        path: '/nonexistent/font.ttf'
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe(true);
      expect(response.code).toBe('FONT_LOAD_FAILED');
    });
  });

  describe('Font Loading from Buffer', () => {
    test('should load font from buffer', async () => {
      const testBuffer = Buffer.alloc(1024, 0);
      const input = {
        type: 'buffer',
        data: testBuffer
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.font).toBeDefined();
    });

    test('should load font from base64 string', async () => {
      const testBuffer = Buffer.alloc(1024, 0);
      const input = {
        type: 'buffer',
        data: testBuffer.toString('base64')
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.font).toBeDefined();
    });
  });

  describe('Font Loading from URL', () => {
    test('should load font from URL', async () => {
      const input = {
        type: 'url',
        url: 'https://example.com/font.ttf'
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.font).toBeDefined();
    });

    test('should handle URL fetch failure', async () => {
      const fetch = await import('node-fetch');
      (fetch.default as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({
          ok: false,
          status: 404,
          statusText: 'Not Found'
        })
      );

      const input = {
        type: 'url',
        url: 'https://example.com/nonexistent.ttf'
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe(true);
    });
  });

  describe('System Font Loading', () => {
    test('should load system font', async () => {
      const input = {
        type: 'system',
        name: 'Arial'
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.font).toBeDefined();
    });

    test('should handle missing system font', async () => {
      const fs = await import('fs');
      (fs.readdirSync as jest.Mock).mockReturnValueOnce([]);

      const input = {
        type: 'system',
        name: 'NonexistentFont'
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.code).toBe('SYSTEM_FONT_ACCESS_FAILED');
    });
  });

  describe('Font Metadata Extraction', () => {
    test('should extract comprehensive metadata', async () => {
      const input = {
        type: 'file',
        path: '/test/fonts/test-font.ttf'
      };

      const result = await loadFontTool.invoke(input);
      const response = JSON.parse(result.content[0].text);
      const font = response.font;

      expect(font.family).toBeDefined();
      expect(font.subfamily).toBeDefined();
      expect(font.fullName).toBeDefined();
      expect(font.postScriptName).toBeDefined();
      expect(font.version).toBeDefined();
      expect(font.unitsPerEm).toBeDefined();
      expect(font.ascender).toBeDefined();
      expect(font.descender).toBeDefined();
      expect(font.bbox).toBeDefined();
      expect(font.weightClass).toBeDefined();
      expect(font.supportedScripts).toBeInstanceOf(Array);
      expect(font.features).toBeInstanceOf(Array);
      expect(font.numGlyphs).toBeDefined();
      expect(font.format).toBeDefined();
    });

    test('should include performance metrics', async () => {
      const input = {
        type: 'file',
        path: '/test/fonts/test-font.ttf'
      };

      const result = await loadFontTool.invoke(input);
      const response = JSON.parse(result.content[0].text);

      expect(response.performance).toBeDefined();
      expect(response.performance.duration).toBeDefined();
      expect(response.performance.memoryUsed).toBeDefined();
    });
  });

  describe('Font Caching', () => {
    test('should return cached result on second load', async () => {
      const input = {
        type: 'file',
        path: '/test/fonts/test-font.ttf'
      };

      // First load
      const result1 = await loadFontTool.invoke(input);
      const response1 = JSON.parse(result1.content[0].text);
      expect(response1.cached).toBe(false);

      // Second load should be cached
      const result2 = await loadFontTool.invoke(input);
      const response2 = JSON.parse(result2.content[0].text);
      expect(response2.cached).toBe(true);
    });
  });

  describe('Input Validation', () => {
    test('should reject invalid input type', async () => {
      const input = {
        type: 'invalid',
        path: '/test/fonts/test-font.ttf'
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.code).toBe('INVALID_INPUT');
    });

    test('should reject missing required fields', async () => {
      const input = {
        type: 'file'
        // Missing path field
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.code).toBe('INVALID_INPUT');
    });

    test('should handle malformed font data', async () => {
      const opentype = await import('opentype.js');
      (opentype.parse as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Invalid font data');
      });

      const input = {
        type: 'file',
        path: '/test/fonts/corrupted-font.ttf'
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe(true);
    });
  });

  describe('Font Format Detection', () => {
    test('should detect TTF format', async () => {
      const fs = await import('fs');
      const ttfSignature = Buffer.from([0x00, 0x01, 0x00, 0x00]);
      const ttfBuffer = Buffer.concat([ttfSignature, Buffer.alloc(1020)]);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(ttfBuffer);

      const input = {
        type: 'file',
        path: '/test/fonts/test-font.ttf'
      };

      const result = await loadFontTool.invoke(input);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.font.format).toBe('ttf');
    });

    test('should detect OTF format', async () => {
      const fs = await import('fs');
      const otfSignature = Buffer.from([0x4F, 0x54, 0x54, 0x4F]);
      const otfBuffer = Buffer.concat([otfSignature, Buffer.alloc(1020)]);
      (fs.readFileSync as jest.Mock).mockReturnValueOnce(otfBuffer);

      const input = {
        type: 'file',
        path: '/test/fonts/test-font.otf'
      };

      const result = await loadFontTool.invoke(input);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.font.format).toBe('otf');
    });
  });
});