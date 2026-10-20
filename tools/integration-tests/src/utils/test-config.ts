/**
 * Test Configuration Management
 * Centralized configuration for integration tests
 */

import path from 'path';
import { TestConfig, ServerConfig, MCPServer } from '../types/index.js';

/**
 * Default test configuration
 */
export const DEFAULT_TEST_CONFIG: TestConfig = {
  servers: [
    {
      name: MCPServer.COLOR,
      executablePath: 'mcp-graphics-color/dist/index.js',
      timeout: 15000,
      retries: 3,
      healthCheck: {
        enabled: true,
        timeout: 5000
      }
    },
    {
      name: MCPServer.SVG,
      executablePath: 'mcp-graphics-svg/dist/index.js',
      timeout: 15000,
      retries: 3,
      healthCheck: {
        enabled: true,
        timeout: 5000
      }
    },
    {
      name: MCPServer.IMAGE,
      executablePath: 'mcp-graphics-image/dist/index.js',
      timeout: 20000, // Image processing may take longer
      retries: 3,
      healthCheck: {
        enabled: true,
        timeout: 5000
      }
    },
    {
      name: MCPServer.TYPE,
      executablePath: 'mcp-graphics-type/dist/index.js',
      timeout: 15000,
      retries: 3,
      healthCheck: {
        enabled: true,
        timeout: 5000
      }
    }
  ],
  assets: {
    baseDir: path.resolve(process.cwd(), 'assets'),
    fonts: [
      'Inter-Regular.ttf',
      'Roboto-Regular.ttf',
      'OpenSans-Regular.ttf'
    ],
    images: [
      'test-image-100x100.png',
      'test-image-400x300.jpg',
      'test-svg-icon.svg'
    ],
    colorPalettes: [
      'brand-colors.json',
      'material-colors.json',
      'accessibility-test-colors.json'
    ]
  },
  performance: {
    defaultTimeout: 30000,
    memoryLimitMB: 512,
    concurrencyLimit: 20
  },
  reporting: {
    outputDir: path.resolve(process.cwd(), 'test-output'),
    generateHtml: true,
    generateJson: true,
    includeLogs: true
  }
};

/**
 * Environment-specific configurations
 */
export const ENV_CONFIGS = {
  development: {
    ...DEFAULT_TEST_CONFIG,
    performance: {
      ...DEFAULT_TEST_CONFIG.performance,
      concurrencyLimit: 10
    },
    reporting: {
      ...DEFAULT_TEST_CONFIG.reporting,
      includeLogs: true
    }
  },
  ci: {
    ...DEFAULT_TEST_CONFIG,
    servers: DEFAULT_TEST_CONFIG.servers.map(server => ({
      ...server,
      timeout: server.timeout * 2, // Double timeouts in CI
      retries: 5
    })),
    performance: {
      ...DEFAULT_TEST_CONFIG.performance,
      defaultTimeout: 60000,
      memoryLimitMB: 1024,
      concurrencyLimit: 15
    },
    reporting: {
      ...DEFAULT_TEST_CONFIG.reporting,
      includeLogs: false // Reduce CI artifact size
    }
  },
  production: {
    ...DEFAULT_TEST_CONFIG,
    performance: {
      ...DEFAULT_TEST_CONFIG.performance,
      concurrencyLimit: 50,
      memoryLimitMB: 2048
    },
    reporting: {
      ...DEFAULT_TEST_CONFIG.reporting,
      includeLogs: false
    }
  }
};

/**
 * Get configuration for current environment
 */
export function getTestConfig(): TestConfig {
  const env = process.env.NODE_ENV || 'development';
  const isCI = process.env.CI === 'true';
  
  if (isCI) {
    return ENV_CONFIGS.ci;
  }
  
  return ENV_CONFIGS[env as keyof typeof ENV_CONFIGS] || DEFAULT_TEST_CONFIG;
}

/**
 * Performance test thresholds by test category
 */
export const PERFORMANCE_THRESHOLDS = {
  // Individual tool execution (milliseconds)
  tool_execution: {
    'color.convert': { max: 50, target: 20 },
    'color.generatePalette': { max: 200, target: 100 },
    'color.contrast': { max: 100, target: 50 },
    'color.validateAccessibility': { max: 150, target: 75 },
    'svg.create': { max: 300, target: 150 },
    'svg.optimize': { max: 500, target: 250 },
    'svg.transform': { max: 200, target: 100 },
    'image.resize': { max: 1000, target: 500 },
    'image.crop': { max: 800, target: 400 },
    'image.convert': { max: 1500, target: 750 },
    'type.loadFont': { max: 2000, target: 1000 },
    'type.validateText': { max: 300, target: 150 }
  },
  
  // Workflow execution (milliseconds)
  workflows: {
    'svg-typography-colors': { max: 10000, target: 5000 },
    'image-processing-colors': { max: 15000, target: 7500 },
    'design-system': { max: 20000, target: 10000 },
    'simple-integration': { max: 5000, target: 2500 }
  },
  
  // Concurrent operations
  concurrency: {
    '10-operations': { max: 3000, target: 1500 },
    '25-operations': { max: 7000, target: 3500 },
    '50-operations': { max: 15000, target: 7500 }
  },
  
  // Memory usage (MB)
  memory: {
    'single-server': { max: 200, target: 100 },
    'all-servers': { max: 800, target: 400 },
    'under-load': { max: 1200, target: 600 }
  },
  
  // Throughput (operations per second)
  throughput: {
    'light-operations': { min: 10, target: 20 },
    'medium-operations': { min: 5, target: 10 },
    'heavy-operations': { min: 2, target: 5 }
  }
};

