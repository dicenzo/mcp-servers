# mcp-graphics-color

An MCP server for color work: converting between color spaces, checking WCAG contrast, generating palettes, matching colors against a brand palette, linting a brand palette, and validating accessibility. Built on culori.

It runs over stdio and works with any MCP client, including Claude Code and Claude Desktop.

## Tools (6)

| Tool | What it does |
| --- | --- |
| `color.convert` | Convert colors between color spaces (sRGB, HSL, Lab, LCH, OKLCH, and others) with configurable precision. |
| `color.contrast` | Check the WCAG contrast ratio between a foreground and background color. Also reports the CIEDE2000 Delta E between them. |
| `color.generatePalette` | Generate a palette from a base color using a harmony rule (monochromatic, analogous, complementary, and others). |
| `color.brandMatch` | Find the closest color in a brand palette using CIEDE2000 Delta E. Accepts named palette entries and reports threshold fit, a lightness/chroma/hue breakdown, skipped entries, and duplicates. |
| `color.lintBrand` | Check a brand palette for near-duplicates, contrast problems, and allowed or forbidden colors (matched within a CIEDE2000 `maxDeltaE`, default 3). |
| `color.validateAccessibility` | Validate color combinations against WCAG and return recommendations. |

## Color difference (Delta E)

`color.brandMatch`, `color.lintBrand`, and `color.contrast` measure color difference with CIEDE2000. On this scale about 1 is just noticeable side by side, and 2 to 3 reads as the same color in use. `maxDeltaE` defaults to 3 in `color.brandMatch` and `color.lintBrand`. Delta E ignores transparency.

## Using `color.brandMatch`

Palette entries can be plain colors or `{ name, color }` objects. Colors can be strings (hex, CSS, or named) or `{ space, values, alpha }` objects.

```json
{
  "targetColor": "#1b4fd8",
  "brandPalette": [
    { "name": "Primary Blue", "color": "#2a5ce0" },
    { "name": "Navy", "color": "#0b2a6f" },
    "#4a3fd8"
  ],
  "maxDeltaE": 3,
  "maxAlternatives": 3
}
```

The result includes:

| Field | Meaning |
| --- | --- |
| `bestMatch`, `deltaE`, `confidence` | The closest palette color, its CIEDE2000 distance, and `exact`, `high`, `medium`, or `low`. |
| `withinThreshold` | Whether `deltaE` is at or below `maxDeltaE`. The closest color is always returned, so check this before treating it as a match. |
| `paletteIndex`, `name` | Where the match sits in your input, and its name if you gave one. |
| `difference` | Lightness, chroma, and hue change from the target, plus a summary such as `"slightly lighter, slightly less saturated, slightly cooler"`. "Warmer" and "cooler" mean the hue moved toward orange or toward blue. |
| `alphaDifference` | Difference in transparency (0 to 1), reported separately because Delta E ignores it. |
| `alternatives` | The next-closest colors (up to `maxAlternatives`), each with the same fields. |
| `skipped` | Entries that could not be parsed, with the reason. |
| `duplicates` | Entries identical to an earlier entry. They are left out of matching, and the first entry wins. |

## Errors

Every tool returns `{ "success": true, "result": ..., "metadata": ... }` on success. On failure it returns `{ "success": false, "error": { "code", "message", "details", "suggestions" } }`, where `code` is a value such as `INVALID_COLOR` and `suggestions` lists ways to fix the input.

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

- Last verified test run: build passes; all 334 tests pass (10 of 10 suites).
- A few tests assert wall-clock limits (for example, a batch of conversions under 50ms) and can fail on a slow or heavily loaded machine.
- `color.contrast` accepts `algorithm: "apca"` but always computes the WCAG 2 ratio. The `algorithm` field in the result echoes the input.
- `package.json` lists chroma-js, colorjs.io, delta-e, apca-w3, and wcag-contrast as dependencies, but the source imports none of them. All color math uses culori.

## License

MIT. See [LICENSE](../../LICENSE).
