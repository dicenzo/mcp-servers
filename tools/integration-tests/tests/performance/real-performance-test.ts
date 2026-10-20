#!/usr/bin/env tsx

/**
 * Real MCP Graphics Performance Integration Test
 * Tests actual server implementations against PRD performance targets
 */

import { performance } from 'perf_hooks';
import { join } from 'path';

// Import actual server tools directly
import { colorConvert } from '../../../../packages/mcp-graphics-color/src/tools/colorConvert.js';
import { colorContrast } from '../../../../packages/mcp-graphics-color/src/tools/colorContrast.js';
import { colorGeneratePalette } from '../../../../packages/mcp-graphics-color/src/tools/colorGeneratePalette.js';
import { colorValidateAccessibility } from '../../../../packages/mcp-graphics-color/src/tools/colorValidateAccessibility.js';

import { imageResize } from '../../../../packages/mcp-graphics-image/src/tools/imageResize.js';
import { imageConvert } from '../../../../packages/mcp-graphics-image/src/tools/imageConvert.js';
import { imageCrop } from '../../../../packages/mcp-graphics-image/src/tools/imageCrop.js';

import { svgCreateTool } from '../../../../packages/mcp-graphics-svg/src/tools/svgCreate.js';
import { svgOptimizeTool } from '../../../../packages/mcp-graphics-svg/src/tools/svgOptimize.js';
import { svgTransformTool } from '../../../../packages/mcp-graphics-svg/src/tools/svgTransform.js';

import { loadFontTool } from '../../../../packages/mcp-graphics-type/src/tools/loadFont.js';
import { shapeTextTool } from '../../../../packages/mcp-graphics-type/src/tools/shapeText.js';
import { measureTextTool } from '../../../../packages/mcp-graphics-type/src/tools/measureText.js';

// PRD Performance targets (in milliseconds)
const PRD_TARGETS = {
  'color.convert': 10,
  'color.contrast': 50,
  'color.generatePalette': 100,
  'color.validateAccessibility': 50,
  
  'image.resize': 200,
  'image.convert': 300,
  'image.crop': 200,
  
  'svg.create': 50,
  'svg.optimize': 200,
  'svg.transform': 100,
  
  'type.loadFont': 200,
  'type.shapeText': 50,
  'type.measureText': 25
};

interface TestResult {
  tool: string;
  iterations: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  p95Time: number;
  successRate: number;
  target: number;
  passed: boolean;
  errors: string[];
  memoryUsed: number;
}

class RealPerformanceTest {
  private testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

