#!/usr/bin/env node

/**
 * Performance benchmarking suite for mcp-graphics-color
 * Tests all tools against performance targets defined in PRD
 */

import { performance } from 'perf_hooks';
import { colorConvert } from '../src/tools/colorConvert.js';
import { colorContrast } from '../src/tools/colorContrast.js';
import { colorGeneratePalette } from '../src/tools/colorGeneratePalette.js';
import { colorBrandMatch } from '../src/tools/colorBrandMatch.js';
import { colorLintBrand } from '../src/tools/colorLintBrand.js';
import { colorValidateAccessibility } from '../src/tools/colorValidateAccessibility.js';

// Performance targets from PRD (in milliseconds)
const PERFORMANCE_TARGETS = {
  'color.convert': 10,
  'color.contrast': 50,
  'color.generatePalette': 100,
  'color.brandMatch': 150,
  'color.lintBrand': 200,
  'color.validateAccessibility': 50
};

interface BenchmarkResult {
  tool: string;
  target: number;
  average: number;
  min: number;
  max: number;
  passed: boolean;
  iterations: number;
  successRate: number;
}

interface BenchmarkSuite {
  results: BenchmarkResult[];
  overallPassed: boolean;
  totalDuration: number;
}

/**
 * Run benchmark for a tool function
 */
async function benchmarkTool<T>(
  name: string,
  toolFunction: (input: any) => Promise<T>,
  input: any,
  iterations: number = 100
): Promise<BenchmarkResult> {
  const target = PERFORMANCE_TARGETS[name as keyof typeof PERFORMANCE_TARGETS];
  const times: number[] = [];
  let successes = 0;
  
  console.log(`\n🔄 Benchmarking ${name} (${iterations} iterations)...`);
  
  // Warm up
  for (let i = 0; i < 5; i++) {
    try {
      await toolFunction(input);
    } catch (error) {
      // Ignore warmup errors
    }
  }
  
  // Run benchmark iterations
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    
    try {
      const result = await toolFunction(input);
      const end = performance.now();
      const duration = end - start;
      
      times.push(duration);
      
      // Check if result indicates success
      if (typeof result === 'object' && result !== null && 'success' in result) {
        if ((result as any).success) successes++;
      } else {
        successes++; // Assume success if no success field
      }
      
    } catch (error) {
      const end = performance.now();
      times.push(end - start);
      // Error counts as failure
    }
    
    // Progress indicator
    if ((i + 1) % 20 === 0) {
      process.stdout.write(`${i + 1}/${iterations} `);
    }
  }
  
  const average = times.reduce((sum, time) => sum + time, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const passed = average <= target;
  const successRate = successes / iterations;
  
  const status = passed ? '✅' : '❌';
  console.log(`\n${status} ${name}: ${average.toFixed(2)}ms avg (target: ${target}ms, success: ${(successRate * 100).toFixed(1)}%)`);
  
  return {
    tool: name,
    target,
    average: Math.round(average * 100) / 100,
    min: Math.round(min * 100) / 100,
    max: Math.round(max * 100) / 100,
    passed,
    iterations,
    successRate: Math.round(successRate * 1000) / 10
  };
}

/**
 * Run comprehensive benchmark suite
 */
async function runBenchmarkSuite(): Promise<BenchmarkSuite> {
  console.log('🚀 Starting MCP Graphics Color Performance Benchmark Suite');
  console.log('=' .repeat(60));
  
  const startTime = performance.now();
  const results: BenchmarkResult[] = [];
  
  // Benchmark color.convert
  results.push(await benchmarkTool(
    'color.convert',
    colorConvert,
    { color: '#ff0000', targetSpace: 'oklch' }
  ));
  
  // Benchmark color.contrast
  results.push(await benchmarkTool(
    'color.contrast',
    colorContrast,
    { foreground: '#333333', background: '#ffffff' }
  ));
  
  // Benchmark color.generatePalette
  results.push(await benchmarkTool(
    'color.generatePalette',
    colorGeneratePalette,
    { baseColor: '#3366cc', harmony: 'analogous', count: 5 }
  ));
  
  // Benchmark color.brandMatch
  results.push(await benchmarkTool(
    'color.brandMatch',
    colorBrandMatch,
    {
      targetColor: '#ff6b6b',
      brandPalette: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24', '#f0932b', '#eb4d4b'],
      maxDeltaE: 10
    }
  ));
  
  // Benchmark color.lintBrand
  results.push(await benchmarkTool(
    'color.lintBrand',
    colorLintBrand,
    {
      palette: ['#ff6b6b', '#4ecdc4', '#45b7d1', '#f9ca24'],
      rules: {
        minContrast: 4.5,
        maxDeltaE: 10
      }
    }
  ));
  
  // Benchmark color.validateAccessibility
  results.push(await benchmarkTool(
    'color.validateAccessibility',
    colorValidateAccessibility,
    {
      colors: ['#000000', '#ffffff', '#ff0000', '#00ff00'],
      contexts: [
        { name: 'text', foreground: 0, background: 1, textSize: 'normal', level: 'AA' },
        { name: 'accent', foreground: 2, background: 1, textSize: 'large', level: 'AAA' }
      ]
    }
  ));
  
  const endTime = performance.now();
  const totalDuration = Math.round((endTime - startTime) * 100) / 100;
  const overallPassed = results.every(r => r.passed);
  
  return {
    results,
    overallPassed,
    totalDuration
  };
}

