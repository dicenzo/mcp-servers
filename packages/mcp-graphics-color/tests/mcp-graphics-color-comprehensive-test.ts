#!/usr/bin/env node

/**
 * Comprehensive MCP Graphics Color Server Test Suite
 * 
 * Tests all functionality areas:
 * 1. Color Generation & Palettes
 * 2. WCAG Accessibility & Compliance
 * 3. Color Space Conversions
 * 4. Advanced Color Science
 * 5. Error Handling
 */

import { spawn, ChildProcess } from 'child_process';
import { setTimeout as delay } from 'timers/promises';

interface TestResult {
  test: string;
  category: string;
  success: boolean;
  duration: number;
  result?: any;
  error?: string;
  details?: string;
}

interface TestReport {
  summary: {
    total: number;
    passed: number;
    failed: number;
    categories: Record<string, {passed: number, failed: number}>;
    totalDuration: number;
  };
  results: TestResult[];
  analysis: {
    functionalityGaps: string[];
    performanceIssues: string[];
    accessibilityCompliance: 'full' | 'partial' | 'none';
    professionalReadiness: 'excellent' | 'good' | 'fair' | 'poor';
    recommendations: string[];
  };
}

class MCPColorServerTester {
  private server: ChildProcess | null = null;
  private results: TestResult[] = [];
  private startTime = Date.now();

  /**
   * Start the MCP color server
   */
  async startServer(): Promise<void> {
    console.log('🚀 Starting MCP Graphics Color Server...');
    
    this.server = spawn('node', ['./dist/index.js'], {
      cwd: '..',
      stdio: ['pipe', 'pipe', 'pipe']
    });

    if (!this.server.stdin || !this.server.stdout) {
      throw new Error('Failed to create server process pipes');
    }

    // Wait for server to start
    await delay(1000);
    
    if (this.server.killed) {
      throw new Error('Server failed to start');
    }
    
    console.log('✅ Server started successfully');
  }

  /**
   * Stop the server
   */
  async stopServer(): Promise<void> {
    if (this.server) {
      this.server.kill('SIGTERM');
      this.server = null;
      console.log('🛑 Server stopped');
    }
  }

