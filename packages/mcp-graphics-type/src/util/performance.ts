import { TypographyErrorCode, PERFORMANCE_LIMITS } from '../types/typography.js';

/**
 * Performance monitoring and optimization utilities
 */
export class PerformanceMonitor {
  private static activeOperations = new Map<string, number>();
  private static operationHistory: PerformanceMetrics[] = [];

  /**
   * Measures the performance of an operation
   */
  static async measureOperation<T>(
    operationType: string,
    operation: () => Promise<T>
  ): Promise<{ result: T; metrics: PerformanceMetrics }> {
    const operationId = `${operationType}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = performance.now();
    const startMemory = process.memoryUsage();
    
    this.activeOperations.set(operationId, startTime);

    try {
      // Set up timeout based on operation type
      const timeout = this.getTimeoutForOperation(operationType);
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => {
          reject(new Error(JSON.stringify({
            code: TypographyErrorCode.PERFORMANCE_TIMEOUT,
            message: `Operation timeout after ${timeout}ms`,
            details: { operationType, timeout },
            suggestions: [
              'Reduce input complexity',
              'Use smaller batch sizes',
              'Consider caching results'
            ]
          })));
        }, timeout);
      });

      // Race the operation against timeout
      const result = await Promise.race([operation(), timeoutPromise]);
      
      const endTime = performance.now();
      const endMemory = process.memoryUsage();
      const duration = endTime - startTime;

      const metrics: PerformanceMetrics = {
        operationType,
        operationId,
        duration,
        memoryUsed: endMemory.heapUsed - startMemory.heapUsed,
        memoryPeak: endMemory.heapUsed,
        timestamp: new Date().toISOString(),
        success: true
      };

      this.recordMetrics(metrics);
      this.activeOperations.delete(operationId);

      return { result, metrics };

    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      const metrics: PerformanceMetrics = {
        operationType,
        operationId,
        duration,
        memoryUsed: 0,
        memoryPeak: process.memoryUsage().heapUsed,
        timestamp: new Date().toISOString(),
        success: false,
        error: error instanceof Error ? error.message : String(error)
      };

      this.recordMetrics(metrics);
      this.activeOperations.delete(operationId);
      
      throw error;
    }
  }

  /**
   * Gets timeout value for specific operation types
   */
  private static getTimeoutForOperation(operationType: string): number {
    switch (operationType) {
      case 'type.loadFont':
        return PERFORMANCE_LIMITS.FONT_LOADING_TIMEOUT;
      case 'type.shapeText':
        return PERFORMANCE_LIMITS.TEXT_SHAPING_TIMEOUT;
      case 'type.subsetFont':
        return PERFORMANCE_LIMITS.FONT_SUBSETTING_TIMEOUT;
      case 'type.measureText':
        return PERFORMANCE_LIMITS.TEXT_SHAPING_TIMEOUT;
      case 'type.generateFallback':
        return 1000; // 1 second for fallback generation
      case 'type.validateFont':
        return 2000; // 2 seconds for font validation
      default:
        return 1000; // Default 1 second
    }
  }

  /**
   * Records performance metrics
   */
  private static recordMetrics(metrics: PerformanceMetrics): void {
    this.operationHistory.push(metrics);
    
    // Keep only last 100 operations to prevent memory leaks
    if (this.operationHistory.length > 100) {
      this.operationHistory.shift();
    }

    // Log performance warnings
    this.checkPerformanceWarnings(metrics);
  }

  /**
   * Checks for performance warnings and logs them
   */
  private static checkPerformanceWarnings(metrics: PerformanceMetrics): void {
    const warnings: string[] = [];

    // Check duration warnings
    const expectedDuration = this.getTimeoutForOperation(metrics.operationType) * 0.8;
    if (metrics.duration > expectedDuration) {
      warnings.push(`Slow operation: ${metrics.duration.toFixed(2)}ms (expected <${expectedDuration.toFixed(2)}ms)`);
    }

    // Check memory warnings
    const maxMemoryForOperation = PERFORMANCE_LIMITS.MAX_MEMORY_USAGE * 0.1; // 10% of max
    if (metrics.memoryUsed > maxMemoryForOperation) {
      warnings.push(`High memory usage: ${(metrics.memoryUsed / 1024 / 1024).toFixed(2)}MB`);
    }

    if (warnings.length > 0) {
      console.warn(`[Typography Performance] ${metrics.operationType} warnings:`, warnings.join(', '));
    }
  }

  /**
   * Gets performance statistics for analysis
   */
  static getPerformanceStats(): PerformanceStats {
    const recentOperations = this.operationHistory.slice(-50);
    const operationsByType = new Map<string, PerformanceMetrics[]>();

    for (const op of recentOperations) {
      if (!operationsByType.has(op.operationType)) {
        operationsByType.set(op.operationType, []);
      }
      operationsByType.get(op.operationType)!.push(op);
    }

    const stats: PerformanceStats = {
      totalOperations: this.operationHistory.length,
      activeOperations: this.activeOperations.size,
      operationTypes: {},
      overallStats: {
        averageDuration: 0,
        totalMemoryUsed: 0,
        successRate: 0
      }
    };

    let totalDuration = 0;
    let totalMemory = 0;
    let successCount = 0;

    for (const [type, operations] of operationsByType) {
      const durations = operations.map(op => op.duration);
      const memoryUsed = operations.map(op => op.memoryUsed);
      const successful = operations.filter(op => op.success).length;

      stats.operationTypes[type] = {
        count: operations.length,
        averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations),
        averageMemory: memoryUsed.reduce((a, b) => a + b, 0) / memoryUsed.length,
        successRate: successful / operations.length
      };

      totalDuration += durations.reduce((a, b) => a + b, 0);
      totalMemory += memoryUsed.reduce((a, b) => a + b, 0);
      successCount += successful;
    }

    stats.overallStats = {
      averageDuration: recentOperations.length > 0 ? totalDuration / recentOperations.length : 0,
      totalMemoryUsed: totalMemory,
      successRate: recentOperations.length > 0 ? successCount / recentOperations.length : 0
    };

    return stats;
  }

  /**
   * Clears performance history
   */
  static clearHistory(): void {
    this.operationHistory = [];
  }

  /**
   * Gets current active operations
   */
  static getActiveOperations(): Array<{ operationId: string; startTime: number; duration: number }> {
    const now = performance.now();
    return Array.from(this.activeOperations.entries()).map(([operationId, startTime]) => ({
      operationId,
      startTime,
      duration: now - startTime
    }));
  }
}

/**
 * Font cache for performance optimization
 */
export class FontCache {
  private static cache = new Map<string, CachedFont>();
  private static maxCacheSize = 20; // Maximum number of cached fonts
  private static cacheHits = 0;
  private static cacheMisses = 0;

  /**
   * Generates a cache key for font input
   */
  static generateCacheKey(fontInput: any): string {
    if (fontInput.type === 'file') {
      return `file:${fontInput.path}`;
    } else if (fontInput.type === 'buffer') {
      // Use a hash of the buffer for caching
      const hash = require('crypto').createHash('md5').update(fontInput.data).digest('hex');
      return `buffer:${hash}`;
    } else if (fontInput.type === 'url') {
      return `url:${fontInput.url}`;
    } else if (fontInput.type === 'system') {
      return `system:${fontInput.name}`;
    }
    return 'unknown';
  }

  /**
   * Retrieves font from cache
   */
  static get(cacheKey: string): CachedFont | null {
    const cached = this.cache.get(cacheKey);
    if (cached) {
      // Check if cache entry is still valid (1 hour expiry)
      const isExpired = Date.now() - cached.timestamp > 60 * 60 * 1000;
      if (!isExpired) {
        cached.accessCount++;
        cached.lastAccessed = Date.now();
        this.cacheHits++;
        return cached;
      } else {
        this.cache.delete(cacheKey);
      }
    }
    this.cacheMisses++;
    return null;
  }

  /**
   * Stores font in cache
   */
  static set(cacheKey: string, fontData: any, metadata: any): void {
    // Implement LRU eviction if cache is full
    if (this.cache.size >= this.maxCacheSize) {
      this.evictLeastRecentlyUsed();
    }

    const cachedFont: CachedFont = {
      fontData,
      metadata,
      timestamp: Date.now(),
      lastAccessed: Date.now(),
      accessCount: 1,
      size: this.estimateSize(fontData)
    };

    this.cache.set(cacheKey, cachedFont);
  }

  /**
   * Evicts least recently used font from cache
   */
  private static evictLeastRecentlyUsed(): void {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();

    for (const [key, cached] of this.cache) {
      if (cached.lastAccessed < oldestTime) {
        oldestTime = cached.lastAccessed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  /**
   * Estimates size of cached font data
   */
  private static estimateSize(fontData: any): number {
    if (Buffer.isBuffer(fontData)) {
      return fontData.length;
    }
    return JSON.stringify(fontData).length;
  }

  /**
   * Gets cache statistics
   */
  static getStats(): CacheStats {
    const totalSize = Array.from(this.cache.values()).reduce((sum, cached) => sum + cached.size, 0);
    const hitRate = this.cacheHits + this.cacheMisses > 0 
      ? this.cacheHits / (this.cacheHits + this.cacheMisses) 
      : 0;

    return {
      size: this.cache.size,
      maxSize: this.maxCacheSize,
      totalMemory: totalSize,
      hits: this.cacheHits,
      misses: this.cacheMisses,
      hitRate
    };
  }

  /**
   * Clears the font cache
   */
  static clear(): void {
    this.cache.clear();
    this.cacheHits = 0;
    this.cacheMisses = 0;
  }

  /**
   * Removes expired entries from cache
   */
  static cleanup(): void {
    const now = Date.now();
    const expiryTime = 60 * 60 * 1000; // 1 hour

    for (const [key, cached] of this.cache) {
      if (now - cached.timestamp > expiryTime) {
        this.cache.delete(key);
      }
    }
  }
}

// Type definitions
export interface PerformanceMetrics {
  operationType: string;
  operationId: string;
  duration: number;
  memoryUsed: number;
  memoryPeak: number;
  timestamp: string;
  success: boolean;
  error?: string;
}

export interface PerformanceStats {
  totalOperations: number;
  activeOperations: number;
  operationTypes: Record<string, {
    count: number;
    averageDuration: number;
    minDuration: number;
    maxDuration: number;
    averageMemory: number;
    successRate: number;
  }>;
  overallStats: {
    averageDuration: number;
    totalMemoryUsed: number;
    successRate: number;
  };
}

export interface CachedFont {
  fontData: any;
  metadata: any;
  timestamp: number;
  lastAccessed: number;
  accessCount: number;
  size: number;
}

export interface CacheStats {
  size: number;
  maxSize: number;
  totalMemory: number;
  hits: number;
  misses: number;
  hitRate: number;
}