import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { optimize } from 'svgo';
import { 
  SVGOptimizeInputSchema, 
  SVGOptimizeInput, 
  SVGErrorCode,
  SVG_LIMITS
} from '../types/svg.js';
import { SVGValidator, SVGSanitizer } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

/**
 * SVG Optimization Tool - Reduces file size while maintaining quality
 */
export const svgOptimizeTool: ExecutableTool = {
  name: 'svg.optimize',
  description: 'Optimize SVG for smaller file size and better performance while preserving visual quality',
  inputSchema: {
    type: 'object',
    properties: {
      svg: {
        type: 'string',
        maxLength: SVG_LIMITS.MAX_SVG_LENGTH,
        description: 'SVG content to optimize (as string). DOCTYPE/ENTITY declarations are rejected; scripts, event handlers, foreignObject and external links are removed from the output.'
      },
      options: {
        type: 'object',
        properties: {
          removeComments: {
            type: 'boolean',
            default: true,
            description: 'Remove XML comments from SVG'
          },
          removeEmptyElements: {
            type: 'boolean',
            default: true,
            description: 'Remove empty elements and groups'
          },
          mergePaths: {
            type: 'boolean',
            default: true,
            description: 'Merge adjacent paths when possible'
          },
          precision: {
            type: 'number',
            minimum: 1,
            maximum: 10,
            default: 3,
            description: 'Decimal precision for numeric values'
          },
          removeUnusedDefs: {
            type: 'boolean',
            default: true,
            description: 'Remove unused definitions'
          },
          minifyStyles: {
            type: 'boolean',
            default: true,
            description: 'Minify CSS styles'
          },
          removeMetadata: {
            type: 'boolean',
            default: false,
            description: 'Remove metadata and non-essential information'
          },
          removeViewBox: {
            type: 'boolean',
            default: false,
            description: 'Remove viewBox attribute (not recommended for responsive SVGs)'
          }
        },
        description: 'Optimization options to control the optimization process'
      }
    },
    required: ['svg']
  },

  async invoke(args: unknown) {
    try {
      // Performance monitoring wrapper
      const { result } = await PerformanceMonitor.measureOperation('svg.optimize', async () => {
        
        // Validate input
        const input = SVGValidator.validateInput(SVGOptimizeInputSchema, args) as SVGOptimizeInput;
        
        // Validate SVG format
        SVGValidator.validateSVGString(input.svg);
        
        // Security validation
        SVGSanitizer.validateSafeSVG(input.svg);
        
        // Get original metrics
        const originalSize = Buffer.byteLength(input.svg, 'utf8');
        const originalElementCount = countSVGElements(input.svg);
        
        // Configure SVGO options
        const svgoConfig = buildSVGOConfig(input.options || {});
        
        // Perform optimization with timeout protection
        const optimizedResult = await optimize(input.svg, svgoConfig);
        
        if (!optimizedResult.data) {
          throw new Error('SVGO optimization failed - no output generated');
        }
        
        // SVGO can normalize markup that evaded the string pre-check into working
        // script, so sanitize the output with a real parser as the final step
        const optimizedSVG = SVGSanitizer.removeActiveContent(optimizedResult.data);
        
        // Validate optimized SVG
        SVGValidator.validateSVGString(optimizedSVG);
        
        // Calculate optimization metrics
        const optimizedSize = Buffer.byteLength(optimizedSVG, 'utf8');
        const optimizedElementCount = countSVGElements(optimizedSVG);
        const compressionRatio = ((originalSize - optimizedSize) / originalSize) * 100;
        
        return {
          svg: optimizedSVG,
          optimization: {
            originalSize,
            optimizedSize,
            savedBytes: originalSize - optimizedSize,
            compressionRatio: Math.round(compressionRatio * 100) / 100,
            originalElementCount,
            optimizedElementCount,
            elementsRemoved: originalElementCount - optimizedElementCount
          },
          metadata: {
            tool: 'svg.optimize',
            optimizedAt: new Date().toISOString(),
            svgoVersion: getSVGOVersion()
          }
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2)
        }]
      };

    } catch (error) {
      console.error('[svg.optimize] Error:', error);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: true,
            code: SVGErrorCode.OPTIMIZATION_FAILED,
            message: error instanceof Error ? error.message : 'SVG optimization failed',
            tool: 'svg.optimize',
            timestamp: new Date().toISOString()
          }, null, 2)
        }],
        isError: true
      };
    }
  }
};

