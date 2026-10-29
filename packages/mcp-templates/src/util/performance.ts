/**
 * Performance monitoring utilities for MCP Templates server
 */

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  metadata?: Record<string, unknown>;
}

/** Completed metrics kept per operation name (oldest dropped first) */
export const MAX_METRICS_PER_OPERATION = 1000;
/** Max in-flight operations tracked; operations never ended are evicted oldest first */
export const MAX_ACTIVE_OPERATIONS = 1000;

export class PerformanceMonitor {
  private static instance: PerformanceMonitor;
  private metrics: Map<string, PerformanceMetric[]> = new Map();
  private activeOperations: Map<string, PerformanceMetric> = new Map();
  
  // Performance targets from PRD (in milliseconds)
  private targets = {
    'template.create': 200,
    'template.render': 500,
    'template.validate': 200,
    'template.library.add': 100,
    'template.library.compose': 300,
    'template.export': 500
  };

  static getInstance(): PerformanceMonitor {
    if (!PerformanceMonitor.instance) {
      PerformanceMonitor.instance = new PerformanceMonitor();
    }
    return PerformanceMonitor.instance;
  }

  startOperation(operationId: string, name: string, metadata?: Record<string, unknown>): void {
    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      metadata
    };
    
    this.activeOperations.set(operationId, metric);
    if (this.activeOperations.size > MAX_ACTIVE_OPERATIONS) {
      const oldest = this.activeOperations.keys().next().value;
      if (oldest !== undefined) this.activeOperations.delete(oldest);
    }
  }

  endOperation(operationId: string): number | null {
    const metric = this.activeOperations.get(operationId);
    if (!metric) {
      console.warn(`No active operation found for ID: ${operationId}`);
      return null;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;
    
    // Store completed metric
    const existingMetrics = this.metrics.get(metric.name) || [];
    existingMetrics.push(metric);
    if (existingMetrics.length > MAX_METRICS_PER_OPERATION) {
      existingMetrics.splice(0, existingMetrics.length - MAX_METRICS_PER_OPERATION);
    }
    this.metrics.set(metric.name, existingMetrics);
    
    // Remove from active operations
    this.activeOperations.delete(operationId);
    
    // Check performance target
    this.checkPerformanceTarget(metric);
    
    return metric.duration;
  }

  private checkPerformanceTarget(metric: PerformanceMetric): void {
    const target = this.targets[metric.name as keyof typeof this.targets];
    if (target && metric.duration && metric.duration > target) {
      console.warn(
        `[Performance Warning] ${metric.name} took ${metric.duration.toFixed(2)}ms ` +
        `(target: ${target}ms, ${((metric.duration / target - 1) * 100).toFixed(1)}% over)`
      );
    }
  }

  getMetrics(operationName?: string): PerformanceMetric[] {
    if (operationName) {
      return this.metrics.get(operationName) || [];
    }
    
    const allMetrics: PerformanceMetric[] = [];
    for (const metrics of this.metrics.values()) {
      allMetrics.push(...metrics);
    }
    return allMetrics;
  }

  getAverageTime(operationName: string): number {
    const operationMetrics = this.metrics.get(operationName) || [];
    if (operationMetrics.length === 0) return 0;
    
    const total = operationMetrics.reduce((sum, metric) => sum + (metric.duration || 0), 0);
    return total / operationMetrics.length;
  }

  getOperationStats(operationName: string): {
    count: number;
    average: number;
    min: number;
    max: number;
    target: number;
    withinTarget: number;
  } {
    const operationMetrics = this.metrics.get(operationName) || [];
    const target = this.targets[operationName as keyof typeof this.targets] || 0;
    
    if (operationMetrics.length === 0) {
      return {
        count: 0,
        average: 0,
        min: 0,
        max: 0,
        target,
        withinTarget: 0
      };
    }
    
    const durations = operationMetrics.map(m => m.duration || 0);
    const withinTarget = durations.filter(d => d <= target).length;
    
    return {
      count: operationMetrics.length,
      average: durations.reduce((sum, d) => sum + d, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      target,
      withinTarget: withinTarget / durations.length
    };
  }

  reset(): void {
    this.metrics.clear();
    this.activeOperations.clear();
  }

  generateReport(): string {
    const operations = Array.from(this.metrics.keys());
    let report = '=== MCP Templates Performance Report ===\n\n';
    
    for (const operation of operations) {
      const stats = this.getOperationStats(operation);
      report += `${operation}:\n`;
      report += `  Count: ${stats.count}\n`;
      report += `  Average: ${stats.average.toFixed(2)}ms\n`;
      report += `  Range: ${stats.min.toFixed(2)}ms - ${stats.max.toFixed(2)}ms\n`;
      report += `  Target: ${stats.target}ms\n`;
      report += `  Within Target: ${(stats.withinTarget * 100).toFixed(1)}%\n\n`;
    }
    
    return report;
  }
}

/**
 * Decorator for timing method execution
 */
export function timed(operationName: string) {
  return function(_target: unknown, propertyName: string, descriptor: PropertyDescriptor) {
    const method = descriptor.value;
    
    descriptor.value = async function(this: unknown, ...args: unknown[]) {
      const monitor = PerformanceMonitor.getInstance();
      const operationId = `${operationName}_${Date.now()}_${Math.random()}`;
      
      monitor.startOperation(operationId, operationName, {
        method: propertyName,
        args: args.length
      });
      
      try {
        const result = await method.apply(this, args);
        monitor.endOperation(operationId);
        return result;
      } catch (error) {
        monitor.endOperation(operationId);
        throw error;
      }
    };
  };
}

/**
 * Simple timing utility function
 */
export async function timeOperation<T>(
  name: string,
  operation: () => Promise<T>,
  metadata?: Record<string, unknown>
): Promise<T> {
  const monitor = PerformanceMonitor.getInstance();
  const operationId = `${name}_${Date.now()}_${Math.random()}`;
  
  monitor.startOperation(operationId, name, metadata);
  
  try {
    const result = await operation();
    const duration = monitor.endOperation(operationId);
    
    if (duration !== null) {
      // stdout is the MCP stdio channel; diagnostics go to stderr
      console.error(`[Performance] ${name} completed in ${duration.toFixed(2)}ms`);
    }
    
    return result;
  } catch (error) {
    monitor.endOperation(operationId);
    throw error;
  }
}
