# integration-tests

A Jest harness that starts the four graphics servers (`mcp-graphics-color`, `mcp-graphics-svg`, `mcp-graphics-image`, `mcp-graphics-type`) as child processes, talks to them over stdio with the MCP client SDK, and checks cross-server behavior.

## What it covers

| Folder | What the tests check |
| --- | --- |
| `tests/integration/` | Calls across servers, for example a color result fed into an SVG call. |
| `tests/workflows/` | Multi-step workflows that combine SVG, typography, and color tools. |
| `tests/performance/` | Concurrent requests against running servers. |
| `tests/mcp-protocol/` | Tool listing, error formats, and other MCP protocol behavior. |
| `tests/examples/` | Small worked examples of using the harness. |

Framework code lives in `src/`:

- `src/mcp/server-manager.ts` starts and stops server processes.
- `src/mcp/client.ts` wraps the MCP client.
- `src/utils/workflow-engine.ts` runs multi-step workflows.
- `src/utils/test-config.ts` holds server definitions, timeouts, and output paths.

## How server paths are resolved

The harness expects to run from `tools/integration-tests/` inside this repo. It resolves servers from `../../packages/<server>/dist/index.js`. The Jest global setup builds each of the four servers (running `npm install` first if `node_modules` is missing) before any test runs.

## Run it

```bash
cd tools/integration-tests
yarn install
yarn build        # type-checks the harness
yarn test         # builds the four servers, then runs all suites
```

Other working scripts:

- `yarn test:integration`, `yarn test:workflows`, `yarn test:performance` run one folder.
- `yarn setup` prepares the test asset folders.
- `yarn validate` checks that the servers are built and reachable.

Test output goes to `test-output/` and `test-results/`, both gitignored.

## Known issues

- Last verified run: harness builds; 23 of 51 tests pass, 28 fail (5 of 5 suites have failures). All four servers start and respond. Most failures are assertions on tool responses (for example, a test expects `success: true` and the tool returns an error or a differently shaped result). Some tests also receive MCP `-32603` internal errors from the servers.
- `package.json` lists scripts whose source files are not in the repo: `benchmark` (`src/benchmarks/run-all.ts`), `cleanup` (`src/scripts/cleanup-test-env.ts`), `dev` (`src/test-runner.ts`), `servers:start` and `servers:stop` (`src/scripts/start-servers.ts`, `src/scripts/stop-servers.ts`). These scripts fail.
- `tests/performance/real-performance-test.ts` imports server source files directly. Its name does not match the Jest test pattern, so `yarn test` does not run it.

## License

MIT. See [LICENSE](../../LICENSE).
