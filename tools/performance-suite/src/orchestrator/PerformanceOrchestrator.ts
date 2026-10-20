/**
 * Performance Orchestrator
 * Coordinates testing across all MCP Graphics servers
 */

import { TestRunner } from '../framework/TestRunner.js';
import {
  PerformanceReport,
  ServerConfig,
  TestCase,
  BenchmarkConfig,
  ServerHealthMetrics
} from '../types/performance.js';
import { ColorTestSuite } from '../suites/ColorTestSuite.js';
import { ImageTestSuite } from '../suites/ImageTestSuite.js';
import { SvgTestSuite } from '../suites/SvgTestSuite.js';
import { TypeTestSuite } from '../suites/TypeTestSuite.js';

export class PerformanceOrchestrator {
  private testRunner: TestRunner;
  private servers: ServerConfig[] = [
    {
      name: 'mcp-graphics-color',
      path: '../../packages/mcp-graphics-color',
      port: 3001,
      tools: ['color.convert', 'color.contrast', 'color.generatePalette', 'color.brandMatch', 'color.lintBrand', 'color.validateAccessibility'],
      dependencies: ['chroma-js', 'culori', 'apca-w3'],
      buildCommand: 'npm run build',
      startCommand: 'npm start'
    },
    {
      name: 'mcp-graphics-image',
      path: '../../packages/mcp-graphics-image',
      port: 3002,
      tools: ['image.resize', 'image.convert', 'image.crop', 'image.filter', 'image.composite', 'image.optimize'],
      dependencies: ['sharp'],
      buildCommand: 'npm run build',
      startCommand: 'npm start'
    },
    {
      name: 'mcp-graphics-svg',
      path: '../../packages/mcp-graphics-svg',
      port: 3003,
      tools: ['svg.create', 'svg.optimize', 'svg.pathOperations', 'svg.transform'],
      dependencies: ['@svgdotjs/svg.js', 'svgo'],
      buildCommand: 'npm run build',
      startCommand: 'npm start'
    },
    {
      name: 'mcp-graphics-type',
      path: '../../packages/mcp-graphics-type',
      port: 3004,
      tools: ['type.loadFont', 'type.shapeText', 'type.measureText', 'type.subsetFont', 'type.generateFallback', 'type.validateFont'],
      dependencies: ['opentype.js'],
      buildCommand: 'npm run build',
      startCommand: 'npm start'
    }
  ];

  constructor(config?: Partial<BenchmarkConfig>) {
    this.testRunner = new TestRunner(config);
  }

  /**
   * Run comprehensive performance analysis across all servers
   */
  async runComprehensiveAnalysis(): Promise<PerformanceReport> {
    const startTime = Date.now();
    console.log('🚀 Starting Comprehensive MCP Graphics Performance Analysis');
    console.log('='.repeat(70));

    const report: PerformanceReport = {
      generatedAt: new Date().toISOString(),
      testDuration: 0,
      environment: this.getEnvironmentInfo(),
      summary: {
        totalTests: 0,
        passedTests: 0,
        failedTests: 0,
        overallPassRate: 0,
        averagePerformance: 0
      },
      serverResults: {},
      crossServerMetrics: {
        concurrentOperationsTest: {
          toolName: 'cross-server',
          concurrentUsers: 0,
          duration: 0,
          totalRequests: 0,
          successfulRequests: 0,
          failedRequests: 0,
          averageResponseTime: 0,
          throughputPerSecond: 0,
          errorRate: 0,
          memoryPeak: 0,
          cpuPeak: 0
        },
        memoryLeakTest: {
          initialMemory: 0,
          finalMemory: 0,
          memoryIncrease: 0,
          leakDetected: false
        },
        resourceContentionTest: {
          isolatedPerformance: 0,
          concurrentPerformance: 0,
          degradationPercentage: 0
        }
      }
    };

    try {
      // Test each server individually
      for (const server of this.servers) {
        console.log(`\\n📦 Testing ${server.name}...`);
        console.log('-'.repeat(50));
        
        const serverResults = await this.testServer(server);
        report.serverResults[server.name] = serverResults;
      }

      // Run cross-server tests
      console.log('\\n🔄 Running cross-server tests...');
      console.log('-'.repeat(50));
      
      report.crossServerMetrics = await this.runCrossServerTests();

      // Calculate summary statistics
      report.summary = this.calculateSummary(report);
      report.testDuration = Date.now() - startTime;

      console.log('\\n✅ Analysis completed!');
      
    } catch (error) {
      console.error('❌ Analysis failed:', error);
      throw error;
    }

    return report;
  }

