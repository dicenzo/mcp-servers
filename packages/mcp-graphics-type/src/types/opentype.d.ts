// Type declarations for opentype.js

declare module 'opentype.js' {
  export function parse(buffer: ArrayBuffer): Font;
  
  export interface Font {
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
        subtables: any[];
      };
      gsub?: {
        scripts: Record<string, any>;
        features: Record<string, any>;
      };
      gpos?: {
        scripts: Record<string, any>;
        features: Record<string, any>;
      };
      kern?: any;
      fvar?: any;
    };
    glyphs: {
      glyphs: Glyph[];
    };
    charToGlyph(char: string): Glyph;
    hasChar?(char: string): boolean;
    toArrayBuffer(): ArrayBuffer;
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
  
  export class Font {
    constructor(options: {
      familyName: string;
      styleName: string;
      unitsPerEm: number;
      ascender: number;
      descender: number;
      glyphs: Glyph[];
    });
    
    toArrayBuffer(): ArrayBuffer;
  }
}