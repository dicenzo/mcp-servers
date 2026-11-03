/** Minimal typings for the parts of apca-w3 this package uses */
declare module 'apca-w3' {
  /** Lc contrast of text luminance on background luminance; negative for light text on dark */
  export function APCAcontrast(txtY: number, bgY: number, places?: number): number | string;
  /** Screen luminance (Y) of an 8-bit sRGB colour [r, g, b] (0-255) */
  export function sRGBtoY(rgb: number[]): number;
}