  /**
   * Run benchmark for a tool with actual implementation
   */
  async runBenchmark(
    toolName: string,
    toolFunction: (input: any) => Promise<any>,
    input: any,
    iterations: number = 100
  ): Promise<TestResult> {
    const times: number[] = [];
    const errors: string[] = [];
    let successes = 0;
    const initialMemory = process.memoryUsage().heapUsed;

    console.log(`🔄 Testing ${toolName} (${iterations} iterations)...`);

    // Warmup runs
    for (let i = 0; i < 5; i++) {
      try {
        await toolFunction(input);
      } catch (error) {
        // Ignore warmup errors
      }
    }

    // Actual benchmark runs
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      
      try {
        const result = await toolFunction(input);
        const end = performance.now();
        const duration = end - start;
        
        times.push(duration);
        
        // Check if result indicates success
        if (result && (result.success === true || (typeof result === 'object' && result.result))) {
          successes++;
        } else if (typeof result === 'string' || (result && result.data)) {
          // Some tools might return string or have data field
          successes++;
        }
        
      } catch (error) {
        const end = performance.now();
        times.push(end - start);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        if (errors.length < 5) { // Keep only first 5 errors
          errors.push(errorMessage);
        }
      }
      
      // Progress indicator
      if ((i + 1) % 20 === 0) {
        process.stdout.write(`${i + 1}/${iterations} `);
      }
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryUsed = finalMemory - initialMemory;

    // Calculate statistics
    times.sort((a, b) => a - b);
    const averageTime = times.reduce((sum, time) => sum + time, 0) / times.length;
    const minTime = Math.min(...times);
    const maxTime = Math.max(...times);
    const p95Index = Math.floor(times.length * 0.95);
    const p95Time = times[p95Index] || maxTime;
    const successRate = (successes / iterations) * 100;
    const target = PRD_TARGETS[toolName as keyof typeof PRD_TARGETS] || 1000;
    const passed = averageTime <= target && successRate >= 90;

    const status = passed ? '✅ PASS' : '❌ FAIL';
    console.log(`\n${status} ${toolName}: ${averageTime.toFixed(2)}ms avg (target: ${target}ms, success: ${successRate.toFixed(1)}%)`);
    
    if (errors.length > 0) {
      console.log(`   Errors: ${errors.slice(0, 2).join(', ')}`);
    }

    return {
      tool: toolName,
      iterations,
      averageTime: Math.round(averageTime * 100) / 100,
      minTime: Math.round(minTime * 100) / 100,
      maxTime: Math.round(maxTime * 100) / 100,
      p95Time: Math.round(p95Time * 100) / 100,
      successRate: Math.round(successRate * 10) / 10,
      target,
      passed,
      errors: errors.slice(0, 3),
      memoryUsed: Math.round(memoryUsed / 1024) // KB
    };
  }

  /**
   * Test color server performance
   */
  async testColorServer(): Promise<TestResult[]> {
    console.log('\n🎨 TESTING COLOR SERVER');
    console.log('='.repeat(40));
    
    const results: TestResult[] = [];

    // Test color.convert
    results.push(await this.runBenchmark(
      'color.convert',
      colorConvert,
      { color: '#ff0000', targetSpace: 'oklch' }
    ));

    // Test color.contrast
    results.push(await this.runBenchmark(
      'color.contrast',
      colorContrast,
      { foreground: '#333333', background: '#ffffff' }
    ));

    // Test color.generatePalette
    results.push(await this.runBenchmark(
      'color.generatePalette',
      colorGeneratePalette,
      { baseColor: '#3366cc', harmony: 'analogous', count: 5 }
    ));

    // Test color.validateAccessibility
    results.push(await this.runBenchmark(
      'color.validateAccessibility',
      colorValidateAccessibility,
      {
        colors: ['#000000', '#ffffff', '#ff0000', '#00ff00'],
        contexts: [
          { name: 'text', foreground: 0, background: 1, textSize: 'normal', level: 'AA' }
        ]
      }
    ));

    return results;
  }

  /**
   * Test image server performance
   */
  async testImageServer(): Promise<TestResult[]> {
    console.log('\n🖼️  TESTING IMAGE SERVER');
    console.log('='.repeat(40));
    
    const results: TestResult[] = [];

    // Create a proper test image
    const testImageData = {
      data: this.testImage,
      format: 'png' as const,
      width: 1,
      height: 1
    };

    // Test image.resize
    results.push(await this.runBenchmark(
      'image.resize',
      imageResize,
      {
        image: testImageData,
        dimensions: { width: 100, height: 100 },
        method: 'lanczos'
      }
    ));

    // Test image.convert
    results.push(await this.runBenchmark(
      'image.convert',
      imageConvert,
      {
        image: testImageData,
        format: 'jpeg',
        quality: 85
      }
    ));

    // Test image.crop
    results.push(await this.runBenchmark(
      'image.crop',
      imageCrop,
      {
        image: testImageData,
        bounds: { left: 0, top: 0, width: 50, height: 50 }
      }
    ));

    return results;
  }

