import * as fs from 'fs';
import * as path from 'path';

/**
 * Finds installed fonts by the names stored inside them (the `name` table), not by
 * file name: on macOS "Georgia" must not match ".SF Georgian.ttf", and most system
 * fonts live in subfolders or in .ttc collections whose file names say little.
 */

/** File types whose `name` table can be read without decompressing */
const INDEXED_EXTENSIONS = new Set(['.ttf', '.otf', '.ttc', '.otc']);
const MAX_DEPTH = 8;
const MAX_FILES = 20_000;

/** Subfamily names treated as the default style when only a family is requested */
const REGULAR_STYLES = ['regular', 'roman', 'book', 'normal', 'plain'];

export interface SystemFontEntry {
  path: string;
  /** Index of the font inside a collection; 0 for single fonts */
  index: number;
  family: string;
  subfamily: string;
  /** Typographic family and subfamily (name IDs 16 and 17), when the font has them */
  typographicFamily?: string;
  typographicSubfamily?: string;
  fullName: string;
  postScriptName: string;
}

export type SystemFontMatch =
  | { found: true; entry: SystemFontEntry }
  | { found: false; similar: string[] };

const indexCache = new Map<string, SystemFontEntry[]>();

/** Lowercase with spaces, hyphens and underscores removed, so "Times-New Roman" equals "timesnewroman". */
const normalize = (name: string) => name.toLowerCase().replace(/[\s_-]+/g, '');

/**
 * Looks a font up by full name, PostScript name or family name in the given font
 * directories (searched recursively). A family name picks its regular style. Names
 * are never matched by substring; a miss returns similar family names instead.
 * The index is cached per set of directories and rebuilt once on a miss, so fonts
 * installed while the server runs are still found.
 */
export function findSystemFont(name: string, roots: string[]): SystemFontMatch {
  const key = roots.join(path.delimiter);
  let entries = indexCache.get(key);
  if (entries) {
    const cached = matchFont(name, entries);
    if (cached.found) {
      return cached;
    }
  }
  entries = buildIndex(roots);
  indexCache.set(key, entries);
  return matchFont(name, entries);
}

function matchFont(name: string, entries: SystemFontEntry[]): SystemFontMatch {
  const query = normalize(name);
  const exact = entries.find(e => normalize(e.fullName) === query || normalize(e.postScriptName) === query);
  if (exact) {
    return { found: true, entry: exact };
  }

  const family = entries.filter(e =>
    normalize(e.family) === query || (e.typographicFamily !== undefined && normalize(e.typographicFamily) === query)
  );
  if (family.length > 0) {
    const styleRank = (e: SystemFontEntry) => {
      const styles = [e.typographicSubfamily, e.subfamily].map(s => REGULAR_STYLES.indexOf(normalize(s ?? '')));
      const ranks = styles.filter(rank => rank >= 0);
      return ranks.length > 0 ? Math.min(...ranks) : REGULAR_STYLES.length;
    };
    const best = family.reduce((a, b) => (styleRank(b) < styleRank(a) ? b : a));
    return { found: true, entry: best };
  }

  const families = new Set<string>();
  for (const e of entries) {
    const familyName = e.typographicFamily ?? e.family;
    const normalized = normalize(familyName);
    if (query.length > 0 && (normalized.includes(query) || query.includes(normalized))) {
      families.add(familyName);
    }
  }
  return { found: false, similar: [...families].sort().slice(0, 8) };
}

function buildIndex(roots: string[]): SystemFontEntry[] {
  const entries: SystemFontEntry[] = [];
  const seenDirs = new Set<string>();
  let files = 0;

  const walk = (dir: string, depth: number) => {
    let real: string;
    try {
      real = fs.realpathSync(dir);
    } catch {
      return;
    }
    if (seenDirs.has(real) || depth > MAX_DEPTH) {
      return;
    }
    seenDirs.add(real);

    let dirents: fs.Dirent[];
    try {
      dirents = fs.readdirSync(real, { withFileTypes: true });
    } catch {
      return;
    }
    // Sorted so that the same fonts always give the same answer
    dirents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const dirent of dirents) {
      const fullPath = path.join(real, dirent.name);
      if (dirent.isDirectory()) {
        walk(fullPath, depth + 1);
      } else if (INDEXED_EXTENSIONS.has(path.extname(dirent.name).toLowerCase()) && files < MAX_FILES) {
        files++;
        entries.push(...readFontNames(fullPath));
      }
    }
  };

  for (const root of roots) {
    walk(root, 0);
  }
  return entries;
}