  /**
   * Test individual server
   */
  private async testServer(server: ServerConfig) {
    const health = await this.checkServerHealth(server);
    const testSuite = this.getTestSuite(server.name);
    const testCases = testSuite.getTestCases();
    
    const functionalTests = [];
    const performanceTests = [];
    const loadTests = [];
    
    for (const testCase of testCases) {
      try {
        // Get the actual tool function
        const toolFunction = testSuite.getToolFunction(testCase.toolName);
        
        // Run functional test first
        if (!testCase.skipFunctionalTest) {
          const functionalSuccess = await this.testRunner.runFunctionalTest(testCase, toolFunction);
          if (!functionalSuccess) {
            console.log(`⚠️ Skipping performance tests for ${testCase.name} due to functional failure`);
            continue;
          }
        }
        
        // Run performance test
        if (!testCase.skipPerformanceTest) {
          const performanceResult = await this.testRunner.runPerformanceTest(testCase, toolFunction);
          performanceTests.push(performanceResult);
        }
        
        // Run load test for critical tools
        if (this.isCriticalTool(testCase.toolName)) {
          const loadResult = await this.testRunner.runLoadTest(testCase, toolFunction, 5, 10);
          loadTests.push(loadResult);
        }
        
      } catch (error) {
        console.error(`❌ Error testing ${testCase.name}:`, error instanceof Error ? error.message : String(error));
      }
    }
    
    return {
      health,
      functionalTests: [],
      performanceTests,
      loadTests,
      recommendations: this.generateRecommendations(performanceTests, loadTests),
      criticalIssues: this.identifyCriticalIssues(performanceTests, loadTests)
    };
  }

  /**
   * Get appropriate test suite for server
   */
  private getTestSuite(serverName: string) {
    switch (serverName) {
      case 'mcp-graphics-color':
        return new ColorTestSuite();
      case 'mcp-graphics-image':
        return new ImageTestSuite();
      case 'mcp-graphics-svg':
        return new SvgTestSuite();
      case 'mcp-graphics-type':
        return new TypeTestSuite();
      default:
        throw new Error(`Unknown server: ${serverName}`);
    }
  }

  /**
   * Check if tool is critical for additional testing
   */
  private isCriticalTool(toolName: string): boolean {
    const criticalTools = [
      'image.resize', 'image.convert', 'image.optimize',
      'color.convert', 'color.generatePalette',
      'svg.create', 'svg.optimize',
      'type.loadFont', 'type.shapeText'
    ];
    return criticalTools.includes(toolName);
  }

  /**
   * Check server health and availability
   */
  private async checkServerHealth(server: ServerConfig): Promise<ServerHealthMetrics> {
    // For now, return mock health data
    // TODO: Implement actual health checks
    return {
      serverName: server.name,
      uptime: 0,
      memoryUsage: {
        rss: 0,
        heapTotal: 0,
        heapUsed: 0,
        external: 0
      },
      cpuUsage: 0,
      activeConnections: 0,
      averageResponseTime: 0,
      errorRate: 0,
      timestamp: Date.now()
    };
  }

