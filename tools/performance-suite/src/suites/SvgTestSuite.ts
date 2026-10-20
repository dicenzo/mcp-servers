/**
 * SVG Server Test Suite
 * Comprehensive test cases for mcp-graphics-svg server
 */

import { TestCase } from '../types/performance.js';

export class SvgTestSuite {
  // Sample SVG content for testing
  private readonly sampleSvgs = {
    simple: '<svg width="100" height="100"><circle cx="50" cy="50" r="40" fill="red"/></svg>',
    complex: `<svg width="500" height="400" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ff6b6b"/>
          <stop offset="100%" stop-color="#4ecdc4"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#gradient)"/>
      <path d="M50,50 L150,50 L100,150 Z" fill="blue" opacity="0.7"/>
      <circle cx="200" cy="200" r="60" fill="yellow"/>
      <text x="250" y="100" font-family="Arial" font-size="20">Test Text</text>
    </svg>`,
    withPaths: `<svg width="300" height="300" xmlns="http://www.w3.org/2000/svg">
      <path d="M10,90 Q90,90 90,45 Q90,10 50,10 Q10,10 10,40 Q10,70 45,70 Q70,70 75,50" 
            fill="none" stroke="black" stroke-width="5"/>
      <path d="M100,100 C100,100 150,50 200,100 C250,150 300,100 300,100" 
            fill="none" stroke="red" stroke-width="3"/>
      <polygon points="200,10 250,198 160,78 240,78 150,198" stroke="purple" 
               fill="lime" stroke-width="5" fill-rule="evenodd"/>
    </svg>`
  };

