/**
 * Comprehensive Test Runner for MCP Graphics Performance Suite
 * Handles functional, performance, load, and memory testing
 */

import { performance } from 'perf_hooks';
import {
  TestResult,
  TestCase,
  LoadTestResult,
  BenchmarkConfig,
  DEFAULT_CONFIG,
  PRD_TARGETS,
  TestError,
  ServerHealthMetrics
} from '../types/performance.js';

export class TestRunner {
  private config: BenchmarkConfig;
  private results: TestResult[] = [];
  private loadResults: LoadTestResult[] = [];
  
  constructor(config: Partial<BenchmarkConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Run comprehensive functional test to verify tool works correctly
   */
  async runFunctionalTest(
    testCase: TestCase, 
    toolFunction: (input: any) => Promise<any>
  ): Promise<boolean> {
    console.log(`🧪 Functional test: ${testCase.name}`);
    
    try {
      const result = await this.executeWithTimeout(
        toolFunction, 
        testCase.input,
        testCase.timeout || this.config.timeoutMs
      );
      
      // Basic success check
      if (typeof result === 'object' && result !== null) {
        if ('success' in result && result.success === false) {
          console.log(`❌ ${testCase.name}: Tool returned error -`, result.error?.message || 'Unknown error');
          return false;
        }
        if ('success' in result && result.success === true) {
          console.log(`✅ ${testCase.name}: Tool executed successfully`);
          return true;
        }
      }
      
      // If no success field, assume success if no exception was thrown
      console.log(`✅ ${testCase.name}: Tool executed (no explicit success field)`);
      return true;
      
    } catch (error) {
      console.log(`❌ ${testCase.name}: Tool failed -`, error instanceof Error ? error.message : String(error));
      return false;
    }
  }

  /**
   * Run performance benchmark test
   */
  async runPerformanceTest(
    testCase: TestCase,
    toolFunction: (input: any) => Promise<any>
  ): Promise<TestResult> {
    console.log(`⚡ Performance test: ${testCase.name} (${this.config.iterations} iterations)`);
    
    const target = PRD_TARGETS[testCase.toolName as keyof typeof PRD_TARGETS] || 1000;
    const times: number[] = [];
    const errors: TestError[] = [];
    let successCount = 0;
    let totalMemory = 0;
    
    // Warmup iterations
    console.log(`  Warming up (${this.config.warmupIterations} iterations)...`);
    for (let i = 0; i < this.config.warmupIterations; i++) {
      try {
        await toolFunction(testCase.input);
      } catch (error) {
        // Ignore warmup errors
      }
    }
    
    // Actual benchmark iterations
    console.log(`  Benchmarking...`);
    const startMemory = process.memoryUsage().heapUsed;
    
    for (let i = 0; i < this.config.iterations; i++) {
      const iterationStartTime = performance.now();
      const iterationStartMemory = process.memoryUsage().heapUsed;
      
      try {
        const result = await this.executeWithTimeout(
          toolFunction, 
          testCase.input,
          this.config.timeoutMs
        );
        
        const iterationEndTime = performance.now();
        const duration = iterationEndTime - iterationStartTime;
        times.push(duration);
        
        // Check if operation was successful
        if (this.isSuccessfulResult(result)) {
          successCount++;
        }
        
        const iterationEndMemory = process.memoryUsage().heapUsed;
        totalMemory += (iterationEndMemory - iterationStartMemory);
        
      } catch (error) {
        const iterationEndTime = performance.now();
        const duration = iterationEndTime - iterationStartTime;
        times.push(duration);
        
        errors.push({
          iteration: i + 1,
          error: error instanceof Error ? error.message : String(error),
          timestamp: Date.now()
        });
      }
      
      // Progress indicator
      if ((i + 1) % Math.ceil(this.config.iterations / 10) === 0) {
        process.stdout.write(`${i + 1}/${this.config.iterations} `);
      }
    }
    
    const endMemory = process.memoryUsage().heapUsed;
    console.log(`\\n`);
    
    // Calculate statistics
    const sortedTimes = [...times].sort((a, b) => a - b);
    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const medianTime = sortedTimes[Math.floor(sortedTimes.length / 2)];
    const p95Index = Math.floor(sortedTimes.length * 0.95);
    const p99Index = Math.floor(sortedTimes.length * 0.99);
    
    const result: TestResult = {
      toolName: testCase.toolName,
      operation: testCase.name,
      target,
      actualTime: averageTime,
      passed: averageTime <= target,
      successRate: (successCount / this.config.iterations) * 100,
      iterations: this.config.iterations,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      averageTime,
      medianTime,
      p95Time: sortedTimes[p95Index] || 0,
      p99Time: sortedTimes[p99Index] || 0,
      memoryUsed: endMemory - startMemory,
      errors,
      warnings: this.generateWarnings(averageTime, target, successCount / this.config.iterations)
    };
    
    this.results.push(result);
    
    const status = result.passed ? '✅' : '❌';
    const successRateStr = `${result.successRate.toFixed(1)}%`;
    console.log(`${status} ${testCase.name}: ${averageTime.toFixed(2)}ms avg (target: ${target}ms, success: ${successRateStr})`);
    
    return result;
  }

  /**
   * Run load test with concurrent operations
   */
  async runLoadTest(
    testCase: TestCase,
    toolFunction: (input: any) => Promise<any>,
    concurrentUsers: number = 10,
    durationSeconds: number = 30
  ): Promise<LoadTestResult> {
    console.log(`🔄 Load test: ${testCase.name} (${concurrentUsers} concurrent users, ${durationSeconds}s)`);
    
    const startTime = performance.now();
    const endTime = startTime + (durationSeconds * 1000);
    const startMemory = process.memoryUsage();
    
    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;
    let totalResponseTime = 0;
    let maxMemory = startMemory.heapUsed;
    
    // Create worker promises
    const workers = Array.from({ length: concurrentUsers }, async () => {
      while (performance.now() < endTime) {
        const requestStart = performance.now();
        
        try {
          const result = await toolFunction(testCase.input);
          const requestEnd = performance.now();
          const responseTime = requestEnd - requestStart;
          
          totalRequests++;
          totalResponseTime += responseTime;
          
          if (this.isSuccessfulResult(result)) {
            successfulRequests++;
          } else {
            failedRequests++;
          }
          
          // Track peak memory
          const currentMemory = process.memoryUsage().heapUsed;
          maxMemory = Math.max(maxMemory, currentMemory);
          
        } catch (error) {
          totalRequests++;
          failedRequests++;
          totalResponseTime += (performance.now() - requestStart);
        }
        
        // Small delay to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 1));
      }
    });
    
    await Promise.all(workers);
    
    const actualDuration = (performance.now() - startTime) / 1000;
    const averageResponseTime = totalResponseTime / totalRequests;
    const throughput = totalRequests / actualDuration;
    const errorRate = (failedRequests / totalRequests) * 100;
    
    const loadResult: LoadTestResult = {
      toolName: testCase.toolName,
      concurrentUsers,
      duration: actualDuration,
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime,
      throughputPerSecond: throughput,
      errorRate,
      memoryPeak: maxMemory - startMemory.heapUsed,
      cpuPeak: 0 // TODO: Implement CPU monitoring
    };
    
    this.loadResults.push(loadResult);
    
    console.log(`✅ Load test completed: ${throughput.toFixed(2)} req/s, ${errorRate.toFixed(1)}% errors`);
    
    return loadResult;
  }

  /**
   * Run memory leak detection test
   */
  async runMemoryLeakTest(
    testCase: TestCase,
    toolFunction: (input: any) => Promise<any>,
    iterations: number = 1000
  ): Promise<{ leakDetected: boolean; memoryIncrease: number }> {
    console.log(`🧠 Memory leak test: ${testCase.name} (${iterations} iterations)`);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
    }
    
    const initialMemory = process.memoryUsage().heapUsed;
    let maxMemory = initialMemory;
    const memoryReadings: number[] = [];
    
    for (let i = 0; i < iterations; i++) {
      try {
        await toolFunction(testCase.input);
        
        // Take memory readings every 100 iterations
        if (i % 100 === 0) {
          const currentMemory = process.memoryUsage().heapUsed;
          memoryReadings.push(currentMemory);
          maxMemory = Math.max(maxMemory, currentMemory);
        }
        
      } catch (error) {
        // Continue even if some operations fail
      }
    }
    
    // Force garbage collection again
    if (global.gc) {
      global.gc();
      await new Promise(resolve => setTimeout(resolve, 100)); // Give GC time to work
    }
    
    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
    const leakDetected = memoryIncrease > 50; // Flag if > 50MB increase after GC
    
    console.log(`${leakDetected ? '⚠️' : '✅'} Memory change: ${memoryIncrease.toFixed(2)}MB`);
    
    return { leakDetected, memoryIncrease };
  }

