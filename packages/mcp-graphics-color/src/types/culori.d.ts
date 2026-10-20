declare module 'culori' {
  export function converter(mode: string): (color: any) => any;
  export function formatHex(color: any): string;
  export function formatCss(color: any): string;
  export function wcagContrast(color1: any, color2: any): number;
  export function differenceEuclidean(mode: string): (color1: any, color2: any) => number;
}