  private testCases: TestCase[] = [
    // SVG creation tests
    {
      name: 'create-simple-shapes',
      toolName: 'svg.create',
      input: {
        width: 200,
        height: 200,
        elements: [
          { type: 'rect', x: 10, y: 10, width: 80, height: 60, fill: '#ff6b6b' },
          { type: 'circle', cx: 150, cy: 50, r: 30, fill: '#4ecdc4' },
          { type: 'line', x1: 10, y1: 100, x2: 190, y2: 100, stroke: '#333', strokeWidth: 2 }
        ]
      }
    },
    {
      name: 'create-complex-graphic',
      toolName: 'svg.create',
      input: {
        width: 500,
        height: 400,
        elements: [
          { type: 'rect', x: 0, y: 0, width: 500, height: 400, fill: 'url(#grad1)' },
          { type: 'path', d: 'M100,100 Q200,50 300,100 T500,100', fill: 'none', stroke: '#333' },
          { type: 'text', x: 250, y: 200, text: 'Performance Test', fontSize: 24, textAnchor: 'middle' }
        ],
        defs: [
          {
            type: 'linearGradient',
            id: 'grad1',
            stops: [
              { offset: '0%', stopColor: '#ff6b6b' },
              { offset: '100%', stopColor: '#4ecdc4' }
            ]
          }
        ]
      }
    },
    {
      name: 'create-chart-visualization',
      toolName: 'svg.create',
      input: {
        width: 400,
        height: 300,
        elements: Array.from({ length: 20 }, (_, i) => ({
          type: 'rect',
          x: i * 20,
          y: 250 - (Math.random() * 200),
          width: 18,
          height: Math.random() * 200,
          fill: `hsl(${i * 18}, 70%, 50%)`
        }))
      }
    },

    // SVG optimization tests
    {
      name: 'optimize-simple-svg',
      toolName: 'svg.optimize',
      input: {
        svg: this.sampleSvgs.simple,
        options: {
          removeUnusedDefs: true,
          convertToRelative: true,
          removeDimensions: false
        }
      }
    },
    {
      name: 'optimize-complex-svg',
      toolName: 'svg.optimize',
      input: {
        svg: this.sampleSvgs.complex,
        options: {
          removeUnusedDefs: true,
          minifyColors: true,
          convertToRelative: true,
          precision: 2
        }
      }
    },
    {
      name: 'optimize-aggressive',
      toolName: 'svg.optimize',
      input: {
        svg: this.sampleSvgs.withPaths,
        options: {
          removeUnusedDefs: true,
          minifyColors: true,
          convertToRelative: true,
          removeDimensions: true,
          precision: 1,
          removeComments: true,
          removeMetadata: true
        }
      }
    },

    // SVG path operations tests
    {
      name: 'path-boolean-union',
      toolName: 'svg.pathOperations',
      input: {
        operation: 'union',
        paths: [
          'M50,50 L150,50 L100,150 Z',
          'M75,25 L175,25 L125,125 Z'
        ]
      }
    },
    {
      name: 'path-boolean-intersection',
      toolName: 'svg.pathOperations',
      input: {
        operation: 'intersection',
        paths: [
          'M0,0 L100,0 L100,100 L0,100 Z',
          'M50,50 L150,50 L150,150 L50,150 Z'
        ]
      }
    },
    {
      name: 'path-simplification',
      toolName: 'svg.pathOperations',
      input: {
        operation: 'simplify',
        path: 'M10,90 Q90,90 90,45 Q90,10 50,10 Q10,10 10,40 Q10,70 45,70 Q70,70 75,50',
        tolerance: 2
      }
    },
    {
      name: 'path-complex-boolean',
      toolName: 'svg.pathOperations',
      input: {
        operation: 'difference',
        paths: [
          'M0,0 L200,0 L200,200 L0,200 Z',
          'M50,50 L150,50 L150,150 L50,150 Z',
          'M25,25 L75,25 L75,75 L25,75 Z'
        ]
      }
    },
    {
      name: 'path-stroke-to-fill',
      toolName: 'svg.pathOperations',
      input: {
        operation: 'strokeToFill',
        path: 'M10,10 L100,10 L100,100 L10,100 Z',
        strokeWidth: 5,
        strokeLinecap: 'round',
        strokeLinejoin: 'round'
      }
    },

    // SVG transformation tests
    {
      name: 'transform-translate-simple',
      toolName: 'svg.transform',
      input: {
        svg: this.sampleSvgs.simple,
        transformations: [
          { type: 'translate', x: 50, y: 50 }
        ]
      }
    },
    {
      name: 'transform-scale-and-rotate',
      toolName: 'svg.transform',
      input: {
        svg: this.sampleSvgs.complex,
        transformations: [
          { type: 'scale', sx: 0.8, sy: 0.8 },
          { type: 'rotate', angle: 15, cx: 250, cy: 200 }
        ]
      }
    },
    {
      name: 'transform-complex-chain',
      toolName: 'svg.transform',
      input: {
        svg: this.sampleSvgs.withPaths,
        transformations: [
          { type: 'translate', x: 100, y: 50 },
          { type: 'scale', sx: 1.2, sy: 1.2 },
          { type: 'rotate', angle: -10 },
          { type: 'skewX', angle: 5 }
        ]
      }
    },
    {
      name: 'transform-perspective',
      toolName: 'svg.transform',
      input: {
        svg: this.sampleSvgs.complex,
        transformations: [
          { 
            type: 'matrix',
            a: 1, b: 0.2, c: -0.1, d: 0.9, e: 20, f: 30
          }
        ]
      }
    },
    {
      name: 'transform-viewport-fitting',
      toolName: 'svg.transform',
      input: {
        svg: this.sampleSvgs.complex,
        targetViewBox: { x: 0, y: 0, width: 200, height: 200 },
        preserveAspectRatio: 'xMidYMid meet'
      }
    }
  ];

  getTestCases(): TestCase[] {
    return this.testCases;
  }

