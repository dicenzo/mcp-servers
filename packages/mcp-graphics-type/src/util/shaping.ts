import { createHash } from 'crypto';
import * as hb from 'harfbuzzjs';
import bidiFactory from 'bidi-js';
import { toSfnt } from './parseFont.js';

export type TextDirection = 'ltr' | 'rtl' | 'ttb' | 'btt';

export interface ShapeOptions {
  fontSize: number;
  /** Paragraph direction; when omitted it comes from the first strong character (bidi rules P2/P3) */
  direction?: TextDirection;
  /** ISO 15924 script for the whole text; when omitted each script run is shaped as its own script */
  script?: string;
  /** BCP 47 language */
  language?: string;
  /** OpenType features: true/false (1/0), or a value such as an alternate index */
  features?: Record<string, boolean | number>;
  /** Variable font axis values */
  variations?: Record<string, number>;
  /** Added to the advance of every glyph that has one (marks keep zero) */
  letterSpacing?: number;
  /** Added to the advance of each space glyph */
  wordSpacing?: number;
}

export interface ShapedGlyph {
  glyphId: number;
  name?: string;
  /** UTF-16 offset in the text of the first character the glyph comes from */
  cluster: number;
  /** The code point at `cluster` (the first character of a ligature) */
  codepoint: number;
  /** In px */
  advance: { x: number; y: number };
  offset: { x: number; y: number };
  /** HarfBuzz glyph flags (1 unsafe to break, 2 unsafe to concat) */
  flags: number;
}

/** A stretch of text shaped in one direction and script, in logical order */
export interface ShapingRun {
  /** UTF-16 offsets, end exclusive */
  start: number;
  end: number;
  direction: TextDirection;
  /** ISO 15924, such as "Latn" or "Arab" (or the script passed in options) */
  script: string;
  /** Bidi embedding level: even is left to right, odd right to left */
  level: number;
}

export interface ShapedLine {
  /** In visual order: left to right for horizontal text, top to bottom for vertical */
  glyphs: ShapedGlyph[];
  advance: { x: number; y: number };
  /** The paragraph direction */
  direction: TextDirection;
  runs: ShapingRun[];
  /** Ink extents of a glyph in px, y up from the baseline */
  glyphBounds(glyphId: number): { xMin: number; yMin: number; xMax: number; yMax: number } | undefined;
}

const bidi = bidiFactory();

/**
 * Shapes one line of text with HarfBuzz: ligatures, contextual and joining forms,
 * mark positioning and kerning from GSUB/GPOS (or the legacy `kern` table), with
 * Unicode bidi reordering of mixed-direction text and one HarfBuzz run per script.
 * Text with several paragraphs (newlines) is laid out as one line, paragraph after
 * paragraph.
 */