  /**
   * Test SVG server performance
   */
  async testSvgServer(): Promise<TestResult[]> {
    console.log('\n🔺 TESTING SVG SERVER');
    console.log('='.repeat(40));
    
    const results: TestResult[] = [];

    // Test svg.create
    results.push(await this.runBenchmark(
      'svg.create',
      (args) => svgCreateTool.invoke(args),
      {
        width: 200,
        height: 200,
        elements: [
          {
            type: 'circle',
            cx: 100,
            cy: 100,
            r: 50,
            fill: '#ff0000'
          }
        ]
      }
    ));

    // Test svg.optimize
    const basicSvg = '<svg width="100" height="100"><circle cx="50" cy="50" r="40" fill="red"/></svg>';
    results.push(await this.runBenchmark(
      'svg.optimize',
      (args) => svgOptimizeTool.invoke(args),
      {
        svg: basicSvg,
        options: {
          removeViewBox: false,
          removeDimensions: false,
          precision: 2
        }
      }
    ));

    // Test svg.transform
    results.push(await this.runBenchmark(
      'svg.transform',
      (args) => svgTransformTool.invoke(args),
      {
        svg: basicSvg,
        transforms: [
          { type: 'scale', values: [2, 2] }
        ]
      }
    ));

    return results;
  }

  /**
   * Test typography server performance
   */
  async testTypeServer(): Promise<TestResult[]> {
    console.log('\n🔤 TESTING TYPE SERVER');
    console.log('='.repeat(40));
    
    const results: TestResult[] = [];

    // Test type.loadFont
    results.push(await this.runBenchmark(
      'type.loadFont',
      (args) => loadFontTool.invoke(args),
      {
        type: 'system',
        name: 'Arial'
      }
    ));

    // Test type.shapeText
    results.push(await this.runBenchmark(
      'type.shapeText',
      (args) => shapeTextTool.invoke(args),
      {
        text: 'Hello, world!',
        font: {
          type: 'system',
          name: 'Arial'
        },
        features: {}
      }
    ));

    // Test type.measureText
    results.push(await this.runBenchmark(
      'type.measureText',
      (args) => measureTextTool.invoke(args),
      {
        text: 'Hello, world!',
        font: {
          type: 'system',
          name: 'Arial'
        }
      }
    ));

    return results;
  }