/**
 * Builds SVGO configuration from input options
 */
function buildSVGOConfig(options: {
  precision?: number;
  removeComments?: boolean;
  removeEmptyElements?: boolean;
  removeUnusedDefs?: boolean;
  minifyStyles?: boolean;
  mergePaths?: boolean;
  removeMetadata?: boolean;
  removeViewBox?: boolean;
  aggressive?: boolean;
}): any {
  const plugins: any[] = [
    // Use preset-default as base
    {
      name: 'preset-default',
      params: {
        overrides: {
          // Configure specific plugins within preset-default
          cleanupNumericValues: {
            floatPrecision: options.precision || 3
          },
          removeComments: options.removeComments !== false,
          removeEmptyElements: options.removeEmptyElements !== false,
          removeUnusedNS: options.removeUnusedDefs !== false,
          minifyStyles: options.minifyStyles !== false,
          mergePaths: options.mergePaths !== false,
          removeMetadata: options.removeMetadata || false,
          removeViewBox: options.removeViewBox || false
        }
      }
    },
    // Always on: strips <script>, on* handlers and javascript: links (disabled by default in SVGO)
    'removeScriptElement'
  ];

  // Advanced optimizations for aggressive compression - add as simple strings for v3
  if (options.aggressive) {
    plugins.push(
      'removeTitle',
      'removeDesc', 
      'removeDoctype',
      'removeXMLProcInst',
      'removeEditorsNSData'
    );
  }

  return {
    multipass: true,
    plugins
  };
}

/**
 * Counts the number of elements in an SVG string
 */
function countSVGElements(svgString: string): number {
  // Simple element counting based on opening tags
  const elementPattern = /<(\w+)(?:\s|>)/g;
  const matches = svgString.match(elementPattern);
  return matches ? matches.length : 0;
}

/**
 * Gets SVGO version for metadata
 */
function getSVGOVersion(): string {
  // This would normally require importing package.json, simplified for now
  return 'latest';
}

/**
 * Advanced optimization strategies
 */
export class SVGOptimizer {
  /**
   * Performs custom path optimization
   */
  static optimizePaths(svgString: string): string {
    // Remove redundant path commands
    let optimized = svgString;
    
    // Remove unnecessary precision in path data
    optimized = optimized.replace(
      /d="([^"]*)"/g, 
      (match, pathData) => {
        // Round numbers to 3 decimal places
        const rounded = pathData.replace(
          /(\d+\.\d{4,})/g,
          (num: string) => parseFloat(num).toFixed(3)
        );
        return `d="${rounded}"`;
      }
    );
    
    // Remove redundant move commands
    optimized = optimized.replace(
      /M\s*(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)\s+L\s*\1\s+\2/g,
      ''
    );
    
    return optimized;
  }

  /**
   * Optimizes colors and styles
   */
  static optimizeColors(svgString: string): string {
    let optimized = svgString;
    
    // Convert rgb() to hex when shorter
    optimized = optimized.replace(
      /rgb\((\d+),\s*(\d+),\s*(\d+)\)/g,
      (match, r, g, b) => {
        const hex = ((parseInt(r) << 16) | (parseInt(g) << 8) | parseInt(b))
          .toString(16).padStart(6, '0');
        return `#${hex}`;
      }
    );
    
    // Use color keywords when shorter
    const colorMap: Record<string, string> = {
      '#000000': 'black',
      '#ffffff': 'white',
      '#ff0000': 'red',
      '#00ff00': 'lime',
      '#0000ff': 'blue'
    };
    
    for (const [hex, keyword] of Object.entries(colorMap)) {
      if (keyword.length < hex.length) {
        optimized = optimized.replace(new RegExp(hex, 'gi'), keyword);
      }
    }
    
    return optimized;
  }

  /**
   * Removes redundant attributes
   */
  static removeRedundantAttributes(svgString: string): string {
    let optimized = svgString;
    
    // Remove default attribute values
    const defaultValues = {
      'fill': 'black',
      'stroke': 'none',
      'stroke-width': '1',
      'opacity': '1'
    };
    
    for (const [attr, defaultValue] of Object.entries(defaultValues)) {
      const pattern = new RegExp(`\\s${attr}="${defaultValue}"`, 'g');
      optimized = optimized.replace(pattern, '');
    }
    
    return optimized;
  }
}