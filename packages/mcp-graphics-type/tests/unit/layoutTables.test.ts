import { describe, test, expect } from '@jest/globals';
import * as opentypeModule from 'opentype.js';
import { loadFontTool } from '../../src/tools/loadFont.js';
import { validateFontTool } from '../../src/tools/validateFont.js';

// src/types/opentype.d.ts only declares the parsing API the tools use; the
// Font/Glyph/Path constructors and substitution API used here are untyped there.
const opentype = ((opentypeModule as any).default ?? opentypeModule) as any;

/**
 * A font whose GSUB table has script "latn" with a Turkish language system and a
 * "liga" feature (f + i -> f_i). opentype.js parses GSUB scripts and features as
 * arrays of tagged records, which is what these tests exercise.
 */
function buildLigatureFontBase64(): string {
  const box = () => {
    const p = new opentype.Path();
    p.moveTo(50, 0);
    p.lineTo(550, 0);
    p.lineTo(550, 700);
    p.lineTo(50, 700);
    p.close();
    return p;
  };
  const glyphs = [
    new opentype.Glyph({ name: '.notdef', unicode: 0, advanceWidth: 600, path: box() }),
    new opentype.Glyph({ name: 'f', unicode: 102, advanceWidth: 600, path: box() }),
    new opentype.Glyph({ name: 'i', unicode: 105, advanceWidth: 600, path: box() }),
    new opentype.Glyph({ name: 'f_i', advanceWidth: 600, path: box() })
  ];
  const font = new opentype.Font({
    familyName: 'Ligature Test',
    styleName: 'Regular',
    unitsPerEm: 1000,
    ascender: 800,
    descender: -200,
    glyphs
  });
  font.substitution.add('liga', { sub: [1, 2], by: 3 }, 'latn', 'TRK ');
  return Buffer.from(new Uint8Array(font.toArrayBuffer())).toString('base64');
}

const fontInput = { type: 'buffer' as const, data: buildLigatureFontBase64() };

describe('GSUB layout table extraction', () => {
  test('loadFont reports script tags, not array indices', async () => {
    const result = await loadFontTool.invoke(fontInput);
    const metadata = JSON.parse(result.content[0].text).font;

    expect(metadata.supportedScripts).toContain('latn');
    expect(metadata.supportedScripts).not.toContain('0');
  });

  test('loadFont reports feature tags, not array indices', async () => {
    const result = await loadFontTool.invoke(fontInput);
    const metadata = JSON.parse(result.content[0].text).font;

    expect(metadata.features).toContain('liga');
    expect(metadata.features).not.toContain('0');
  });

  test('loadFont reports language system tags from the script records', async () => {
    const result = await loadFontTool.invoke(fontInput);
    const metadata = JSON.parse(result.content[0].text).font;

    expect(metadata.supportedLanguages).toContain('TRK ');
  });

  test('validateFont finds a required feature the font has', async () => {
    const result = await validateFontTool.invoke({ font: fontInput, options: { requiredFeatures: ['liga'] } });
    const report = JSON.parse(result.content[0].text).validation;

    const codes = report.errors.map((e: { code: string }) => e.code);
    expect(codes).not.toContain('MISSING_REQUIRED_FEATURES');
  });

  test('validateFont still flags a required feature the font lacks', async () => {
    const result = await validateFontTool.invoke({ font: fontInput, options: { requiredFeatures: ['smcp'] } });
    const report = JSON.parse(result.content[0].text).validation;

    const codes = report.errors.map((e: { code: string }) => e.code);
    expect(codes).toContain('MISSING_REQUIRED_FEATURES');
  });
});
