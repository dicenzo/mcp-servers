/**
 * Performance monitoring utilities for layout operations
 */
export class PerformanceMonitor {
  private static readonly MAX_CALCULATION_TIME = 200; // ms
  private static readonly MAX_CONSTRAINT_ITERATIONS = 1000;

  private startTime: number = 0;
  private operations: string[] = [];
  private iterationCount: number = 0;

  /**
   * Start performance monitoring for a layout operation
   */
  start(operation: string): void {
    this.startTime = performance.now();
    this.operations.push(operation);
    this.iterationCount = 0;
  }

  /**
   * Record an iteration of constraint solving or layout calculation
   */
  recordIteration(): void {
    this.iterationCount++;
    
    if (this.iterationCount > PerformanceMonitor.MAX_CONSTRAINT_ITERATIONS) {
      throw new Error(`Layout calculation exceeded maximum iterations (${PerformanceMonitor.MAX_CONSTRAINT_ITERATIONS})`);
    }
  }

  /**
   * Check if the operation is taking too long and should be aborted
   */
  checkTimeout(): void {
    const elapsed = performance.now() - this.startTime;
    if (elapsed > PerformanceMonitor.MAX_CALCULATION_TIME) {
      throw new Error(`Layout calculation timeout after ${elapsed.toFixed(2)}ms (max: ${PerformanceMonitor.MAX_CALCULATION_TIME}ms)`);
    }
  }

  /**
   * End monitoring and return performance metrics
   */
  end(): { duration: number; iterations: number; operations: string[] } {
    const duration = performance.now() - this.startTime;
    
    return {
      duration,
      iterations: this.iterationCount,
      operations: [...this.operations]
    };
  }

  /**
   * Create a performance snapshot without ending monitoring
   */
  snapshot(): { elapsed: number; iterations: number; operations: string[] } {
    return {
      elapsed: performance.now() - this.startTime,
      iterations: this.iterationCount,
      operations: [...this.operations]
    };
  }
}

/**
 * Global performance tracker for layout operations
 */
export class LayoutPerformanceTracker {
  private static instance: LayoutPerformanceTracker;
  private monitors: Map<string, PerformanceMonitor> = new Map();
  private history: Array<{
    operation: string;
    duration: number;
    iterations: number;
    timestamp: number;
  }> = [];

  static getInstance(): LayoutPerformanceTracker {
    if (!LayoutPerformanceTracker.instance) {
      LayoutPerformanceTracker.instance = new LayoutPerformanceTracker();
    }
    return LayoutPerformanceTracker.instance;
  }

  /**
   * Start monitoring a specific layout operation
   */
  startMonitoring(operationId: string, operation: string): PerformanceMonitor {
    const monitor = new PerformanceMonitor();
    monitor.start(operation);
    this.monitors.set(operationId, monitor);
    return monitor;
  }

  /**
   * End monitoring and record results
   */
  endMonitoring(operationId: string): void {
    const monitor = this.monitors.get(operationId);
    if (!monitor) {
      console.warn(`No performance monitor found for operation: ${operationId}`);
      return;
    }

    const results = monitor.end();
    this.history.push({
      operation: operationId,
      duration: results.duration,
      iterations: results.iterations,
      timestamp: Date.now()
    });

    this.monitors.delete(operationId);

    // Keep only last 100 operations to prevent memory leaks
    if (this.history.length > 100) {
      this.history = this.history.slice(-100);
    }
  }

  /**
   * Get performance statistics
   */
  getStats(): {
    averageDuration: number;
    maxDuration: number;
    totalOperations: number;
    operationTypes: Record<string, number>;
  } {
    if (this.history.length === 0) {
      return {
        averageDuration: 0,
        maxDuration: 0,
        totalOperations: 0,
        operationTypes: {}
      };
    }

    const durations = this.history.map(h => h.duration);
    const operationTypes: Record<string, number> = {};

    this.history.forEach(h => {
      operationTypes[h.operation] = (operationTypes[h.operation] || 0) + 1;
    });

    return {
      averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      totalOperations: this.history.length,
      operationTypes
    };
  }

  /**
   * Clear performance history
   */
  clearHistory(): void {
    this.history = [];
  }
}