export async function shapeLine(fontData: Buffer | Uint8Array, text: string, options: ShapeOptions): Promise<ShapedLine> {
  const { face, legacyKerning } = await faceFor(fontData);
  const font = new hb.Font(face);
  if (options.variations && Object.keys(options.variations).length > 0) {
    font.setVariations(Object.entries(options.variations).map(([tag, value]) => new hb.Variation(tag, value)));
  }
  const scale = options.fontSize / face.upem;
  const features = Object.entries(options.features ?? {})
    .map(([tag, value]) => new hb.Feature(tag, value === true ? 1 : value === false ? 0 : value));
  const kerning = ![false, 0].includes(options.features?.kern ?? true);

  const vertical = options.direction === 'ttb' || options.direction === 'btt';
  const { runs, visualRuns, direction } = vertical
    ? verticalRuns(text, options.direction as TextDirection, options.script)
    : bidiRuns(text, options);

  const glyphs: ShapedGlyph[] = [];
  for (const run of visualRuns) {
    const buffer = new hb.Buffer();
    buffer.addText(text, run.start, run.end - run.start);
    buffer.setDirection(HB_DIRECTIONS[run.direction]);
    if (run.script !== COMMON_SCRIPT) {
      buffer.setScript(run.script);
    }
    if (options.language) {
      buffer.setLanguage(options.language);
    }
    buffer.guessSegmentProperties();
    hb.shape(font, buffer, features);
    const shaped = buffer.getGlyphInfosAndPositions();
    if (legacyKerning && kerning && !vertical) {
      applyLegacyKerning(shaped, legacyKerning, run.direction === 'rtl');
    }
    for (const info of shaped) {
      glyphs.push({
        glyphId: info.codepoint,
        name: font.glyphName(info.codepoint) || undefined,
        cluster: info.cluster,
        codepoint: text.codePointAt(info.cluster) ?? 0,
        advance: { x: (info.xAdvance ?? 0) * scale, y: (info.yAdvance ?? 0) * scale },
        offset: { x: (info.xOffset ?? 0) * scale, y: (info.yOffset ?? 0) * scale },
        flags: info.flags
      });
    }
  }

  applySpacing(glyphs, text, options, vertical);
  const advance = glyphs.reduce(
    (sum, glyph) => ({ x: sum.x + glyph.advance.x, y: sum.y + glyph.advance.y }),
    { x: 0, y: 0 }
  );

  return {
    glyphs,
    advance,
    direction,
    runs,
    glyphBounds(glyphId) {
      const extents = font.glyphExtents(glyphId);
      if (!extents) {
        return undefined;
      }
      // HarfBuzz extents: bearing to the top-left corner, height negative (y up)
      return {
        xMin: extents.xBearing * scale,
        yMin: (extents.yBearing + extents.height) * scale,
        xMax: (extents.xBearing + extents.width) * scale,
        yMax: extents.yBearing * scale
      };
    }
  };
}

const HB_DIRECTIONS: Record<TextDirection, hb.Direction> = {
  ltr: hb.Direction.LTR,
  rtl: hb.Direction.RTL,
  ttb: hb.Direction.TTB,
  btt: hb.Direction.BTT
};

interface CachedFace {
  face: hb.Face;
  /** Pairs from the legacy `kern` table, when the font has no GPOS kerning to use instead */
  legacyKerning?: Map<number, number>;
}

/** Recently used faces by font content hash, so repeated calls don't copy the font into WASM memory again */
const faceCache = new Map<string, CachedFace>();
const FACE_CACHE_SIZE = 8;

async function faceFor(fontData: Buffer | Uint8Array): Promise<CachedFace> {
  const sfnt = await toSfnt(fontData);
  const key = createHash('sha256').update(sfnt).digest('hex');
  let entry = faceCache.get(key);
  if (entry) {
    faceCache.delete(key);
  } else {
    const face = new hb.Face(new hb.Blob(sfnt));
    if (face.upem === 0 || face.collectUnicodes().length === 0) {
      throw new Error('HarfBuzz could not read the font (no units per em or no character map)');
    }
    // harfbuzzjs is built without legacy `kern` support, which full HarfBuzz
    // applies when GPOS has no kern feature
    const kernTable = face.getTableFeatureTags('GPOS').includes('kern') ? undefined : face.referenceTable('kern');
    entry = { face, legacyKerning: kernTable ? parseKernTable(kernTable) : undefined };
    const oldest = faceCache.keys().next().value;
    if (faceCache.size >= FACE_CACHE_SIZE && oldest !== undefined) {
      faceCache.delete(oldest);
    }
  }
  faceCache.set(key, entry);
  return entry;
}

const pairKey = (left: number, right: number) => left * 0x10000 + right;

/**
 * Reads horizontal format 0 pairs from a `kern` table, either the OpenType
 * version 0 or the Apple version 1 layout. Each subtable's pairs must lie inside
 * the subtable, so overlapping subtables can't make the same bytes count many
 * times; the one exception is the last OpenType subtable, which may run to the
 * end of the table (fonts with more than ~10900 pairs overflow its 16-bit length,
 * which HarfBuzz allows for too). Malformed tables give the pairs read so far.
 */
