#!/usr/bin/env node

/**
 * Test Environment Setup Script
 * Downloads and prepares test assets, validates server builds
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import fetch from 'node-fetch';
import { getTestConfig } from '../utils/test-config.js';

const config = getTestConfig();

/**
 * Setup test assets directory and download required files
 */
async function setupTestAssets(): Promise<void> {
  console.log('🎨 Setting up test assets...');
  
  const assetsDir = config.assets.baseDir;
  
  // Create asset directories
  await fs.mkdir(path.join(assetsDir, 'fonts'), { recursive: true });
  await fs.mkdir(path.join(assetsDir, 'images'), { recursive: true });
  await fs.mkdir(path.join(assetsDir, 'colors'), { recursive: true });
  await fs.mkdir(path.join(assetsDir, 'svg'), { recursive: true });
  
  // Create test color palettes
  await createTestColorPalettes(assetsDir);
  
  // Create test images
  await createTestImages(assetsDir);
  
  // Create test SVG assets
  await createTestSVGs(assetsDir);
  
  // Create test font metadata (actual fonts would be too large for repo)
  await createTestFontMetadata(assetsDir);
  
  console.log('✅ Test assets setup complete');
}

/**
 * Create test color palette JSON files
 */
async function createTestColorPalettes(assetsDir: string): Promise<void> {
  const colorPalettes = {
    'brand-colors.json': {
      name: 'Brand Colors',
      colors: [
        { hex: '#3498db', name: 'Primary Blue', role: 'primary' },
        { hex: '#e74c3c', name: 'Accent Red', role: 'accent' },
        { hex: '#2c3e50', name: 'Dark Blue', role: 'text' },
        { hex: '#95a5a6', name: 'Light Gray', role: 'secondary' },
        { hex: '#ffffff', name: 'White', role: 'background' }
      ],
      metadata: {
        created: new Date().toISOString(),
        version: '1.0.0',
        accessibility: 'WCAG AA compliant'
      }
    },
    
    'material-colors.json': {
      name: 'Material Design Colors',
      colors: [
        { hex: '#f44336', name: 'Red 500', role: 'error' },
        { hex: '#e91e63', name: 'Pink 500', role: 'accent' },
        { hex: '#9c27b0', name: 'Purple 500', role: 'secondary' },
        { hex: '#673ab7', name: 'Deep Purple 500', role: 'primary' },
        { hex: '#3f51b5', name: 'Indigo 500', role: 'info' },
        { hex: '#2196f3', name: 'Blue 500', role: 'primary' },
        { hex: '#03a9f4', name: 'Light Blue 500', role: 'info' },
        { hex: '#00bcd4', name: 'Cyan 500', role: 'accent' },
        { hex: '#009688', name: 'Teal 500', role: 'success' },
        { hex: '#4caf50', name: 'Green 500', role: 'success' }
      ]
    },
    
    'accessibility-test-colors.json': {
      name: 'Accessibility Test Colors',
      colors: [
        { hex: '#000000', name: 'Black', contrast: { white: 21.0 } },
        { hex: '#ffffff', name: 'White', contrast: { black: 21.0 } },
        { hex: '#767676', name: 'Gray AA Normal', contrast: { white: 4.54 } },
        { hex: '#949494', name: 'Gray AA Large', contrast: { white: 3.15 } },
        { hex: '#595959', name: 'Gray AAA Normal', contrast: { white: 7.17 } },
        { hex: '#777777', name: 'Gray AAA Large', contrast: { white: 4.47 } }
      ],
      metadata: {
        purpose: 'Testing WCAG contrast requirements',
        standards: ['WCAG 2.1 AA', 'WCAG 2.1 AAA']
      }
    }
  };
  
  for (const [filename, palette] of Object.entries(colorPalettes)) {
    await fs.writeFile(
      path.join(assetsDir, 'colors', filename),
      JSON.stringify(palette, null, 2)
    );
  }
  
  console.log('  📋 Created color palette files');
}

/**
 * Create minimal test images (base64 encoded)
 */
