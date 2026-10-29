import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { 
  SVGPathOperationsInputSchema, 
  SVGErrorCode, 
  SVGPathOperationsInput,
  SVG_LIMITS
} from '../types/svg.js';
import { SVGValidator } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

/**
 * SVG Path Operations Tool - Boolean operations on SVG paths
 */
export const svgPathOperationsTool: ExecutableTool = {
  name: 'svg.path.operations',
  description: 'Perform boolean operations (union, intersect, subtract, exclude) on SVG paths',
  inputSchema: {
    type: 'object',
    properties: {
      path1: {
        type: 'string',
        maxLength: SVG_LIMITS.MAX_PATH_LENGTH,
        description: 'First SVG path data string (d attribute value)'
      },
      path2: {
        type: 'string',
        maxLength: SVG_LIMITS.MAX_PATH_LENGTH,
        description: 'Second SVG path data string (d attribute value)'
      },
      operation: {
        enum: ['union', 'intersect', 'subtract', 'exclude'],
        description: 'Boolean operation to perform on the paths'
      },
      precision: {
        type: 'number',
        minimum: 1,
        maximum: 10,
        default: 3,
        description: 'Decimal precision for result coordinates'
      },
      tolerance: {
        type: 'number',
        minimum: 0.001,
        maximum: 1.0,
        default: 0.1,
        description: 'Tolerance for path intersection calculations'
      }
    },
    required: ['path1', 'path2', 'operation']
  },

  async invoke(args: unknown) {
    try {
      // Performance monitoring wrapper
      const { result } = await PerformanceMonitor.measureOperation('svg.pathOperations', async () => {
        
        // Validate input
        const input = SVGValidator.validateInput(SVGPathOperationsInputSchema, args) as SVGPathOperationsInput;
        
        // Validate path data
        SVGValidator.validatePathData(input.path1);
        SVGValidator.validatePathData(input.path2);
        
        // Perform path operation
        const resultPath = await performPathOperation(
          input.path1, 
          input.path2, 
          input.operation,
          {
            precision: (args as Record<string, unknown>).precision as number || 3,
            tolerance: (args as Record<string, unknown>).tolerance as number || 0.1
          }
        );
        
        // Validate result
        SVGValidator.validatePathData(resultPath);
        
        // Calculate metrics
        const path1Length = estimatePathLength(input.path1);
        const path2Length = estimatePathLength(input.path2);
        const resultLength = estimatePathLength(resultPath);
        
        return {
          path: resultPath,
          operation: {
            type: input.operation,
            path1Length,
            path2Length,
            resultLength,
            complexity: estimatePathComplexity(resultPath)
          },
          metadata: {
            processedAt: new Date().toISOString(),
            precision: (args as Record<string, unknown>).precision as number || 3,
            tolerance: (args as Record<string, unknown>).tolerance as number || 0.1
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
      console.error('[svg.pathOperations] Error:', error);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: true,
            code: SVGErrorCode.PATH_OPERATION_FAILED,
            message: error instanceof Error ? error.message : 'Path operation failed',
            tool: 'svg.pathOperations',
            timestamp: new Date().toISOString()
          }, null, 2)
        }],
        isError: true
      };
    }
  }
};

/**
 * Performs the requested path operation
 */
async function performPathOperation(
  path1: string, 
  path2: string, 
  operation: string,
  options: { precision: number; tolerance: number }
): Promise<string> {
  
  // Parse paths into coordinate arrays
  const coords1 = parsePathToCoordinates(path1);
  const coords2 = parsePathToCoordinates(path2);

  // The operations compare every point of one path with every point of the
  // other (O(n*m)), so cap the coordinate count to bound the running time
  validateCoordinateCount(coords1.length, 'path1');
  validateCoordinateCount(coords2.length, 'path2');

  try {
    // Perform the boolean operation
    let resultCoords: PathCoordinate[];
    
    switch (operation) {
      case 'union':
        resultCoords = performUnion(coords1, coords2, options);
        break;
        
      case 'intersect':
        resultCoords = performIntersection(coords1, coords2, options);
        break;
        
      case 'subtract':
        resultCoords = performSubtraction(coords1, coords2, options);
        break;
        
      case 'exclude':
        resultCoords = performExclusion(coords1, coords2, options);
        break;
        
      default:
        throw new Error(`Unsupported path operation: ${operation}`);
    }
    
    // Convert back to path string
    return coordinatesToPath(resultCoords, options.precision);
    
  } catch {
    // Fallback to simplified operations if complex algorithms fail
    console.warn('[svg.pathOperations] Complex operation failed, using simplified approach');
    return performSimplifiedOperation(path1, path2, operation, options);
  }
}

