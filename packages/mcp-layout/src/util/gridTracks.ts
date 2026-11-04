import { MAX_GRID_TRACKS } from '../types/layout.js';

/**
 * Parser and sizer for grid-template-columns / grid-template-rows and gap values.
 * The parser is also the validator: whatever parses is valid, and anything else
 * fails with an error naming the offending token.
 *
 * Supported: lengths in px, em/rem (16px), %, fr, `auto`, `min-content`,
 * `max-content`, `minmax(min, max)`, `repeat(n | auto-fill | auto-fit, tracks)` and
 * `[line names]`. Content-sized tracks use a 100px estimate, since there is no
 * content to measure. `auto-fit` is treated like `auto-fill` (empty tracks are kept).
 */

const ROOT_FONT_SIZE = 16;
/** Size used for tracks sized by content (auto, min-content, max-content) */
export const CONTENT_TRACK_SIZE = 100;

export class GridTemplateError extends Error {
  constructor(message: string, readonly token: string) {
    super(message);
    this.name = 'GridTemplateError';
  }
}

type Breadth =
  | { kind: 'length'; px: number }
  | { kind: 'percent'; value: number }
  | { kind: 'fr'; value: number }
  | { kind: 'content'; keyword: 'auto' | 'min-content' | 'max-content' };

export interface TrackDef {
  min: Breadth;
  max: Breadth;
  /** Name of the line before this track, if any */
  name?: string;
}

type TrackListItem =
  | { type: 'track'; track: TrackDef }
  | { type: 'repeat'; count: number | 'auto-fill' | 'auto-fit'; tracks: TrackDef[] };

export interface SizedTrack {
  start: number;
  size: number;
  name?: string;
}

const LENGTH = /^(\d+(?:\.\d+)?|\.\d+)(px|em|rem|%|fr)?$/;
const UNSUPPORTED_UNITS = /^(\d+(?:\.\d+)?|\.\d+)(vh|vw|vmin|vmax|ch|ex|cm|mm|in|pt|pc|q|lh)$/i;

function parseBreadth(token: string, context: string): Breadth {
  if (token === 'auto' || token === 'min-content' || token === 'max-content') {
    return { kind: 'content', keyword: token };
  }
  if (UNSUPPORTED_UNITS.test(token)) {
    throw new GridTemplateError(`Unsupported unit in ${context}: "${token}" (use px, em, rem, %, or fr)`, token);
  }
  const match = token.match(LENGTH);
  if (!match || (match[2] === undefined && parseFloat(match[1]) !== 0)) {
    throw new GridTemplateError(`Invalid track size in ${context}: "${token}"`, token);
  }
  const value = parseFloat(match[1]);
  switch (match[2]) {
  case 'fr': return { kind: 'fr', value };
  case '%': return { kind: 'percent', value };
  case 'em':
  case 'rem': return { kind: 'length', px: value * ROOT_FONT_SIZE };
  default: return { kind: 'length', px: value };
  }
}

/** Splits on top-level whitespace, keeping `( … )` and `[ … ]` groups whole */
function tokenize(text: string, context: string): string[] {
  const tokens: string[] = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(' || char === '[') {
      depth++;
    } else if (char === ')' || char === ']') {
      depth--;
      if (depth < 0) {
        throw new GridTemplateError(`Unbalanced "${char}" in ${context}`, char);
      }
    }
    if (/\s/.test(char) && depth === 0) {
      if (current) {
        tokens.push(current);
      }
      current = '';
    } else {
      current += char;
    }
  }
  if (depth !== 0) {
    throw new GridTemplateError(`Unclosed bracket in ${context}: "${text.trim()}"`, text.trim());
  }
  if (current) {
    tokens.push(current);
  }
  return tokens;
}

function parseTrackSize(token: string, context: string): TrackDef {
  const minmax = token.match(/^minmax\((.*)\)$/);
  if (minmax) {
    const parts = minmax[1].split(',').map(part => part.trim());
    if (parts.length !== 2) {
      throw new GridTemplateError(`minmax() needs two values: "${token}"`, token);
    }
    const min = parseBreadth(parts[0], context);
    const max = parseBreadth(parts[1], context);
    if (min.kind === 'fr') {
      throw new GridTemplateError(`The minimum of minmax() can't be an fr value: "${token}"`, token);
    }
    return { min, max };
  }
  if (token.includes('(')) {
    throw new GridTemplateError(`Unsupported function in ${context}: "${token}"`, token);
  }
  const breadth = parseBreadth(token, context);
  // A bare fr track behaves as minmax(auto, fr); its minimum is not used here
  return { min: breadth.kind === 'fr' ? { kind: 'length', px: 0 } : breadth, max: breadth };
}

