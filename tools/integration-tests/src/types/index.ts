/**
 * Core types for MCP Graphics Integration Testing Framework
 */

import { Tool, CallToolResult } from '@modelcontextprotocol/sdk/types.js';

/**
 * Supported MCP Graphics Servers
 */
export enum MCPServer {
  COLOR = 'mcp-graphics-color',
  SVG = 'mcp-graphics-svg', 
  IMAGE = 'mcp-graphics-image',
  TYPE = 'mcp-graphics-type'
}

/**
 * Server configuration for testing
 */
export interface ServerConfig {
  name: MCPServer;
  executablePath: string;
  port?: number;
  timeout: number;
  retries: number;
  healthCheck: {
    enabled: boolean;
    endpoint?: string;
    timeout: number;
  };
}

/**
 * Test server instance
 */
export interface TestServerInstance {
  config: ServerConfig;
  process: any; // Child process
  pid?: number;
  status: 'starting' | 'ready' | 'error' | 'stopped';
  startTime?: number;
  lastHealthCheck?: number;
  tools?: Tool[];
}

/**
 * Integration test context
 */
export interface IntegrationTestContext {
  servers: Map<MCPServer, TestServerInstance>;
  testId: string;
  startTime: number;
  cleanup: (() => Promise<void>)[];
}

/**
 * Tool execution result with performance metrics
 */
export interface ToolExecutionResult<T = any> {
  server: MCPServer;
  toolName: string;
  input: any;
  result?: T;
  error?: Error;
  metrics: {
    startTime: number;
    endTime: number;
    duration: number;
    memoryUsage?: NodeJS.MemoryUsage;
    cpuUsage?: NodeJS.CpuUsage;
  };
}

/**
 * Cross-server workflow step
 */
export interface WorkflowStep {
  id: string;
  server: MCPServer;
  tool: string;
  input: any;
  inputMappings?: Record<string, string>; // Map from previous results
  validation?: (result: any) => boolean | Promise<boolean>;
  onError?: 'fail' | 'continue' | 'retry';
  retries?: number;
}

/**
 * Workflow execution result
 */
export interface WorkflowResult {
  id: string;
  steps: WorkflowStep[];
  results: Map<string, ToolExecutionResult>;
  success: boolean;
  error?: Error;
  totalDuration: number;
  metrics: {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    averageStepDuration: number;
    peakMemoryUsage: number;
  };
}

/**
 * Performance benchmark configuration
 */
export interface BenchmarkConfig {
  name: string;
  description: string;
  setup?: () => Promise<void>;
  teardown?: () => Promise<void>;
  warmupRuns: number;
  benchmarkRuns: number;
  concurrent?: boolean;
  maxConcurrency?: number;
  timeout: number;
  thresholds: {
    maxDuration: number;
    maxMemoryUsage: number;
    minThroughput?: number;
  };
}

/**
 * Benchmark result
 */
export interface BenchmarkResult {
  config: BenchmarkConfig;
  runs: Array<{
    runNumber: number;
    duration: number;
    memoryUsage: NodeJS.MemoryUsage;
    cpuUsage: NodeJS.CpuUsage;
    success: boolean;
    error?: Error;
  }>;
  summary: {
    averageDuration: number;
    medianDuration: number;
    minDuration: number;
    maxDuration: number;
    standardDeviation: number;
    successRate: number;
    throughput: number; // operations per second
  };
  passed: boolean;
}

/**
 * Test asset configuration
 */
export interface TestAsset {
  id: string;
  type: 'font' | 'image' | 'svg' | 'color-palette' | 'config';
  path: string;
  metadata?: Record<string, any>;
}

/**
 * Integration test specification
 */
export interface IntegrationTestSpec {
  name: string;
  description: string;
  servers: MCPServer[];
  workflow: WorkflowStep[];
  assets?: TestAsset[];
  validation: {
    expectedResults?: Record<string, any>;
    customValidation?: (results: Map<string, ToolExecutionResult>) => boolean | Promise<boolean>;
  };
  performance?: {
    maxTotalDuration: number;
    maxMemoryUsage: number;
  };
  cleanup?: string[]; // Cleanup commands
}

/**
 * MCP Protocol compliance test result
 */
export interface ProtocolComplianceResult {
  server: MCPServer;
  tests: {
    toolDiscovery: boolean;
    toolExecution: boolean;
    errorHandling: boolean;
    requestFormat: boolean;
    responseFormat: boolean;
    timeouts: boolean;
  };
  issues: string[];
  score: number; // 0-100
}

/**
 * Test configuration
 */
export interface TestConfig {
  servers: ServerConfig[];
  assets: {
    baseDir: string;
    fonts: string[];
    images: string[];
    colorPalettes: string[];
  };
  performance: {
    defaultTimeout: number;
    memoryLimitMB: number;
    concurrencyLimit: number;
  };
  reporting: {
    outputDir: string;
    generateHtml: boolean;
    generateJson: boolean;
    includeLogs: boolean;
  };
}