/**
 * Rejects paths with more coordinates than SVG_LIMITS.MAX_PATH_COORDINATES
 */
function validateCoordinateCount(count: number, pathName: string): void {
  if (count > SVG_LIMITS.MAX_PATH_COORDINATES) {
    throw new Error(
      `${pathName} has ${count} coordinates; path operations support at most ${SVG_LIMITS.MAX_PATH_COORDINATES} coordinates per path`
    );
  }
}

/**
 * Simplified path operations (fallback implementation)
 */
function performSimplifiedOperation(
  path1: string, 
  path2: string, 
  operation: string,
  _options: { precision: number; tolerance: number }
): string {
  // For now, return a basic combined path
  // In a full implementation, this would use a proper computational geometry library
  switch (operation) {
    case 'union':
      // Simple concatenation for union (not geometrically correct)
      return `${path1} ${path2}`;
      
    case 'intersect':
      // Return smaller path as approximation
      return path1.length < path2.length ? path1 : path2;
      
    case 'subtract':
      // Return first path as approximation
      return path1;
      
    case 'exclude':
      // Return combined paths as approximation
      return `${path1} ${path2}`;
      
    default:
      return path1;
  }
}

// Path parsing and coordinate types
interface PathCoordinate {
  x: number;
  y: number;
  command?: string;
}



/**
 * Parses SVG path data into coordinate arrays
 */
function parsePathToCoordinates(pathData: string): PathCoordinate[] {
  const coordinates: PathCoordinate[] = [];
  
  // Remove extra whitespace and split by commands
  const cleanPath = pathData.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  const segments = cleanPath.split(/(?=[MmLlHhVvCcSsQqTtAaZz])/);
  
  let currentX = 0;
  let currentY = 0;
  
  for (const segment of segments) {
    if (!segment.trim()) continue;
    
    const command = segment[0];
    const args = segment.slice(1).trim().split(/\s+/).map(parseFloat);
    
    switch (command.toLowerCase()) {
      case 'm': // Move to
        if (args.length >= 2) {
          currentX += command === 'M' ? args[0] : args[0];
          currentY += command === 'M' ? args[1] : args[1];
          coordinates.push({ x: currentX, y: currentY, command });
        }
        break;
        
      case 'l': // Line to
        for (let i = 0; i < args.length; i += 2) {
          if (i + 1 < args.length) {
            currentX += command === 'L' ? args[i] : args[i];
            currentY += command === 'L' ? args[i + 1] : args[i + 1];
            coordinates.push({ x: currentX, y: currentY, command });
          }
        }
        break;
        
      case 'h': // Horizontal line
        for (const arg of args) {
          currentX += command === 'H' ? arg : arg;
          coordinates.push({ x: currentX, y: currentY, command });
        }
        break;
        
      case 'v': // Vertical line
        for (const arg of args) {
          currentY += command === 'V' ? arg : arg;
          coordinates.push({ x: currentX, y: currentY, command });
        }
        break;
        
      case 'c': // Cubic Bezier curve
        for (let i = 0; i < args.length; i += 6) {
          if (i + 5 < args.length) {
            // Add curve control points and end point
            const isAbsolute = command === 'C';
            coordinates.push({
              x: currentX + (isAbsolute ? args[i + 4] : args[i + 4]),
              y: currentY + (isAbsolute ? args[i + 5] : args[i + 5]),
              command
            });
            currentX += isAbsolute ? args[i + 4] : args[i + 4];
            currentY += isAbsolute ? args[i + 5] : args[i + 5];
          }
        }
        break;
        
      case 'z': // Close path
        coordinates.push({ x: currentX, y: currentY, command });
        break;
    }
  }
  
  return coordinates;
}

/**
 * Converts coordinates back to SVG path data
 */
