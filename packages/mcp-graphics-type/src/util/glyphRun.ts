import type { Font, Glyph } from 'opentype.js';

export interface GlyphRunItem {
  /** The character, as a whole code point (an emoji is one item, not two surrogates) */
  char: string;
  codepoint: number;
  /** UTF-16 offset of the character in the input text */
  cluster: number;
  glyph: Glyph;
  /** Advance in px: glyph advance plus kerning with the next glyph and any spacing */
  advance: number;
}

export interface GlyphRunOptions {
  fontSize: number;
  kerning?: boolean;
  letterSpacing?: number;
  wordSpacing?: number;
}

/**
 * Maps text to glyphs one code point at a time and positions them along the line,
 * with pair kerning from GPOS (or the legacy `kern` table) added to the first glyph
 * of each pair, as HarfBuzz does. Ligatures, contextual forms and bidi are not applied.
 */
export function layoutGlyphRun(font: Font, text: string, options: GlyphRunOptions): GlyphRunItem[] {
  const scale = options.fontSize / font.unitsPerEm;
  const items: GlyphRunItem[] = [];
  let cluster = 0;
  for (const char of text) {
    const glyph = font.charToGlyph(char);
    let advance = (glyph.advanceWidth || 0) * scale;
    advance += options.letterSpacing || 0;
    if (char === ' ') {
      advance += options.wordSpacing || 0;
    }
    items.push({ char, codepoint: char.codePointAt(0) ?? 0, cluster, glyph, advance });
    cluster += char.length;
  }
  if (options.kerning !== false) {
    for (let i = 0; i < items.length - 1; i++) {
      items[i].advance += font.getKerningValue(items[i].glyph, items[i + 1].glyph) * scale;
    }
  }
  return items;
}
