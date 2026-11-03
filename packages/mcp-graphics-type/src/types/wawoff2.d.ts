// Type declarations for wawoff2 (Google's woff2 encoder/decoder compiled to WASM)

declare module 'wawoff2' {
  /** Converts a WOFF2 font to TTF/OTF; rejects when the data isn't valid WOFF2. */
  export function decompress(woff2: Uint8Array): Promise<Uint8Array>;
  /** Converts a TTF/OTF font to WOFF2. */
  export function compress(sfnt: Uint8Array): Promise<Uint8Array>;
  const wawoff2: { decompress: typeof decompress; compress: typeof compress };
  export default wawoff2;
}