  /**
   * Send MCP request to server
   */
  async sendMCPRequest(method: string, params: any): Promise<any> {
    if (!this.server || !this.server.stdin || !this.server.stdout) {
      throw new Error('Server not running');
    }

    const request = {
      jsonrpc: '2.0',
      id: Math.floor(Math.random() * 1000000),
      method,
      params
    };

    return new Promise((resolve, reject) => {
      const server = this.server!;
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, 10000);

      const onData = (data: Buffer) => {
        clearTimeout(timeout);
        server.stdout!.removeListener('data', onData);
        
        try {
          const response = JSON.parse(data.toString());
          resolve(response);
        } catch (error) {
          reject(new Error(`Failed to parse response: ${data.toString()}`));
        }
      };

      server.stdout!.on('data', onData);
      server.stdin!.write(JSON.stringify(request) + '\n');
    });
  }

  /**
   * Test helper to run a single test
   */
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
   * 1. Color Generation & Palette Tests
   */
  async testColorGenerationAndPalettes(): Promise<void> {
    console.log('\n📊 Testing Color Generation & Palettes...');

    // Test complementary palette generation
    await this.runTest('Color Generation', 'Complementary Palette Generation', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.generatePalette',
        arguments: {
          baseColor: '#1976d2',
          harmony: 'complementary',
          count: 5
        }
      });

      if (!response.result || !response.result.content) {
        throw new Error('No content in response');
      }

      const result = JSON.parse(response.result.content[0].text);
      if (!result.colors || result.colors.length !== 5) {
        throw new Error(`Expected 5 colors, got ${result.colors?.length || 0}`);
      }

      return result;
    });

    // Test triadic palette generation
    await this.runTest('Color Generation', 'Triadic Palette Generation', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.generatePalette',
        arguments: {
          baseColor: '#e53e3e',
          harmony: 'triadic',
          count: 3,
          adjustments: {
            saturation: 0.1,
            lightness: -0.1
          }
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      if (!result.colors || result.colors.length !== 3) {
        throw new Error(`Expected 3 colors, got ${result.colors?.length || 0}`);
      }

      return result;
    });

    // Test analogous palette generation  
    await this.runTest('Color Generation', 'Analogous Palette Generation', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.generatePalette',
        arguments: {
          baseColor: '#38a169',
          harmony: 'analogous',
          count: 4
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      if (!result.colors || result.colors.length !== 4) {
        throw new Error(`Expected 4 colors, got ${result.colors?.length || 0}`);
      }

      return result;
    });

    // Test monochromatic palette generation
    await this.runTest('Color Generation', 'Monochromatic Palette Generation', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.generatePalette',
        arguments: {
          baseColor: '#805ad5',
          harmony: 'monochromatic',
          count: 6
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      if (!result.colors || result.colors.length !== 6) {
        throw new Error(`Expected 6 colors, got ${result.colors?.length || 0}`);
      }

      return result;
    });
  }

  /**
   * 2. WCAG Accessibility & Compliance Tests  
   */
  async testWCAGAccessibility(): Promise<void> {
    console.log('\n♿ Testing WCAG Accessibility & Compliance...');

    // Test basic contrast checking
    await this.runTest('WCAG Accessibility', 'Basic Contrast Calculation', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.contrast',
        arguments: {
          foreground: '#333333',
          background: '#ffffff',
          level: 'AA',
          size: 'normal'
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      if (!result.ratio || result.ratio < 4.5) {
        throw new Error(`Expected contrast ratio >= 4.5, got ${result.ratio}`);
      }

      if (!result.wcag || !result.wcag.AA || !result.wcag.AA.normal) {
        throw new Error('Expected WCAG AA compliance for normal text');
      }

      return result;
    });

    // Test AAA level compliance
    await this.runTest('WCAG Accessibility', 'AAA Level Compliance', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.contrast',
        arguments: {
          foreground: '#000000',
          background: '#ffffff',
          level: 'AAA',
          size: 'normal'
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      if (!result.ratio || result.ratio < 7.0) {
        throw new Error(`Expected contrast ratio >= 7.0 for AAA, got ${result.ratio}`);
      }

      if (!result.wcag || !result.wcag.AAA || !result.wcag.AAA.normal) {
        throw new Error('Expected WCAG AAA compliance');
      }

      return result;
    });

    // Test large text sizing
    await this.runTest('WCAG Accessibility', 'Large Text Compliance', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.contrast',
        arguments: {
          foreground: '#666666',
          background: '#ffffff',
          level: 'AA',
          size: 'large'
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      // Large text only needs 3:1 for AA
      if (!result.ratio || result.ratio < 3.0) {
        throw new Error(`Expected contrast ratio >= 3.0 for large text, got ${result.ratio}`);
      }

      return result;
    });

    // Test comprehensive accessibility validation
    await this.runTest('WCAG Accessibility', 'Comprehensive Accessibility Validation', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.validateAccessibility',
        arguments: {
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
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      if (!result.validationResults || result.validationResults.length !== 3) {
        throw new Error(`Expected 3 validation results, got ${result.validationResults?.length || 0}`);
      }

      return result;
    });
  }

  /**
   * 3. Color Space Conversion Tests
   */
  async testColorSpaceConversions(): Promise<void> {
    console.log('\n🎨 Testing Color Space Conversions...');

    // Test hex to RGB conversion
    await this.runTest('Color Conversions', 'Hex to RGB Conversion', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.convert',
        arguments: {
          color: '#ff6b6b',
          targetSpace: 'rgb',
          precision: 3
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      if (!result.values || result.values.length !== 3) {
        throw new Error('Expected RGB values array with 3 elements');
      }

      // Check if values are in expected range
      for (const value of result.values) {
        if (value < 0 || value > 255) {
          throw new Error(`RGB value ${value} out of range (0-255)`);
        }
      }

      return result;
    });

    // Test RGB to HSL conversion
    await this.runTest('Color Conversions', 'RGB to HSL Conversion', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.convert',
        arguments: {
          color: { space: 'rgb', values: [255, 107, 107] },
          targetSpace: 'hsl'
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      if (!result.values || result.values.length !== 3) {
        throw new Error('Expected HSL values array with 3 elements');
      }

      return result;
    });

    // Test conversion to OKLCH (modern color space)
    await this.runTest('Color Conversions', 'Hex to OKLCH Conversion', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.convert',
        arguments: {
          color: '#3498db',
          targetSpace: 'oklch',
          precision: 4
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      if (!result.values || result.values.length !== 3) {
        throw new Error('Expected OKLCH values array with 3 elements');
      }

      return result;
    });

    // Test Lab color space conversion
    await this.runTest('Color Conversions', 'RGB to Lab Conversion', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.convert',
        arguments: {
          color: 'rgb(52, 152, 219)',
          targetSpace: 'lab'
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      if (!result.values || result.values.length !== 3) {
        throw new Error('Expected Lab values array with 3 elements');
      }

      return result;
    });

    // Test high precision conversion
    await this.runTest('Color Conversions', 'High Precision Conversion', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.convert',
        arguments: {
          color: '#ff0000',
          targetSpace: 'oklch',
          precision: 6
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      // Check that precision is properly applied
      const precision6 = result.values[0].toString().split('.')[1]?.length || 0;
      if (precision6 > 6) {
        throw new Error(`Precision should be limited to 6 decimal places`);
      }

      return result;
    });
  }

  /**
   * 4. Advanced Color Science Tests
   */
  async testAdvancedColorScience(): Promise<void> {
    console.log('\n🔬 Testing Advanced Color Science...');

    // Test brand color matching
    await this.runTest('Color Science', 'Brand Color Matching', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.brandMatch',
        arguments: {
          inputColor: '#4285f4',
          brandPalette: ['#1976d2', '#424242', '#ffffff', '#f44336'],
          tolerance: 15,
          method: 'delta-e'
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      if (!result.bestMatch || typeof result.bestMatch.similarity !== 'number') {
        throw new Error('Expected bestMatch with similarity score');
      }

      if (!result.bestMatch.deltaE || typeof result.bestMatch.deltaE !== 'number') {
        throw new Error('Expected Delta E calculation');
      }

      return result;
    });

    // Test brand linting
    await this.runTest('Color Science', 'Brand Color Linting', async () => {
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.lintBrand',
        arguments: {
          brandPalette: ['#1976d2', '#424242', '#ffffff', '#f44336', '#4caf50'],
          rules: {
            minContrast: 4.5,
            maxColors: 10,
            requireAccessibility: true
          },
          context: 'web'
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      if (!result.validation || typeof result.validation.isValid !== 'boolean') {
        throw new Error('Expected validation results with isValid property');
      }

      return result;
    });

    // Test color temperature and perception
    await this.runTest('Color Science', 'Color Temperature Analysis', async () => {
      // Generate palette with temperature adjustments
      const response = await this.sendMCPRequest('tools/call', {
        name: 'color.generatePalette',
        arguments: {
          baseColor: '#ffffff',
          harmony: 'monochromatic',
          count: 3,
          adjustments: {
            temperature: 0.5  // Warmer
          }
        }
      });

      const result = JSON.parse(response.result.content[0].text);
      if (!result.colors || result.colors.length !== 3) {
        throw new Error('Expected 3 colors for temperature test');
      }

      return result;
    });
  }

  /**
   * 5. Error Handling Tests
   */
  async testErrorHandling(): Promise<void> {
    console.log('\n🚨 Testing Error Handling...');

    // Test invalid color format
    await this.runTest('Error Handling', 'Invalid Color Format', async () => {
      try {
        const response = await this.sendMCPRequest('tools/call', {
          name: 'color.convert',
          arguments: {
            color: '#gghhii',  // Invalid hex
            targetSpace: 'rgb'
          }
        });

        // This should have failed
        if (response.result) {
          throw new Error('Expected error for invalid color format');
        }

        return { expectedError: true, response };
      } catch (error) {
        // Expected error - validate it's the right kind
        if (error instanceof Error && error.message.includes('invalid') || error.message.includes('parse')) {
          return { expectedError: true, error: error.message };
        }
        throw error;
      }
    });

    // Test unsupported color space
    await this.runTest('Error Handling', 'Unsupported Color Space', async () => {
      try {
        const response = await this.sendMCPRequest('tools/call', {
          name: 'color.convert',
          arguments: {
            color: '#ff0000',
            targetSpace: 'cmyk'  // Not supported
          }
        });

        if (response.result) {
          throw new Error('Expected error for unsupported color space');
        }

        return { expectedError: true, response };
      } catch (error) {
        if (error instanceof Error && error.message.toLowerCase().includes('unsupported')) {
          return { expectedError: true, error: error.message };
        }
        throw error;
      }
    });

    // Test invalid precision range
    await this.runTest('Error Handling', 'Invalid Precision Range', async () => {
      try {
        const response = await this.sendMCPRequest('tools/call', {
          name: 'color.convert',
          arguments: {
            color: '#ff0000',
            targetSpace: 'rgb',
            precision: 15  // Out of range (max 10)
          }
        });

        if (response.result) {
          throw new Error('Expected error for invalid precision');
        }

        return { expectedError: true, response };
      } catch (error) {
        if (error instanceof Error && (error.message.includes('precision') || error.message.includes('range'))) {
          return { expectedError: true, error: error.message };
        }
        throw error;
      }
    });

    // Test missing required parameters
    await this.runTest('Error Handling', 'Missing Required Parameters', async () => {
      try {
        const response = await this.sendMCPRequest('tools/call', {
          name: 'color.contrast',
          arguments: {
            foreground: '#333333'
            // Missing background parameter
          }
        });

        if (response.result) {
          throw new Error('Expected error for missing parameters');
        }

        return { expectedError: true, response };
      } catch (error) {
        if (error instanceof Error && (error.message.includes('required') || error.message.includes('background'))) {
          return { expectedError: true, error: error.message };
        }
        throw error;
      }
    });
  }

  /**
   * Generate comprehensive test report
   */
  generateReport(): TestReport {
    const totalDuration = Date.now() - this.startTime;
    const categories: Record<string, {passed: number, failed: number}> = {};
    
    // Categorize results
    for (const result of this.results) {
      if (!categories[result.category]) {
        categories[result.category] = { passed: 0, failed: 0 };
      }
      
      if (result.success) {
        categories[result.category].passed++;
      } else {
        categories[result.category].failed++;
      }
    }

    const passed = this.results.filter(r => r.success).length;
    const failed = this.results.filter(r => r.success === false).length;
    
    // Analyze results
    const functionalityGaps: string[] = [];
    const performanceIssues: string[] = [];
    const recommendations: string[] = [];
    
    // Check for missing functionality
    const colorGenerationTests = this.results.filter(r => r.category === 'Color Generation');
    const accessibilityTests = this.results.filter(r => r.category === 'WCAG Accessibility');
    const conversionTests = this.results.filter(r => r.category === 'Color Conversions');
    
    if (colorGenerationTests.filter(t => t.success).length < 3) {
      functionalityGaps.push('Incomplete color palette generation support');
    }
    
    if (accessibilityTests.filter(t => t.success).length < 3) {
      functionalityGaps.push('Limited WCAG accessibility validation');
    }
    
    // Check performance
    const slowTests = this.results.filter(r => r.duration > 100);
    if (slowTests.length > 0) {
      performanceIssues.push(`${slowTests.length} tests exceeded 100ms response time`);
    }
    
    // Generate recommendations
    if (failed === 0) {
      recommendations.push('All tests passed - server is production-ready');
    } else if (failed < 3) {
      recommendations.push('Minor issues found - address error handling edge cases');
    } else {
      recommendations.push('Multiple failures detected - review core functionality');
    }
    
    const accessibilityCompliance: 'full' | 'partial' | 'none' = 
      accessibilityTests.filter(t => t.success).length >= 3 ? 'full' : 
      accessibilityTests.filter(t => t.success).length > 0 ? 'partial' : 'none';
    
    const professionalReadiness: 'excellent' | 'good' | 'fair' | 'poor' = 
      failed === 0 && performanceIssues.length === 0 ? 'excellent' :
      failed <= 2 && performanceIssues.length <= 1 ? 'good' :
      failed <= 5 ? 'fair' : 'poor';

    return {
      summary: {
        total: this.results.length,
        passed,
        failed,
        categories,
        totalDuration
      },
      results: this.results,
      analysis: {
        functionalityGaps,
        performanceIssues,
        accessibilityCompliance,
        professionalReadiness,
        recommendations
      }
    };
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<TestReport> {
    try {
      await this.startServer();
      
      await this.testColorGenerationAndPalettes();
      await this.testWCAGAccessibility();  
      await this.testColorSpaceConversions();
      await this.testAdvancedColorScience();
      await this.testErrorHandling();
      
      console.log('\n📋 All tests completed!');
      
    } catch (error) {
      console.error('❌ Test suite failed:', error);
      throw error;
    } finally {
      await this.stopServer();
    }
    
    return this.generateReport();
  }
}

/**
 * Main execution
 */
async function main() {
  console.log('🎯 MCP Graphics Color Server - Comprehensive Test Suite');
  console.log('==================================================');
  
  const tester = new MCPColorServerTester();
  
  try {
    const report = await tester.runAllTests();
    
    // Display report
    console.log('\n📊 TEST REPORT');
    console.log('===============');
    console.log(`Total Tests: ${report.summary.total}`);
    console.log(`Passed: ${report.summary.passed} ✅`);
    console.log(`Failed: ${report.summary.failed} ❌`);
    console.log(`Total Duration: ${report.summary.totalDuration}ms`);
    
    console.log('\n📈 Category Breakdown:');
    for (const [category, stats] of Object.entries(report.summary.categories)) {
      console.log(`  ${category}: ${stats.passed}/${stats.passed + stats.failed} passed`);
    }
    
    console.log('\n🔍 Analysis:');
    console.log(`Accessibility Compliance: ${report.analysis.accessibilityCompliance}`);
    console.log(`Professional Readiness: ${report.analysis.professionalReadiness}`);
    
    if (report.analysis.functionalityGaps.length > 0) {
      console.log('\n⚠️  Functionality Gaps:');
      report.analysis.functionalityGaps.forEach(gap => console.log(`  - ${gap}`));
    }
    
    if (report.analysis.performanceIssues.length > 0) {
      console.log('\n🐌 Performance Issues:');
      report.analysis.performanceIssues.forEach(issue => console.log(`  - ${issue}`));
    }
    
    console.log('\n💡 Recommendations:');
    report.analysis.recommendations.forEach(rec => console.log(`  - ${rec}`));
    
    if (report.summary.failed > 0) {
      console.log('\n❌ Failed Tests:');
      report.results
        .filter(r => !r.success)
        .forEach(r => console.log(`  - ${r.test}: ${r.error}`));
    }
    
    // Save detailed report
    const fs = await import('fs/promises');
    const reportPath = './reports/mcp-color-server-test-report.json';
    await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
    console.log(`\n📄 Detailed report saved to: ${reportPath}`);
    
  } catch (error) {
    console.error('\n💥 Test suite failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}