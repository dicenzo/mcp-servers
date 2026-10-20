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

This server reads no environment variables.

## Notes

- System font lookup reads the standard font folders for macOS (`~/Library/Fonts`), Linux (`~/.fonts`, `~/.local/share/fonts`), and Windows (`%USERPROFILE%\AppData\Local\Microsoft\Windows\Fonts`).

## Known issues

- Last verified test run: build passes; 0 tests run (3 of 3 suites fail to start).
- `tests/jest.setup.ts` mocks `hb-wasm`, which is not a dependency, so Jest cannot start any suite.

## License

MIT. See [LICENSE](../../LICENSE).
