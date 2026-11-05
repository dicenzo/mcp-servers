# mcp-graphics-svg

An MCP server for creating and editing SVG, and for turning text diagrams (ASCII art, ASCII wireframes) into SVG. Uses @svgdotjs/svg.js, svgo, and jsdom.

It runs over stdio and works with any MCP client, including Claude Code and Claude Desktop.

## Tools (6)

| Tool | What it does |
| --- | --- |
| `svg.create` | Generate a new SVG document from a list of elements and properties. |
| `svg.optimize` | Reduce SVG file size with svgo. |
| `svg.transform` | Apply translate, rotate, scale, skew or matrix transforms to SVG elements. |
| `svg.path.operations` | Combine SVG paths with union, intersect, subtract, or exclude. See the note below. |
| `wireframe.to.svg` | Convert an ASCII wireframe (for example from a Markdown file) to SVG. |
| `svgbob.to.svg` | Convert ASCII-art diagrams to SVG in the style of svgbob (a TypeScript implementation, not the svgbob binary). |

## Requirements

- Node.js 18 or later
- Yarn 4 (run `corepack enable` once to get it from Node)

## Install, build, test

```bash
cd packages/mcp-graphics-svg
yarn install
yarn build      # compiles src/ to dist/
yarn test       # runs the Jest suite
```

`yarn dev` runs the server from source with tsx.

## Register with an MCP client

### Claude Code

```bash
claude mcp add mcp-graphics-svg -- node /path/to/mcp-servers/packages/mcp-graphics-svg/dist/index.js
```

### Claude Desktop

Add this to `claude_desktop_config.json` and restart Claude Desktop:

```json
{
  "mcpServers": {
    "mcp-graphics-svg": {
      "command": "node",
      "args": ["/path/to/mcp-servers/packages/mcp-graphics-svg/dist/index.js"]
    }
  }
}
```

Replace `/path/to/mcp-servers` with the location of your clone.

## Environment variables

This server reads no environment variables.

## Notes

- `svg.path.operations` does not compute true geometric boolean operations. For example, `union` concatenates the input paths (the source says so in a comment). Treat its output as approximate.
- `advanced_examples/` holds four small sample SVGs produced by the server.
- Each tool's advertised `inputSchema` is generated from the zod schema it validates with (`src/util/toolSchema.ts`), so clients see the limits, defaults and descriptions that are enforced. `svg.create` group children refer to `#/$defs/SVGElement`. A failed call is a tool result with `isError: true` and `{ error, code, message, details?, suggestions?, tool }` as its text; only an unknown tool name is a JSON-RPC error (`-32601`).
- `svgbob.to.svg` and `wireframe.to.svg` read their text the same way: CRLF, CR and LF line endings are all accepted, tabs expand to 8-column tab stops, and each character (including an emoji) takes one cell. East Asian wide characters still take one cell, not two.
- Path data (`svg.create`, `svg.path.operations`) is checked against the full SVG path grammar, including compact forms such as `M-5-5`, `M.5.5`, `1e2` and arc flags without separators.
- Colours (`fill`, `stroke`, `svgbob.to.svg` colours) may be 3, 4, 6 or 8-digit hex, `rgb()`/`rgba()` with channels 0–255 or 0–100%, `hsl()`/`hsla()`, in comma or space syntax with an optional `/ alpha`, a CSS named colour, `currentColor`, `none`, `inherit`, or `url(#id)` with an optional fallback colour. Out-of-range values such as `rgb(999, 999, 999)` are rejected.

## Known issues

- Last verified test run: build passes; all 338 tests in 12 suites pass.
- `svg.optimize` passes `removeEmptyElements` and other options as `preset-default` overrides that the installed SVGO says aren't part of the preset, so those switches log warnings and may do nothing. The code also reads `removeMetadata` and `removeViewBox`, but they aren't in the input schema, so they are stripped and not offered.
- `svg.transform` has code for a transform `origin`, but setting an origin alone doesn't move anything in svg.js, so it isn't in the input schema either.
- The `mermaid.to.svg` and `fabric.wireframe` tools were removed. Mermaid never loaded under the test runner, `fabric.wireframe` only returned a placeholder, and their dependencies (mermaid, fabric, canvas) carried most of the package's audit findings.

## License

MIT. See [LICENSE](../../LICENSE).
