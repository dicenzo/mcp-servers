# mcp-business-strategy

An MCP server with tools for early-stage business analysis: web search, market data lookups, unit economics, scenario and sensitivity modeling, and Markdown templates served as both a tool and MCP resources.

It runs over stdio and works with any MCP client, including Claude Code and Claude Desktop.

## Tools (5)

| Tool | What it does |
| --- | --- |
| `web.search` | Search the web through Tavily, SerpAPI, or Brave (tried in that order) and rank results by source credibility and relevance. |
| `data.enrich` | Return market size, competitor, and trend figures for a topic. See the note below. |
| `unitecon.calc` | Calculate unit economics: LTV, CAC payback, retention, and related ratios. |
| `scenario.run` | Run scenario analysis with sensitivity testing on business model inputs. |
| `templates.get` | Return the contents of a Markdown template by name. |

## Resources

Each `*.md` file in the templates directory is also listed as an MCP resource at `templates://<name>`.

## Requirements

- Node.js 18 or later
- Yarn 4 (run `corepack enable` once to get it from Node)

## Install, build, test

```bash
cd packages/mcp-business-strategy
yarn install
yarn build      # compiles src/ to dist/
yarn test       # runs the Jest suite
```

`yarn dev` runs the server from source with tsx.

## Register with an MCP client

### Claude Code

```bash
claude mcp add mcp-business-strategy -e TAVILY_API_KEY=your-key -- node /path/to/mcp-servers/packages/mcp-business-strategy/dist/index.js
```

### Claude Desktop

Add this to `claude_desktop_config.json` and restart Claude Desktop:

```json
{
  "mcpServers": {
    "mcp-business-strategy": {
      "command": "node",
      "args": ["/path/to/mcp-servers/packages/mcp-business-strategy/dist/index.js"],
      "env": {
        "TAVILY_API_KEY": "your-key"
      }
    }
  }
}
```

Replace `/path/to/mcp-servers` with the location of your clone.

## Environment variables

Copy `.env.example` to `.env` in this folder, or set the variables in your MCP client config. The server loads `.env` from its working directory.

| Variable | Purpose |
| --- | --- |
| `TAVILY_API_KEY` | Tavily search API key. Tried first. |
| `SERPAPI_KEY` | SerpAPI key. Tried second. |
| `BRAVE_API_KEY` | Brave Search API key. Tried third. |
| `TEMPLATES_DIR` | Directory of Markdown templates. Defaults to `../templates` relative to the working directory. |

## Notes

- `web.search` returns generated placeholder results when no search key is set or every provider fails. The server logs a warning to stderr when this happens. Set at least one key for real results.
- `data.enrich` does not call any external service. It matches keywords in the topic (AI, SaaS, fintech, healthcare, e-commerce, and a general fallback) and returns fixed figures stored in the source, with source names attached. Treat the output as rough illustrative estimates, not current research.
- No templates ship with this package. Point `TEMPLATES_DIR` at your own folder of `.md` files.

## Known issues

- Last verified test run: build passes; 11 of 19 tests pass, 8 fail (8 of 8 suites fail).
- Seven of eight suites cannot resolve `.js` import specifiers (no Jest module mapping), so they do not run.
- The `data.enrich` suite runs; 8 of its tests expect fields (such as `market_leaders`) that the tool no longer returns.

## License

MIT. See [LICENSE](../../LICENSE).
