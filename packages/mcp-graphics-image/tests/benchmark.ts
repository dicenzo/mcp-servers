#!/usr/bin/env node

import { performance } from 'perf_hooks';
import sharp from 'sharp';
import { imageResize } from '../src/tools/imageResize.js';
import { imageConvert } from '../src/tools/imageConvert.js';
import { imageCrop } from '../src/tools/imageCrop.js';
import { imageFilter } from '../src/tools/imageFilter.js';
import { imageOptimize } from '../src/tools/imageOptimize.js';
import { imageComposite } from '../src/tools/imageComposite.js';

/**
 * Performance benchmarking suite for mcp-graphics-image
 * Tests all tools against PRD performance requirements
 */

interface BenchmarkResult {
  tool: string;
  operation: string;
  iterations: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  target: number;
  passed: boolean;
  details: string;
}

class ImageBenchmark {
  private results: BenchmarkResult[] = [];
  
  // Performance targets from PRD (in milliseconds)
  private readonly TARGETS = {
    'image.resize': 200,      // 200ms for standard web sizes
    'image.convert': 300,     // 300ms for 1920x1080
    'image.crop': 200,        // 200ms for crop operations
    'image.filter': 500,      // 500ms for complex filter operations
    'image.composite': 500,   // 500ms for multi-image operations
    'image.optimize': 500     // 500ms for optimization operations
  };

  /**
   * Generate test images of various sizes
   */
  async generateTestImages(): Promise<Record<string, string>> {
    console.log('Generating test images...');
    
    const images: Record<string, string> = {};
    
    // Small image (100x100)
    images.small = await this.createTestImage(100, 100, 'small test image');
    
    // Medium image (800x600)
    images.medium = await this.createTestImage(800, 600, 'medium test image');
    
    // Large image (1920x1080)
    images.large = await this.createTestImage(1920, 1080, 'large test image');
    
    // Square image (500x500)
    images.square = await this.createTestImage(500, 500, 'square test image');
    
    console.log('✅ Test images generated');
    return images;
  }

