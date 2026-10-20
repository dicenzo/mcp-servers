# mcp-layout

An MCP server that computes layouts: CSS Grid and Flexbox layouts, constraint-based positioning, automatic layout, responsive layouts across breakpoints, and layout metrics. The grid, flex, constraint, and responsive engines are written in TypeScript in `src/util/` with no layout library dependency.

It runs over stdio and works with any MCP client, including Claude Code and Claude Desktop.

## Tools (6)

| Tool | What it does |
| --- | --- |
| `layout.createGrid` | Compute a CSS Grid layout for a set of elements. |
| `layout.createFlex` | Compute a Flexbox layout for a set of elements. |
| `layout.addConstraints` | Position elements by solving layout constraints. |
| `layout.autoLayout` | Place elements automatically with content-based spacing. |
| `layout.responsive` | Compute a layout for each of several breakpoints. |
| `layout.measure` | Report metrics and quality checks for a computed layout. |

## Requirements

- Node.js 18 or later
- Yarn 4 (run `corepack enable` once to get it from Node)

## Install, build, test

```bash
cd packages/mcp-layout
yarn install
yarn build      # compiles src/ to dist/
yarn test       # runs the Jest suite
```

`yarn dev` runs the server from source with tsx.

## Register with an MCP client

### Claude Code

```bash
claude mcp add mcp-layout -- node /path/to/mcp-servers/packages/mcp-layout/dist/index.js
```

### Claude Desktop

Add this to `claude_desktop_config.json` and restart Claude Desktop:

```json
{
  "mcpServers": {
    "mcp-layout": {
      "command": "node",
      "args": ["/path/to/mcp-servers/packages/mcp-layout/dist/index.js"]
    }
  }
}
```

Replace `/path/to/mcp-servers` with the location of your clone.

## Environment variables

This server reads no environment variables.

## Known issues

- Last verified test run: build passes; 71 of 74 tests pass, 0 fail, 3 skipped.
- `layout.createFlex` and `layout.addConstraints` return the placeholder `"CSS generation temporarily disabled"` instead of CSS, and `layout.measure` returns a fixed `accessibilityAnalysis` stub (its touch-target check is never called). The 3 skipped tests cover those outputs.
- The constraint solver has no priority-based conflict resolution. Two `equal` constraints with different values on the same property are rejected, whatever their priorities.


## License

MIT. See [LICENSE](../../LICENSE).
