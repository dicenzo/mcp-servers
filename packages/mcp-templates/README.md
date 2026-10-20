# mcp-templates

An MCP server for design templates: define a template with variables and components, render it to SVG or HTML, validate it, export it to other formats, and build templates from a component library. Rendering uses Handlebars and Mustache; PNG and PDF export use Puppeteer and sharp.

It runs over stdio and works with any MCP client, including Claude Code and Claude Desktop.

## Tools (6)

| Tool | What it does |
| --- | --- |
| `template.create` | Create a reusable template from a structured definition. |
| `template.render` | Render a template with variables to SVG or HTML. |
| `template.validate` | Check a template's structure, components, and variable definitions. |
| `template.export` | Export a rendered template to SVG, PNG, PDF, HTML, or other formats. |
| `template.library.add` | Add a component to the reusable component library. |
| `template.library.compose` | Build a template from library components and a layout. |

## Requirements

- Node.js 18 or later
- Yarn 4 (run `corepack enable` once to get it from Node)

## Install, build, test

```bash
cd packages/mcp-templates
yarn install
yarn build      # compiles src/ to dist/
yarn test       # runs the Jest suite
```

`yarn dev` runs the server from source with tsx.

## Register with an MCP client

### Claude Code

```bash
claude mcp add mcp-templates -- node /path/to/mcp-servers/packages/mcp-templates/dist/index.js
```

### Claude Desktop

Add this to `claude_desktop_config.json` and restart Claude Desktop:

```json
{
  "mcpServers": {
    "mcp-templates": {
      "command": "node",
      "args": ["/path/to/mcp-servers/packages/mcp-templates/dist/index.js"]
    }
  }
}
```

Replace `/path/to/mcp-servers` with the location of your clone.

## Environment variables

This server reads no environment variables.

## Notes

- Puppeteer downloads a Chromium build during `yarn install`. PNG and PDF export need it.

## Known issues

- Last verified test run: build passes; 31 of 31 tests pass.


## License

MIT. See [LICENSE](../../LICENSE).
