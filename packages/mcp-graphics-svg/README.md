# mcp-graphics-svg

An MCP server for creating and editing SVG, and for turning text diagrams (Mermaid, ASCII art, ASCII wireframes) into SVG. Uses @svgdotjs/svg.js, svgo, jsdom, and mermaid.

It runs over stdio and works with any MCP client, including Claude Code and Claude Desktop.

## Tools (8)

| Tool | What it does |
| --- | --- |
| `svg.create` | Generate a new SVG document from a list of elements and properties. |
| `svg.optimize` | Reduce SVG file size with svgo. |
| `svg.transform` | Apply translate, rotate, scale, or skew to SVG elements. |
| `svg.path.operations` | Combine SVG paths with union, intersect, subtract, or exclude. See the note below. |
| `wireframe.to.svg` | Convert an ASCII wireframe (for example from a Markdown file) to SVG. |
| `mermaid.to.svg` | Render Mermaid diagram code to SVG with a selectable theme. |
| `svgbob.to.svg` | Convert ASCII-art diagrams to SVG in the style of svgbob (a TypeScript implementation, not the svgbob binary). |
| `fabric.wireframe` | Convert an ASCII wireframe into a Fabric.js-style canvas description with interactive elements, exported as SVG, JSON, or HTML. It does not import the fabric package. |

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

- Last verified test run: build passes; 181 of 185 tests pass, 3 fail, 1 skipped (5 of 10 suites fail).
- `tests/util/performance.test.ts`, `tests/tools/fabricWireframe.test.ts`, and `tests/tools/mermaidToSvg.test.ts` do not compile under ts-jest (test arguments no longer match the tool input types).
- Two `validation` tests fail on assertions.
- One `wireframe.to.svg` test fails because the jsdom-backed SVG document has no `getBBox`, which svg.js needs to position text. Wireframes that contain text may fail at runtime for the same reason.

## License

MIT. See [LICENSE](../../LICENSE).