/**
 * Generate detailed benchmark report
 */
function generateReport(suite: BenchmarkSuite): void {
  console.log('\n📊 BENCHMARK REPORT');
  console.log('=' .repeat(60));
  
  // Summary table
  console.log('\nPerformance Results:');
  console.log('-'.repeat(80));
  console.log('Tool                     Target    Average    Min      Max      Status   Success');
  console.log('-'.repeat(80));
  
  suite.results.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    const line = `${result.tool.padEnd(24)} ${result.target.toString().padEnd(9)} ` +
                 `${result.average.toFixed(2).padEnd(10)} ${result.min.toFixed(2).padEnd(8)} ` +
                 `${result.max.toFixed(2).padEnd(8)} ${status.padEnd(8)} ${result.successRate.toFixed(1)}%`;
    console.log(line);
  });
  
  console.log('-'.repeat(80));
  
  // Overall results
  const passedCount = suite.results.filter(r => r.passed).length;
  const totalCount = suite.results.length;
  const passRate = (passedCount / totalCount) * 100;
  
  console.log(`\nOverall Results:`);
  console.log(`• Total Tools: ${totalCount}`);
  console.log(`• Passed: ${passedCount}`);
  console.log(`• Failed: ${totalCount - passedCount}`);
  console.log(`• Pass Rate: ${passRate.toFixed(1)}%`);
  console.log(`• Total Duration: ${suite.totalDuration.toFixed(2)}ms`);
  
  if (suite.overallPassed) {
    console.log('\n🎉 ALL PERFORMANCE TARGETS MET!');
  } else {
    console.log('\n⚠️  Some tools exceeded performance targets');
    
    const failures = suite.results.filter(r => !r.passed);
    console.log('\nFailed Tools:');
    failures.forEach(result => {
      const exceededBy = result.average - result.target;
      console.log(`• ${result.tool}: ${exceededBy.toFixed(2)}ms over target`);
    });
  }
  
  // Performance recommendations
  console.log('\n💡 Performance Recommendations:');
  suite.results.forEach(result => {
    const utilizationPercent = (result.average / result.target) * 100;
    
    if (utilizationPercent > 100) {
      console.log(`• ${result.tool}: Optimize to reduce average time by ${(utilizationPercent - 100).toFixed(1)}%`);
    } else if (utilizationPercent > 80) {
      console.log(`• ${result.tool}: Monitor closely (${utilizationPercent.toFixed(1)}% of target)`);
    } else if (utilizationPercent < 20) {
      console.log(`• ${result.tool}: Excellent performance (${utilizationPercent.toFixed(1)}% of target)`);
    }
  });
  
  // Memory usage and system info
  const memUsage = process.memoryUsage();
  console.log('\n🖥️  System Information:');
  console.log(`• Node.js Version: ${process.version}`);
  console.log(`• Memory Usage: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
  console.log(`• Peak Memory: ${Math.round(memUsage.heapTotal / 1024 / 1024)}MB`);
  console.log(`• Platform: ${process.platform} ${process.arch}`);
}

/**
 * Memory stress test
 */
async function runMemoryStressTest(): Promise<void> {
  console.log('\n🧠 Running Memory Stress Test...');
  
  const initialMemory = process.memoryUsage().heapUsed;
  
  // Generate many large palettes
  const promises: Promise<any>[] = [];
  for (let i = 0; i < 50; i++) {
    promises.push(colorGeneratePalette({
      baseColor: `hsl(${i * 7}, 80%, 50%)`,
      harmony: 'tetradic',
      count: 20
    }));
  }
  
  await Promise.all(promises);
  
  // Force garbage collection if available
  if (global.gc) {
    global.gc();
  }
  
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;
  
  console.log(`Memory increase: ${memoryIncrease.toFixed(2)}MB`);
  
  if (memoryIncrease < 50) {
    console.log('✅ Memory usage within acceptable limits');
  } else {
    console.log('⚠️  High memory usage detected - check for leaks');
  }
}

/**
 * Main execution
 */
async function main(): Promise<void> {
  try {
    const suite = await runBenchmarkSuite();
    generateReport(suite);
    
    await runMemoryStressTest();
    
    process.exit(suite.overallPassed ? 0 : 1);
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  }
}

// Run benchmarks if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}