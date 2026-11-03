import { describe, test, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { loadFontTool } from '../../src/tools/loadFont.js';
import { FONT_DIRS_ENV } from '../../src/util/fontSources.js';
import { extractFromCollection, readFontNames } from '../../src/util/systemFonts.js';
import { buildTestFont, buildCollection, toBuffer } from '../fixtures/buildTestFont.js';

type ToolResult = { content: { text: string }[]; isError?: boolean };
const resultOf = (response: unknown) => JSON.parse((response as ToolResult).content[0].text);
const font = (familyName: string, styleName = 'Regular') => toBuffer(buildTestFont({ familyName, styleName }));

const loadSystem = async (name: string) => resultOf(await loadFontTool.invoke({ type: 'system', name }));

describe('type: "system" finds fonts by the names inside them', () => {
  let dir: string;
  let outside: string;
  let previousDirs: string | undefined;

  beforeAll(() => {
    dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mcp-type-system-'));
    // Sorts first and its file name contains "Mcp Probe", but it is another family
    fs.writeFileSync(path.join(dir, '.Mcp Probeian.otf'), font('Mcp Probeian'));
    fs.mkdirSync(path.join(dir, 'nested', 'deeper'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'nested', 'probe-b.otf'), font('Mcp Probe', 'Bold'));
    fs.writeFileSync(path.join(dir, 'nested', 'deeper', 'probe-r.otf'), font('Mcp Probe', 'Regular'));
    fs.writeFileSync(path.join(dir, 'Collection.ttc'), buildCollection([font('Mcp Coll'), font('Mcp Coll', 'Bold')]));
    // Fonts outside the allowed folders, reachable only through symlinks
    outside = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mcp-type-outside-'));
    fs.writeFileSync(path.join(outside, 'secret.otf'), font('Mcp Outside File'));
    fs.mkdirSync(path.join(outside, 'folder'));
    fs.writeFileSync(path.join(outside, 'folder', 'other.otf'), font('Mcp Outside Folder'));
    fs.symlinkSync(path.join(outside, 'secret.otf'), path.join(dir, 'linked.otf'));
    fs.symlinkSync(path.join(outside, 'folder'), path.join(dir, 'linked-folder'));
    if (process.platform !== 'win32') {
      // Opening a FIFO for reading blocks until a writer appears
      execFileSync('mkfifo', [path.join(dir, 'pipe.ttf')]);
    }
    previousDirs = process.env[FONT_DIRS_ENV];
    process.env[FONT_DIRS_ENV] = [previousDirs, dir].filter(Boolean).join(path.delimiter);
  });

  afterAll(() => {
    process.env[FONT_DIRS_ENV] = previousDirs;
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(outside, { recursive: true, force: true });
  });

  test('a family name picks that family\'s regular style, searching subfolders', async () => {
    const result = await loadSystem('Mcp Probe');
    expect(result.error).toBeUndefined();
    expect(result.font.family).toBe('Mcp Probe');
    expect(result.font.subfamily).toBe('Regular');
  });

  test('a full name or PostScript name picks that exact style', async () => {
    expect((await loadSystem('Mcp Probe Bold')).font.subfamily).toBe('Bold');
    expect((await loadSystem('McpProbe-Bold')).font.subfamily).toBe('Bold');
    expect((await loadSystem('mcp probe bold')).font.subfamily).toBe('Bold');
  });

  test('fonts inside a .ttc collection can be found and loaded', async () => {
    const regular = await loadSystem('Mcp Coll');
    expect(regular.font.family).toBe('Mcp Coll');
    expect(regular.font.subfamily).toBe('Regular');
    const bold = await loadSystem('Mcp Coll Bold');
    expect(bold.font.subfamily).toBe('Bold');
    expect(bold.font.format).toBe('otf');
  });

  test('a .ttc file can be loaded by path (its first font)', async () => {
    const result = resultOf(await loadFontTool.invoke({ type: 'file', path: path.join(dir, 'Collection.ttc') }));
    expect(result.error).toBeUndefined();
    expect(result.font.fullName).toBe('Mcp Coll Regular');
  });

  test('symlinks leading out of the font folders are not followed, and special files are skipped', async () => {
    expect((await loadSystem('Mcp Outside File')).error).toBe(true);
    const folder = await loadSystem('Mcp Outside Folder');
    expect(folder.error).toBe(true);
    expect(folder.suggestions.join(' ')).not.toContain('Mcp Outside');
  });

  test('a partial name is not guessed, and the error suggests close names', async () => {
    const result = await loadSystem('Mcp Prob');
    expect(result.error).toBe(true);
    expect(result.code).toBe('SYSTEM_FONT_ACCESS_FAILED');
    expect(result.suggestions.join(' ')).toContain('Mcp Probe');
  });
});

describe('font tables are bounds-checked before anything is allocated', () => {
  test('extractFromCollection rejects a table that runs past the end of the file', () => {
    const collection = buildCollection([font('Mcp Bounds')]);
    const firstRecord = collection.readUInt32BE(12) + 12;
    collection.writeUInt32BE(0x7fffffff, firstRecord + 12); // table length
    expect(() => extractFromCollection(collection, 0)).toThrow(/past the end/);
  });

  test('readFontNames ignores a name table longer than the file', () => {
    const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'mcp-type-names-'));
    try {
      const data = font('Mcp Long Name');
      for (let i = 0; i < data.readUInt16BE(4); i++) {
        if (data.toString('latin1', 12 + i * 16, 16 + i * 16) === 'name') {
          data.writeUInt32BE(0x7fffffff, 12 + i * 16 + 12);
        }
      }
      const file = path.join(dir, 'long.otf');
      fs.writeFileSync(file, data);
      expect(readFontNames(file)).toEqual([]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
