# performance-suite

A scaffold for performance testing the four graphics servers (`mcp-graphics-color`, `mcp-graphics-image`, `mcp-graphics-svg`, `mcp-graphics-type`).

**Important:** in its current state the suite does not call the real servers. Each suite in `src/suites/` replaces every tool with a mock function that waits for a computed or random delay and returns a canned result. The timings, pass counts, and load numbers it prints describe those mocks, not the servers. Do not cite its output as server performance.

What exists is the framework for real measurements:

- **Functional check:** call a tool once and confirm it returns a result.
- **Latency check:** warm up, run a fixed number of iterations, and compare the average with a per-tool target defined in `src/suites/*TestSuite.ts`.
- **Load check:** send requests from several concurrent callers for a fixed period and record throughput and error rate.
- **Reports:** a console summary and an HTML report in `reports/` (gitignored).

To measure the real servers, replace the `mock*` functions in each suite with calls to the server over MCP. `tools/integration-tests/src/mcp/` has a server manager and client that already do this.

## Layout

| Path | Purpose |
| --- | --- |
| `src/index.ts` | CLI entry point. |
| `src/orchestrator/PerformanceOrchestrator.ts` | Server list (paths, tool names) and run order. |
| `src/framework/TestRunner.ts` | Runs functional, latency, and load checks against a supplied function. |
| `src/suites/` | Test cases, targets, and the mock tool implementations for each server. |
| `src/reporting/ReportGenerator.ts` | Console and HTML reports. |
| `src/ComprehensivePerformanceSuite.ts` | An older all-in-one version that spawns the servers but also returns simulated results. `src/index.ts` does not use it. |

## Run it

```bash
cd tools/performance-suite
yarn install
yarn test        # builds, then runs node dist/index.js
```

Pass `--help` to `node dist/index.js` for options such as `--output` and `--format`.

## Known issues

- The suites measure mock functions, not the servers (see above).
- Last verified run: build passes and the script runs to completion. Its own summary reported 62 of 78 checks within target; because the checks time mocks, that number says nothing about the servers.
- `package.json` lists scripts that point at files not in the repo: `test:functional`, `test:performance`, `test:load`, `test:memory`, `test:all`, `monitor`, and `report` expect `dist/functional.js`, `dist/performance.js`, `dist/load-test.js`, `dist/memory-test.js`, `dist/monitor.js`, and `dist/report-generator.js`. These scripts fail. Use `yarn test`.

## License

MIT. See [LICENSE](../../LICENSE).
