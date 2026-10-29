import { describe, test, expect } from '@jest/globals';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as opentypeModule from 'opentype.js';
import { FontSubsetOptionsSchema, MAX_UNICODE_RANGES } from '../../src/types/typography.js';
import {
  subsetFontTool,
  mergeUnicodeRanges,
  codepointsInRanges
} from '../../src/tools/subsetFont.js';

const opentype = ((opentypeModule as any).default ?? opentypeModule) as typeof opentypeModule;

const FULL_RANGE = { start: 0, end: 0x10FFFF };

const hasFontTools = (() => {
  try {
    execFileSync('python3', ['-c', 'import fontTools'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
// Timing of the opentype.js fallback is only meaningful when fontTools is absent.
const testIfFallback = hasFontTools ? test.skip : test;

describe('type.subsetFont unicodeRanges hardening', () => {
  describe('schema', () => {
    const parse = (unicodeRanges: unknown) =>
      FontSubsetOptionsSchema.safeParse({ characters: 'abc', unicodeRanges });

    test('rejects non-integer codepoints', () => {
      expect(parse([{ start: 0.5, end: 10 }]).success).toBe(false);
      expect(parse([{ start: 0, end: 10.25 }]).success).toBe(false);
    });

    test('rejects codepoints outside 0..0x10FFFF', () => {
      expect(parse([{ start: -1, end: 10 }]).success).toBe(false);
      expect(parse([{ start: 0, end: 0x110000 }]).success).toBe(false);
      expect(parse([FULL_RANGE]).success).toBe(true);
    });

    test('caps the number of ranges', () => {
      const atLimit = Array.from({ length: MAX_UNICODE_RANGES }, (_, i) => ({ start: i, end: i }));
      const overLimit = [...atLimit, { start: 0, end: 0 }];

      expect(parse(atLimit).success).toBe(true);
      expect(parse(overLimit).success).toBe(false);
    });

    test('tool invoke returns an error for too many ranges', async () => {
      const unicodeRanges = Array.from({ length: MAX_UNICODE_RANGES + 1 }, (_, i) => ({ start: i, end: i }));
      const result = await subsetFontTool.invoke({
        font: { type: 'buffer', data: global.testFontBuffer.toString('base64') },
        options: { characters: 'A', unicodeRanges }
      });

      expect(result.isError).toBe(true);
    });
  });

  describe('mergeUnicodeRanges', () => {
    test('sorts and merges overlapping and adjacent ranges', () => {
      expect(mergeUnicodeRanges([
        { start: 30, end: 40 },
        { start: 0, end: 10 },
        { start: 5, end: 20 },
        { start: 21, end: 25 },
        { start: 35, end: 36 }
      ])).toEqual([
        { start: 0, end: 25 },
        { start: 30, end: 40 }
      ]);
    });

    test('collapses repeated full ranges into one', () => {
      expect(mergeUnicodeRanges(Array.from({ length: 10 }, () => FULL_RANGE))).toEqual([FULL_RANGE]);
    });

    test('returns an empty list for no ranges', () => {
      expect(mergeUnicodeRanges([])).toEqual([]);
    });
  });

  describe('codepointsInRanges', () => {
    const font = opentype.parse(new Uint8Array(global.testFontBuffer).buffer);

    test('returns only codepoints the font maps, filtered by range', () => {
      const upper = codepointsInRanges(font, [{ start: 0x41, end: 0x5A }]);
      expect(upper).toHaveLength(26);
      expect(upper).toContain(0x41);
      expect(upper).not.toContain(0x61);

      // Ranges with no mapped codepoints contribute nothing
      expect(codepointsInRanges(font, [{ start: 0x4E00, end: 0x9FFF }])).toEqual([]);
    });

    test('ten full Unicode ranges cost the size of the cmap, not 11M lookups', () => {
      const started = performance.now();
      const codepoints = codepointsInRanges(font, Array.from({ length: 10 }, () => FULL_RANGE));
      const elapsed = performance.now() - started;

      // space + A-Z + a-z + 0-9 (+ U+0000 mapped to .notdef by the fixture)
      expect(codepoints.length).toBeGreaterThanOrEqual(63);
      expect(codepoints.length).toBeLessThanOrEqual(64);
      expect(elapsed).toBeLessThan(100);
    });
  });

  testIfFallback('fallback subset with ten full ranges finishes quickly', async () => {
    const started = performance.now();
    const result = await subsetFontTool.invoke({
      font: { type: 'buffer', data: global.testFontBuffer.toString('base64') },
      options: { characters: 'A', unicodeRanges: Array.from({ length: 10 }, () => FULL_RANGE) }
    });

    expect(result.isError).toBeFalsy();
    expect(performance.now() - started).toBeLessThan(500);
  });
});

describe('stdout hygiene', () => {
  test('server source never writes to stdout (the MCP channel) with console.log', () => {
    const srcDir = path.resolve(__dirname, '../../src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.ts')) {
          fs.readFileSync(full, 'utf8').split('\n').forEach((line, i) => {
            if (/console\.(log|info)\(/.test(line)) {
              offenders.push(`${path.relative(srcDir, full)}:${i + 1}`);
            }
          });
        }
      }
    };
    walk(srcDir);

    expect(offenders).toEqual([]);
  });
});