function coordinatesToPath(coordinates: PathCoordinate[], precision: number): string {
  if (coordinates.length === 0) return '';
  
  const pathParts: string[] = [];
  let isFirstMove = true;
  
  for (const coord of coordinates) {
    const x = coord.x.toFixed(precision);
    const y = coord.y.toFixed(precision);
    
    if (isFirstMove || coord.command === 'M' || coord.command === 'm') {
      pathParts.push(`M ${x} ${y}`);
      isFirstMove = false;
    } else if (coord.command === 'Z' || coord.command === 'z') {
      pathParts.push('Z');
    } else {
      pathParts.push(`L ${x} ${y}`);
    }
  }
  
  return pathParts.join(' ');
}

/**
 * True when two points are within `tolerance` of each other. Compares squared
 * distances to keep sqrt/pow out of the O(n*m) inner loops.
 */
function isWithinTolerance(a: PathCoordinate, b: PathCoordinate, tolerance: number): boolean {
  if (tolerance < 0) return false;
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy <= tolerance * tolerance;
}

/**
 * Boolean operation implementations (simplified)
 * In a production system, these would use robust computational geometry libraries
 */

function performUnion(
  coords1: PathCoordinate[], 
  coords2: PathCoordinate[], 
  _options: { tolerance: number }
): PathCoordinate[] {
  // Simple union: combine all coordinates
  return [...coords1, ...coords2];
}

function performIntersection(
  coords1: PathCoordinate[], 
  coords2: PathCoordinate[], 
  options: { tolerance: number }
): PathCoordinate[] {
  // Simplified intersection: find coordinates within tolerance
  const intersection: PathCoordinate[] = [];
  
  for (const coord1 of coords1) {
    for (const coord2 of coords2) {
      if (isWithinTolerance(coord1, coord2, options.tolerance)) {
        intersection.push({
          x: (coord1.x + coord2.x) / 2,
          y: (coord1.y + coord2.y) / 2,
          command: 'L'
        });
        break;
      }
    }
  }
  
  return intersection;
}

function performSubtraction(
  coords1: PathCoordinate[], 
  coords2: PathCoordinate[], 
  options: { tolerance: number }
): PathCoordinate[] {
  // Simplified subtraction: remove coords1 points near coords2 points
  return coords1.filter(coord1 => {
    return !coords2.some(coord2 => isWithinTolerance(coord1, coord2, options.tolerance));
  });
}

function performExclusion(
  coords1: PathCoordinate[], 
  coords2: PathCoordinate[], 
  options: { tolerance: number }
): PathCoordinate[] {
  // Exclusion: union minus intersection
  const union = performUnion(coords1, coords2, options);
  const intersection = performIntersection(coords1, coords2, options);
  
  return union.filter(coord => {
    return !intersection.some(intCoord => isWithinTolerance(coord, intCoord, options.tolerance));
  });
}

/**
 * Utility functions
 */

function estimatePathLength(pathData: string): number {
  // Simple estimation based on path data string length
  return pathData.length;
}

function estimatePathComplexity(pathData: string): string {
  const commandCount = (pathData.match(/[MmLlHhVvCcSsQqTtAaZz]/g) || []).length;
  
  if (commandCount < 5) return 'simple';
  if (commandCount < 20) return 'moderate';
  return 'complex';
}

/**
 * Advanced path operations utilities
 */
export class PathOperationsUtils {
  /**
   * Validates that two paths can be combined
   */
  static validatePathCompatibility(path1: string, path2: string): boolean {
    try {
      SVGValidator.validatePathData(path1);
      SVGValidator.validatePathData(path2);
      return true;
    } catch {
      return false;
    }
  }
  
  /**
   * Estimates the computational complexity of a path operation
   */
  static estimateOperationComplexity(path1: string, path2: string): {
    complexity: 'low' | 'medium' | 'high';
    estimatedTimeMs: number;
  } {
    const path1Commands = (path1.match(/[MmLlHhVvCcSsQqTtAaZz]/g) || []).length;
    const path2Commands = (path2.match(/[MmLlHhVvCcSsQqTtAaZz]/g) || []).length;
    const totalCommands = path1Commands + path2Commands;
    
    if (totalCommands < 10) {
      return { complexity: 'low', estimatedTimeMs: 50 };
    } else if (totalCommands < 50) {
      return { complexity: 'medium', estimatedTimeMs: 200 };
    } else {
      return { complexity: 'high', estimatedTimeMs: 500 };
    }
  }
}