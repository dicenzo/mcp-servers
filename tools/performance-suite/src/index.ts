#!/usr/bin/env node

/**
 * MCP Graphics Performance Suite
 * Main entry point for comprehensive performance analysis
 */

import { PerformanceOrchestrator } from './orchestrator/PerformanceOrchestrator.js';
import { ReportGenerator } from './reporting/ReportGenerator.js';
import { BenchmarkConfig, DEFAULT_CONFIG } from './types/performance.js';

interface CliArgs {
  config?: string;
  output?: string;
  format?: 'html' | 'json' | 'console';
  functional?: boolean;
  performance?: boolean;
  load?: boolean;
  memory?: boolean;
  servers?: string[];
  verbose?: boolean;
}

class PerformanceSuiteCLI {
  private args: CliArgs;
  
  constructor(args: CliArgs = {}) {
    this.args = args;
  }

  async run(): Promise<void> {
    console.log('🎨 MCP Graphics Performance Suite');
    console.log('='.repeat(50));
    console.log('Comprehensive performance analysis for MCP Graphics servers\\n');

    try {
      // Parse configuration
      const config = this.parseConfig();
      
      // Initialize orchestrator
      const orchestrator = new PerformanceOrchestrator(config);
      
      // Run analysis
      console.log('🚀 Starting performance analysis...');
      const report = await orchestrator.runComprehensiveAnalysis();
      
      // Generate reports
      const reportGenerator = new ReportGenerator();
      
      // Always show console summary
      reportGenerator.printConsoleSummary(report);
      
      // Generate additional formats based on args
      const outputBase = this.args.output || './reports/mcp-graphics-performance';
      const timestamp = new Date().toISOString().slice(0, 19).replace(/:/g, '-');
      
      if (!this.args.format || this.args.format === 'html') {
        reportGenerator.generateHtmlReport(report, `${outputBase}-${timestamp}.html`);
      }
      
      if (this.args.format === 'json' || this.args.verbose) {
        reportGenerator.generateJsonReport(report, `${outputBase}-${timestamp}.json`);
      }
      
      // Exit with appropriate code
      const success = report.summary.overallPassRate >= 80; // 80% pass rate threshold
      process.exit(success ? 0 : 1);
      
    } catch (error) {
      console.error('❌ Performance analysis failed:');
      console.error(error instanceof Error ? error.message : String(error));
      if (this.args.verbose && error instanceof Error) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  }

  private parseConfig(): Partial<BenchmarkConfig> {
    const config: Partial<BenchmarkConfig> = { ...DEFAULT_CONFIG };
    
    // Adjust config based on CLI args
    if (this.args.functional && !this.args.performance) {
      config.iterations = 1; // Just run once for functional testing
    }
    
    if (this.args.load) {
      config.concurrencyLevels = [1, 5, 10, 20, 50]; // More aggressive load testing
      config.includeStressTests = true;
    }
    
    if (this.args.memory) {
      config.enableMemoryProfiling = true;
    }
    
    // TODO: Load from config file if specified
    if (this.args.config) {
      // Implementation for loading external config file
    }
    
    return config;
  }
}

// CLI Argument parsing
function parseArgs(): CliArgs {
  const args: CliArgs = {};
  const argv = process.argv.slice(2);
  
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    
    switch (arg) {
      case '--config':
        args.config = argv[++i];
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--format':
        args.format = argv[++i] as 'html' | 'json' | 'console';
        break;
      case '--functional':
        args.functional = true;
        break;
      case '--performance':
        args.performance = true;
        break;
      case '--load':
        args.load = true;
        break;
      case '--memory':
        args.memory = true;
        break;
      case '--servers':
        args.servers = argv[++i].split(',');
        break;
      case '--verbose':
        args.verbose = true;
        break;
      case '--help':
      case '-h':
        printHelp();
        process.exit(0);
        break;
      default:
        if (arg.startsWith('--')) {
          console.error(`Unknown option: ${arg}`);
          process.exit(1);
        }
    }
  }
  
  return args;
}

function printHelp(): void {
  console.log(`
MCP Graphics Performance Suite

USAGE:
  npm run test [OPTIONS]
  node dist/index.js [OPTIONS]

OPTIONS:
  --config <file>      Load configuration from file
  --output <path>      Output path for reports (default: ./reports/mcp-graphics-performance)
  --format <format>    Report format: html, json, console (default: html)
  --functional         Run functional tests only
  --performance        Run performance tests only  
  --load               Include load testing
  --memory             Include memory profiling
  --servers <list>     Comma-separated list of servers to test
  --verbose            Verbose output including JSON report
  --help, -h           Show this help message

EXAMPLES:
  npm run test                                    # Full analysis with HTML report
  npm run test -- --format json --output ./my-report  # JSON report to custom path
  npm run test -- --functional --servers color,image  # Functional tests for specific servers
  npm run test -- --load --memory --verbose           # Load testing with memory profiling

REPORTS:
  HTML reports provide comprehensive visualizations and recommendations.
  JSON reports are suitable for automated processing and integration.
  Console output provides immediate feedback and summary statistics.

EXIT CODES:
  0    All tests passed (≥80% pass rate)
  1    Some tests failed or errors occurred
  `);
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs();
  const cli = new PerformanceSuiteCLI(args);
  cli.run();
}

export { PerformanceSuiteCLI, PerformanceOrchestrator, ReportGenerator };