  /**
   * Generate comprehensive report
   */
  generateReport(allResults: TestResult[]): void {
    console.log('\n' + '='.repeat(80));
    console.log('📊 MCP GRAPHICS REAL PERFORMANCE VALIDATION REPORT');
    console.log('='.repeat(80));
    
    const totalTests = allResults.length;
    const passedTests = allResults.filter(r => r.passed).length;
    const failedTests = totalTests - passedTests;
    const overallPassRate = (passedTests / totalTests) * 100;

    console.log(`\n📈 OVERALL SUMMARY`);
    console.log(`Total Tests: ${totalTests}`);
    console.log(`Passed: ${passedTests} (${overallPassRate.toFixed(1)}%)`);
    console.log(`Failed: ${failedTests}`);

    // Group by server
    const serverGroups = allResults.reduce((groups, result) => {
      const serverName = result.tool.split('.')[0];
      if (!groups[serverName]) groups[serverName] = [];
      groups[serverName].push(result);
      return groups;
    }, {} as Record<string, TestResult[]>);

    // Print server-specific results
    for (const [serverName, results] of Object.entries(serverGroups)) {
      console.log(`\n🔧 ${serverName.toUpperCase()} SERVER`);
      console.log('-'.repeat(60));
      console.log('Tool                     Target    Average    P95      Success  Status');
      console.log('-'.repeat(75));

      results.forEach(result => {
        const status = result.passed ? '✅ PASS' : '❌ FAIL';
        const utilizationPercent = (result.averageTime / result.target) * 100;
        const line = `${result.tool.padEnd(24)} ${result.target.toString().padEnd(9)} ` +
                     `${result.averageTime.toFixed(2).padEnd(10)} ${result.p95Time.toFixed(2).padEnd(8)} ` +
                     `${result.successRate.toFixed(1).padEnd(8)}% ${status}`;
        console.log(line);
        
        if (result.errors.length > 0) {
          console.log(`    Errors: ${result.errors.slice(0, 2).join(', ')}`);
        }
      });

      const serverPassRate = (results.filter(r => r.passed).length / results.length) * 100;
      const avgResponseTime = results.reduce((sum, r) => sum + r.averageTime, 0) / results.length;
      
      console.log(`\n  Server Summary:`);
      console.log(`    Pass Rate: ${serverPassRate.toFixed(1)}%`);
      console.log(`    Avg Response: ${avgResponseTime.toFixed(2)}ms`);
      console.log(`    Memory Impact: ${results.reduce((sum, r) => sum + r.memoryUsed, 0)}KB total`);
    }

    // Performance insights
    console.log(`\n💡 PERFORMANCE INSIGHTS`);
    console.log('-'.repeat(50));

    const slowestTools = allResults
      .sort((a, b) => (b.averageTime / b.target) - (a.averageTime / a.target))
      .slice(0, 5);

    console.log('Tools needing optimization:');
    slowestTools.forEach(result => {
      const utilizationPercent = (result.averageTime / result.target) * 100;
      if (utilizationPercent > 80 || !result.passed) {
        console.log(`  • ${result.tool}: ${utilizationPercent.toFixed(1)}% of target (${result.averageTime}ms)`);
      }
    });

    const fastestTools = allResults
      .filter(r => r.passed)
      .sort((a, b) => (a.averageTime / a.target) - (b.averageTime / b.target))
      .slice(0, 3);

    console.log('\nBest performing tools:');
    fastestTools.forEach(result => {
      const utilizationPercent = (result.averageTime / result.target) * 100;
      console.log(`  • ${result.tool}: ${utilizationPercent.toFixed(1)}% of target (${result.averageTime}ms)`);
    });

    // Final status
    console.log(`\n🎯 FINAL ASSESSMENT`);
    console.log('-'.repeat(50));
    
    if (overallPassRate >= 90) {
      console.log('🎉 EXCELLENT: All systems performing within PRD targets!');
    } else if (overallPassRate >= 75) {
      console.log('✅ GOOD: Most systems meeting targets with minor optimizations needed');
    } else if (overallPassRate >= 50) {
      console.log('⚠️  NEEDS IMPROVEMENT: Significant optimization required');
    } else {
      console.log('❌ CRITICAL: Major performance issues detected');
    }

    console.log('\n' + '='.repeat(80));
  }

  /**
   * Run all performance tests
   */
  async run(): Promise<void> {
    console.log('🚀 Starting Real MCP Graphics Performance Validation');
    console.log('Testing actual server implementations against PRD requirements\n');

    const startTime = performance.now();
    const allResults: TestResult[] = [];

    try {
      // Test all servers
      const colorResults = await this.testColorServer();
      allResults.push(...colorResults);

      const imageResults = await this.testImageServer();
      allResults.push(...imageResults);

      const svgResults = await this.testSvgServer();
      allResults.push(...svgResults);

      const typeResults = await this.testTypeServer();
      allResults.push(...typeResults);

      const endTime = performance.now();
      const totalDuration = endTime - startTime;

      console.log(`\n⏱️  Total test duration: ${(totalDuration / 1000).toFixed(2)} seconds`);

      // Generate and display report
      this.generateReport(allResults);

      // Determine exit code
      const passedCount = allResults.filter(r => r.passed).length;
      const overallPassRate = (passedCount / allResults.length) * 100;
      const exitCode = overallPassRate >= 80 ? 0 : 1;

      process.exit(exitCode);

    } catch (error) {
      console.error('❌ Performance test failed:', error);
      process.exit(1);
    }
  }
}

// Run the test if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new RealPerformanceTest();
  test.run();
}

export default RealPerformanceTest;
