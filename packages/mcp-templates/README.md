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

- Node.js 20.9 or later (required by sharp 0.35)
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

## Limits

Templates and variables come from the caller, so the server bounds the work one request can cause. These limits apply even when `validateVariables` is `false`.

- Rendering: at most 1,000 items per `repeat` or `{{#each}}`, group nesting 16 deep, 10,000 rendered components, and 5,000,000 characters of output. Layouts are at most 10,000 px on each side.
- Raster export: `width` and `height` are at most 8,192 px, the output area (width × scale × height × scale) is at most 50,000,000 pixels, and sharp refuses SVGs larger than 50,000,000 pixels. PDF export renders at most 2 pages at a time, with a 30-second page timeout.
- Rendered templates passed to `template.export` are schema-checked; their SVG and HTML are at most 5,000,000 characters.
- `pattern` validation rules: patterns are at most 200 characters and values at most 1,000. Patterns with backreferences, lookarounds, or a repeated group that contains a quantifier or alternation (for example `(a+)+` or `(a|b)*`) are rejected. Patterns that pass run in a worker thread with a 500 ms timeout, never on the main thread.
- Output escaping: image sources must be `data:image/*`, `https:`, or a relative path. Colors must be hex, `rgb()`/`rgba()`/`hsl()`/`hsla()`, or a named color. Font families may contain only letters, digits, spaces, commas, quotes, hyphens, and underscores. SVG and HTML components are inserted as written, by design.
- Component library: at most 50 libraries, 500 components per library, and 256 KB per component.

## Known issues

- Last verified test run: build passes; 63 of 63 tests pass.


## License

MIT. See [LICENSE](../../LICENSE).