/**
 * Test data generators for consistent test inputs
 */
export const TEST_DATA = {
  colors: {
    primary: ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff', '#00ffff'],
    grayscale: ['#000000', '#404040', '#808080', '#c0c0c0', '#ffffff'],
    invalid: ['not-a-color', '#gggggg', 'rgb(300, 300, 300)', null, undefined, ''],
    accessible: [
      { background: '#ffffff', text: '#000000', ratio: 21 },
      { background: '#000000', text: '#ffffff', ratio: 21 },
      { background: '#3498db', text: '#ffffff', ratio: 4.77 },
      { background: '#e74c3c', text: '#ffffff', ratio: 4.02 }
    ]
  },
  
  dimensions: {
    small: { width: 50, height: 50 },
    medium: { width: 200, height: 150 },
    large: { width: 800, height: 600 },
    square: { width: 300, height: 300 },
    portrait: { width: 400, height: 600 },
    landscape: { width: 800, height: 450 },
    invalid: [
      { width: -1, height: 100 },
      { width: 0, height: 0 },
      { width: 10000, height: 10000 },
      { width: 'invalid', height: 100 }
    ]
  },
  
  fonts: {
    web_safe: ['Arial', 'Times', 'Helvetica', 'Georgia', 'Verdana'],
    google_fonts: [
      'Inter',
      'Roboto', 
      'Open Sans',
      'Lato',
      'Montserrat'
    ],
    system: ['system-ui', 'sans-serif', 'serif', 'monospace'],
    invalid: ['NonExistentFont', '', null, undefined]
  },
  
  text: {
    simple: ['Hello', 'Test', 'Sample Text'],
    multilingual: [
      'Hello World',
      'Hola Mundo',
      'Bonjour le Monde',
      'こんにちは世界',
      '你好世界',
      'مرحبا بالعالم'
    ],
    special_chars: [
      'Special!@#$%^&*()',
      'Emoji 😀🎨🚀',
      'Math ∑∞∆∇',
      'Quotes "Hello" \'World\'',
      'Unicode ñáéíóú'
    ],
    edge_cases: ['', ' ', '\n', '\t', '   ']
  },
  
  svg_elements: {
    basic: [
      { type: 'rect', x: 0, y: 0, width: 100, height: 50, fill: '#ff0000' },
      { type: 'circle', cx: 50, cy: 50, r: 25, fill: '#00ff00' },
      { type: 'text', x: 10, y: 30, content: 'Hello', fill: '#0000ff' }
    ],
    complex: [
      {
        type: 'path',
        d: 'M 10 10 L 90 90 L 10 90 Z',
        fill: '#purple',
        stroke: '#black',
        strokeWidth: 2
      },
      {
        type: 'group',
        elements: [
          { type: 'circle', cx: 25, cy: 25, r: 20, fill: '#red' },
          { type: 'circle', cx: 75, cy: 25, r: 20, fill: '#blue' }
        ]
      }
    ]
  }
};

/**
 * Helper function to generate test scenarios
 */
export function generateTestScenarios<T>(
  baseData: T[],
  variations: Partial<T>[],
  count: number = 10
): T[] {
  const scenarios: T[] = [];
  
  for (let i = 0; i < count; i++) {
    const base = baseData[i % baseData.length];
    const variation = variations[i % variations.length];
    scenarios.push({ ...base, ...variation });
  }
  
  return scenarios;
}

/**
 * Validation helpers for test configuration
 */
export function validateTestConfig(config: TestConfig): string[] {
  const errors: string[] = [];
  
  // Validate servers
  if (!config.servers || config.servers.length === 0) {
    errors.push('At least one server must be configured');
  }
  
  config.servers?.forEach((server, index) => {
    if (!server.name) {
      errors.push(`Server ${index}: name is required`);
    }
    if (!server.executablePath) {
      errors.push(`Server ${index}: executablePath is required`);
    }
    if (server.timeout <= 0) {
      errors.push(`Server ${index}: timeout must be positive`);
    }
  });
  
  // Validate performance settings
  if (config.performance.defaultTimeout <= 0) {
    errors.push('Performance defaultTimeout must be positive');
  }
  if (config.performance.memoryLimitMB <= 0) {
    errors.push('Performance memoryLimitMB must be positive');
  }
  if (config.performance.concurrencyLimit <= 0) {
    errors.push('Performance concurrencyLimit must be positive');
  }
  
  return errors;
}

/**
 * Get performance threshold for a specific test
 */
export function getPerformanceThreshold(
  category: keyof typeof PERFORMANCE_THRESHOLDS,
  testName: string
): { max: number; target: number } | null {
  const categoryThresholds = PERFORMANCE_THRESHOLDS[category];
  return (categoryThresholds as any)?.[testName] || null;
}

/**
 * Environment detection utilities
 */
export const ENV_UTILS = {
  isCI: () => process.env.CI === 'true',
  isDevelopment: () => process.env.NODE_ENV === 'development',
  isProduction: () => process.env.NODE_ENV === 'production',
  isTesting: () => process.env.NODE_ENV === 'test',
  
  getNodeVersion: () => process.version,
  getPlatform: () => process.platform,
  getArchitecture: () => process.arch,
  
  hasDebugFlag: () => process.env.DEBUG === 'true' || process.argv.includes('--debug'),
  getVerboseLevel: () => {
    if (process.argv.includes('--verbose')) return 2;
    if (process.env.VERBOSE === 'true') return 1;
    return 0;
  }
};