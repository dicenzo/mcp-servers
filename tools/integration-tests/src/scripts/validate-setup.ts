#!/usr/bin/env node

/**
 * Integration Testing Framework Validation Script
 * Validates that the framework is properly set up and ready to run tests
 */

import fs from 'fs/promises';
import path from 'path';
import { execSync } from 'child_process';
import { getTestConfig, validateTestConfig } from '../utils/test-config.js';

/**
 * Validation results interface
 */
interface ValidationResult {
  category: string;
  test: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

const results: ValidationResult[] = [];

/**
 * Add validation result
 */
function addResult(category: string, test: string, status: 'pass' | 'fail' | 'warn', message: string) {
  results.push({ category, test, status, message });
  
  const icon = status === 'pass' ? '✅' : status === 'fail' ? '❌' : '⚠️ ';
  console.log(`  ${icon} ${test}: ${message}`);
}

/**
 * Validate Node.js and npm setup
 */
async function validateEnvironment(): Promise<void> {
  console.log('🔍 Validating Environment...');
  
  try {
    const nodeVersion = process.version;
    const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
    
    if (majorVersion >= 18) {
      addResult('Environment', 'Node.js Version', 'pass', `${nodeVersion} (required: >=18)`);
    } else {
      addResult('Environment', 'Node.js Version', 'fail', `${nodeVersion} (required: >=18)`);
    }
  } catch (error) {
    addResult('Environment', 'Node.js Version', 'fail', 'Unable to determine Node.js version');
  }
  
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    addResult('Environment', 'npm Version', 'pass', `${npmVersion}`);
  } catch (error) {
    addResult('Environment', 'npm Version', 'fail', 'npm not found');
  }
  
  // Check if running in CI
  const isCI = process.env.CI === 'true';
  addResult('Environment', 'Environment Type', isCI ? 'warn' : 'pass', 
    isCI ? 'CI Environment Detected' : 'Development Environment');
}

/**
 * Validate test configuration
 */
