/**
 * Performance Testing Framework Types
 * Comprehensive types for MCP Graphics performance analysis
 */

export interface PerformanceTargets {
  // Color server targets (ms)
  'color.convert': number;
  'color.contrast': number;
  'color.generatePalette': number;
  'color.brandMatch': number;
  'color.lintBrand': number;
  'color.validateAccessibility': number;
  
  // Image server targets (ms)
  'image.resize': number;
  'image.convert': number;
  'image.crop': number;
  'image.filter': number;
  'image.composite': number;
  'image.optimize': number;
  
  // SVG server targets (ms)
  'svg.create': number;
  'svg.optimize': number;
  'svg.pathOperations': number;
  'svg.transform': number;
  
  // Typography server targets (ms)
  'type.loadFont': number;
  'type.shapeText': number;
  'type.measureText': number;
  'type.subsetFont': number;
  'type.generateFallback': number;
  'type.validateFont': number;
}

export interface TestResult {
  toolName: string;
  operation: string;
  target: number;
  actualTime: number;
  passed: boolean;
  successRate: number;
  iterations: number;
  minTime: number;
  maxTime: number;
  averageTime: number;
  medianTime: number;
  p95Time: number;
  p99Time: number;
  memoryUsed: number;
  errors: TestError[];
  warnings: string[];
}

export interface TestError {
  iteration: number;
  error: string;
  timestamp: number;
  stackTrace?: string;
}

export interface LoadTestResult {
  toolName: string;
  concurrentUsers: number;
  duration: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  throughputPerSecond: number;
  errorRate: number;
  memoryPeak: number;
  cpuPeak: number;
}

export interface ServerHealthMetrics {
  serverName: string;
  uptime: number;
  memoryUsage: {
    rss: number;
    heapTotal: number;
    heapUsed: number;
    external: number;
  };
  cpuUsage: number;
  activeConnections: number;
  averageResponseTime: number;
  errorRate: number;
  timestamp: number;
}

export interface PerformanceReport {
  generatedAt: string;
  testDuration: number;
  environment: {
    nodeVersion: string;
    platform: string;
    arch: string;
    totalMemory: number;
    cpuCount: number;
  };
  summary: {
    totalTests: number;
    passedTests: number;
    failedTests: number;
    overallPassRate: number;
    averagePerformance: number;
  };
  serverResults: {
    [serverName: string]: {
      health: ServerHealthMetrics;
      functionalTests: TestResult[];
      performanceTests: TestResult[];
      loadTests: LoadTestResult[];
      recommendations: string[];
      criticalIssues: string[];
    };
  };
  crossServerMetrics: {
    concurrentOperationsTest: LoadTestResult;
    memoryLeakTest: {
      initialMemory: number;
      finalMemory: number;
      memoryIncrease: number;
      leakDetected: boolean;
    };
    resourceContentionTest: {
      isolatedPerformance: number;
      concurrentPerformance: number;
      degradationPercentage: number;
    };
  };
}

export interface BenchmarkConfig {
  iterations: number;
  warmupIterations: number;
  timeoutMs: number;
  enableMemoryProfiling: boolean;
  enableCpuProfiling: boolean;
  concurrencyLevels: number[];
  testDataSizes: string[];
  includeStressTests: boolean;
}

export interface TestCase {
  name: string;
  toolName: string;
  input: unknown;
  expectedResult?: unknown;
  timeout?: number;
  skipFunctionalTest?: boolean;
  skipPerformanceTest?: boolean;
}

export interface ServerConfig {
  name: string;
  path: string;
  port: number;
  tools: string[];
  dependencies: string[];
  buildCommand: string;
  startCommand: string;
  healthcheckEndpoint?: string;
}

// PRD Performance targets
export const PRD_TARGETS: PerformanceTargets = {
  // Color server targets
  'color.convert': 10,
  'color.contrast': 50,
  'color.generatePalette': 100,
  'color.brandMatch': 150,
  'color.lintBrand': 200,
  'color.validateAccessibility': 50,
  
  // Image server targets 
  'image.resize': 200,
  'image.convert': 300,
  'image.crop': 200,
  'image.filter': 500,
  'image.composite': 500,
  'image.optimize': 500,
  
  // SVG server targets
  'svg.create': 50,
  'svg.optimize': 200,
  'svg.pathOperations': 500,
  'svg.transform': 100,
  
  // Typography server targets
  'type.loadFont': 200,
  'type.shapeText': 50,
  'type.measureText': 25,
  'type.subsetFont': 400,
  'type.generateFallback': 300,
  'type.validateFont': 100
};

export const DEFAULT_CONFIG: BenchmarkConfig = {
  iterations: 50,
  warmupIterations: 5,
  timeoutMs: 30000,
  enableMemoryProfiling: true,
  enableCpuProfiling: true,
  concurrencyLevels: [1, 5, 10, 20],
  testDataSizes: ['small', 'medium', 'large'],
  includeStressTests: true
};