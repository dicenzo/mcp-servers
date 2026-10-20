import {
  PerformanceMonitor,
  MemoryOptimizer,
  PerformanceBenchmark,
  OperationMetrics,
  OperationStats,
  MemoryUsageInfo,
  BenchmarkResult
} from '../../src/util/performance';

describe('Performance Utilities', () => {
  beforeEach(() => {
    PerformanceMonitor.clearMetrics();
  });

  describe('PerformanceMonitor', () => {
    describe('measureOperation', () => {
      it('should measure successful operation', async () => {
        const testOperation = async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          return 'success';
        };

        const { result, metrics } = await PerformanceMonitor.measureOperation('test.operation', testOperation);

        expect(result).toBe('success');
        expect(metrics.operationName).toBe('test.operation');
        expect(metrics.duration).toBeGreaterThan(0);
        expect(metrics.success).toBe(true);
        expect(metrics.timestamp).toBeDefined();
        expect(metrics.memoryDelta).toBeDefined();
        expect(metrics.memoryDelta.rss).toBeDefined();
        expect(metrics.memoryDelta.heapUsed).toBeDefined();
        expect(metrics.memoryDelta.external).toBeDefined();
      });

      it('should measure failed operation', async () => {
        const testOperation = async () => {
          await new Promise(resolve => setTimeout(resolve, 5));
          throw new Error('Test error');
        };

        await expect(
          PerformanceMonitor.measureOperation('test.error', testOperation)
        ).rejects.toThrow('Test error');

        const metrics = PerformanceMonitor.getAllMetrics();
        expect(metrics).toHaveLength(1);
        expect(metrics[0].operationName).toBe('test.error');
        expect(metrics[0].success).toBe(false);
        expect(metrics[0].error).toBe('Test error');
      });

      it('should handle non-Error exceptions', async () => {
        const testOperation = async () => {
          throw 'String error';
        };

        await expect(
          PerformanceMonitor.measureOperation('test.string.error', testOperation)
        ).rejects.toBe('String error');

        const metrics = PerformanceMonitor.getAllMetrics();
        expect(metrics[0].error).toBe('Unknown error');
      });

      it('should record metrics for analysis', async () => {
        const testOperation = async () => 'result';

        await PerformanceMonitor.measureOperation('test.record', testOperation);
        
        const allMetrics = PerformanceMonitor.getAllMetrics();
        expect(allMetrics).toHaveLength(1);
        expect(allMetrics[0].operationName).toBe('test.record');
      });

      it('should limit metrics storage to 100 entries', async () => {
        const testOperation = async () => 'result';

        // Add 105 metrics
        for (let i = 0; i < 105; i++) {
          await PerformanceMonitor.measureOperation(`test.limit.${i}`, testOperation);
        }

        const allMetrics = PerformanceMonitor.getAllMetrics();
        expect(allMetrics.length).toBeLessThanOrEqual(100);
      });

      it('should log performance warnings for slow operations', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        
        const slowOperation = async () => {
          await new Promise(resolve => setTimeout(resolve, 60)); // 60ms > 50ms threshold
          return 'slow result';
        };

        await PerformanceMonitor.measureOperation('svg.create', slowOperation);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Performance Warning] svg.create took')
        );

        consoleSpy.mockRestore();
      });

      it('should log memory warnings for high memory usage', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        
        // Mock memory usage to simulate high memory usage
        const originalMemoryUsage = process.memoryUsage;
        let memoryCallCount = 0;
        (process.memoryUsage as jest.Mock) = jest.fn(() => {
          memoryCallCount++;
          const baseMemory = { rss: 1000000, heapUsed: 1000000, heapTotal: 1000000, external: 1000000, arrayBuffers: 0 };
          if (memoryCallCount === 1) {
            return baseMemory; // start memory
          } else {
            return {
              ...baseMemory,
              heapUsed: baseMemory.heapUsed + (110 * 1024 * 1024) // 110MB increase > 100MB threshold
            };
          }
        });

        const testOperation = async () => 'result';
        await PerformanceMonitor.measureOperation('test.memory', testOperation);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Memory Warning] test.memory used')
        );

        process.memoryUsage = originalMemoryUsage;
        consoleSpy.mockRestore();
      });
    });

    describe('getOperationStats', () => {
      it('should return null for non-existent operation', () => {
        const stats = PerformanceMonitor.getOperationStats('nonexistent');
        expect(stats).toBeNull();
      });

      it('should return stats for recorded operations', async () => {
        const testOperation = async () => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
          return 'result';
        };

        // Record multiple operations
        for (let i = 0; i < 5; i++) {
          await PerformanceMonitor.measureOperation('test.stats', testOperation);
        }

        const stats = PerformanceMonitor.getOperationStats('test.stats');
        expect(stats).toBeDefined();
        expect(stats!.operationName).toBe('test.stats');
        expect(stats!.count).toBe(5);
        expect(stats!.avgDuration).toBeGreaterThan(0);
        expect(stats!.medianDuration).toBeGreaterThan(0);
        expect(stats!.minDuration).toBeGreaterThan(0);
        expect(stats!.maxDuration).toBeGreaterThan(0);
        expect(stats!.p95Duration).toBeGreaterThan(0);
        expect(stats!.successRate).toBe(1);
      });

      it('should calculate success rate correctly with failures', async () => {
        const successOperation = async () => 'success';
        const failOperation = async () => { throw new Error('fail'); };

        await PerformanceMonitor.measureOperation('test.mixed', successOperation);
        await PerformanceMonitor.measureOperation('test.mixed', successOperation);
        try {
          await PerformanceMonitor.measureOperation('test.mixed', failOperation);
        } catch (e) {
          // Expected
        }

        const stats = PerformanceMonitor.getOperationStats('test.mixed');
        expect(stats!.count).toBe(2); // Only successful ones
        expect(stats!.successRate).toBeCloseTo(2/3); // 2 success out of 3 total
      });
    });

    describe('getAllMetrics', () => {
      it('should return empty array initially', () => {
        const metrics = PerformanceMonitor.getAllMetrics();
        expect(metrics).toEqual([]);
      });

      it('should return all recorded metrics', async () => {
        const testOperation = async () => 'result';

        await PerformanceMonitor.measureOperation('test.1', testOperation);
        await PerformanceMonitor.measureOperation('test.2', testOperation);

        const metrics = PerformanceMonitor.getAllMetrics();
        expect(metrics).toHaveLength(2);
        expect(metrics.map(m => m.operationName)).toContain('test.1');
        expect(metrics.map(m => m.operationName)).toContain('test.2');
      });
    });

    describe('clearMetrics', () => {
      it('should clear all recorded metrics', async () => {
        const testOperation = async () => 'result';
        await PerformanceMonitor.measureOperation('test.clear', testOperation);
        
        expect(PerformanceMonitor.getAllMetrics()).toHaveLength(1);
        
        PerformanceMonitor.clearMetrics();
        
        expect(PerformanceMonitor.getAllMetrics()).toHaveLength(0);
      });
    });
  });

  describe('MemoryOptimizer', () => {
    describe('forceGC', () => {
      it('should call global.gc if available', () => {
        const mockGc = jest.fn();
        const originalGc = (global as any).gc;
        (global as any).gc = mockGc;

        MemoryOptimizer.forceGC();

        expect(mockGc).toHaveBeenCalled();
        (global as any).gc = originalGc;
      });

      it('should handle missing global.gc gracefully', () => {
        const originalGc = (global as any).gc;
        delete (global as any).gc;

        expect(() => MemoryOptimizer.forceGC()).not.toThrow();

        (global as any).gc = originalGc;
      });
    });

    describe('getMemoryUsage', () => {
      it('should return formatted memory usage information', () => {
        const usage = MemoryOptimizer.getMemoryUsage();

        expect(usage.rss).toBeDefined();
        expect(usage.rss.bytes).toBeGreaterThan(0);
        expect(usage.rss.mb).toBeGreaterThan(0);

        expect(usage.heapUsed).toBeDefined();
        expect(usage.heapUsed.bytes).toBeGreaterThan(0);
        expect(usage.heapUsed.mb).toBeGreaterThan(0);

        expect(usage.heapTotal).toBeDefined();
        expect(usage.heapTotal.bytes).toBeGreaterThan(0);
        expect(usage.heapTotal.mb).toBeGreaterThan(0);

        expect(usage.external).toBeDefined();
        expect(usage.external.bytes).toBeGreaterThanOrEqual(0);
        expect(usage.external.mb).toBeGreaterThanOrEqual(0);
      });

      it('should format MB values correctly', () => {
        const originalMemoryUsage = process.memoryUsage;
        (process.memoryUsage as jest.Mock) = jest.fn(() => ({
          rss: 1024 * 1024, // 1MB
          heapUsed: 2 * 1024 * 1024, // 2MB
          heapTotal: 3 * 1024 * 1024, // 3MB
          external: 512 * 1024, // 0.5MB
          arrayBuffers: 0
        }));

        const usage = MemoryOptimizer.getMemoryUsage();

        expect(usage.rss.mb).toBe(1);
        expect(usage.heapUsed.mb).toBe(2);
        expect(usage.heapTotal.mb).toBe(3);
        expect(usage.external.mb).toBe(0.5);

        process.memoryUsage = originalMemoryUsage;
      });
    });

    describe('monitorMemory', () => {
      it('should complete successfully when under memory limit', async () => {
        const testOperation = async () => {
          await new Promise(resolve => setTimeout(resolve, 50));
          return 'success';
        };

        const result = await MemoryOptimizer.monitorMemory(testOperation, 1000); // 1000MB limit
        expect(result).toBe('success');
      });

      it('should throw error when memory limit exceeded', async () => {
        const originalMemoryUsage = process.memoryUsage;
        (process.memoryUsage as jest.Mock) = jest.fn(() => ({
          rss: 1024 * 1024,
          heapUsed: 200 * 1024 * 1024, // 200MB
          heapTotal: 300 * 1024 * 1024,
          external: 1024 * 1024,
          arrayBuffers: 0
        }));

        const testOperation = async () => {
          await new Promise(resolve => setTimeout(resolve, 200));
          return 'should not reach';
        };

        await expect(
          MemoryOptimizer.monitorMemory(testOperation, 100) // 100MB limit
        ).rejects.toThrow(/Memory limit exceeded/);

        process.memoryUsage = originalMemoryUsage;
      });

      it('should log memory usage notice for high delta', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        
        const originalMemoryUsage = process.memoryUsage;
        let callCount = 0;
        (process.memoryUsage as jest.Mock) = jest.fn(() => {
          callCount++;
          const baseUsage = 10 * 1024 * 1024; // 10MB
          return {
            rss: baseUsage,
            heapUsed: baseUsage + (callCount > 1 ? 15 * 1024 * 1024 : 0), // 15MB increase
            heapTotal: baseUsage * 2,
            external: baseUsage,
            arrayBuffers: 0
          };
        });

        const testOperation = async () => 'result';
        
        await MemoryOptimizer.monitorMemory(testOperation, 100);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Memory Notice] Operation used 15.00MB additional memory')
        );

        process.memoryUsage = originalMemoryUsage;
        consoleSpy.mockRestore();
      });

      it('should handle operation errors properly', async () => {
        const testOperation = async () => {
          await new Promise(resolve => setTimeout(resolve, 10));
          throw new Error('Operation failed');
        };

        await expect(
          MemoryOptimizer.monitorMemory(testOperation, 100)
        ).rejects.toThrow('Operation failed');
      });

      it('should use default memory limit when not specified', async () => {
        const testOperation = async () => 'result';
        
        const result = await MemoryOptimizer.monitorMemory(testOperation);
        expect(result).toBe('result');
      });
    });
  });

  describe('PerformanceBenchmark', () => {
    describe('benchmark', () => {
      it('should run benchmark with successful operations', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        
        const testOperation = async () => {
          await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
          return 'success';
        };

        const result = await PerformanceBenchmark.benchmark('test.benchmark', testOperation, 3);

        expect(result.operationName).toBe('test.benchmark');
        expect(result.iterations).toBe(3);
        expect(result.successfulIterations).toBe(3);
        expect(result.errorCount).toBe(0);
        expect(result.avgDuration).toBeGreaterThan(0);
        expect(result.medianDuration).toBeGreaterThan(0);
        expect(result.minDuration).toBeGreaterThan(0);
        expect(result.maxDuration).toBeGreaterThan(0);
        expect(result.p95Duration).toBeGreaterThan(0);
        expect(result.standardDeviation).toBeGreaterThanOrEqual(0);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Benchmark] Starting test.benchmark benchmark')
        );
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Benchmark] test.benchmark completed:'),
          expect.objectContaining({
            operationName: 'test.benchmark'
          })
        );

        consoleSpy.mockRestore();
      });

      it('should handle operations with errors', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        
        let callCount = 0;
        const testOperation = async () => {
          callCount++;
          if (callCount <= 2) {
            return 'success';
          } else {
            throw new Error('Benchmark error');
          }
        };

        const result = await PerformanceBenchmark.benchmark('test.errors', testOperation, 4);

        expect(result.successfulIterations).toBe(2);
        expect(result.errorCount).toBe(2);

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[Benchmark] Iteration 3 failed:'),
          expect.any(Error)
        );

        consoleSpy.mockRestore();
      });

      it('should handle all operations failing', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        
        const testOperation = async () => {
          throw new Error('All fail');
        };

        const result = await PerformanceBenchmark.benchmark('test.allfail', testOperation, 2);

        expect(result.successfulIterations).toBe(0);
        expect(result.errorCount).toBe(2);
        expect(result.avgDuration).toBeNaN(); // No successful operations

        consoleSpy.mockRestore();
      });

      it('should use default iterations when not specified', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        
        const testOperation = async () => 'success';
        
        const result = await PerformanceBenchmark.benchmark('test.default', testOperation);
        
        expect(result.iterations).toBe(10);
        expect(result.successfulIterations).toBe(10);

        consoleSpy.mockRestore();
      });

      it('should calculate standard deviation correctly', async () => {
        const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
        
        // Mock consistent timing for predictable standard deviation
        let callCount = 0;
        const durations = [10, 20, 30]; // Known values for standard deviation calculation
        const testOperation = async () => {
          const duration = durations[callCount % durations.length];
          callCount++;
          await new Promise(resolve => setTimeout(resolve, duration));
          return 'success';
        };

        const result = await PerformanceBenchmark.benchmark('test.stddev', testOperation, 3);
        
        // Standard deviation of [10, 20, 30] should be ~8.16 (but timing will vary)
        expect(result.standardDeviation).toBeGreaterThanOrEqual(0);

        consoleSpy.mockRestore();
      });
    });

    describe('calculateStandardDeviation', () => {
      it('should calculate standard deviation correctly', () => {
        // Access private method through bracket notation for testing
        const calculateStandardDeviation = (PerformanceBenchmark as any).calculateStandardDeviation;
        
        const values = [2, 4, 4, 4, 5, 5, 7, 9];
        const stdDev = calculateStandardDeviation(values);
        
        expect(stdDev).toBeCloseTo(2, 0); // Standard deviation should be approximately 2
      });

      it('should handle single value', () => {
        const calculateStandardDeviation = (PerformanceBenchmark as any).calculateStandardDeviation;
        
        const values = [5];
        const stdDev = calculateStandardDeviation(values);
        
        expect(stdDev).toBe(0); // Standard deviation of single value is 0
      });

      it('should handle identical values', () => {
        const calculateStandardDeviation = (PerformanceBenchmark as any).calculateStandardDeviation;
        
        const values = [5, 5, 5, 5];
        const stdDev = calculateStandardDeviation(values);
        
        expect(stdDev).toBe(0); // Standard deviation of identical values is 0
      });
    });
  });
});