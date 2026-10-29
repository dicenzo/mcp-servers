// Type declarations for opentype.js

declare module 'opentype.js' {
  export function parse(buffer: ArrayBuffer): Font;
  
  export class Font {
    constructor(options: {
      familyName: string;
      styleName: string;
      unitsPerEm: number;
      ascender: number;
      descender: number;
      glyphs: Glyph[];
    });

    names: {
      fontFamily?: { en: string };
      fontSubfamily?: { en: string };
      fullName?: { en: string };
      postScriptName?: { en: string };
      version?: { en: string };
      copyright?: { en: string };
      manufacturer?: { en: string };
      designer?: { en: string };
      description?: { en: string };
      license?: { en: string };
      licenseURL?: { en: string };
      trademark?: { en: string };
    };
    unitsPerEm: number;
    ascender: number;
    descender: number;
    lineGap?: number;
    numGlyphs: number;
    tables: {
      head?: {
        xMin: number;
        yMin: number;
        xMax: number;
        yMax: number;
        macStyle: number;
      };
      os2?: {
        sCapHeight?: number;
        sxHeight?: number;
        usWeightClass: number;
        usWidthClass: number;
        fsSelection: number;
        fsType?: number;
      };
      post?: {
        isFixedPitch: boolean;
      };
      cmap?: {
        // opentype.js exposes the parsed mapping as glyphIndexMap; subtables is not populated.
        subtables?: unknown[];
        glyphIndexMap?: Record<string, number>;
      };
      gsub?: LayoutTable;
      gpos?: LayoutTable;
      kern?: unknown;
      fvar?: unknown;
      // opentype.js keys every parsed table by name; tables not modelled above are opaque.
      [tableName: string]: unknown;
    };
    glyphs: {
      glyphs: Glyph[];
    };
    charToGlyph(char: string): Glyph;
    hasChar?(char: string): boolean;
    toArrayBuffer(): ArrayBuffer;
  }
  
  /**
   * GSUB/GPOS layout table. Only the members this package reads are modelled.
   * Note: at runtime opentype.js stores `scripts` and `features` as arrays of
   * `{ tag, script }` / `{ tag, feature }` records, so keys are array indices.
   */
  export interface LayoutTable {
    scripts: Record<string, LayoutScriptRecord>;
    features: Record<string, unknown>;
  }

  export interface LayoutScriptRecord {
    tag?: string;
    script?: unknown;
    langSys?: Record<string, unknown>;
  }

  export interface Glyph {
    index: number;
    name?: string;
    advanceWidth?: number;
    leftSideBearing?: number;
    rightSideBearing?: number;
    xMin?: number;
    xMax?: number;
    yMin?: number;
    yMax?: number;
    getBoundingBox(): {
      x1: number;
      y1: number;
      x2: number;
      y2: number;
    };
  }
}