  /**
   * Create a test image with specified dimensions
   */
  private async createTestImage(width: number, height: number, text: string): Promise<string> {
    const buffer = await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 100, g: 150, b: 200 }
      }
    })
    .composite([
      {
        input: Buffer.from(`
          <svg width="${width}" height="${height}">
            <rect width="100%" height="100%" fill="rgb(100,150,200)"/>
            <text x="50%" y="50%" text-anchor="middle" dy="0.3em" 
                  font-family="Arial" font-size="24" fill="white">
              ${text}
            </text>
            <circle cx="100" cy="100" r="50" fill="rgba(255,255,255,0.3)"/>
            <rect x="50" y="50" width="200" height="100" fill="rgba(255,0,0,0.2)"/>
          </svg>
        `),
        top: 0,
        left: 0
      }
    ])
    .png()
    .toBuffer();
    
    return buffer.toString('base64');
  }

  /**
   * Benchmark image resize operations
   */
  async benchmarkResize(images: Record<string, string>): Promise<void> {
    console.log('\n🔄 Benchmarking image.resize...');
    
    const testCases = [
      { name: 'small-to-thumbnail', image: 'small', width: 50, height: 50 },
      { name: 'medium-to-web', image: 'medium', width: 400, height: 300 },
      { name: 'large-to-standard', image: 'large', width: 1024, height: 768 },
      { name: 'upscale-small', image: 'small', width: 200, height: 200 }
    ];

    for (const testCase of testCases) {
      const times = await this.runBenchmark(
        `resize-${testCase.name}`,
        async () => {
          const result = await imageResize({
            image: { data: images[testCase.image] },
            dimensions: { width: testCase.width, height: testCase.height },
            method: 'lanczos'
          });
          return result.success;
        },
        5
      );

      this.results.push({
        tool: 'image.resize',
        operation: testCase.name,
        iterations: times.length,
        averageTime: times.reduce((a, b) => a + b, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        target: this.TARGETS['image.resize'],
        passed: Math.max(...times) <= this.TARGETS['image.resize'],
        details: `${testCase.width}x${testCase.height} from ${testCase.image}`
      });
    }
  }

  /**
   * Benchmark image format conversion
   */
  async benchmarkConvert(images: Record<string, string>): Promise<void> {
    console.log('\n🔄 Benchmarking image.convert...');
    
    const testCases = [
      { name: 'png-to-jpeg', image: 'large', format: 'jpeg' as const },
      { name: 'png-to-webp', image: 'large', format: 'webp' as const },
      { name: 'png-to-avif', image: 'medium', format: 'avif' as const },
      { name: 'high-quality-jpeg', image: 'large', format: 'jpeg' as const, quality: 95 }
    ];

    for (const testCase of testCases) {
      const times = await this.runBenchmark(
        `convert-${testCase.name}`,
        async () => {
          const result = await imageConvert({
            image: { data: images[testCase.image] },
            format: testCase.format,
            quality: testCase.quality
          });
          return result.success;
        },
        3
      );

      this.results.push({
        tool: 'image.convert',
        operation: testCase.name,
        iterations: times.length,
        averageTime: times.reduce((a, b) => a + b, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        target: this.TARGETS['image.convert'],
        passed: Math.max(...times) <= this.TARGETS['image.convert'],
        details: `to ${testCase.format} from ${testCase.image}`
      });
    }
  }

  /**
   * Benchmark image cropping operations
   */
  async benchmarkCrop(images: Record<string, string>): Promise<void> {
    console.log('\n🔄 Benchmarking image.crop...');
    
    const testCases = [
      { name: 'center-crop', image: 'large', bounds: { left: 400, top: 200, width: 800, height: 600 } },
      { name: 'corner-crop', image: 'medium', bounds: { left: 0, top: 0, width: 300, height: 300 } },
      { name: 'small-crop', image: 'square', bounds: { left: 100, top: 100, width: 200, height: 200 } }
    ];

    for (const testCase of testCases) {
      const times = await this.runBenchmark(
        `crop-${testCase.name}`,
        async () => {
          const result = await imageCrop({
            image: { data: images[testCase.image] },
            bounds: testCase.bounds
          });
          return result.success;
        },
        5
      );

      this.results.push({
        tool: 'image.crop',
        operation: testCase.name,
        iterations: times.length,
        averageTime: times.reduce((a, b) => a + b, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        target: this.TARGETS['image.crop'],
        passed: Math.max(...times) <= this.TARGETS['image.crop'],
        details: `${testCase.bounds.width}x${testCase.bounds.height} from ${testCase.image}`
      });
    }
  }

  /**
   * Benchmark image filter operations
   */
  async benchmarkFilter(images: Record<string, string>): Promise<void> {
    console.log('\n🔄 Benchmarking image.filter...');
    
    const testCases = [
      { 
        name: 'single-blur', 
        image: 'medium', 
        filters: [{ type: 'blur' as const, intensity: 5 }] 
      },
      { 
        name: 'color-adjustment', 
        image: 'medium', 
        filters: [
          { type: 'brightness' as const, intensity: 10 },
          { type: 'contrast' as const, intensity: 15 },
          { type: 'saturation' as const, intensity: 20 }
        ] 
      },
      { 
        name: 'complex-filters', 
        image: 'small', 
        filters: [
          { type: 'sharpen' as const, intensity: 30 },
          { type: 'brightness' as const, intensity: -10 },
          { type: 'hue' as const, intensity: 45 }
        ] 
      }
    ];

    for (const testCase of testCases) {
      const times = await this.runBenchmark(
        `filter-${testCase.name}`,
        async () => {
          const result = await imageFilter({
            image: { data: images[testCase.image] },
            filters: testCase.filters
          });
          return result.success;
        },
        3
      );

      this.results.push({
        tool: 'image.filter',
        operation: testCase.name,
        iterations: times.length,
        averageTime: times.reduce((a, b) => a + b, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        target: this.TARGETS['image.filter'],
        passed: Math.max(...times) <= this.TARGETS['image.filter'],
        details: `${testCase.filters.length} filters on ${testCase.image}`
      });
    }
  }

  /**
   * Benchmark image optimization
   */
  async benchmarkOptimize(images: Record<string, string>): Promise<void> {
    console.log('\n🔄 Benchmarking image.optimize...');
    
    const testCases = [
      { name: 'size-strategy', image: 'large', strategy: 'size' as const },
      { name: 'quality-strategy', image: 'medium', strategy: 'quality' as const },
      { name: 'balanced-strategy', image: 'large', strategy: 'balanced' as const },
      { name: 'target-filesize', image: 'medium', target: { maxFileSize: 50000 } }
    ];

    for (const testCase of testCases) {
      const times = await this.runBenchmark(
        `optimize-${testCase.name}`,
        async () => {
          const result = await imageOptimize({
            image: { data: images[testCase.image] },
            target: testCase.target || {},
            strategy: testCase.strategy
          });
          return result.success;
        },
        3
      );

      this.results.push({
        tool: 'image.optimize',
        operation: testCase.name,
        iterations: times.length,
        averageTime: times.reduce((a, b) => a + b, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        target: this.TARGETS['image.optimize'],
        passed: Math.max(...times) <= this.TARGETS['image.optimize'],
        details: `${testCase.strategy || 'target-size'} on ${testCase.image}`
      });
    }
  }

  /**
   * Benchmark image composition
   */
  async benchmarkComposite(images: Record<string, string>): Promise<void> {
    console.log('\n🔄 Benchmarking image.composite...');
    
    const testCases = [
      { 
        name: 'two-images', 
        images: ['medium', 'small'],
        mode: 'over' as const
      },
      { 
        name: 'multiple-images', 
        images: ['square', 'small', 'small'],
        mode: 'multiply' as const
      }
    ];

    for (const testCase of testCases) {
      const times = await this.runBenchmark(
        `composite-${testCase.name}`,
        async () => {
          const imageInputs = testCase.images.map(name => ({ data: images[name] }));
          const result = await imageComposite({
            images: imageInputs,
            composition: { mode: testCase.mode }
          });
          return result.success;
        },
        3
      );

      this.results.push({
        tool: 'image.composite',
        operation: testCase.name,
        iterations: times.length,
        averageTime: times.reduce((a, b) => a + b, 0) / times.length,
        minTime: Math.min(...times),
        maxTime: Math.max(...times),
        target: this.TARGETS['image.composite'],
        passed: Math.max(...times) <= this.TARGETS['image.composite'],
        details: `${testCase.images.length} images with ${testCase.mode} blend`
      });
    }
  }

  /**
   * Run benchmark iterations for a specific operation
   */
  private async runBenchmark(
    name: string, 
    operation: () => Promise<boolean>, 
    iterations: number
  ): Promise<number[]> {
    const times: number[] = [];
    
    // Warmup run
    await operation();
    
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      const success = await operation();
      const end = performance.now();
      
      if (success) {
        times.push(end - start);
      } else {
        console.error(`❌ Benchmark ${name} iteration ${i + 1} failed`);
      }
    }
    
    return times;
  }

  /**
   * Generate comprehensive benchmark report
   */
  generateReport(): void {
    console.log('\n📊 PERFORMANCE BENCHMARK REPORT');
    console.log('=====================================');
    
    const toolGroups = this.groupBy(this.results, r => r.tool);
    
    for (const [tool, results] of Object.entries(toolGroups)) {
      console.log(`\n🔧 ${tool.toUpperCase()}`);
      console.log('-'.repeat(50));
      
      for (const result of results) {
        const status = result.passed ? '✅' : '❌';
        const avgTime = result.averageTime.toFixed(2);
        const maxTime = result.maxTime.toFixed(2);
        
        console.log(`${status} ${result.operation.padEnd(20)} | Avg: ${avgTime}ms | Max: ${maxTime}ms | Target: ${result.target}ms`);
        console.log(`   Details: ${result.details}`);
      }
    }
    
    // Summary statistics
    const totalTests = this.results.length;
    const passedTests = this.results.filter(r => r.passed).length;
    const overallPassRate = (passedTests / totalTests * 100).toFixed(1);
    
    console.log('\n📈 SUMMARY');
    console.log('====================');
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests}`);
    console.log(`Failed: ${totalTests - passedTests}`);
    console.log(`Pass Rate: ${overallPassRate}%`);
    
    if (passedTests === totalTests) {
      console.log('\n🎉 ALL PERFORMANCE TARGETS MET!');
    } else {
      console.log('\n⚠️  Some performance targets not met. See failed tests above.');
    }
    
    // Performance insights
    console.log('\n💡 PERFORMANCE INSIGHTS');
    console.log('========================');
    const slowestOperation = this.results.reduce((prev, curr) => 
      prev.maxTime > curr.maxTime ? prev : curr
    );
    const fastestOperation = this.results.reduce((prev, curr) => 
      prev.minTime < curr.minTime ? prev : curr
    );
    
    console.log(`Slowest: ${slowestOperation.tool}:${slowestOperation.operation} (${slowestOperation.maxTime.toFixed(2)}ms)`);
    console.log(`Fastest: ${fastestOperation.tool}:${fastestOperation.operation} (${fastestOperation.minTime.toFixed(2)}ms)`);
  }

  /**
   * Utility function to group array by key
   */
  private groupBy<T, K extends keyof any>(array: T[], key: (item: T) => K): Record<K, T[]> {
    return array.reduce((groups, item) => {
      const group = key(item);
      groups[group] = groups[group] || [];
      groups[group].push(item);
      return groups;
    }, {} as Record<K, T[]>);
  }
}

/**
 * Main benchmark execution
 */
async function main(): Promise<void> {
  console.log('🚀 Starting MCP Graphics Image Performance Benchmark');
  console.log('====================================================');
  
  const benchmark = new ImageBenchmark();
  
  try {
    // Generate test images
    const images = await benchmark.generateTestImages();
    
    // Run all benchmarks
    await benchmark.benchmarkResize(images);
    await benchmark.benchmarkConvert(images);
    await benchmark.benchmarkCrop(images);
    await benchmark.benchmarkFilter(images);
    await benchmark.benchmarkOptimize(images);
    await benchmark.benchmarkComposite(images);
    
    // Generate and display report
    benchmark.generateReport();
    
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run benchmark if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}