  /**
   * Get tool function for testing
   */
  getToolFunction(toolName: string): (input: any) => Promise<any> {
    switch (toolName) {
      case 'svg.create':
        return this.mockSvgCreate.bind(this);
      case 'svg.optimize':
        return this.mockSvgOptimize.bind(this);
      case 'svg.pathOperations':
        return this.mockSvgPathOperations.bind(this);
      case 'svg.transform':
        return this.mockSvgTransform.bind(this);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // Mock implementations with realistic processing times

  private async mockSvgCreate(input: any): Promise<any> {
    const { elements } = input;
    const processingTime = this.calculateSvgProcessingTime('create', elements?.length || 1);
    await this.simulateProcessing(processingTime);
    
    return {
      success: true,
      result: {
        svg: `<svg width="${input.width}" height="${input.height}" xmlns="http://www.w3.org/2000/svg"><!-- Generated SVG --></svg>`,
        elementCount: elements?.length || 0,
        dimensions: { width: input.width, height: input.height }
      },
      metadata: {
        processingTime,
        operation: 'create',
        processedAt: new Date().toISOString()
      }
    };
  }

  private async mockSvgOptimize(input: any): Promise<any> {
    const originalSize = input.svg.length;
    const processingTime = this.calculateSvgProcessingTime('optimize', originalSize / 100);
    await this.simulateProcessing(processingTime);
    
    const optimizedSize = Math.floor(originalSize * (0.6 + Math.random() * 0.3)); // 60-90% of original
    
    return {
      success: true,
      result: {
        originalSvg: input.svg,
        optimizedSvg: input.svg.replace(/\s+/g, ' '), // Simplified for mock
        originalSize,
        optimizedSize,
        compressionRatio: optimizedSize / originalSize,
        optimizations: Object.keys(input.options || {})
      },
      metadata: {
        processingTime,
        operation: 'optimize',
        processedAt: new Date().toISOString()
      }
    };
  }

  private async mockSvgPathOperations(input: any): Promise<any> {
    const { operation, paths, path } = input;
    const pathCount = paths?.length || 1;
    const complexity = (paths?.join('').length || path?.length || 50) / 50;
    const processingTime = this.calculateSvgProcessingTime('pathOperations', complexity * pathCount);
    await this.simulateProcessing(processingTime);
    
    return {
      success: true,
      result: {
        operation,
        originalPaths: paths || [path],
        resultPath: 'M10,10 L100,100 L10,100 Z', // Mock result
        pathCount: pathCount,
        complexity: Math.round(complexity * 10) / 10
      },
      metadata: {
        processingTime,
        operation: 'pathOperations',
        processedAt: new Date().toISOString()
      }
    };
  }

  private async mockSvgTransform(input: any): Promise<any> {
    const { transformations } = input;
    const transformCount = transformations?.length || 1;
    const svgSize = input.svg.length;
    const processingTime = this.calculateSvgProcessingTime('transform', (svgSize / 100) * transformCount);
    await this.simulateProcessing(processingTime);
    
    return {
      success: true,
      result: {
        originalSvg: input.svg,
        transformedSvg: input.svg + '<!-- transformed -->', // Mock transformation
        transformations: transformations || [],
        transformCount
      },
      metadata: {
        processingTime,
        operation: 'transform',
        processedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Calculate realistic processing time for SVG operations
   */
  private calculateSvgProcessingTime(operation: string, complexityFactor: number = 1): number {
    let baseTime = 30;
    let complexityMultiplier = 1;
    
    switch (operation) {
      case 'create':
        baseTime = 20;
        complexityMultiplier = Math.max(1, complexityFactor * 0.5);
        break;
      case 'optimize':
        baseTime = 80;
        complexityMultiplier = Math.max(1, complexityFactor * 0.3);
        break;
      case 'pathOperations':
        baseTime = 150;
        complexityMultiplier = Math.max(1, complexityFactor * 0.8);
        break;
      case 'transform':
        baseTime = 40;
        complexityMultiplier = Math.max(1, complexityFactor * 0.4);
        break;
    }
    
    // Add realistic variation
    const variation = (Math.random() - 0.5) * 0.3; // ±15% variation
    return Math.max(5, baseTime * complexityMultiplier * (1 + variation));
  }

  /**
   * Simulate processing time
   */
  private async simulateProcessing(timeMs: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, timeMs));
  }
}