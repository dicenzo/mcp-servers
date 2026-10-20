#!/usr/bin/env node

/**
 * Direct MCP Graphics Color Server Test
 * 
 * Tests color server tools directly without MCP protocol layer
 * to isolate functionality issues
 */

import { performance } from 'perf_hooks';

// Import tools directly
import { colorConvert } from '../dist/tools/colorConvert.js';
import { colorContrast } from '../dist/tools/colorContrast.js';
import { colorGeneratePalette } from '../dist/tools/colorGeneratePalette.js';
import { colorBrandMatch } from '../dist/tools/colorBrandMatch.js';
import { colorLintBrand } from '../dist/tools/colorLintBrand.js';
import { colorValidateAccessibility } from '../dist/tools/colorValidateAccessibility.js';

interface DirectTestResult {
  test: string;
  category: string;
  success: boolean;
  duration: number;
  result?: any;
  error?: string;
}

class DirectColorTester {
  private results: DirectTestResult[] = [];

  async runTest(category: string, testName: string, testFn: () => Promise<any>): Promise<void> {
    const startTime = performance.now();
    console.log(`🧪 Testing: ${testName}`);
    
    try {
      const result = await testFn();
      const duration = performance.now() - startTime;
      
      this.results.push({
        test: testName,
        category,
        success: true,
        duration,
        result
      });
      
      console.log(`✅ ${testName} - PASSED (${duration.toFixed(2)}ms)`);
      if (result?.result) {
        console.log(`   Result: ${JSON.stringify(result.result, null, 2).substring(0, 200)}...`);
      }
    } catch (error) {
      const duration = performance.now() - startTime;
      
      this.results.push({
        test: testName,
        category,
        success: false,
        duration,
        error: error instanceof Error ? error.message : String(error)
      });
      
      console.log(`❌ ${testName} - FAILED (${duration.toFixed(2)}ms): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Test Color Space Conversions
   */
  async testColorConversions(): Promise<void> {
    console.log('\n🎨 Testing Color Space Conversions...');

    // Test basic hex to RGB conversion
    await this.runTest('Color Conversions', 'Hex to RGB Conversion', async () => {
      return await colorConvert({
        color: '#ff6b6b',
        targetSpace: 'rgb',
        precision: 3
      });
    });

    // Test RGB to HSL conversion
    await this.runTest('Color Conversions', 'RGB to HSL Conversion', async () => {
      return await colorConvert({
        color: { space: 'rgb', values: [255, 107, 107] },
        targetSpace: 'hsl'
      });
    });

    // Test hex to OKLCH conversion
    await this.runTest('Color Conversions', 'Hex to OKLCH Conversion', async () => {
      return await colorConvert({
        color: '#3498db',
        targetSpace: 'oklch',
        precision: 4
      });
    });

    // Test Lab color space conversion
    await this.runTest('Color Conversions', 'RGB to Lab Conversion', async () => {
      return await colorConvert({
        color: 'rgb(52, 152, 219)',
        targetSpace: 'lab'
      });
    });

    // Test high precision conversion
    await this.runTest('Color Conversions', 'High Precision Conversion', async () => {
      return await colorConvert({
        color: '#ff0000',
        targetSpace: 'oklch',
        precision: 6
      });
    });
  }

  /**
   * Test WCAG Contrast Functions
   */
  async testContrastFunctions(): Promise<void> {
    console.log('\n♿ Testing WCAG Contrast Functions...');

    // Test basic contrast calculation
    await this.runTest('WCAG Contrast', 'Basic Contrast Calculation', async () => {
      return await colorContrast({
        foreground: '#333333',
        background: '#ffffff',
        level: 'AA',
        size: 'normal'
      });
    });

    // Test AAA level compliance
    await this.runTest('WCAG Contrast', 'AAA Level Compliance', async () => {
      return await colorContrast({
        foreground: '#000000',
        background: '#ffffff',
        level: 'AAA',
        size: 'normal'
      });
    });

    // Test large text sizing
    await this.runTest('WCAG Contrast', 'Large Text Compliance', async () => {
      return await colorContrast({
        foreground: '#666666',
        background: '#ffffff',
        level: 'AA',
        size: 'large'
      });
    });

    // Test poor contrast detection
    await this.runTest('WCAG Contrast', 'Poor Contrast Detection', async () => {
      return await colorContrast({
        foreground: '#cccccc',
        background: '#ffffff',
        level: 'AA',
        size: 'normal'
      });
    });
  }

  /**
   * Test Palette Generation
   */
  async testPaletteGeneration(): Promise<void> {
    console.log('\n🎯 Testing Palette Generation...');

    // Test complementary palette
    await this.runTest('Palette Generation', 'Complementary Palette', async () => {
      return await colorGeneratePalette({
        baseColor: '#1976d2',
        harmony: 'complementary',
        count: 5
      });
    });

    // Test triadic palette
    await this.runTest('Palette Generation', 'Triadic Palette', async () => {
      return await colorGeneratePalette({
        baseColor: '#e53e3e',
        harmony: 'triadic',
        count: 3,
        adjustments: {
          saturation: 0.1,
          lightness: -0.1
        }
      });
    });

    // Test analogous palette
    await this.runTest('Palette Generation', 'Analogous Palette', async () => {
      return await colorGeneratePalette({
        baseColor: '#38a169',
        harmony: 'analogous',
        count: 4
      });
    });

    // Test monochromatic palette
    await this.runTest('Palette Generation', 'Monochromatic Palette', async () => {
      return await colorGeneratePalette({
        baseColor: '#805ad5',
        harmony: 'monochromatic',
        count: 6
      });
    });
  }

  /**
   * Test Brand Color Functions
   */
  async testBrandColorFunctions(): Promise<void> {
    console.log('\n🏢 Testing Brand Color Functions...');

    // Test brand color matching
    await this.runTest('Brand Colors', 'Brand Color Matching', async () => {
      return await colorBrandMatch({
        inputColor: '#4285f4',
        brandPalette: ['#1976d2', '#424242', '#ffffff', '#f44336'],
        tolerance: 15,
        method: 'delta-e'
      });
    });

    // Test brand linting
    await this.runTest('Brand Colors', 'Brand Linting', async () => {
      return await colorLintBrand({
        brandPalette: ['#1976d2', '#424242', '#ffffff', '#f44336', '#4caf50'],
        rules: {
          minContrast: 4.5,
          maxColors: 10,
          requireAccessibility: true
        },
        context: 'web'
      });
    });
  }

  /**
   * Test Accessibility Validation
   */
  async testAccessibilityValidation(): Promise<void> {
    console.log('\n🔍 Testing Accessibility Validation...');

    // Test comprehensive accessibility validation
    await this.runTest('Accessibility', 'Comprehensive Validation', async () => {
      return await colorValidateAccessibility({
        colorCombinations: [
          { foreground: '#333333', background: '#ffffff', context: 'body-text' },
          { foreground: '#ffffff', background: '#1976d2', context: 'button' },
          { foreground: '#e53e3e', background: '#ffffff', context: 'error-text' }
        ],
        standards: ['wcag21', 'wcag22'],
        requirements: {
          level: 'AA',
          size: 'normal',
          interactive: true
        }
      });
    });
  }

  /**
   * Test Error Handling
   */
  async testErrorHandling(): Promise<void> {
    console.log('\n🚨 Testing Error Handling...');

    // Test invalid color format
    await this.runTest('Error Handling', 'Invalid Color Format', async () => {
      const result = await colorConvert({
        color: '#gghhii',
        targetSpace: 'rgb'
      });

      // We expect this to fail
      if (result.success) {
        throw new Error('Expected failure for invalid color format');
      }

      return result; // Should be error response
    });

    // Test unsupported color space
    await this.runTest('Error Handling', 'Unsupported Color Space', async () => {
      const result = await colorConvert({
        color: '#ff0000',
        targetSpace: 'cmyk' as any
      });

      if (result.success) {
        throw new Error('Expected failure for unsupported color space');
      }

      return result;
    });

    // Test invalid precision range
    await this.runTest('Error Handling', 'Invalid Precision Range', async () => {
      const result = await colorConvert({
        color: '#ff0000',
        targetSpace: 'rgb',
        precision: 15
      });

      if (result.success) {
        throw new Error('Expected failure for invalid precision');
      }

      return result;
    });
  }

  /**
   * Generate test report
   */
  generateReport(): void {
    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => !r.success).length;
    const categories = this.results.reduce((acc, r) => {
      if (!acc[r.category]) acc[r.category] = { passed: 0, failed: 0 };
      acc[r.category][r.success ? 'passed' : 'failed']++;
      return acc;
    }, {} as Record<string, {passed: number, failed: number}>);

    console.log('\n📊 DIRECT TEST REPORT');
    console.log('======================');
    console.log(`Total Tests: ${this.results.length}`);
    console.log(`Passed: ${passed} ✅`);
    console.log(`Failed: ${failed} ❌`);
    
    console.log('\n📈 Category Breakdown:');
    for (const [category, stats] of Object.entries(categories)) {
      console.log(`  ${category}: ${stats.passed}/${stats.passed + stats.failed} passed`);
    }

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results
        .filter(r => !r.success)
        .forEach(r => console.log(`  - ${r.test}: ${r.error}`));
    }

    // Analysis
    const avgDuration = this.results.reduce((sum, r) => sum + r.duration, 0) / this.results.length;
    console.log(`\n⚡ Average Response Time: ${avgDuration.toFixed(2)}ms`);
    
    const slowTests = this.results.filter(r => r.duration > 50);
    if (slowTests.length > 0) {
      console.log(`⚠️ Slow Tests (>50ms): ${slowTests.length}`);
    }

    // Professional readiness assessment
    let readiness = 'excellent';
    if (failed > 0) readiness = 'needs work';
    if (failed > 5) readiness = 'poor';
    
    console.log(`\n🎯 Professional Readiness: ${readiness}`);
  }

  /**
   * Run all direct tests
   */
  async runAllTests(): Promise<void> {
    console.log('🎯 Direct MCP Graphics Color Server Test Suite');
    console.log('===============================================');

    try {
      await this.testColorConversions();
      await this.testContrastFunctions();
      await this.testPaletteGeneration();
      await this.testBrandColorFunctions();
      await this.testAccessibilityValidation();
      await this.testErrorHandling();

      this.generateReport();

    } catch (error) {
      console.error('❌ Test suite failed:', error);
      throw error;
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const tester = new DirectColorTester();
  await tester.runAllTests();
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}