function parseLineNames(token: string, context: string): string[] {
  const names = token.slice(1, -1).trim().split(/\s+/).filter(Boolean);
  for (const name of names) {
    if (!/^[A-Za-z_-][\w-]*$/.test(name) || name === 'span' || name === 'auto') {
      throw new GridTemplateError(`Invalid line name in ${context}: "${name}"`, name);
    }
  }
  return names;
}

/** Parses a plain track list (no repeat()), attaching each [name] to the following track */
function parsePlainTracks(tokens: string[], context: string, allowRepeat: boolean): TrackListItem[] {
  const items: TrackListItem[] = [];
  let pendingName: string | undefined;
  for (const token of tokens) {
    if (token.startsWith('[')) {
      if (!token.endsWith(']')) {
        throw new GridTemplateError(`Invalid line names in ${context}: "${token}"`, token);
      }
      pendingName = parseLineNames(token, context)[0] ?? pendingName;
      continue;
    }
    const repeat = token.match(/^repeat\((.*)\)$/);
    if (repeat) {
      if (!allowRepeat) {
        throw new GridTemplateError(`repeat() can't be nested: "${token}"`, token);
      }
      const comma = repeat[1].indexOf(',');
      if (comma < 0) {
        throw new GridTemplateError(`repeat() needs a count and a track list: "${token}"`, token);
      }
      const countText = repeat[1].slice(0, comma).trim();
      const inner = parsePlainTracks(tokenize(repeat[1].slice(comma + 1), context), context, false)
        .map(item => (item as { type: 'track'; track: TrackDef }).track);
      if (inner.length === 0) {
        throw new GridTemplateError(`repeat() needs at least one track: "${token}"`, token);
      }
      let count: number | 'auto-fill' | 'auto-fit';
      if (countText === 'auto-fill' || countText === 'auto-fit') {
        count = countText;
        if (inner.some(track => track.min.kind !== 'length' && track.max.kind !== 'length')) {
          throw new GridTemplateError(`repeat(${countText}, …) needs fixed track sizes: "${token}"`, token);
        }
      } else if (/^\d+$/.test(countText) && parseInt(countText, 10) >= 1) {
        count = parseInt(countText, 10);
      } else {
        throw new GridTemplateError(`Invalid repeat() count: "${countText}"`, countText);
      }
      if (pendingName) {
        inner[0] = { ...inner[0], name: inner[0].name ?? pendingName };
        pendingName = undefined;
      }
      items.push({ type: 'repeat', count, tracks: inner });
      continue;
    }
    items.push({ type: 'track', track: { ...parseTrackSize(token, context), ...(pendingName ? { name: pendingName } : {}) } });
    pendingName = undefined;
  }
  return items;
}

/** Parses a template into its items; throws GridTemplateError for invalid syntax. */
export function parseTrackList(template: string, context = 'grid template'): TrackListItem[] {
  const tokens = tokenize(template, context);
  if (tokens.length === 0) {
    throw new GridTemplateError(`Empty ${context}`, template);
  }
  const items = parsePlainTracks(tokens, context, true);
  if (items.length === 0) {
    throw new GridTemplateError(`${context} has line names but no tracks: "${template}"`, template);
  }
  if (items.filter(item => item.type === 'repeat' && typeof item.count !== 'number').length > 1) {
    throw new GridTemplateError(`Only one auto-fill/auto-fit repeat() is allowed: "${template}"`, template);
  }
  return items;
}

/** Resolves a length or percentage (no fr) to px; throws for anything else. */
export function resolveLength(token: string, percentBasis: number, context: string): number {
  const breadth = parseBreadth(token.trim(), context);
  if (breadth.kind === 'length') {
    return breadth.px;
  }
  if (breadth.kind === 'percent') {
    return (breadth.value / 100) * percentBasis;
  }
  throw new GridTemplateError(`Invalid ${context}: "${token}"`, token);
}

/**
 * Resolves `gap` (one value, or "row column") plus `rowGap`/`columnGap` overrides
 * to px. Percentages refer to the container size on that axis.
 */
export function resolveGaps(
  config: { gap?: string; rowGap?: string; columnGap?: string },
  width: number,
  height: number
): { row: number; column: number } {
  const parts = (config.gap ?? '0').trim().split(/\s+/);
  if (parts.length > 2) {
    throw new GridTemplateError(`gap takes one or two values: "${config.gap}"`, config.gap ?? '');
  }
  const [rowPart, columnPart = rowPart] = parts;
  return {
    row: resolveLength(config.rowGap ?? rowPart, height, 'row gap'),
    column: resolveLength(config.columnGap ?? columnPart, width, 'column gap')
  };
}

const breadthPx = (breadth: Breadth, available: number): number | undefined => {
  if (breadth.kind === 'length') {
    return breadth.px;
  }
  if (breadth.kind === 'percent') {
    return (breadth.value / 100) * available;
  }
  return undefined;
};

