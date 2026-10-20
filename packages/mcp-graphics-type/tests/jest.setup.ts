// Jest setup file for typography tests

// Set up test environment
import { jest, beforeEach, afterEach, afterAll } from '@jest/globals';

// Mock node-fetch for URL-based font loading tests
jest.mock('node-fetch', () => ({
  default: jest.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(1024)),
    })
  ),
}));

// Mock file system operations for testing
jest.mock('fs', () => ({
  existsSync: jest.fn(() => true),
  readFileSync: jest.fn(() => Buffer.alloc(1024)),
  writeFileSync: jest.fn(),
  mkdtempSync: jest.fn(() => '/tmp/test-dir'),
  rmdirSync: jest.fn(),
  unlinkSync: jest.fn(),
  readdirSync: jest.fn(() => ['test-font.ttf']),
}));

// Mock opentype.js
jest.mock('opentype.js', () => ({
  parse: jest.fn(() => ({
    names: {
      fontFamily: { en: 'Test Font' },
      fontSubfamily: { en: 'Regular' },
      fullName: { en: 'Test Font Regular' },
      postScriptName: { en: 'TestFont-Regular' },
      version: { en: '1.0' },
      license: { en: 'Test License' }
    },
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    lineGap: 0,
    numGlyphs: 1000,
    tables: {
      head: { 
        xMin: 0, yMin: -200, xMax: 800, yMax: 800,
        macStyle: 0
      },
      os2: { 
        sCapHeight: 700, 
        sxHeight: 500,
        usWeightClass: 400,
        usWidthClass: 5,
        fsSelection: 64
      },
      post: { 
        isFixedPitch: false 
      },
      cmap: { 
        subtables: [{}] 
      },
      gsub: {
        scripts: { latn: {} },
        features: { kern: {}, liga: {} }
      },
      gpos: {
        scripts: { latn: {} },
        features: { kern: {} }
      }
    },
    glyphs: {
      glyphs: [
        { index: 0, name: '.notdef' }
      ]
    },
    charToGlyph: jest.fn(() => ({
      index: 65,
      name: 'A',
      advanceWidth: 600,
      leftSideBearing: 50,
      rightSideBearing: 50,
      xMin: 50,
      xMax: 550,
      yMin: 0,
      yMax: 700,
      getBoundingBox: () => ({
        x1: 50, y1: 0, x2: 550, y2: 700
      })
    })),
    hasChar: jest.fn(() => true)
  }))
}));


// Set up global test constants
declare global {
  var testFontBuffer: Buffer;
  var testFontPath: string;
}

global.testFontBuffer = Buffer.alloc(1024, 0);
global.testFontPath = '/test/fonts/test-font.ttf';

// Set NODE_ENV for tests
process.env.NODE_ENV = 'test';

// Increase test timeout for complex operations
jest.setTimeout(10000);

// Console suppression for cleaner test output
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  // Suppress console.error and console.warn during tests
  console.error = jest.fn();
  console.warn = jest.fn();
});

afterEach(() => {
  // Restore console methods
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
});

// Clean up after tests
afterAll(() => {
  jest.restoreAllMocks();
});