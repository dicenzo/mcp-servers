#!/usr/bin/env tsx

/**
 * Focused MCP Graphics Performance Test
 * Direct testing of individual server functions with proper imports
 */

import { performance } from 'perf_hooks';
import { spawn } from 'child_process';

// Test the working color server functions directly
async function testColorServer() {
  console.log('🎨 TESTING COLOR SERVER PERFORMANCE');
  console.log('=' .repeat(50));

  // Import and test each function
  try {
    // Dynamic imports to handle module resolution
    const { colorConvert } = await import('../dist/tools/colorConvert.js');
    const { colorContrast } = await import('../dist/tools/colorContrast.js');
    const { colorGeneratePalette } = await import('../dist/tools/colorGeneratePalette.js');
    const { colorValidateAccessibility } = await import('../dist/tools/colorValidateAccessibility.js');

    console.log('✅ Color server modules loaded successfully');

    // Test color.convert
    console.log('\\n🔄 Testing color.convert...');
    const convertTimes: number[] = [];
    const convertIterations = 50;
    
    for (let i = 0; i < convertIterations; i++) {
      const start = performance.now();
      const result = await colorConvert({ color: '#ff0000', targetSpace: 'oklch' });
      const end = performance.now();
      convertTimes.push(end - start);
      
      if (i === 0) {
        console.log('   Sample result:', JSON.stringify(result).substring(0, 100) + '...');
      }
    }
    
    const avgConvert = convertTimes.reduce((a, b) => a + b) / convertTimes.length;
    const p95Convert = convertTimes.sort((a, b) => a - b)[Math.floor(convertTimes.length * 0.95)];
    console.log(`   Average: ${avgConvert.toFixed(2)}ms, P95: ${p95Convert.toFixed(2)}ms, Target: 10ms`);
    console.log(`   Status: ${avgConvert <= 10 ? '✅ PASS' : '❌ FAIL'}`);

    // Test color.contrast
    console.log('\\n🔄 Testing color.contrast...');
    const contrastTimes: number[] = [];
    const contrastIterations = 50;
    
    for (let i = 0; i < contrastIterations; i++) {
      const start = performance.now();
      const result = await colorContrast({ foreground: '#333333', background: '#ffffff' });
      const end = performance.now();
      contrastTimes.push(end - start);
      
      if (i === 0) {
        console.log('   Sample result:', JSON.stringify(result).substring(0, 100) + '...');
      }
    }
    
    const avgContrast = contrastTimes.reduce((a, b) => a + b) / contrastTimes.length;
    const p95Contrast = contrastTimes.sort((a, b) => a - b)[Math.floor(contrastTimes.length * 0.95)];
    console.log(`   Average: ${avgContrast.toFixed(2)}ms, P95: ${p95Contrast.toFixed(2)}ms, Target: 50ms`);
    console.log(`   Status: ${avgContrast <= 50 ? '✅ PASS' : '❌ FAIL'}`);

    // Test color.generatePalette
    console.log('\\n🔄 Testing color.generatePalette...');
    const paletteTimes: number[] = [];
    const paletteIterations = 30;
    
    for (let i = 0; i < paletteIterations; i++) {
      const start = performance.now();
      const result = await colorGeneratePalette({ baseColor: '#3366cc', harmony: 'analogous', count: 5 });
      const end = performance.now();
      paletteTimes.push(end - start);
      
      if (i === 0) {
        console.log('   Sample result:', JSON.stringify(result).substring(0, 100) + '...');
      }
    }
    
    const avgPalette = paletteTimes.reduce((a, b) => a + b) / paletteTimes.length;
    const p95Palette = paletteTimes.sort((a, b) => a - b)[Math.floor(paletteTimes.length * 0.95)];
    console.log(`   Average: ${avgPalette.toFixed(2)}ms, P95: ${p95Palette.toFixed(2)}ms, Target: 100ms`);
    console.log(`   Status: ${avgPalette <= 100 ? '✅ PASS' : '❌ FAIL'}`);

    // Test color.validateAccessibility
    console.log('\\n🔄 Testing color.validateAccessibility...');
    const accessibilityTimes: number[] = [];
    const accessibilityIterations = 30;
    
    for (let i = 0; i < accessibilityIterations; i++) {
      const start = performance.now();
      const result = await colorValidateAccessibility({
        colors: ['#000000', '#ffffff', '#ff0000', '#00ff00'],
        contexts: [
          { name: 'text', foreground: 0, background: 1, textSize: 'normal', level: 'AA' }
        ]
      });
      const end = performance.now();
      accessibilityTimes.push(end - start);
      
      if (i === 0) {
        console.log('   Sample result:', JSON.stringify(result).substring(0, 100) + '...');
      }
    }
    
    const avgAccessibility = accessibilityTimes.reduce((a, b) => a + b) / accessibilityTimes.length;
    const p95Accessibility = accessibilityTimes.sort((a, b) => a - b)[Math.floor(accessibilityTimes.length * 0.95)];
    console.log(`   Average: ${avgAccessibility.toFixed(2)}ms, P95: ${p95Accessibility.toFixed(2)}ms, Target: 50ms`);
    console.log(`   Status: ${avgAccessibility <= 50 ? '✅ PASS' : '❌ FAIL'}`);

    // Summary
    const allResults = [
      { name: 'color.convert', avg: avgConvert, target: 10, passed: avgConvert <= 10 },
      { name: 'color.contrast', avg: avgContrast, target: 50, passed: avgContrast <= 50 },
      { name: 'color.generatePalette', avg: avgPalette, target: 100, passed: avgPalette <= 100 },
      { name: 'color.validateAccessibility', avg: avgAccessibility, target: 50, passed: avgAccessibility <= 50 }
    ];

    const passedCount = allResults.filter(r => r.passed).length;
    const passRate = (passedCount / allResults.length) * 100;

    console.log('\\n📊 COLOR SERVER SUMMARY');
    console.log('-'.repeat(40));
    console.log(`Tests: ${passedCount}/${allResults.length} passed (${passRate.toFixed(1)}%)`);
    console.log(`Overall Status: ${passRate >= 80 ? '✅ EXCELLENT' : passRate >= 60 ? '⚠️  NEEDS WORK' : '❌ CRITICAL'}`);

    // Performance insights
    console.log('\\n💡 Performance Insights:');
    allResults.forEach(result => {
      const utilizationPercent = (result.avg / result.target) * 100;
      if (utilizationPercent <= 20) {
        console.log(`  • ${result.name}: Excellent performance (${utilizationPercent.toFixed(1)}% of target)`);
      } else if (utilizationPercent <= 80) {
        console.log(`  • ${result.name}: Good performance (${utilizationPercent.toFixed(1)}% of target)`);
      } else {
        console.log(`  • ${result.name}: Needs optimization (${utilizationPercent.toFixed(1)}% of target)`);
      }
    });

  } catch (error) {
    console.error('❌ Color server test failed:', error);
    console.log('\\nTrying to build color server...');
    
    // Try to build the color server
    return new Promise((resolve) => {
      const buildProcess = spawn('npm', ['run', 'build'], {
        cwd: '..',
        stdio: 'inherit'
      });

      buildProcess.on('close', (code) => {
        if (code === 0) {
          console.log('✅ Color server built successfully, retry the test');
          resolve(true);
        } else {
          console.log('❌ Color server build failed');
          resolve(false);
        }
      });
    });
  }
}