  /**
   * Run cross-server performance tests
   */
  private async runCrossServerTests() {
    // TODO: Implement cross-server testing
    return {
      concurrentOperationsTest: {
        toolName: 'cross-server',
        concurrentUsers: 0,
        duration: 0,
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        throughputPerSecond: 0,
        errorRate: 0,
        memoryPeak: 0,
        cpuPeak: 0
      },
      memoryLeakTest: {
        initialMemory: process.memoryUsage().heapUsed,
        finalMemory: process.memoryUsage().heapUsed,
        memoryIncrease: 0,
        leakDetected: false
      },
      resourceContentionTest: {
        isolatedPerformance: 0,
        concurrentPerformance: 0,
        degradationPercentage: 0
      }
    };
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(report: PerformanceReport) {
    let totalTests = 0;
    let passedTests = 0;
    let totalPerformance = 0;
    
    for (const serverResult of Object.values(report.serverResults)) {
      totalTests += serverResult.performanceTests.length;
      passedTests += serverResult.performanceTests.filter(t => t.passed).length;
      totalPerformance += serverResult.performanceTests.reduce((sum, t) => sum + (t.target / t.actualTime), 0);
    }
    
    return {
      totalTests,
      passedTests,
      failedTests: totalTests - passedTests,
      overallPassRate: totalTests > 0 ? (passedTests / totalTests) * 100 : 0,
      averagePerformance: totalTests > 0 ? totalPerformance / totalTests : 0
    };
  }

  /**
   * Generate recommendations based on test results
   */
  private generateRecommendations(performanceTests: any[], loadTests: any[]): string[] {
    const recommendations: string[] = [];
    
    // Performance recommendations
    const slowTests = performanceTests.filter(t => !t.passed);
    if (slowTests.length > 0) {
      recommendations.push(`Optimize ${slowTests.length} slow operations: ${slowTests.map(t => t.toolName).join(', ')}`);
    }
    
    // Memory recommendations
    const highMemoryTests = performanceTests.filter(t => t.memoryUsed > 100 * 1024 * 1024); // >100MB
    if (highMemoryTests.length > 0) {
      recommendations.push(`Reduce memory usage for: ${highMemoryTests.map(t => t.toolName).join(', ')}`);
    }
    
    // Load test recommendations
    const highErrorRateTests = loadTests.filter(t => t.errorRate > 5);
    if (highErrorRateTests.length > 0) {
      recommendations.push(`Improve error handling for: ${highErrorRateTests.map(t => t.toolName).join(', ')}`);
    }
    
    return recommendations;
  }

  /**
   * Identify critical issues
   */
  private identifyCriticalIssues(performanceTests: any[], loadTests: any[]): string[] {
    const issues: string[] = [];
    
    // Critical performance issues
    const criticallySlowTests = performanceTests.filter(t => t.actualTime > t.target * 2);
    if (criticallySlowTests.length > 0) {
      issues.push(`Critical performance: ${criticallySlowTests.map(t => t.toolName).join(', ')} exceed targets by 100%+`);
    }
    
    // High failure rates
    const unreliableTests = performanceTests.filter(t => t.successRate < 50);
    if (unreliableTests.length > 0) {
      issues.push(`High failure rate: ${unreliableTests.map(t => t.toolName).join(', ')} < 50% success`);
    }
    
    // Memory leaks
    const memoryLeakTests = performanceTests.filter(t => t.memoryUsed > 500 * 1024 * 1024); // >500MB
    if (memoryLeakTests.length > 0) {
      issues.push(`Potential memory leaks: ${memoryLeakTests.map(t => t.toolName).join(', ')}`);
    }
    
    return issues;
  }

  /**
   * Get system environment information
   */
  private getEnvironmentInfo() {
    return {
      nodeVersion: process.version,
      platform: process.platform,
      arch: process.arch,
      totalMemory: 0, // TODO: Get actual system memory
      cpuCount: 0     // TODO: Get actual CPU count
    };
  }
}