async function createTestImages(assetsDir: string): Promise<void> {
  const testImages = {
    'test-image-100x100.png': {
      width: 100,
      height: 100,
      format: 'png',
      // Minimal 1x1 red pixel PNG (base64)
      data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
      description: 'Red 100x100 test image'
    },
    
    'test-image-400x300.jpg': {
      width: 400,
      height: 300,
      format: 'jpeg',
      // Minimal JPEG placeholder
      data: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAYEBQYFBAYGBQYHBwYIChAKCgkJChQODwwQFxQYGBcUFhYaHSUfGhsjHBYWICwgIyYnKSopGR8tMC0oMCUoKSj/2wBDAQcHBwoIChMKChMoGhYaKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCgoKCj/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAv/xAAhEAACAQMDBQAAAAAAAAAAAAABAgMABAUGIWGRobHB8f/EABUBAQEAAAAAAAAAAAAAAAAAAAMF/8QAGhEAAgIDAAAAAAAAAAAAAAAAAAECEgMRkf/aAAwDAQACEQMRAD8AltJagyeH0AthI5xdrLcNM91BF5pX2HaH9bcfaSXWGaRmknyepU4yRVkzToN6 Ap38J6tR5bVJhyKOI4g9MdQTjbY7ESDrfm9j88sNtJYMwxnZ5jJ6YxzTMpGqLc1qkKBKnB4HPFULEozGIDNLWJlNUJE7KzDEbWmAJ6dTU+bCYDGp2B2KRIUvB+sYJ4jKlZOJE5Gek8x4A7AxqRaOVhb6lDL5eObCHhppgE1hANuFm4RGAE3Qh8GzrZiPFzUE3c9r5fIdvJIBjDAKGFKHmJzHo9QiAJDLnLNSTmZBGCwjn+AiGQyKl5A7/GjCt2IcFo+0DpbRvTHnEy3dIDAbJwFRhsOMl/aDMRIXfP8AgNVrBfNy2rDAJwuMA2T3ANhJxKQCJgJz8jWFoI74TDc7Kq1bL3qd7GgOc5HbdGQYPeQNh+TaQR',
      description: 'Blue 400x300 test image'
    }
  };
  
  for (const [filename, imageData] of Object.entries(testImages)) {
    await fs.writeFile(
      path.join(assetsDir, 'images', filename),
      JSON.stringify(imageData, null, 2)
    );
  }
  
  console.log('  🖼️  Created test image files');
}

/**
 * Create test SVG assets
 */
async function createTestSVGs(assetsDir: string): Promise<void> {
  const testSVGs = {
    'simple-icon.svg': `<svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
  <circle cx="12" cy="12" r="10" fill="#3498db" stroke="#2c3e50" stroke-width="2"/>
  <path d="M8 12l2 2 4-4" stroke="#ffffff" stroke-width="2" fill="none"/>
</svg>`,
    
    'complex-logo.svg': `<svg width="200" height="60" viewBox="0 0 200 60" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="200" height="60" rx="8" fill="#2c3e50"/>
  <text x="100" y="35" font-family="Arial, sans-serif" font-size="18" font-weight="bold" text-anchor="middle" fill="#3498db">MCP GRAPHICS</text>
  <circle cx="20" cy="20" r="8" fill="#e74c3c"/>
  <rect x="172" y="12" width="16" height="16" fill="#f39c12"/>
</svg>`,
    
    'typography-sample.svg': `<svg width="400" height="300" viewBox="0 0 400 300" xmlns="http://www.w3.org/2000/svg">
  <rect width="400" height="300" fill="#ffffff"/>
  <text x="20" y="40" font-family="Arial, sans-serif" font-size="32" font-weight="bold" fill="#2c3e50">Typography Test</text>
  <text x="20" y="80" font-family="Arial, sans-serif" font-size="18" fill="#34495e">Regular text in Arial</text>
  <text x="20" y="110" font-family="Times, serif" font-size="16" fill="#7f8c8d">Serif text in Times</text>
  <text x="20" y="140" font-family="Courier, monospace" font-size="14" fill="#95a5a6">Monospace text in Courier</text>
  <text x="20" y="180" font-family="Arial, sans-serif" font-size="24" font-weight="300" fill="#e74c3c">Light weight text</text>
  <text x="20" y="220" font-family="Arial, sans-serif" font-size="20" font-weight="700" fill="#27ae60">Bold text</text>
  <text x="20" y="260" font-family="Arial, sans-serif" font-size="18" font-style="italic" fill="#8e44ad">Italic text</text>
</svg>`
  };
  
  for (const [filename, svgContent] of Object.entries(testSVGs)) {
    await fs.writeFile(
      path.join(assetsDir, 'svg', filename),
      svgContent
    );
  }
  
  console.log('  🎯 Created test SVG files');
}