/** Expands repeat() into a flat track list, enforcing MAX_GRID_TRACKS before allocating. */
export function expandTracks(items: TrackListItem[], available: number, gap: number): TrackDef[] {
  const fixedCount = items.reduce((sum, item) =>
    sum + (item.type === 'track' ? 1 : typeof item.count === 'number' ? item.count * item.tracks.length : 0), 0);
  for (const item of items) {
    if (item.type === 'repeat' && typeof item.count === 'number' && item.count > MAX_GRID_TRACKS) {
      throw new Error(`Grid repeat() count ${item.count} exceeds the maximum of ${MAX_GRID_TRACKS}`);
    }
  }
  if (fixedCount > MAX_GRID_TRACKS) {
    throw new Error(`Grid repeat() expands to more than ${MAX_GRID_TRACKS} tracks`);
  }

  // auto-fill / auto-fit: as many repetitions as fit beside the other tracks
  const autoRepeatCount = (tracks: TrackDef[]): number => {
    const definite = (track: TrackDef) =>
      breadthPx(track.max, available) ?? breadthPx(track.min, available) ?? 0;
    const others = items.flatMap(item => item.type === 'track' ? [item.track]
      : typeof item.count === 'number' ? Array(item.count).fill(item.tracks).flat() : []);
    const used = others.reduce((sum, track) => sum + definite(track), 0) + others.length * gap;
    const perRepeat = tracks.reduce((sum, track) => sum + definite(track), 0) + tracks.length * gap;
    const count = perRepeat > 0 ? Math.floor((available - used + gap) / perRepeat) : 1;
    return Math.max(1, Math.min(count, Math.floor((MAX_GRID_TRACKS - fixedCount) / tracks.length)));
  };

  const result: TrackDef[] = [];
  for (const item of items) {
    if (item.type === 'track') {
      result.push(item.track);
    } else {
      const count = typeof item.count === 'number' ? item.count : autoRepeatCount(item.tracks);
      for (let i = 0; i < count; i++) {
        result.push(...item.tracks.map((track, j) => (i > 0 && j === 0 ? { ...track, name: undefined } : track)));
      }
    }
  }
  return result;
}

/**
 * Sizes tracks for the available space with gaps between them. Fixed and percentage
 * tracks take their size and content tracks the 100px estimate. The rest of the space
 * (after gaps) goes to fr tracks, any whose share falls below its minimum is frozen at
 * that minimum and the rest are re-shared. With no fr tracks, leftover space is split
 * between tracks whose maximum is `auto`, as CSS stretches them.
 */
export function sizeTracks(tracks: TrackDef[], available: number, gap: number): SizedTrack[] {
  const sizes = tracks.map(track => {
    if (track.max.kind === 'fr') {
      return 0;
    }
    const min = breadthPx(track.min, available) ?? CONTENT_TRACK_SIZE;
    const max = breadthPx(track.max, available) ?? Math.max(min, CONTENT_TRACK_SIZE);
    return Math.max(min, Math.min(max, Math.max(min, CONTENT_TRACK_SIZE)));
  });
  const free = available - gap * Math.max(0, tracks.length - 1);

  const flexible = new Set(tracks.flatMap((track, i) => (track.max.kind === 'fr' ? [i] : [])));
  if (flexible.size > 0) {
    // Freeze tracks whose fr share would be smaller than their minimum
    for (;;) {
      const fixedTotal = sizes.reduce((sum, size, i) => (flexible.has(i) ? sum : sum + size), 0);
      const totalFr = [...flexible].reduce((sum, i) => sum + (tracks[i].max as { value: number }).value, 0);
      const unit = totalFr > 0 ? Math.max(0, free - fixedTotal) / Math.max(totalFr, 1) : 0;
      let frozen = false;
      for (const i of flexible) {
        const minimum = breadthPx(tracks[i].min, available) ?? 0;
        const share = (tracks[i].max as { value: number }).value * unit;
        if (share < minimum) {
          sizes[i] = minimum;
          flexible.delete(i);
          frozen = true;
        } else {
          sizes[i] = share;
        }
      }
      if (!frozen) {
        break;
      }
    }
  } else {
    const stretchable = tracks.flatMap((track, i) => (track.max.kind === 'content' && track.max.keyword === 'auto' ? [i] : []));
    const leftover = free - sizes.reduce((sum, size) => sum + size, 0);
    if (stretchable.length > 0 && leftover > 0) {
      // Content tracks start from zero when stretched, so equal auto tracks split evenly
      const base = stretchable.reduce((sum, i) => sum + sizes[i], 0);
      const share = (base + leftover) / stretchable.length;
      stretchable.forEach(i => {
        sizes[i] = Math.max(breadthPx(tracks[i].min, available) ?? 0, share);
      });
    }
  }

  let position = 0;
  return tracks.map((track, i) => {
    const sized = { start: position, size: sizes[i], ...(track.name ? { name: track.name } : {}) };
    position += sizes[i] + gap;
    return sized;
  });
}
