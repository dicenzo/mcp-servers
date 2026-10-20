# mcp-graphics-image

An MCP server for raster image processing on top of sharp: resize, convert, crop, filter, composite, and optimize images.

It runs over stdio and works with any MCP client, including Claude Code and Claude Desktop.

## Tools (6)

| Tool | What it does |
| --- | --- |
| `image.resize` | Resize an image to given dimensions with a choice of interpolation method. |
| `image.convert` | Convert between formats (PNG, JPEG, WebP, AVIF, and others) with quality settings. |
| `image.crop` | Crop an image to a rectangle. |
| `image.filter` | Apply filters such as blur, sharpen, brightness, and contrast. |
| `image.composite` | Layer multiple images with position, blend mode, and opacity. |
| `image.optimize` | Compress an image for web delivery, trading size against quality. |

## Requirements

- Node.js 18 or later
- Yarn 4 (run `corepack enable` once to get it from Node)

## Install, build, test

```bash
cd packages/mcp-graphics-image
yarn install
yarn build      # compiles src/ to dist/
yarn test       # runs the Jest suite
```

`yarn dev` runs the server from source with tsx.

## Register with an MCP client

### Claude Code

```bash
claude mcp add mcp-graphics-image -- node /path/to/mcp-servers/packages/mcp-graphics-image/dist/index.js
```

### Claude Desktop

Add this to `claude_desktop_config.json` and restart Claude Desktop:

```json
{
  "mcpServers": {
    "mcp-graphics-image": {
      "command": "node",
      "args": ["/path/to/mcp-servers/packages/mcp-graphics-image/dist/index.js"]
    }
  }
}
```

Replace `/path/to/mcp-servers` with the location of your clone.

## Environment variables

This server reads no environment variables.

## Notes

- sharp ships native binaries. If install fails on your platform, see the sharp installation docs.

## Known issues

- Last verified test run: build passes; 27 of 27 tests pass (3 suites).
- Five older test files are disabled with a `.disabled` suffix in `tests/` and do not run.

## License

MIT. See [LICENSE](../../LICENSE).
