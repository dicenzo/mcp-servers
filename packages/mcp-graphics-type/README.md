# mcp-graphics-type

An MCP server for fonts and text: load a font and read its metadata, shape and measure text, subset a font, build fallback font stacks, and validate font files. Built on opentype.js.

It runs over stdio and works with any MCP client, including Claude Code and Claude Desktop.

## Tools (6)

| Tool | What it does |
| --- | --- |
| `type.loadFont` | Load a font (from a path, URL, or system font name) and return metrics, features, and Unicode coverage. |
| `type.shapeText` | Shape a string with the loaded font, including script analysis and OpenType features. |
| `type.measureText` | Measure text dimensions, baselines, bounding boxes, and per-character metrics. |
| `type.subsetFont` | Produce a font subset that contains only the given characters. |
| `type.generateFallback` | Suggest a system font fallback stack for a primary font and target platforms. |
| `type.validateFont` | Check a font file for format problems and compatibility issues. |

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
| `MCP_FONT_DIRS` | Extra directories `type.loadFont` may read font files from, separated by `:` (`;` on Windows). |

Font sources are restricted because tool arguments come from a model and may be attacker-influenced:

- `file`: only `.ttf`, `.otf`, `.woff`, or `.woff2` files inside the system font folders or `MCP_FONT_DIRS`. Symlinks are resolved first, and error messages don't echo the path.
- `url`: only `https://` URLs on public hosts. The resolved address is checked again at connect time, redirects are refused, and downloads stop at 15 seconds or 20MB.
- `buffer`: base64-encoded font data, no restrictions.
- Subsetting runs `python3 -m fontTools.subset`; install fontTools (`pip install fonttools`) to use `type.subsetFont`.

## Notes

- System font lookup reads the standard font folders for macOS (`~/Library/Fonts`), Linux (`~/.fonts`, `~/.local/share/fonts`), and Windows (`%USERPROFILE%\AppData\Local\Microsoft\Windows\Fonts`).

## Known issues

- Last verified test run: build passes; 127 of 130 tests pass, 0 fail, 3 skipped.
- Tests use a small font generated at test time with opentype.js (`tests/fixtures/buildTestFont.ts`). `tests/jest.setup.ts` writes it to a temp directory and lists that directory in `MCP_FONT_DIRS`. No font files are checked in.
- Skipped: loading a font from a public URL (needs the network), loading a system font (depends on which fonts are installed), and creating a subset (needs `python3` with fontTools). The end-to-end test also leaves out its subset step when fontTools is missing.
- `type.subsetFont` was verified by hand with fontTools installed (subset of a generated font succeeded); the automated subset tests still skip when fontTools is missing.


## License

MIT. See [LICENSE](../../LICENSE).
