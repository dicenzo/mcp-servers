# mcp-graphics-color

An MCP server for color work: converting between color spaces, checking WCAG contrast, generating palettes, matching colors against a brand palette, linting a brand palette, and validating accessibility. Built on culori.

It runs over stdio and works with any MCP client, including Claude Code and Claude Desktop.

## Tools (6)

| Tool | What it does |
| --- | --- |
| `color.convert` | Convert colors between color spaces (sRGB, HSL, Lab, LCH, OKLCH, and others) with configurable precision. |
| `color.contrast` | Check the WCAG contrast ratio between a foreground and background color. With `algorithm: "apca"` it also reports the APCA lightness contrast (`apca.lc`, signed, with `polarity`). Also reports the CIEDE2000 Delta E between them. |
| `color.generatePalette` | Generate a palette from a base color using a harmony rule (monochromatic, analogous, complementary, and others), with role names, contrast, optional locked brand colors, spacing, 50-950 scales, and CSS/Tailwind/design-token exports. |
| `color.brandMatch` | Find the closest color in a brand palette using CIEDE2000 Delta E. Accepts named palette entries and reports threshold fit, a lightness/chroma/hue breakdown, skipped entries, and duplicates. |
| `color.lintBrand` | Check a brand palette for near-duplicates, contrast problems, and allowed or forbidden colors (matched within a CIEDE2000 `maxDeltaE`, default 3). |
| `color.validateAccessibility` | Validate color combinations against WCAG and return recommendations. |

## Color difference (Delta E)

`color.brandMatch`, `color.lintBrand`, and `color.contrast` measure color difference with CIEDE2000. On this scale about 1 is just noticeable side by side, and 2 to 3 reads as the same color in use. `maxDeltaE` defaults to 3 in `color.brandMatch` and `color.lintBrand`. Delta E ignores transparency.

## Using `color.brandMatch`

Palette entries can be plain colors or `{ name, color }` objects. Colors can be strings (hex, CSS, or named) or `{ space, values, alpha }` objects. For `rgba` and `hsla`, a fourth entry in `values` is read as alpha when `alpha` is not given.

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

## Using `color.generatePalette`

Hues rotate in OKLCH by default (or `lab`/`hsl` via `space`) and are mapped into sRGB. The base color is always included; extra colors are tints and shades of the harmony hues. Grey base colors fall back to a monochromatic ramp.

```json
{
  "baseColor": "#3366cc",
  "harmony": "complementary",
  "count": 5,
  "lockedColors": ["#ff6600"],
  "minDeltaE": 8,
  "scale": true,
  "exports": ["css", "tailwind", "tokens"],
  "exportPrefix": "brand"
}
```

| Input | Meaning |
| --- | --- |
| `count` | Total colors (2-20), including locked colors. |
| `options` | `hueShift` rotates every generated color (-360 to 360). `lightnessRange` and `saturationRange` are `[first, last]` percentages spread across the generated colors; saturation is a percentage of the space's maximum chroma. |
| `lockedColors` | Up to 10 existing colors kept unchanged and placed after the generated ones. Generated colors stay at least `minDeltaE` (default 3) away from them. |
| `minDeltaE` | Minimum CIEDE2000 distance between generated colors. Crowded colors are replaced with tints and shades; if the spacing can't be met the palette is shorter and a warning says so. |
| `scale` | Also return a Tailwind-style 50-950 OKLCH scale for each harmony hue and locked color. |
| `exports`, `exportPrefix` | Also return CSS custom properties (`--brand-base-500`), a Tailwind `theme.extend.colors` object, and/or W3C design tokens. |

Alongside `result.colors`, the response includes:

| Field | Meaning |
| --- | --- |
| `swatches` | One per color: `role` (`base`, `complement`, `triad-1`, `base-lighter-2`, `locked-1` ...), `hex`, WCAG `contrast` on white and black with the readable `textColor`, `chromaLost` (share of chroma removed to fit sRGB), and the `nearest` other color. |
| `scales`, `exports` | Present when requested. |
| `closePairs` | Pairs closer than `minDeltaE` (or 3 when only `lockedColors` is set). The base and locked colors are always kept, so they can end up close. |
| `warnings` | Why the palette differs from the request: grey base, harmony hues that lost over 75% of their chroma, unmet spacing, close pairs, or colors identical after rounding. |

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

- Last verified test run: build passes; all 392 tests pass (11 of 11 suites).
- Contrast (in `color.contrast`, `color.lintBrand` and `color.validateAccessibility`) compares the unrounded WCAG ratio with thresholds, so 4.4993:1 fails AA. Reported ratios are truncated to 2 decimals (4.4993 shows as 4.49). A translucent foreground is composited over the background, a translucent background over white, and out-of-gamut colors are clipped to sRGB first, as their hex is.
- A few tests assert wall-clock limits (for example, a batch of conversions under 50ms) and can fail on a slow or heavily loaded machine.
- `package.json` lists chroma-js, colorjs.io, delta-e and wcag-contrast as dependencies, but the source imports none of them. Color math uses culori, and APCA uses `apca-w3`.

## License

MIT. See [LICENSE](../../LICENSE).