export function parseKernTable(table: Uint8Array): Map<number, number> | undefined {
  const pairs = new Map<number, number>();
  const view = new DataView(table.buffer, table.byteOffset, table.byteLength);
  try {
    const apple = view.getUint16(0) === 1;
    const numTables = apple ? view.getUint32(4) : view.getUint16(2);
    const headerSize = apple ? 8 : 6;
    let offset = apple ? 8 : 4;
    for (let i = 0; i < numTables && offset + headerSize + 8 <= table.length; i++) {
      const length = apple ? view.getUint32(offset) : view.getUint16(offset + 2);
      const last = i === numTables - 1;
      const end = !apple && last ? table.length : offset + length;
      if (length < headerSize + 8 || end > table.length) {
        break;
      }
      const coverage = view.getUint16(offset + 4);
      const format = apple ? coverage & 0xff : coverage >> 8;
      // OpenType: bit 0 horizontal, 1 minimum, 2 cross-stream, 3 override.
      // Apple: 0x8000 vertical, 0x4000 cross-stream, 0x2000 variation.
      const usable = apple ? (coverage & 0xe000) === 0 : (coverage & 0x07) === 0x01;
      const override = !apple && (coverage & 0x08) !== 0;
      const data = offset + headerSize;
      if (format === 0 && usable) {
        const nPairs = Math.min(view.getUint16(data), Math.floor((end - data - 8) / 6));
        for (let p = 0; p < nPairs; p++) {
          const pair = data + 8 + p * 6;
          const key = pairKey(view.getUint16(pair), view.getUint16(pair + 2));
          const value = view.getInt16(pair + 4);
          pairs.set(key, override ? value : (pairs.get(key) ?? 0) + value);
        }
      }
      offset += length;
    }
  } catch {
    // A truncated table: keep the pairs read so far
  }
  return pairs.size > 0 ? pairs : undefined;
}

/**
 * Adds legacy kerning to one shaped run, in font units, as HarfBuzz does: pairs
 * are taken in logical order, skipping marks (zero-advance glyphs), and the value
 * goes on the first glyph of each pair.
 */
function applyLegacyKerning(run: Array<hb.GlyphInfo & Partial<hb.GlyphPosition>>, pairs: Map<number, number>, rtl: boolean): void {
  const logical = (rtl ? [...run].reverse() : run).filter(glyph => (glyph.xAdvance ?? 0) !== 0);
  for (let i = 0; i < logical.length - 1; i++) {
    const value = pairs.get(pairKey(logical[i].codepoint, logical[i + 1].codepoint));
    if (value) {
      logical[i].xAdvance = (logical[i].xAdvance ?? 0) + value;
    }
  }
}

interface LineRuns {
  /** In logical order */
  runs: ShapingRun[];
  /** In the order they're laid out */
  visualRuns: ShapingRun[];
  direction: TextDirection;
}

function verticalRuns(text: string, direction: TextDirection, forcedScript?: string): LineRuns {
  const runs = scriptRuns(text, 0, text.length, 0, direction, forcedScript);
  return { runs, visualRuns: runs, direction };
}

/**
 * Splits text into runs of one bidi level and one script, puts each paragraph's
 * runs in visual order, and returns the first paragraph's direction.
 */
function bidiRuns(text: string, options: ShapeOptions): LineRuns {
  const embedding = bidi.getEmbeddingLevels(text, (options.direction as 'ltr' | 'rtl' | undefined) ?? 'auto');
  const levels = Array.from(embedding.levels);
  const runs: ShapingRun[] = [];
  const visualRuns: ShapingRun[] = [];
  for (const paragraph of embedding.paragraphs) {
    const paragraphRuns: ShapingRun[] = [];
    // Rule L1.4: whitespace at the end of the line takes the paragraph level
    for (let i = paragraph.end; i >= paragraph.start && isTrailingWhitespace(text[i]); i--) {
      levels[i] = paragraph.level;
    }
    let start = paragraph.start;
    for (let i = paragraph.start + 1; i <= paragraph.end + 1; i++) {
      if (i > paragraph.end || levels[i] !== levels[start]) {
        const level = levels[start];
        paragraphRuns.push(...scriptRuns(text, start, i, level, level % 2 === 1 ? 'rtl' : 'ltr', options.script));
        start = i;
      }
    }
    runs.push(...paragraphRuns);
    visualRuns.push(...visualOrder(paragraphRuns));
  }
  const firstLevel = embedding.paragraphs[0]?.level ?? 0;
  return { runs, visualRuns, direction: firstLevel % 2 === 1 ? 'rtl' : 'ltr' };
}

