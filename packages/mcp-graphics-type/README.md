# mcp-graphics-type

An MCP server for fonts and text: load a font and read its metadata, shape and measure text, subset a font, build fallback font stacks, and validate font files. Text is shaped with HarfBuzz (harfbuzzjs, WebAssembly) and reordered with the Unicode bidi algorithm (bidi-js); font metadata comes from opentype.js. WOFF fonts are decompressed with zlib and WOFF2 fonts with wawoff2 first.

It runs over stdio and works with any MCP client, including Claude Code and Claude Desktop.

## Tools (6)

| Tool | What it does |
| --- | --- |
| `type.loadFont` | Load a font (from a path, URL, or system font name) and return metrics, features, and Unicode coverage. |
| `type.shapeText` | Shape a string with HarfBuzz: ligatures, contextual and joining forms, mark positioning, kerning and OpenType features, with mixed-direction text reordered. |
| `type.measureText` | Measure shaped text: dimensions, baselines, bounding boxes, and per-glyph metrics. |
| `type.subsetFont` | Produce a font subset that contains only the given characters. |
| `type.generateFallback` | Suggest a system font fallback stack for a primary font and target platforms. |
| `type.validateFont` | Check a font file (TTF, OTF, WOFF, WOFF2) for missing tables, embedding permissions (decoded `fsType`), Unicode block coverage and browser/OS support (including colour-font formats). Collections (`.ttc`) are reported as unsupported; load one face with a `system` source instead. |

## Requirements

- Node.js 18 or later
- Yarn 4 (run `corepack enable` once to get it from Node)

## Install, build, test

```bash
cd packages/mcp-graphics-type
yarn install
yarn build      # compiles src/ to dist/
yarn test       # runs the Jest suite
```

`yarn test` runs Jest with `node --experimental-vm-modules`, because harfbuzzjs is ESM-only and loads its WebAssembly with a top-level `await`. Plain `npx jest` can't load it.

`yarn dev` runs the server from source with tsx.

## Register with an MCP client

### Claude Code

```bash
claude mcp add mcp-graphics-type -- node /path/to/mcp-servers/packages/mcp-graphics-type/dist/index.js
```

### Claude Desktop

Add this to `claude_desktop_config.json` and restart Claude Desktop:

```json
{
  "mcpServers": {
    "mcp-graphics-type": {
      "command": "node",
      "args": ["/path/to/mcp-servers/packages/mcp-graphics-type/dist/index.js"]
    }
  }
}
```

Replace `/path/to/mcp-servers` with the location of your clone.

## Environment variables

| Variable | Purpose |
|---|---|
| `MCP_FONT_DIRS` | Extra directories fonts may be read from, separated by `:` (`;` on Windows). `file` paths may point into them, and `system` names are looked up in them too. |

Font sources are restricted because tool arguments come from a model and may be attacker-influenced:

- `file`: only `.ttf`, `.otf`, `.ttc`, `.otc`, `.woff`, or `.woff2` files inside the system font folders or `MCP_FONT_DIRS`. Symlinks are resolved first, and error messages don't echo the path. A `.ttc`/`.otc` collection loads its first font.
- `system`: a family name (`Georgia`), full name (`Georgia Bold`) or PostScript name (`Georgia-Bold`), matched against the names inside each font, ignoring case, spaces and hyphens. A family name loads its regular style. The system font folders and `MCP_FONT_DIRS` are searched with their subfolders, including the fonts inside `.ttc`/`.otc` collections. Names aren't matched by substring; when nothing matches, the error lists installed families with a similar name.
- `url`: only `https://` URLs on public hosts. The resolved address is checked again at connect time, redirects are refused, and downloads stop at 15 seconds or 20MB.
- `buffer`: base64-encoded font data, no restrictions.
- Subsetting runs `python3 -m fontTools.subset`; install fontTools (`pip install fonttools`) to use `type.subsetFont`.
- `type.subsetFont` accepts at most 256 `unicodeRanges`, each with integer `start`/`end` in 0..0x10FFFF. Overlapping ranges are merged.

## Notes

- System font lookup reads the standard font folders for macOS (`~/Library/Fonts`), Linux (`~/.fonts`, `~/.local/share/fonts`), and Windows (`%USERPROFILE%\AppData\Local\Microsoft\Windows\Fonts`).

- Each tool's advertised `inputSchema` is generated from the zod schema it validates with (`src/util/toolSchema.ts`), so clients see the limits, defaults and descriptions that are enforced. `type.loadFont`'s font-source union is advertised as one object with a `type` enum (model APIs reject a top-level `anyOf`), and `buffer` data is advertised as base64 text; zod still checks the exact source shape. A failed call is a tool result with `isError: true`; only an unknown tool name is a JSON-RPC error (`-32601`).

- Shaping (`type.shapeText`, `type.measureText`):
  - The text is split by bidi level and then by script. Each run goes through HarfBuzz with its direction and script, and the runs are put in visual order (rule L2). Glyphs come back in visual order (left to right, or top to bottom for `ttb`), with `cluster` as the UTF-16 offset of each glyph's first character. `runs` lists the runs in logical order.
  - When `direction` is omitted, the paragraph direction comes from the first strong character. When `script` is omitted, each run is shaped as its own script; a `script` you pass applies to the whole text.
  - `letterSpacing` is added to every glyph with an advance (marks keep zero) and `wordSpacing` to space glyphs, after shaping. Unlike CSS, ligatures stay on when letter spacing is set.
  - Text with newlines is laid out as one line, paragraph after paragraph. There's no line breaking.
  - The harfbuzzjs build leaves out legacy `kern` table support. When a font has no GPOS kerning, its `kern` pairs (format 0, OpenType or Apple layout) are applied after shaping, as full HarfBuzz would. `features: { kern: false }` turns it off.
  - `type.measureText` takes per-glyph advances and ink bounds from the shaped glyphs (a ligature is one entry, with `char` set to all its characters). Ascender, cap height and the other font metrics come from opentype.js.

## Known issues

- Last verified test run: build passes; 231 of 234 tests pass, 0 fail, 3 skipped.
- Tests use a small font generated at test time with opentype.js (`tests/fixtures/buildTestFont.ts`). `tests/jest.setup.ts` writes it to a temp directory and lists that directory in `MCP_FONT_DIRS`. No font files are checked in.
- Skipped: loading a font from a public URL (needs the network), loading a system font (depends on which fonts are installed), and creating a subset (needs `python3` with fontTools). The end-to-end test also leaves out its subset step when fontTools is missing.
- `type.subsetFont` was verified by hand with fontTools installed (subset of a generated font succeeded); the automated subset tests still skip when fontTools is missing.


## License

MIT. See [LICENSE](../../LICENSE).
