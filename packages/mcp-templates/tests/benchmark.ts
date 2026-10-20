#!/usr/bin/env node

import { TemplateEngine } from '../src/engine/templateEngine.js';
import { TemplateExporter } from '../src/util/export.js';
import { PerformanceMonitor } from '../src/util/performance.js';
import {
  Template,
  VariableType,
  ComponentType,
  ExportFormat
} from '../src/types/template.js';

/**
 * Performance benchmarking suite for MCP Templates server
 */

const PERFORMANCE_TARGETS = {
  'template.create': 200,
  'template.render': 500,
  'template.validate': 200,
  'template.export': 500,
  'template.library.add': 100,
  'template.library.compose': 300
};

class TemplateBenchmark {
  private engine: TemplateEngine;
  private monitor: PerformanceMonitor;
  private results: Map<string, number[]> = new Map();

  constructor() {
    this.engine = new TemplateEngine();
    this.monitor = PerformanceMonitor.getInstance();
  }

  /**
   * Create a simple template for benchmarking
   */
  private createSimpleTemplate(): Template {
    return {
      id: `benchmark-${Date.now()}`,
      metadata: {
        name: 'Benchmark Template',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      variables: [
        { name: 'title', type: VariableType.STRING, required: true },
        { name: 'count', type: VariableType.NUMBER, required: false, default: 1 }
      ],
      components: [
        {
          id: 'title-text',
          type: ComponentType.TEXT as const,
          position: { x: 50, y: 50, width: 300, height: 40 },
          content: '{{title}}',
          style: {
            fontSize: 24,
            fontFamily: 'Arial',
            fill: '#333333'
          }
        },
        {
          id: 'bg-rect',
          type: ComponentType.SHAPE as const,
          position: { x: 0, y: 0, width: 400, height: 300 },
          shape: 'rect' as const,
          shapeData: {},
          style: {
            fill: '#f0f0f0',
            stroke: '#cccccc',
            strokeWidth: 1
          }
        }
      ],
      layout: {
        width: 400,
        height: 300,
        background: '#ffffff'
      }
    };
  }

  /**
   * Create a complex template with many components
   */
  private createComplexTemplate(componentCount: number = 100): Template {
    const components = [];
    
    // Add background
    components.push({
      id: 'background',
      type: ComponentType.SHAPE as const,
      position: { x: 0, y: 0, width: 800, height: 600 },
      shape: 'rect' as const,
      shapeData: {},
      style: { fill: '#ffffff' }
    });
    
    // Add multiple text components
    for (let i = 0; i < componentCount; i++) {
      components.push({
        id: `text-${i}`,
        type: ComponentType.TEXT as const,
        position: {
          x: (i % 10) * 80,
          y: Math.floor(i / 10) * 25 + 50,
          width: 75,
          height: 20
        },
        content: `Item {{items.${i % 10}}}`,
        style: {
          fontSize: 12,
          fontFamily: 'Arial',
          fill: '#333333'
        }
      });
    }

    return {
      id: `complex-benchmark-${Date.now()}`,
      metadata: {
        name: 'Complex Benchmark Template',
        version: '1.0.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      },
      variables: [
        {
          name: 'items',
          type: VariableType.ARRAY,
          required: true,
          default: Array.from({ length: 10 }, (_, i) => `Value ${i}`)
        }
      ],
      components,
      layout: {
        width: 800,
        height: 600
      }
    };
  }

  /**
   * Benchmark template rendering
   */
  async benchmarkRendering(iterations: number = 100): Promise<void> {
    console.log(`\n🎯 Benchmarking Template Rendering (${iterations} iterations)`);
    
    const template = this.createSimpleTemplate();
    const variables = { title: 'Benchmark Test', count: 42 };
    const times: number[] = [];

    // Warm up
    for (let i = 0; i < 5; i++) {
      await this.engine.renderTemplate(template, variables);
    }

    // Actual benchmark
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      await this.engine.renderTemplate(template, variables);
      const duration = performance.now() - startTime;
      times.push(duration);
    }

    this.results.set('template.render.simple', times);
    this.analyzeResults('Simple Template Rendering', times, PERFORMANCE_TARGETS['template.render']);
  }

  /**
   * Benchmark complex template rendering
   */
  async benchmarkComplexRendering(iterations: number = 20): Promise<void> {
    console.log(`\n🎯 Benchmarking Complex Template Rendering (${iterations} iterations)`);
    
    const template = this.createComplexTemplate(200);
    const variables = {
      items: Array.from({ length: 10 }, (_, i) => `Complex Item ${i}`)
    };
    const times: number[] = [];

    // Warm up
    for (let i = 0; i < 2; i++) {
      await this.engine.renderTemplate(template, variables);
    }

    // Actual benchmark
    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      await this.engine.renderTemplate(template, variables);
      const duration = performance.now() - startTime;
      times.push(duration);
      
      if (i % 5 === 0) {
        process.stdout.write('.');
      }
    }
    
    console.log(''); // New line after progress dots
    this.results.set('template.render.complex', times);
    this.analyzeResults('Complex Template Rendering', times, PERFORMANCE_TARGETS['template.render'] * 2);
  }

