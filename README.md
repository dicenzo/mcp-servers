# mcp-servers

A collection of Model Context Protocol (MCP) servers written in TypeScript. MCP is an open protocol that lets AI clients such as Claude Code and Claude Desktop call tools provided by local or remote servers.

Each server lives in its own folder under `packages/`, has its own `package.json` and lockfile, and runs over stdio. Two test harnesses under `tools/` exercise the graphics servers together.

## Servers

| Server | What it does | Tools |
| --- | --- | --- |
| [mcp-graphics-color](packages/mcp-graphics-color) | Color space conversion, WCAG contrast checks, palette generation, brand palette matching and linting. | 6 |
| [mcp-graphics-image](packages/mcp-graphics-image) | Raster image resize, convert, crop, filter, composite, and optimize, using sharp. | 6 |
| [mcp-graphics-svg](packages/mcp-graphics-svg) | SVG creation, optimization, and transforms, plus ASCII art and ASCII wireframe conversion to SVG. | 6 |
| [mcp-graphics-type](packages/mcp-graphics-type) | Font loading and metadata, text shaping and measurement, font subsetting, fallback stacks, font validation. | 6 |
| [mcp-layout](packages/mcp-layout) | CSS Grid, Flexbox, constraint-based, automatic, and responsive layout computation. | 6 |
| [mcp-templates](packages/mcp-templates) | Design templates: create, render to SVG or HTML, validate, export (including PNG and PDF), and compose from a component library. | 6 |
| [mcp-business-strategy](packages/mcp-business-strategy) | Web search, market data lookups, unit economics, scenario modeling, and Markdown templates. | 5 |

Tool counts come from each server's `ListTools` handler. Each package README lists every tool.

## Harnesses

| Harness | What it does |
| --- | --- |
| [tools/integration-tests](tools/integration-tests) | Jest suites that start the four graphics servers and test cross-server calls, workflows, concurrency, and MCP protocol behavior. |
| [tools/performance-suite](tools/performance-suite) | A framework for functional, latency, and load checks with HTML reports. It currently times mock functions, not the real servers. See its README. |

## Requirements

- Node.js 18 or later (verified with Node 22)
- Yarn 4. Run `corepack enable` once and Node provides it.

## Build and test

There is no root workspace. Install and build each package on its own:

```bash
cd packages/mcp-graphics-color
yarn install
yarn build      # compiles src/ to dist/
yarn test       # runs the Jest suite
```

To build every server:

```bash
for p in packages/*/; do (cd "$p" && yarn install && yarn build); done
```

The harnesses expect the servers to be built first, or they build them during setup. See each harness README.

## Register a server with Claude Code

```bash
claude mcp add mcp-graphics-color -- node /path/to/mcp-servers/packages/mcp-graphics-color/dist/index.js
```

Pass environment variables with `-e NAME=value`. Only `mcp-business-strategy` reads any (see below).

## Register a server with Claude Desktop

Add an entry per server to `claude_desktop_config.json`, then restart Claude Desktop:

```json
{
  "mcpServers": {
    "mcp-graphics-color": {
      "command": "node",
      "args": ["/path/to/mcp-servers/packages/mcp-graphics-color/dist/index.js"]
    },
    "mcp-business-strategy": {
      "command": "node",
      "args": ["/path/to/mcp-servers/packages/mcp-business-strategy/dist/index.js"],
      "env": {
        "TAVILY_API_KEY": "your-key",
        "TEMPLATES_DIR": "/path/to/your/templates"
      }
    }
  }
}
```

Replace `/path/to/mcp-servers` with the location of your clone.

## Environment variables

Only `mcp-business-strategy` reads environment variables. See [its `.env.example`](packages/mcp-business-strategy/.env.example):

| Variable | Purpose |
| --- | --- |
| `TAVILY_API_KEY`, `SERPAPI_KEY`, `BRAVE_API_KEY` | Search providers for `web.search`, tried in that order. Without any key, `web.search` returns placeholder results. |
| `TEMPLATES_DIR` | Folder of Markdown templates for `templates.get` and the `templates://` resources. |

## Known issues

These are the results of the last verified run (Node 22, Yarn 4.9.2, macOS). Every package builds. Several test suites have problems that predate this repo; they are listed here and in each package README.

| Package | Build | Tests |
| --- | --- | --- |
| mcp-graphics-color | passes | 186 of 210 pass; 24 fail (assertion mismatches; `tests/index.test.ts` does not compile) |
| mcp-graphics-image | passes | 27 of 27 pass (five older test files are disabled) |
| mcp-graphics-svg | passes | 181 of 185 pass; 3 fail, 1 skipped; 3 suites do not compile |
| mcp-graphics-type | passes | 127 of 130 pass; 3 skipped (network, installed system fonts, fontTools) |
| mcp-layout | passes | 71 of 74 pass; 3 skipped (CSS output and accessibility analysis are stubbed in the tools) |
| mcp-templates | passes | 31 of 31 pass |
| mcp-business-strategy | passes | 11 of 19 pass; 7 of 8 suites cannot resolve `.js` imports; `data.enrich` tests expect fields the tool no longer returns |
| tools/integration-tests | passes | 23 of 51 pass; failures are mostly assertions on tool responses |
| tools/performance-suite | passes | runs to completion, but it times mock functions, so its results do not reflect the servers |

Behavior to know about:

- `mcp-business-strategy`: `data.enrich` returns fixed, keyword-matched figures stored in the source. It does not fetch live data. `web.search` falls back to placeholder results when no search key works.
- `mcp-graphics-svg`: `svg.path.operations` does not compute true geometric boolean operations, and `wireframe.to.svg` can fail on wireframes with text because jsdom has no `getBBox`.
- `tools/performance-suite` replaces every tool with a mock that waits a simulated delay. Treat it as scaffolding until the mocks are replaced with real MCP calls.
- Some harness `package.json` scripts point at files that are not in the repo. The harness READMEs list them.

## License

MIT. See [LICENSE](LICENSE).