  /**
   * Execute function with timeout protection
   */
  private async executeWithTimeout<T>(
    fn: (input: any) => Promise<T>,
    input: any,
    timeoutMs: number
  ): Promise<T> {
    return Promise.race([
      fn(input),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Operation timed out')), timeoutMs)
      )
    ]);
  }

  /**
   * Check if a result indicates success
   */
  private isSuccessfulResult(result: any): boolean {
    if (typeof result === 'object' && result !== null) {
      if ('success' in result) {
        return result.success === true;
      }
    }
    // If no explicit success field, assume success if no exception was thrown
    return true;
  }

  /**
   * Generate performance warnings
   */
  private generateWarnings(
    averageTime: number, 
    target: number, 
    successRate: number
  ): string[] {
    const warnings: string[] = [];
    
    const utilizationPercent = (averageTime / target) * 100;
    
    if (utilizationPercent > 100) {
      warnings.push(`Performance target exceeded by ${(utilizationPercent - 100).toFixed(1)}%`);
    } else if (utilizationPercent > 80) {
      warnings.push(`Performance close to target (${utilizationPercent.toFixed(1)}% utilization)`);
    }
    
    if (successRate < 100) {
      warnings.push(`${(100 - successRate).toFixed(1)}% failure rate`);
    }
    
    if (successRate < 50) {
      warnings.push('High failure rate indicates functional issues');
    }
    
    return warnings;
  }

  /**
   * Get all test results
   */
  getResults(): TestResult[] {
    return this.results;
  }

  /**
   * Get all load test results
   */
  getLoadResults(): LoadTestResult[] {
    return this.loadResults;
  }

  /**
   * Clear all results
   */
  clearResults(): void {
    this.results = [];
    this.loadResults = [];
  }
}