/**
 * Create test font metadata
 */
async function createTestFontMetadata(assetsDir: string): Promise<void> {
  const fontMetadata = {
    'system-fonts.json': {
      fonts: [
        { family: 'Arial', type: 'sans-serif', weight: [400, 700], available: true },
        { family: 'Times', type: 'serif', weight: [400, 700], available: true },
        { family: 'Courier', type: 'monospace', weight: [400, 700], available: true },
        { family: 'Helvetica', type: 'sans-serif', weight: [400, 700], available: true }
      ]
    },
    
    'google-fonts.json': {
      fonts: [
        {
          family: 'Inter',
          variants: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
          subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'vietnamese'],
          url: 'https://fonts.googleapis.com/css2?family=Inter:wght@100;200;300;400;500;600;700;800;900&display=swap'
        },
        {
          family: 'Roboto',
          variants: ['100', '100italic', '300', '300italic', '400', '400italic', '500', '500italic', '700', '700italic', '900', '900italic'],
          subsets: ['latin', 'latin-ext', 'cyrillic', 'cyrillic-ext', 'greek', 'greek-ext', 'vietnamese'],
          url: 'https://fonts.googleapis.com/css2?family=Roboto:ital,wght@0,100;0,300;0,400;0,500;0,700;0,900;1,100;1,300;1,400;1,500;1,700;1,900&display=swap'
        }
      ]
    }
  };
  
  for (const [filename, metadata] of Object.entries(fontMetadata)) {
    await fs.writeFile(
      path.join(assetsDir, 'fonts', filename),
      JSON.stringify(metadata, null, 2)
    );
  }
  
  console.log('  🔤 Created font metadata files');
}

/**
 * Validate that all MCP servers are built and ready
 */
async function validateServerBuilds(): Promise<void> {
  console.log('🔧 Validating MCP server builds...');
  
  const projectRoot = path.resolve(process.cwd(), '..', '..', 'packages');
  
  for (const serverConfig of config.servers) {
    const serverPath = path.resolve(projectRoot, serverConfig.executablePath);
    
    try {
      // Check if executable exists
      await fs.access(serverPath);
      console.log(`  ✅ ${serverConfig.name}: Build found`);
      
      // Try to run basic validation
      try {
        execSync(`node "${serverPath}" --version || echo "No version flag"`, { 
          stdio: 'pipe',
          timeout: 5000,
          cwd: path.dirname(serverPath)
        });
        console.log(`  ✅ ${serverConfig.name}: Executable runs`);
      } catch (error) {
        console.log(`  ⚠️  ${serverConfig.name}: Executable check failed (${error instanceof Error ? error.message : 'Unknown error'})`);
      }
      
    } catch (error) {
      console.error(`  ❌ ${serverConfig.name}: Build not found at ${serverPath}`);
      console.error(`     Run: cd ${path.dirname(serverPath)} && npm run build`);
      throw new Error(`Server ${serverConfig.name} is not built`);
    }
  }
  
  console.log('✅ All server builds validated');
}

/**
 * Create output directories
 */
async function setupOutputDirectories(): Promise<void> {
  console.log('📁 Setting up output directories...');
  
  const outputDir = config.reporting.outputDir;
  
  await fs.mkdir(outputDir, { recursive: true });
  await fs.mkdir(path.join(outputDir, 'test-results'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'performance-reports'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'coverage'), { recursive: true });
  await fs.mkdir(path.join(outputDir, 'logs'), { recursive: true });
  
  console.log('✅ Output directories created');
}

/**
 * Main setup function
 */
async function main(): Promise<void> {
  console.log('🚀 Setting up MCP Graphics Integration Test Environment\n');
  
  try {
    await setupTestAssets();
    await validateServerBuilds();
    await setupOutputDirectories();
    
    console.log('\n🎉 Test environment setup complete!');
    console.log('\nYou can now run:');
    console.log('  npm test                 - Run all tests');
    console.log('  npm run test:integration - Run integration tests');
    console.log('  npm run test:performance - Run performance tests');
    console.log('  npm run test:workflows   - Run workflow tests');
    
  } catch (error) {
    console.error('\n❌ Setup failed:', error instanceof Error ? error.message : 'Unknown error');
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

export { main as setupTestEnvironment };