  /**
   * Benchmark template export
   */
  async benchmarkExport(iterations: number = 10): Promise<void> {
    console.log(`\n🎯 Benchmarking Template Export (${iterations} iterations)`);
    
    const template = this.createSimpleTemplate();
    const variables = { title: 'Export Test' };
    
    // First render the template
    const rendered = await this.engine.renderTemplate(template, variables);
    
    const formats = [ExportFormat.PNG, ExportFormat.JPEG, ExportFormat.WEBP];
    
    for (const format of formats) {
      const times: number[] = [];
      
      console.log(`  Testing ${format.toUpperCase()} export...`);
      
      for (let i = 0; i < iterations; i++) {
        const startTime = performance.now();
        
        try {
          await TemplateExporter.exportTemplate(rendered, {
            format,
            quality: 80,
            width: 400,
            height: 300
          });
          
          const duration = performance.now() - startTime;
          times.push(duration);
        } catch (error) {
          console.warn(`    Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }
      
      if (times.length > 0) {
        this.results.set(`template.export.${format}`, times);
        this.analyzeResults(`${format.toUpperCase()} Export`, times, PERFORMANCE_TARGETS['template.export']);
      }
    }
    
    // Clean up browser instance
    await TemplateExporter.closeBrowser();
  }

  /**
   * Benchmark template validation
   */
  async benchmarkValidation(iterations: number = 1000): Promise<void> {
    console.log(`\n🎯 Benchmarking Template Validation (${iterations} iterations)`);
    
    const { TemplateValidator } = await import('../src/util/validation.js');
    const template = this.createComplexTemplate(50);
    const variables = { items: Array.from({ length: 10 }, (_, i) => `Item ${i}`) };
    const times: number[] = [];

    for (let i = 0; i < iterations; i++) {
      const startTime = performance.now();
      TemplateValidator.validateTemplateWithVariables(template, variables);
      const duration = performance.now() - startTime;
      times.push(duration);
    }

    this.results.set('template.validate', times);
    this.analyzeResults('Template Validation', times, PERFORMANCE_TARGETS['template.validate']);
  }

  /**
   * Analyze benchmark results
   */
  private analyzeResults(name: string, times: number[], target: number): void {
    if (times.length === 0) {
      console.log(`  ❌ ${name}: No successful runs`);
      return;
    }

    const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
    const min = Math.min(...times);
    const max = Math.max(...times);
    const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
    const p95 = times[Math.floor(times.length * 0.95)];
    const withinTarget = times.filter(t => t <= target).length / times.length * 100;

    const status = avg <= target ? '✅' : '⚠️';
    
    console.log(`  ${status} ${name}:`);
    console.log(`    Average: ${avg.toFixed(2)}ms (target: ${target}ms)`);
    console.log(`    Median: ${median.toFixed(2)}ms`);
    console.log(`    Range: ${min.toFixed(2)}ms - ${max.toFixed(2)}ms`);
    console.log(`    95th percentile: ${p95.toFixed(2)}ms`);
    console.log(`    Within target: ${withinTarget.toFixed(1)}%`);
  }

  /**
   * Run memory usage test
   */
  async benchmarkMemory(): Promise<void> {
    console.log(`\n🎯 Memory Usage Test`);
    
    const getMemoryUsage = () => {
      const usage = process.memoryUsage();
      return {
        rss: Math.round(usage.rss / 1024 / 1024),
        heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
        heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
        external: Math.round(usage.external / 1024 / 1024)
      };
    };

    const initialMemory = getMemoryUsage();
    console.log(`  Initial memory: ${JSON.stringify(initialMemory)}MB`);

    // Create and render many templates
    const templates: any[] = [];
    for (let i = 0; i < 100; i++) {
      const template = this.createComplexTemplate(50);
      const variables = { items: Array.from({ length: 10 }, (_, j) => `Item ${j}`) };
      
      const rendered = await this.engine.renderTemplate(template, variables);
      templates.push(rendered);
    }

    const peakMemory = getMemoryUsage();
    console.log(`  Peak memory: ${JSON.stringify(peakMemory)}MB`);
    console.log(`  Memory increase: ${peakMemory.heapUsed - initialMemory.heapUsed}MB heap`);

    // Clean up
    templates.length = 0;
    global.gc?.(); // Force garbage collection if available
    
    // Wait a bit for cleanup
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const finalMemory = getMemoryUsage();
    console.log(`  Final memory: ${JSON.stringify(finalMemory)}MB`);
    console.log(`  Memory leak check: ${finalMemory.heapUsed > initialMemory.heapUsed * 1.5 ? '❌ Potential leak' : '✅ Clean'}`);
  }

  /**
   * Generate comprehensive benchmark report
   */
  generateReport(): void {
    console.log(`\n📊 Benchmark Summary Report`);
    console.log(`===============================`);
    
    console.log(`\nPerformance Targets:`);
    for (const [operation, target] of Object.entries(PERFORMANCE_TARGETS)) {
      console.log(`  ${operation}: ${target}ms`);
    }
    
    console.log(`\nResults Summary:`);
    for (const [operation, times] of this.results) {
      if (times.length === 0) continue;
      
      const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
      const operationKey = operation.split('.').slice(0, 2).join('.');
      const target = PERFORMANCE_TARGETS[operationKey as keyof typeof PERFORMANCE_TARGETS] || 500;
      const status = avg <= target ? '✅' : '❌';
      
      console.log(`  ${status} ${operation}: ${avg.toFixed(2)}ms avg (${times.length} runs)`);
    }
    
    // Server readiness assessment
    const failedOperations = Array.from(this.results.entries())
      .filter(([operation, times]) => {
        if (times.length === 0) return true;
        const avg = times.reduce((sum, time) => sum + time, 0) / times.length;
        const operationKey = operation.split('.').slice(0, 2).join('.');
        const target = PERFORMANCE_TARGETS[operationKey as keyof typeof PERFORMANCE_TARGETS] || 500;
        return avg > target;
      });
    
    console.log(`\n🎯 Production Readiness: ${failedOperations.length === 0 ? '✅ READY' : '⚠️  NEEDS OPTIMIZATION'}`);
    
    if (failedOperations.length > 0) {
      console.log(`\nOperations needing optimization:`);
      for (const [operation] of failedOperations) {
        console.log(`  - ${operation}`);
      }
    }
  }

  /**
   * Run all benchmarks
   */
  async runAll(): Promise<void> {
    console.log('🚀 Starting MCP Templates Performance Benchmark Suite');
    console.log('====================================================');
    
    try {
      await this.benchmarkRendering();
      await this.benchmarkComplexRendering();
      await this.benchmarkValidation();
      await this.benchmarkExport();
      await this.benchmarkMemory();
      
      this.generateReport();
      
    } catch (error) {
      console.error('\n❌ Benchmark failed:', error);
      process.exit(1);
    }
  }
}

// Run benchmarks if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const benchmark = new TemplateBenchmark();
  benchmark.runAll()
    .then(() => {
      console.log('\n✅ Benchmark completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('\n❌ Benchmark failed:', error);
      process.exit(1);
    });
}

export { TemplateBenchmark };
