/**
 * Performance monitoring and optimization utilities for SVG operations
 */
export class PerformanceMonitor {
  private static metrics: Map<string, OperationMetrics> = new Map();

  /**
   * Tracks performance metrics for an operation
   */
  static async measureOperation<T>(
    operationName: string,
    operation: () => Promise<T>
  ): Promise<{ result: T; metrics: OperationMetrics }> {
    const startTime = process.hrtime.bigint();
    const startMemory = process.memoryUsage();

    try {
      const result = await operation();
      const endTime = process.hrtime.bigint();
      const endMemory = process.memoryUsage();

      const metrics: OperationMetrics = {
        operationName,
        duration: Number(endTime - startTime) / 1000000, // Convert to milliseconds
        memoryDelta: {
          rss: endMemory.rss - startMemory.rss,
          heapUsed: endMemory.heapUsed - startMemory.heapUsed,
          external: endMemory.external - startMemory.external
        },
        timestamp: new Date().toISOString(),
        success: true
      };

      this.recordMetrics(metrics);
      return { result, metrics };

    } catch (error) {
      const endTime = process.hrtime.bigint();
      const metrics: OperationMetrics = {
        operationName,
        duration: Number(endTime - startTime) / 1000000,
        memoryDelta: { rss: 0, heapUsed: 0, external: 0 },
        timestamp: new Date().toISOString(),
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };

      this.recordMetrics(metrics);
      throw error;
    }
  }

  /**
   * Records metrics for later analysis
   */
  private static recordMetrics(metrics: OperationMetrics): void {
    const key = `${metrics.operationName}_${Date.now()}`;
    this.metrics.set(key, metrics);

    // Keep only last 100 metrics to prevent memory growth
    if (this.metrics.size > 100) {
      const firstKey = this.metrics.keys().next().value;
      if (firstKey) {
        this.metrics.delete(firstKey);
      }
    }

    // Log performance warnings
    this.checkPerformanceThresholds(metrics);
  }

  /**
   * Checks if metrics exceed performance thresholds
   */
  private static checkPerformanceThresholds(metrics: OperationMetrics): void {
    const thresholds = {
      'svg.create': 50,      // 50ms for simple SVG creation
      'svg.optimize': 200,   // 200ms for optimization
      'svg.transform': 100,  // 100ms for transformations
      'svg.pathOperations': 500 // 500ms for complex path operations
    };

    const threshold = thresholds[metrics.operationName as keyof typeof thresholds];
    if (threshold && metrics.duration > threshold) {
      console.error(
        `[Performance Warning] ${metrics.operationName} took ${metrics.duration.toFixed(2)}ms ` +
        `(threshold: ${threshold}ms)`
      );
    }

    // Memory usage warnings
    const memoryMB = metrics.memoryDelta.heapUsed / (1024 * 1024);
    if (memoryMB > 100) {
      console.error(
        `[Memory Warning] ${metrics.operationName} used ${memoryMB.toFixed(2)}MB ` +
        `(threshold: 100MB)`
      );
    }
  }

  /**
   * Gets performance statistics for an operation type
   */
  static getOperationStats(operationName: string): OperationStats | null {
    const operationMetrics = Array.from(this.metrics.values())
      .filter(m => m.operationName === operationName && m.success);

    if (operationMetrics.length === 0) return null;

    const durations = operationMetrics.map(m => m.duration).sort((a, b) => a - b);
    
    return {
      operationName,
      count: operationMetrics.length,
      avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      medianDuration: durations[Math.floor(durations.length / 2)],
      minDuration: durations[0],
      maxDuration: durations[durations.length - 1],
      p95Duration: durations[Math.floor(durations.length * 0.95)],
      successRate: operationMetrics.length / Array.from(this.metrics.values())
        .filter(m => m.operationName === operationName).length
    };
  }

  /**
   * Gets all recorded metrics
   */
  static getAllMetrics(): OperationMetrics[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Clears all recorded metrics
   */
  static clearMetrics(): void {
    this.metrics.clear();
  }
}

/**
 * Memory optimization utilities
 */
export class MemoryOptimizer {
  /**
   * Forces garbage collection if available (for development/testing)
   */
  static forceGC(): void {
    if (global.gc) {
      global.gc();
    }
  }