async function testImageServer() {
  console.log('\\n🖼️  TESTING IMAGE SERVER PERFORMANCE');
  console.log('=' .repeat(50));

  try {
    // Check if the image server tools exist and can be imported
    const { imageResize } = await import('../../mcp-graphics-image/dist/tools/imageResize.js');
    const { imageConvert } = await import('../../mcp-graphics-image/dist/tools/imageConvert.js');

    console.log('✅ Image server modules loaded successfully');

    // Test with a simple 1x1 pixel image
    const testImage = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

    // Test image.resize
    console.log('\\n🔄 Testing image.resize...');
    const resizeTimes: number[] = [];
    const resizeIterations = 20;
    let resizeSuccesses = 0;
    
    for (let i = 0; i < resizeIterations; i++) {
      try {
        const start = performance.now();
        const result = await imageResize({
          image: { data: testImage },
          dimensions: { width: 100, height: 100 },
          method: 'lanczos'
        });
        const end = performance.now();
        resizeTimes.push(end - start);
        
        if (result.success) {
          resizeSuccesses++;
        }
        
        if (i === 0) {
          console.log('   Sample result:', result.success ? '✅ Success' : '❌ Failed');
        }
      } catch (error) {
        const end = performance.now();
        const start = performance.now(); // Re-declare start for error case
        resizeTimes.push(end - start);
        console.log(`   Iteration ${i}: Error - ${error.message}`);
      }
    }
    
    const avgResize = resizeTimes.reduce((a, b) => a + b) / resizeTimes.length;
    const successRate = (resizeSuccesses / resizeIterations) * 100;
    console.log(`   Average: ${avgResize.toFixed(2)}ms, Success rate: ${successRate.toFixed(1)}%, Target: 200ms`);
    console.log(`   Status: ${avgResize <= 200 && successRate >= 90 ? '✅ PASS' : '❌ FAIL'}`);

    // Test image.convert
    console.log('\\n🔄 Testing image.convert...');
    const convertTimes: number[] = [];
    const convertIterations = 20;
    let convertSuccesses = 0;
    
    for (let i = 0; i < convertIterations; i++) {
      try {
        const start = performance.now();
        const result = await imageConvert({
          image: { data: testImage },
          format: 'jpeg',
          quality: 85
        });
        const end = performance.now();
        convertTimes.push(end - start);
        
        if (result.success) {
          convertSuccesses++;
        }
        
        if (i === 0) {
          console.log('   Sample result:', result.success ? '✅ Success' : '❌ Failed');
        }
      } catch (error) {
        const end = performance.now();
        const start = performance.now(); // Re-declare start for error case
        convertTimes.push(end - start);
        console.log(`   Iteration ${i}: Error - ${error.message}`);
      }
    }
    
    const avgConvert = convertTimes.reduce((a, b) => a + b) / convertTimes.length;
    const convertSuccessRate = (convertSuccesses / convertIterations) * 100;
    console.log(`   Average: ${avgConvert.toFixed(2)}ms, Success rate: ${convertSuccessRate.toFixed(1)}%, Target: 300ms`);
    console.log(`   Status: ${avgConvert <= 300 && convertSuccessRate >= 90 ? '✅ PASS' : '❌ FAIL'}`);

  } catch (error) {
    console.error('❌ Image server test failed:', error);
  }
}

async function main() {
  console.log('🚀 Focused MCP Graphics Performance Test');
  console.log('Testing actual server implementations with proper imports\\n');

  const startTime = performance.now();

  await testColorServer();
  await testImageServer();

  const endTime = performance.now();
  console.log(`\\n⏱️  Total test duration: ${((endTime - startTime) / 1000).toFixed(2)} seconds`);
  
  console.log('\\n🎯 FOCUS AREAS FOR OPTIMIZATION:');
  console.log('1. Fix import/export issues in SVG and Type servers');
  console.log('2. Validate image processing input formats and error handling');
  console.log('3. Add comprehensive error handling and input validation');
  console.log('4. Implement proper caching for frequently used operations');
}

main().catch(console.error);