async function validateConfiguration(): Promise<void> {
  console.log('\n⚙️  Validating Configuration...');
  
  try {
    const config = getTestConfig();
    const configErrors = validateTestConfig(config);
    
    if (configErrors.length === 0) {
      addResult('Configuration', 'Test Config', 'pass', 'Configuration is valid');
    } else {
      configErrors.forEach(error => {
        addResult('Configuration', 'Test Config', 'fail', error);
      });
    }
    
    // Validate server configurations
    addResult('Configuration', 'Server Count', 'pass', 
      `${config.servers.length} servers configured`);
    
    // Check performance settings
    if (config.performance.concurrencyLimit > 0 && config.performance.defaultTimeout > 0) {
      addResult('Configuration', 'Performance Settings', 'pass', 
        `Concurrency: ${config.performance.concurrencyLimit}, Timeout: ${config.performance.defaultTimeout}ms`);
    } else {
      addResult('Configuration', 'Performance Settings', 'fail', 
        'Invalid performance configuration');
    }
    
  } catch (error) {
    addResult('Configuration', 'Test Config', 'fail', 
      `Configuration load failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate MCP server builds
 */
async function validateServerBuilds(): Promise<void> {
  console.log('\n🔧 Validating Server Builds...');
  
  const config = getTestConfig();
  const projectRoot = path.resolve(process.cwd(), '..', '..', 'packages');
  
  for (const serverConfig of config.servers) {
    const serverPath = path.resolve(projectRoot, serverConfig.executablePath);
    const serverDir = path.dirname(serverPath);
    
    try {
      // Check if executable exists
      await fs.access(serverPath);
      addResult('Server Builds', `${serverConfig.name} Executable`, 'pass', 'Build found');
      
      // Check if package.json exists
      const packageJsonPath = path.join(serverDir, '../package.json');
      try {
        await fs.access(packageJsonPath);
        const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf8'));
        addResult('Server Builds', `${serverConfig.name} Package`, 'pass', 
          `v${packageJson.version}`);
      } catch {
        addResult('Server Builds', `${serverConfig.name} Package`, 'warn', 
          'Package.json not found');
      }
      
    } catch (error) {
      addResult('Server Builds', `${serverConfig.name} Executable`, 'fail', 
        `Build not found at ${serverPath.replace(process.cwd(), '.')}`);
    }
  }
}

/**
 * Validate dependencies
 */
async function validateDependencies(): Promise<void> {
  console.log('\n📦 Validating Dependencies...');
  
  try {
    // Check if node_modules exists
    await fs.access('node_modules');
    addResult('Dependencies', 'Node Modules', 'pass', 'Dependencies installed');
    
    // Check package.json
    const packageJson = JSON.parse(await fs.readFile('package.json', 'utf8'));
    const depCount = Object.keys({
      ...packageJson.dependencies,
      ...packageJson.devDependencies
    }).length;
    
    addResult('Dependencies', 'Package Dependencies', 'pass', 
      `${depCount} dependencies declared`);
    
    // Check key dependencies
    const keyDeps = ['@modelcontextprotocol/sdk', 'jest', 'typescript'];
    for (const dep of keyDeps) {
      try {
        await fs.access(`node_modules/${dep}`);
        addResult('Dependencies', dep, 'pass', 'Installed');
      } catch {
        addResult('Dependencies', dep, 'fail', 'Missing');
      }
    }
    
  } catch (error) {
    addResult('Dependencies', 'Node Modules', 'fail', 
      'Dependencies not installed - run npm install');
  }
}

/**
 * Validate test assets
 */
async function validateTestAssets(): Promise<void> {
  console.log('\n🎨 Validating Test Assets...');
  
  const config = getTestConfig();
  const assetsDir = config.assets.baseDir;
  
  try {
    await fs.access(assetsDir);
    addResult('Test Assets', 'Assets Directory', 'pass', `Found at ${assetsDir}`);
    
    // Check subdirectories
    const subdirs = ['fonts', 'images', 'colors', 'svg'];
    for (const subdir of subdirs) {
      try {
        const subdirPath = path.join(assetsDir, subdir);
        await fs.access(subdirPath);
        
        const files = await fs.readdir(subdirPath);
        addResult('Test Assets', `${subdir} Directory`, 'pass', 
          `${files.length} files found`);
      } catch {
        addResult('Test Assets', `${subdir} Directory`, 'warn', 
          'Directory not found - will be created on first run');
      }
    }
    
  } catch (error) {
    addResult('Test Assets', 'Assets Directory', 'warn', 
      'Assets directory not found - run npm run setup');
  }
}

/**
 * Validate output directories
 */
async function validateOutputDirectories(): Promise<void> {
  console.log('\n📁 Validating Output Directories...');
  
  const config = getTestConfig();
  const outputDir = config.reporting.outputDir;
  
  try {
    await fs.access(outputDir);
    addResult('Output', 'Output Directory', 'pass', `Found at ${outputDir}`);
    
    // Check if writable
    const testFile = path.join(outputDir, '.write-test');
    try {
      await fs.writeFile(testFile, 'test');
      await fs.unlink(testFile);
      addResult('Output', 'Write Permissions', 'pass', 'Directory is writable');
    } catch {
      addResult('Output', 'Write Permissions', 'fail', 'Directory is not writable');
    }
    
  } catch (error) {
    addResult('Output', 'Output Directory', 'warn', 
      'Output directory not found - will be created on first run');
  }
}

/**
 * Validate Jest configuration
 */
async function validateJestConfig(): Promise<void> {
  console.log('\n🧪 Validating Jest Configuration...');
  
  try {
    await fs.access('jest.config.js');
    addResult('Jest Config', 'Config File', 'pass', 'jest.config.js found');
    
    // Try to run Jest --help to validate configuration
    try {
      execSync('npx jest --help', { stdio: 'pipe' });
      addResult('Jest Config', 'Jest Executable', 'pass', 'Jest can be executed');
    } catch {
      addResult('Jest Config', 'Jest Executable', 'fail', 'Jest cannot be executed');
    }
    
    // Check test setup files
    const setupFiles = [
      'tests/jest.setup.ts',
      'tests/jest.globalSetup.ts', 
      'tests/jest.globalTeardown.ts'
    ];
    
    for (const setupFile of setupFiles) {
      try {
        await fs.access(setupFile);
        addResult('Jest Config', path.basename(setupFile), 'pass', 'Setup file found');
      } catch {
        addResult('Jest Config', path.basename(setupFile), 'fail', 'Setup file missing');
      }
    }
    
  } catch (error) {
    addResult('Jest Config', 'Config File', 'fail', 'jest.config.js not found');
  }
}

/**
 * Validate TypeScript configuration
 */
async function validateTypeScript(): Promise<void> {
  console.log('\n📝 Validating TypeScript...');
  
  try {
    await fs.access('tsconfig.json');
    addResult('TypeScript', 'Config File', 'pass', 'tsconfig.json found');
    
    // Try to compile TypeScript
    try {
      execSync('npx tsc --noEmit', { stdio: 'pipe' });
      addResult('TypeScript', 'Compilation', 'pass', 'TypeScript compiles without errors');
    } catch (error) {
      addResult('TypeScript', 'Compilation', 'fail', 
        'TypeScript compilation errors - run npx tsc for details');
    }
    
  } catch (error) {
    addResult('TypeScript', 'Config File', 'fail', 'tsconfig.json not found');
  }
}

/**
 * Run a quick smoke test
 */
async function runSmokeTest(): Promise<void> {
  console.log('\n💨 Running Smoke Test...');
  
  try {
    // Try to import core modules
    const { MCPServerManager } = await import('../mcp/server-manager.js');
    const { MCPMultiClient } = await import('../mcp/client.js');
    const { WorkflowEngine } = await import('../utils/workflow-engine.js');
    
    addResult('Smoke Test', 'Module Imports', 'pass', 'Core modules can be imported');
    
    // Try to create instances (without starting servers)
    const config = getTestConfig();
    const manager = new MCPServerManager(config.servers);
    addResult('Smoke Test', 'Server Manager', 'pass', 'Can create server manager');
    
  } catch (error) {
    addResult('Smoke Test', 'Module Loading', 'fail', 
      `Module loading failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Generate validation report
 */
function generateReport(): void {
  console.log('\n📊 Validation Summary');
  console.log('='.repeat(50));
  
  const categories = [...new Set(results.map(r => r.category))];
  const summary: Record<string, { pass: number; fail: number; warn: number }> = {};
  
  categories.forEach(category => {
    const categoryResults = results.filter(r => r.category === category);
    summary[category] = {
      pass: categoryResults.filter(r => r.status === 'pass').length,
      fail: categoryResults.filter(r => r.status === 'fail').length,
      warn: categoryResults.filter(r => r.status === 'warn').length
    };
    
    const total = summary[category].pass + summary[category].fail + summary[category].warn;
    const passRate = ((summary[category].pass / total) * 100).toFixed(1);
    
    console.log(`${category}: ${summary[category].pass}✅ ${summary[category].fail}❌ ${summary[category].warn}⚠️  (${passRate}% pass)`);
  });
  
  const totalPass = results.filter(r => r.status === 'pass').length;
  const totalFail = results.filter(r => r.status === 'fail').length;
  const totalWarn = results.filter(r => r.status === 'warn').length;
  const total = results.length;
  
  console.log('='.repeat(50));
  console.log(`Total: ${totalPass}✅ ${totalFail}❌ ${totalWarn}⚠️  (${((totalPass / total) * 100).toFixed(1)}% pass)`);
  
  if (totalFail > 0) {
    console.log('\n❌ Critical Issues Found:');
    results
      .filter(r => r.status === 'fail')
      .forEach(r => console.log(`  • ${r.category} - ${r.test}: ${r.message}`));
    
    console.log('\n🔧 Recommended Actions:');
    console.log('  1. Run: npm install');
    console.log('  2. Build all MCP servers: cd <server-dir> && npm run build');  
    console.log('  3. Run setup: npm run setup');
    console.log('  4. Fix any remaining TypeScript errors');
  } else if (totalWarn > 0) {
    console.log('\n⚠️  Warnings (non-critical):');
    results
      .filter(r => r.status === 'warn')
      .forEach(r => console.log(`  • ${r.category} - ${r.test}: ${r.message}`));
  } else {
    console.log('\n🎉 All validations passed! The framework is ready to use.');
    console.log('\nNext steps:');
    console.log('  npm test                 - Run all tests');
    console.log('  npm run test:integration - Run integration tests only');
    console.log('  npm run test:workflows   - Run workflow tests only');
    console.log('  npm run test:performance - Run performance tests only');
  }
}

/**
 * Main validation function
 */
async function main(): Promise<void> {
  console.log('🔍 MCP Graphics Integration Testing Framework Validation');
  console.log('='.repeat(60));
  
  await validateEnvironment();
  await validateConfiguration();
  await validateServerBuilds();
  await validateDependencies();
  await validateTestAssets();
  await validateOutputDirectories();
  await validateJestConfig();
  await validateTypeScript();
  await runSmokeTest();
  
  generateReport();
  
  // Exit with error code if there are failures
  const hasFailures = results.some(r => r.status === 'fail');
  process.exit(hasFailures ? 1 : 0);
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('\n💥 Validation script failed:', error);
    process.exit(1);
  });
}

export { main as validateSetup };