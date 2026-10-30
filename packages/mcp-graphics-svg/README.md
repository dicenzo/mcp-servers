# mcp-graphics-svg

An MCP server for creating and editing SVG, and for turning text diagrams (ASCII art, ASCII wireframes) into SVG. Uses @svgdotjs/svg.js, svgo, and jsdom.

It runs over stdio and works with any MCP client, including Claude Code and Claude Desktop.

## Tools (6)

| Tool | What it does |
| --- | --- |
| `svg.create` | Generate a new SVG document from a list of elements and properties. |
| `svg.optimize` | Reduce SVG file size with svgo. |
| `svg.transform` | Apply translate, rotate, scale, or skew to SVG elements. |
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

## Known issues

- Last verified test run: build passes; all 268 tests in 8 suites pass.
- The `mermaid.to.svg` and `fabric.wireframe` tools were removed. Mermaid never loaded under the test runner, `fabric.wireframe` only returned a placeholder, and their dependencies (mermaid, fabric, canvas) carried most of the package's audit findings.

## License

MIT. See [LICENSE](../../LICENSE).
