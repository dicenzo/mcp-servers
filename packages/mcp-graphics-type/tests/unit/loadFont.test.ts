import { describe, test, expect } from '@jest/globals';
import { loadFontTool } from '../../src/tools/loadFont.js';
import { FontCache } from '../../src/util/performance.js';

// Fixtures (global.testFontPath etc.) are generated in tests/jest.setup.ts.
describe('loadFont Tool', () => {

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
        path: global.testFontPath
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
      // Nonexistent file inside the allowed directory, so this exercises "not found"
      // rather than the allowed-directory guard.
      const input = {
        type: 'file',
        path: global.missingFontPath
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe(true);
      expect(response.code).toBe('FONT_LOAD_FAILED');
    });

    test('should reject font files outside the allowed directories', async () => {
      const result = await loadFontTool.invoke({ type: 'file', path: '/etc/hosts.ttf' });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.code).toBe('FONT_LOAD_FAILED');
      expect(response.message).toContain('not in an allowed font directory');
    });
  });

  describe('Font Loading from Buffer', () => {
    test('should load font from buffer', async () => {
      const input = {
        type: 'buffer',
        data: global.testFontBuffer
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.font).toBeDefined();
      expect(response.font.family).toBe('Test Font');
    });

    test('should load font from base64 string', async () => {
      const input = {
        type: 'buffer',
        data: global.testFontBuffer.toString('base64')
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.content).toBeDefined();
      const response = JSON.parse(result.content[0].text);
      expect(response.font).toBeDefined();
      expect(response.font.family).toBe('Test Font');
    });
  });

  describe('Font Loading from URL', () => {
    // Skipped: a successful URL load needs a real public HTTPS font host, and these
    // tests must not touch the network. jest.mock('node-fetch') cannot intercept the
    // ESM dynamic import in loadFont.ts, so there is no offline way to fake success.
    test.skip('should load font from a public https URL (requires network)', async () => {
      const result = await loadFontTool.invoke({ type: 'url', url: 'https://example.com/font.ttf' });
      const response = JSON.parse(result.content[0].text);
      expect(response.font).toBeDefined();
    });

    // The URL guard runs before any request is made, so these never reach the network.
    test.each([
      ['plain http', 'http://example.com/font.ttf'],
      ['file scheme', 'file:///etc/passwd'],
      ['localhost', 'https://localhost/font.ttf'],
      ['loopback IPv4', 'https://127.0.0.1/font.ttf'],
      ['private IPv4', 'https://192.168.1.10/font.ttf'],
      ['cloud metadata', 'https://169.254.169.254/latest/meta-data'],
      ['loopback IPv6', 'https://[::1]/font.ttf'],
      ['embedded credentials', 'https://user:pass@example.com/font.ttf']
    ])('should reject %s URLs', async (_label, url) => {
      const result = await loadFontTool.invoke({ type: 'url', url });

      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe(true);
      expect(response.code).toBe('FONT_LOAD_FAILED');
      expect(response.message).toBe('Font URL must be a public https:// address');
    });
  });

  describe('System Font Loading', () => {
    // Skipped: the result depends on which fonts are installed on the machine (on
    // macOS, for example, "Arial" first matches a 23MB Arial Unicode file that exceeds
    // the 10MB font size limit). System lookup ignores MCP_FONT_DIRS, so the generated
    // fixture can't stand in for it.
    test.skip('should load system font (depends on installed fonts)', async () => {
      const result = await loadFontTool.invoke({ type: 'system', name: 'Arial' });
      const response = JSON.parse(result.content[0].text);
      expect(response.font).toBeDefined();
    });

    test('should handle missing system font', async () => {
      const input = {
        type: 'system',
        name: 'NoSuchFontNameXyz123'
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
        path: global.testFontPath
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
        path: global.testFontPath
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
        path: global.testFontPath
      };

      FontCache.clear();

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
        path: global.testFontPath
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
      // A real .ttf file inside the allowed directory whose bytes are not a font.
      const input = {
        type: 'file',
        path: global.corruptedFontPath
      };

      const result = await loadFontTool.invoke(input);
      
      expect(result.isError).toBe(true);
      const response = JSON.parse(result.content[0].text);
      expect(response.error).toBe(true);
    });
  });

  describe('Font Format Detection', () => {
    test('should detect TTF format', async () => {
      // The generated font with its sfnt version set to TrueType (0x00010000).
      const input = {
        type: 'file',
        path: global.testTrueTypeSignaturePath
      };

      const result = await loadFontTool.invoke(input);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.font.format).toBe('ttf');
    });

    test('should detect OTF format', async () => {
      // opentype.js writes CFF outlines, so the generated font has an "OTTO" header.
      const input = {
        type: 'file',
        path: global.testOtfPath
      };

      const result = await loadFontTool.invoke(input);
      const response = JSON.parse(result.content[0].text);
      
      expect(response.font.format).toBe('otf');
    });
  });
});