// Jest setup file for typography tests.
//
// The package runs Jest in ESM mode, where jest.mock() does not intercept ESM
// imports, so tests use real fixtures instead of module mocks: a small font is
// generated with opentype.js into a temp directory, and that directory is listed
// in MCP_FONT_DIRS so loadFont's allowed-directory guard accepts it.

import { jest, beforeEach, afterEach, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { buildTestFont, toBuffer } from './fixtures/buildTestFont.js';
import { FONT_DIRS_ENV } from '../src/util/fontSources.js';

declare global {
  /** Real temp directory holding the generated fixtures (listed in MCP_FONT_DIRS). */
  var testFontDir: string;
  /** Generated "Test Font" saved with a .ttf extension (CFF outlines, "OTTO" header). */
  var testFontPath: string;
  /** Same generated font saved with a .otf extension. */
  var testOtfPath: string;
  /** Same font with its sfnt version rewritten to TrueType (0x00010000). */
  var testTrueTypeSignaturePath: string;
  /** A .ttf file inside the allowed directory that is not a valid font. */
  var corruptedFontPath: string;
  /** A .ttf path inside the allowed directory that does not exist. */
  var missingFontPath: string;
  /** Raw bytes of the generated font. */
  var testFontBuffer: Buffer;
}

const fontDir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mcp-type-fonts-'));
const fontBuffer = toBuffer(buildTestFont());

const trueTypeSignature = Buffer.from(fontBuffer);
trueTypeSignature.writeUInt32BE(0x00010000, 0);

fs.writeFileSync(path.join(fontDir, 'test-font.ttf'), fontBuffer);
fs.writeFileSync(path.join(fontDir, 'test-font.otf'), fontBuffer);
fs.writeFileSync(path.join(fontDir, 'truetype-signature.ttf'), trueTypeSignature);
fs.writeFileSync(path.join(fontDir, 'corrupted.ttf'), Buffer.alloc(1024, 0));

process.env[FONT_DIRS_ENV] = fontDir;

global.testFontDir = fontDir;
global.testFontPath = path.join(fontDir, 'test-font.ttf');
global.testOtfPath = path.join(fontDir, 'test-font.otf');
global.testTrueTypeSignaturePath = path.join(fontDir, 'truetype-signature.ttf');
global.corruptedFontPath = path.join(fontDir, 'corrupted.ttf');
global.missingFontPath = path.join(fontDir, 'does-not-exist.ttf');
global.testFontBuffer = fontBuffer;

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

afterAll(() => {
  jest.restoreAllMocks();
  fs.rmSync(fontDir, { recursive: true, force: true });
});