  /**
   * Gets current memory usage information
   */
  static getMemoryUsage(): MemoryUsageInfo {
    const usage = process.memoryUsage();
    return {
      rss: {
        bytes: usage.rss,
        mb: Math.round(usage.rss / (1024 * 1024) * 100) / 100
      },
      heapUsed: {
        bytes: usage.heapUsed,
        mb: Math.round(usage.heapUsed / (1024 * 1024) * 100) / 100
      },
      heapTotal: {
        bytes: usage.heapTotal,
        mb: Math.round(usage.heapTotal / (1024 * 1024) * 100) / 100
      },
      external: {
        bytes: usage.external,
        mb: Math.round(usage.external / (1024 * 1024) * 100) / 100
      }
    };
  }

  /**
   * Monitors memory usage during an operation
   */
  static async monitorMemory<T>(
    operation: () => Promise<T>,
    memoryLimitMB: number = 100
  ): Promise<T> {
    const startUsage = this.getMemoryUsage();
    
    // Set up memory monitoring interval
    const memoryCheck = setInterval(() => {
      const currentUsage = this.getMemoryUsage();
      if (currentUsage.heapUsed.mb > memoryLimitMB) {
        clearInterval(memoryCheck);
        throw new Error(`Memory limit exceeded: ${currentUsage.heapUsed.mb}MB > ${memoryLimitMB}MB`);
      }
    }, 100); // Check every 100ms

    try {
      const result = await operation();
      clearInterval(memoryCheck);
      
      const endUsage = this.getMemoryUsage();
      const memoryDelta = endUsage.heapUsed.mb - startUsage.heapUsed.mb;
      
      if (memoryDelta > 10) {
        console.error(`[Memory Notice] Operation used ${memoryDelta.toFixed(2)}MB additional memory`);
      }
      
      return result;
    } catch (error) {
      clearInterval(memoryCheck);
      throw error;
    }
  }
}

/**
 * Performance benchmarking utilities
 */
export class PerformanceBenchmark {
  /**
   * Runs a benchmark test for an operation
   */
  static async benchmark(
    operationName: string,
    operation: () => Promise<unknown>,
    iterations: number = 10
  ): Promise<BenchmarkResult> {
    const results: number[] = [];
    let errors = 0;

    console.error(`[Benchmark] Starting ${operationName} benchmark (${iterations} iterations)`);

    for (let i = 0; i < iterations; i++) {
      try {
        const { metrics } = await PerformanceMonitor.measureOperation(
          `benchmark_${operationName}`,
          operation
        );
        results.push(metrics.duration);
      } catch (error) {
        errors++;
        console.error(`[Benchmark] Iteration ${i + 1} failed:`, error);
      }
    }

    results.sort((a, b) => a - b);

    const benchmark: BenchmarkResult = {
      operationName,
      iterations,
      successfulIterations: results.length,
      errorCount: errors,
      avgDuration: results.reduce((sum, d) => sum + d, 0) / results.length,
      medianDuration: results[Math.floor(results.length / 2)],
      minDuration: results[0],
      maxDuration: results[results.length - 1],
      p95Duration: results[Math.floor(results.length * 0.95)],
      standardDeviation: this.calculateStandardDeviation(results)
    };

    console.error(`[Benchmark] ${operationName} completed:`, benchmark);
    return benchmark;
  }

  /**
   * Calculates standard deviation of an array of numbers
   */
  private static calculateStandardDeviation(values: number[]): number {
    const avg = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, val) => sum + val, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }
}

// Type definitions
export interface OperationMetrics {
  operationName: string;
  duration: number; // milliseconds
  memoryDelta: {
    rss: number;
    heapUsed: number;
    external: number;
  };
  timestamp: string;
  success: boolean;
  error?: string;
}

export interface OperationStats {
  operationName: string;
  count: number;
  avgDuration: number;
  medianDuration: number;
  minDuration: number;
  maxDuration: number;
  p95Duration: number;
  successRate: number;
}

export interface MemoryUsageInfo {
  rss: { bytes: number; mb: number };
  heapUsed: { bytes: number; mb: number };
  heapTotal: { bytes: number; mb: number };
  external: { bytes: number; mb: number };
}

export interface BenchmarkResult {
  operationName: string;
  iterations: number;
  successfulIterations: number;
  errorCount: number;
  avgDuration: number;
  medianDuration: number;
  minDuration: number;
  maxDuration: number;
  p95Duration: number;
  standardDeviation: number;
}