# mcp-graphics-color

An MCP server for color work: converting between color spaces, checking WCAG contrast, generating palettes, matching colors against a brand palette, and linting a brand palette. Built on chroma-js and culori.

It runs over stdio and works with any MCP client, including Claude Code and Claude Desktop.

## Tools (6)

| Tool | What it does |
| --- | --- |
| `color.convert` | Convert colors between color spaces (sRGB, HSL, Lab, LCH, OKLCH, and others) with configurable precision. |
| `color.contrast` | Check the WCAG contrast ratio between a foreground and background color. |
| `color.generatePalette` | Generate a palette from a base color using a harmony rule (monochromatic, analogous, complementary, and others). |
| `color.brandMatch` | Find the closest color in a brand palette using CIEDE2000 Delta E. Accepts named palette entries and reports threshold fit, a lightness/chroma/hue breakdown, skipped entries, and duplicates. |
| `color.lintBrand` | Check a brand palette for consistency, contrast problems, and allowed or forbidden colors. |
| `color.validateAccessibility` | Validate color combinations against WCAG and return recommendations. |

## Requirements

- Node.js 18 or later
- Yarn 4 (run `corepack enable` once to get it from Node)

## Install, build, test

```bash
cd packages/mcp-graphics-color
yarn install
yarn build      # compiles src/ to dist/
yarn test       # runs the Jest suite
```

`yarn dev` runs the server from source with tsx.

## Register with an MCP client

### Claude Code

```bash
claude mcp add mcp-graphics-color -- node /path/to/mcp-servers/packages/mcp-graphics-color/dist/index.js
```

### Claude Desktop

Add this to `claude_desktop_config.json` and restart Claude Desktop:

```json
{
  "mcpServers": {
    "mcp-graphics-color": {
      "command": "node",
      "args": ["/path/to/mcp-servers/packages/mcp-graphics-color/dist/index.js"]
    }
  }
}
```

Replace `/path/to/mcp-servers` with the location of your clone.

## Environment variables

This server reads no environment variables.

## Known issues

- Last verified test run: build passes; all 331 tests pass (9 of 9 suites).
- A few tests assert wall-clock limits (for example, a batch of conversions under 50ms) and can fail on a slow or heavily loaded machine.
- Delta E is CIEDE2000 in `color.brandMatch`, `color.lintBrand`, and `color.contrast` metadata. About 1 is just noticeable side by side; `maxDeltaE` defaults to 3. Delta E ignores transparency, so `color.brandMatch` reports `alphaDifference` separately.

## License

MIT. See [LICENSE](../../LICENSE).