function isTrailingWhitespace(char: string | undefined): boolean {
  return char !== undefined && ['WS', 'S', 'B', 'BN', 'LRI', 'RLI', 'FSI', 'PDI'].includes(bidi.getBidiCharTypeName(char));
}

/**
 * The scripts runs are split by: those with their own HarfBuzz shaper, and common
 * alphabets. Characters in other scripts, Common (spaces, digits, punctuation) or
 * Inherited (combining marks) join the run they're in.
 */
const SCRIPTS = [
  'Latn', 'Grek', 'Cyrl', 'Armn', 'Geor', 'Hebr', 'Arab', 'Syrc', 'Thaa', 'Nkoo', 'Adlm', 'Mong',
  'Deva', 'Beng', 'Guru', 'Gujr', 'Orya', 'Taml', 'Telu', 'Knda', 'Mlym', 'Sinh',
  'Thai', 'Laoo', 'Tibt', 'Mymr', 'Khmr', 'Hang', 'Hira', 'Kana', 'Hani', 'Bopo',
  'Ethi', 'Cher', 'Tfng', 'Java', 'Bali', 'Sund'
].map(code => ({ code, pattern: new RegExp(`\\p{Script=${code}}`, 'u') }));

/** ISO 15924 for Common: a run with no script-specific characters, left for HarfBuzz to guess */
const COMMON_SCRIPT = 'Zyyy';

function scriptOf(char: string): string | undefined {
  return SCRIPTS.find(script => script.pattern.test(char))?.code;
}

/** Splits [start, end) into runs of one script, or one run of the forced script */
function scriptRuns(text: string, start: number, end: number, level: number, direction: TextDirection, forcedScript?: string): ShapingRun[] {
  if (forcedScript) {
    return [{ start, end, direction, script: forcedScript, level }];
  }
  const runs: ShapingRun[] = [];
  let index = start;
  for (const char of text.slice(start, end)) {
    const script = scriptOf(char);
    const current = runs[runs.length - 1];
    if (!current) {
      runs.push({ start, end: index + char.length, direction, script: script ?? COMMON_SCRIPT, level });
    } else if (script && current.script === COMMON_SCRIPT) {
      current.script = script;
      current.end = index + char.length;
    } else if (script && script !== current.script) {
      runs.push({ start: index, end: index + char.length, direction, script, level });
    } else {
      current.end = index + char.length;
    }
    index += char.length;
  }
  return runs;
}

/**
 * Rule L2 for one paragraph: from the highest level down to the lowest odd
 * level, reverse every stretch of runs at that level or higher.
 */
function visualOrder(runs: ShapingRun[]): ShapingRun[] {
  const order = [...runs];
  if (order.length < 2) {
    return order;
  }
  const levels = order.map(run => run.level);
  const highest = Math.max(...levels);
  const lowestOdd = Math.min(...levels.filter(level => level % 2 === 1), highest + 1);
  for (let level = highest; level >= lowestOdd; level--) {
    for (let i = 0; i < order.length; i++) {
      if (order[i].level >= level) {
        let j = i;
        while (j + 1 < order.length && order[j + 1].level >= level) {
          j++;
        }
        order.splice(i, j - i + 1, ...order.slice(i, j + 1).reverse());
        i = j;
      }
    }
  }
  return order;
}

/** Adds letter spacing to every glyph with an advance, and word spacing to spaces, along the line */
function applySpacing(glyphs: ShapedGlyph[], text: string, options: ShapeOptions, vertical: boolean): void {
  const letterSpacing = options.letterSpacing ?? 0;
  const wordSpacing = options.wordSpacing ?? 0;
  if (letterSpacing === 0 && wordSpacing === 0) {
    return;
  }
  for (const glyph of glyphs) {
    const along = vertical ? glyph.advance.y : glyph.advance.x;
    if (along === 0) {
      continue;
    }
    let extra = letterSpacing;
    if (text[glyph.cluster] === ' ' || text[glyph.cluster] === ' ') {
      extra += wordSpacing;
    }
    if (vertical) {
      // HarfBuzz advances downward text with negative y
      glyph.advance.y += options.direction === 'ttb' ? -extra : extra;
    } else {
      glyph.advance.x += extra;
    }
  }
}
