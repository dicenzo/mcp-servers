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

- Node.js 20.9 or later (required by sharp 0.35)
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
- Input limits: images are rejected above 8192 px on either side, 10 MB decoded (about 14 MB of base64), or when the declared `format` does not match the actual encoding (`jpg` and `jpeg` are interchangeable). `image.composite` accepts at most 10 layers on a canvas of at most 8192x8192.

## Known issues

- Last verified test run: build passes; 54 of 54 tests pass (5 suites).
- Five older test files are disabled with a `.disabled` suffix in `tests/` and do not run.

## License

MIT. See [LICENSE](../../LICENSE).