/** Reads the names of every font in a font file or collection; unreadable files give []. */
export function readFontNames(filePath: string): SystemFontEntry[] {
  let fd: number | undefined;
  try {
    fd = fs.openSync(filePath, 'r');
    const read = (position: number, length: number) => {
      const buffer = Buffer.alloc(length);
      const bytesRead = fs.readSync(fd as number, buffer, 0, length, position);
      if (bytesRead < length) {
        throw new Error('Truncated font file');
      }
      return buffer;
    };

    const header = read(0, 12);
    const fontOffsets = header.toString('latin1', 0, 4) === 'ttcf'
      ? Array.from({ length: Math.min(header.readUInt32BE(8), 256) }, (_, i) => i)
        .map(i => read(12 + i * 4, 4).readUInt32BE(0))
      : [0];

    const entries: SystemFontEntry[] = [];
    fontOffsets.forEach((offset, index) => {
      const names = readNameTable(read, offset);
      const family = names.get(1);
      if (family) {
        entries.push({
          path: filePath,
          index,
          family,
          subfamily: names.get(2) ?? 'Regular',
          typographicFamily: names.get(16),
          typographicSubfamily: names.get(17),
          fullName: names.get(4) ?? family,
          postScriptName: names.get(6) ?? ''
        });
      }
    });
    return entries;
  } catch {
    return [];
  } finally {
    if (fd !== undefined) {
      fs.closeSync(fd);
    }
  }
}

/** Name IDs 1, 2, 4, 6, 16 and 17, preferring Windows English, then Unicode, then Mac Roman records. */
function readNameTable(read: (position: number, length: number) => Buffer, fontOffset: number): Map<number, string> {
  const numTables = read(fontOffset + 4, 2).readUInt16BE(0);
  const directory = read(fontOffset + 12, numTables * 16);
  for (let i = 0; i < numTables; i++) {
    if (directory.toString('latin1', i * 16, i * 16 + 4) === 'name') {
      return parseNames(read(directory.readUInt32BE(i * 16 + 8), directory.readUInt32BE(i * 16 + 12)));
    }
  }
  return new Map();
}

const WANTED_NAME_IDS = new Set([1, 2, 4, 6, 16, 17]);

function parseNames(table: Buffer): Map<number, string> {
  const count = table.readUInt16BE(2);
  const storage = table.readUInt16BE(4);
  const best = new Map<number, { score: number; value: string }>();
  for (let i = 0; i < count; i++) {
    const record = 6 + i * 12;
    const platformId = table.readUInt16BE(record);
    const encodingId = table.readUInt16BE(record + 2);
    const languageId = table.readUInt16BE(record + 4);
    const nameId = table.readUInt16BE(record + 6);
    if (!WANTED_NAME_IDS.has(nameId)) {
      continue;
    }
    const start = storage + table.readUInt16BE(record + 10);
    const bytes = table.subarray(start, start + table.readUInt16BE(record + 8));

    let score: number;
    let value: string;
    if (platformId === 3 && (encodingId === 1 || encodingId === 10)) {
      score = languageId === 0x0409 ? 3 : 1;
      value = decodeUtf16BE(bytes);
    } else if (platformId === 0) {
      score = 2;
      value = decodeUtf16BE(bytes);
    } else if (platformId === 1 && encodingId === 0) {
      score = languageId === 0 ? 2 : 0;
      value = bytes.toString('latin1');
    } else {
      continue;
    }
    const current = best.get(nameId);
    if (value && (!current || score > current.score)) {
      best.set(nameId, { score, value });
    }
  }
  return new Map([...best].map(([id, { value }]) => [id, value]));
}

function decodeUtf16BE(bytes: Buffer): string {
  const swapped = Buffer.from(bytes.subarray(0, bytes.length & ~1));
  swapped.swap16();
  return swapped.toString('utf16le');
}

/**
 * Copies one font out of a TrueType/OpenType collection into a standalone sfnt,
 * which opentype.js and pyftsubset can read. Non-collections are returned unchanged.
 */
export function extractFromCollection(data: Buffer, index: number): Buffer {
  if (data.length < 12 || data.toString('latin1', 0, 4) !== 'ttcf') {
    return data;
  }
  const numFonts = data.readUInt32BE(8);
  if (index < 0 || index >= numFonts) {
    throw new Error(`Font index ${index} is out of range for a collection of ${numFonts} fonts`);
  }
  const fontOffset = data.readUInt32BE(12 + index * 4);
  const numTables = data.readUInt16BE(fontOffset + 4);
  const directorySize = 12 + numTables * 16;
  const pad4 = (n: number) => (n + 3) & ~3;

  const tables = Array.from({ length: numTables }, (_, i) => {
    const record = fontOffset + 12 + i * 16;
    return { record, offset: data.readUInt32BE(record + 8), length: data.readUInt32BE(record + 12) };
  });
  const output = Buffer.alloc(directorySize + tables.reduce((sum, t) => sum + pad4(t.length), 0));
  data.copy(output, 0, fontOffset, fontOffset + directorySize);

  let offset = directorySize;
  tables.forEach((table, i) => {
    if (table.offset + table.length > data.length) {
      throw new Error('Collection table extends past the end of the file');
    }
    data.copy(output, offset, table.offset, table.offset + table.length);
    output.writeUInt32BE(offset, 12 + i * 16 + 8);
    offset += pad4(table.length);
  });
  return output;
}
