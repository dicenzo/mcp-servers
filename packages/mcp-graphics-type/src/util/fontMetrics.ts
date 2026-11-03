import type { Font } from 'opentype.js';

/**
 * The font's line gap in font units. opentype.js has no `font.lineGap`; it sets
 * `font.ascender`/`font.descender` from hhea, so the gap comes from hhea as well,
 * falling back to OS/2 sTypoLineGap.
 */
export function fontLineGap(font: Font): number {
  return font.tables.hhea?.lineGap ?? font.tables.os2?.sTypoLineGap ?? 0;
}
