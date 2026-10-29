import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { SVG, Svg, Element, List } from '@svgdotjs/svg.js';
import { 
  SVGTransformInputSchema, 
  SVGTransformInput, 
  SVGErrorCode,
  SVG_ID_PATTERN,
  SVG_LIMITS
} from '../types/svg.js';
import { SVGValidator } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

// Additional type definitions for transform operations
interface Transform {
  type: 'translate' | 'rotate' | 'scale' | 'skewX' | 'skewY' | 'matrix';
  values: number[];
  element?: string;
  origin?: { x: number; y: number };
}

/**
 * SVG Transform Tool - Applies transformations to SVG elements
 */
export const svgTransformTool: ExecutableTool = {
  name: 'svg.transform',
  description: 'Apply geometric transformations (translate, rotate, scale, skew) to SVG elements',
  inputSchema: {
    type: 'object',
    properties: {
      svg: {
        type: 'string',
        maxLength: SVG_LIMITS.MAX_SVG_LENGTH,
        description: 'SVG content to transform'
      },
      transforms: {
        type: 'array',
        maxItems: SVG_LIMITS.MAX_TRANSFORMS,
        items: {
          type: 'object',
          properties: {
            type: {
              enum: ['translate', 'rotate', 'scale', 'skewX', 'skewY', 'matrix'],
              description: 'Type of transformation to apply'
            },
            values: {
              type: 'array',
              items: { type: 'number' },
              description: 'Transformation parameters (varies by transform type)'
            },
            element: {
              type: 'string',
              maxLength: SVG_LIMITS.MAX_SHORT_STRING_LENGTH,
              description: 'CSS selector or element ID to target (optional, applies to all if not specified). ID selectors must match #[A-Za-z_][A-Za-z0-9_.:-]*'
            },
            origin: {
              type: 'object',
              properties: {
                x: { type: 'number' },
                y: { type: 'number' }
              },
              description: 'Transform origin point'
            }
          },
          required: ['type', 'values']
        },
        description: 'Array of transformations to apply'
      }
    },
    required: ['svg', 'transforms']
  },

  async invoke(args: unknown) {
    try {
      // Performance monitoring wrapper
      const { result } = await PerformanceMonitor.measureOperation('svg.transform', async () => {
        
        // Validate input
        const input = SVGValidator.validateInput(SVGTransformInputSchema, args) as SVGTransformInput;
        
        // Validate SVG format
        SVGValidator.validateSVGString(input.svg);
        
        // Apply transformations
        const transformedSVG = await applyTransformations(input.svg, input.transforms);
        
        // Validate output
        SVGValidator.validateSVGString(transformedSVG);
        
        // Calculate metrics
        const originalSize = Buffer.byteLength(input.svg, 'utf8');
        const transformedSize = Buffer.byteLength(transformedSVG, 'utf8');
        
        return {
          svg: transformedSVG,
          transformations: input.transforms.map((t, index) => ({
            index,
            type: t.type,
            values: t.values,
            element: t.element || 'all',
            applied: true
          })),
          metadata: {
            originalSize,
            transformedSize,
            transformCount: input.transforms.length,
            transformedAt: new Date().toISOString()
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
      console.error('[svg.transform] Error:', error);
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: true,
            code: SVGErrorCode.TRANSFORMATION_FAILED,
            message: error instanceof Error ? error.message : 'SVG transformation failed',
            tool: 'svg.transform',
            timestamp: new Date().toISOString()
          }, null, 2)
        }],
        isError: true
      };
    }
  }
};

/**
 * Applies transformations to SVG content
 */
async function applyTransformations(svgContent: string, transforms: Transform[]): Promise<string> {
  try {
            // Parse SVG using @svgdotjs/svg.js
    const draw = SVG(svgContent) as Svg;
    
    // Apply each transformation
    for (const transform of transforms) {
      await applyTransformation(draw, transform);
    }
    
    return draw.svg();
    
  } catch {
            // Fallback to string-based transformation if @svgdotjs/svg.js parsing failed, using string-based transformation');
    return applyTransformationsStringBased(svgContent, transforms);
  }
}

/**
 * Applies a single transformation using @svgdotjs/svg.js
 */
async function applyTransformation(draw: Svg, transform: Transform): Promise<void> {
  const { type, values, element, origin } = transform;
  
  // Validate transformation parameters
  validateTransformParameters(type, values);
  
  // Select elements to transform
  let elements: List<Element>;
  if (element) {
    // Try to select by ID or class
    elements = draw.find(element);
    if (elements.length === 0) {
      console.warn(`[svg.transform] No elements found for selector: ${element}`);
      return;
    }
  } else {
    // Apply to all transformable elements
    elements = draw.children() as List<Element>;
  }
  
  // Apply transformation to selected elements
  elements.each((el: Element) => {
    
    // Set transform origin if specified
    if (origin) {
      el.transform({ origin: [origin.x, origin.y] });
    }
    
    // Apply the specific transformation
    switch (type) {
      case 'translate':
        if (values.length >= 2) {
          el.translate(values[0], values[1]);
        } else if (values.length === 1) {
          el.translate(values[0], 0);
        }
        break;
        
      case 'rotate':
        if (values.length >= 1) {
          const angle = values[0];
          const centerX = values[1] || 0;
          const centerY = values[2] || 0;
          el.rotate(angle, centerX, centerY);
        }
        break;
        
      case 'scale':
        if (values.length >= 2) {
          el.scale(values[0], values[1]);
        } else if (values.length === 1) {
          el.scale(values[0]);
        }
        break;
        
      case 'skewX':
        if (values.length >= 1) {
          el.skew(values[0], 0);
        }
        break;
        
      case 'skewY':
        if (values.length >= 1) {
          el.skew(0, values[0]);
        }
        break;
        
      case 'matrix':
        if (values.length >= 6) {
          el.matrix(values[0], values[1], values[2], values[3], values[4], values[5]);
        }
        break;
        
      default:
        throw new Error(`Unsupported transformation type: ${type}`);
    }
  });
}

/**
 * String-based transformation fallback
 */
function applyTransformationsStringBased(svgContent: string, transforms: Transform[]): string {
  let result = svgContent;
  
  for (const transform of transforms) {
    result = applyTransformStringBased(result, transform);
  }
  
  return result;
}

/**
 * Applies transformation using string manipulation
 */
function applyTransformStringBased(svgContent: string, transform: Transform): string {
  const { type, values, element } = transform;
  
  // Build transform string
  const transformString = buildTransformString(type, values);
  
  if (element) {
    // Apply to specific element
    return applyTransformToElement(svgContent, element, transformString);
  } else {
    // Apply to root SVG element
    return applyTransformToRoot(svgContent, transformString);
  }
}

/**
 * Builds transform attribute string
 */
function buildTransformString(type: string, values: number[]): string {
  switch (type) {
    case 'translate':
      return values.length >= 2 
        ? `translate(${values[0]}, ${values[1]})`
        : `translate(${values[0]})`;
        
    case 'rotate':
      return values.length >= 3
        ? `rotate(${values[0]}, ${values[1]}, ${values[2]})`
        : `rotate(${values[0]})`;
        
    case 'scale':
      return values.length >= 2
        ? `scale(${values[0]}, ${values[1]})`
        : `scale(${values[0]})`;
        
    case 'skewX':
      return `skewX(${values[0]})`;
      
    case 'skewY':
      return `skewY(${values[0]})`;
      
    case 'matrix':
      return `matrix(${values.slice(0, 6).join(', ')})`;
      
    default:
      throw new Error(`Unsupported transformation type: ${type}`);
  }
}

/**
 * Applies transform to specific element by selector
 */
function applyTransformToElement(svgContent: string, selector: string, transformString: string): string {
  // Simple implementation for ID selector
  if (selector.startsWith('#')) {
    const id = selector.slice(1);
    // The schema already restricts ids to SVG_ID_PATTERN; re-check here so this
    // function never builds a pattern from unvalidated input
    if (!SVG_ID_PATTERN.test(id)) {
      throw new Error(`Invalid id selector: ${selector}`);
    }
    const idAttribute = new RegExp(`\\sid="${escapeRegExp(id)}"`, 'i');

    // Scan tag by tag: each character is examined once, so the cost stays
    // linear however the input is shaped
    let tagStart = svgContent.indexOf('<');
    while (tagStart !== -1) {
      const tagEnd = svgContent.indexOf('>', tagStart + 1);
      if (tagEnd === -1) break;

      const tag = svgContent.slice(tagStart, tagEnd + 1);
      if (idAttribute.test(tag)) {
        return svgContent.slice(0, tagStart) + addTransformToTag(tag, transformString) + svgContent.slice(tagEnd + 1);
      }
      tagStart = svgContent.indexOf('<', tagEnd + 1);
    }
    return svgContent;
  }
  
  // For other selectors, apply to all matching elements (simplified)
  return applyTransformToRoot(svgContent, transformString);
}

/**
 * Adds a transform to a single opening tag, appending to an existing transform
 * attribute or inserting one before the closing `>` or `/>`
 */
function addTransformToTag(tag: string, transformString: string): string {
  if (tag.includes('transform=')) {
    return tag.replace(/transform="([^"]*)"/, `transform="$1 ${transformString}"`);
  }
  const closing = tag.endsWith('/>') ? '/>' : '>';
  const body = tag.slice(0, tag.length - closing.length).replace(/\s+$/, '');
  return `${body} transform="${transformString}"${closing}`;
}

/**
 * Escapes regular expression metacharacters so a string matches literally
 */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Applies transform to root SVG element
 */
function applyTransformToRoot(svgContent: string, transformString: string): string {
  // Wrap the root's content in a transformed group. indexOf-based so the cost
  // is linear; the regex /(<svg[^>]*>)(.*?)(<\/svg>)/s backtracked
  // quadratically on inputs with many unterminated "<svg" openings.
  const openStart = svgContent.indexOf('<svg');
  if (openStart === -1) return svgContent;
  const openEnd = svgContent.indexOf('>', openStart);
  // The root's closing tag is the last one, which keeps nested <svg> elements intact
  const closeStart = svgContent.lastIndexOf('</svg>');
  if (openEnd === -1 || closeStart < openEnd) return svgContent;

  return svgContent.slice(0, openEnd + 1) +
    `<g transform="${transformString}">` +
    svgContent.slice(openEnd + 1, closeStart) +
    '</g>' +
    svgContent.slice(closeStart);
}

/**
 * Validates transformation parameters
 */
function validateTransformParameters(type: string, values: number[]): void {
  const requirements: Record<string, { min: number; max?: number; description: string }> = {
    translate: { min: 1, max: 2, description: 'translate requires 1-2 values (x, y)' },
    rotate: { min: 1, max: 3, description: 'rotate requires 1-3 values (angle, cx?, cy?)' },
    scale: { min: 1, max: 2, description: 'scale requires 1-2 values (sx, sy?)' },
    skewX: { min: 1, max: 1, description: 'skewX requires 1 value (angle)' },
    skewY: { min: 1, max: 1, description: 'skewY requires 1 value (angle)' },
    matrix: { min: 6, max: 6, description: 'matrix requires 6 values (a, b, c, d, e, f)' }
  };

  const requirement = requirements[type];
  if (!requirement) {
    throw new Error(`Unknown transformation type: ${type}`);
  }

  if (values.length < requirement.min) {
    throw new Error(`${requirement.description}. Got ${values.length} values.`);
  }

  if (requirement.max && values.length > requirement.max) {
    throw new Error(`${requirement.description}. Got ${values.length} values.`);
  }

  // Validate numeric values
  for (const value of values) {
    if (typeof value !== 'number' || isNaN(value)) {
      throw new Error(`All transformation values must be valid numbers. Got: ${value}`);
    }
  }
}

/**
 * Transformation utilities
 */
export class TransformationUtils {
  /**
   * Combines multiple transformations into a single matrix
   */
  static combineTransforms(transforms: Transform[]): number[] {
    let matrix = [1, 0, 0, 1, 0, 0]; // Identity matrix
    
    for (const transform of transforms) {
      const transformMatrix = this.getTransformMatrix(transform);
      matrix = this.multiplyMatrices(matrix, transformMatrix);
    }
    
    return matrix;
  }
  
  /**
   * Converts a transformation to a matrix
   */
  private static getTransformMatrix(transform: Transform): number[] {
    const { type, values } = transform;
    
    switch (type) {
      case 'translate': {
        return [1, 0, 0, 1, values[0] || 0, values[1] || 0];
      }
        
      case 'scale': {
        return [values[0] || 1, 0, 0, values[1] || values[0] || 1, 0, 0];
      }
        
      case 'rotate': {
        const angle = (values[0] || 0) * Math.PI / 180;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return [cos, sin, -sin, cos, 0, 0];
      }
        
      case 'matrix': {
        return values.slice(0, 6);
      }
        
      default: {
        return [1, 0, 0, 1, 0, 0]; // Identity matrix
      }
    }
  }
  
  /**
   * Multiplies two 2D transformation matrices
   */
  private static multiplyMatrices(m1: number[], m2: number[]): number[] {
    return [
      m1[0] * m2[0] + m1[2] * m2[1],
      m1[1] * m2[0] + m1[3] * m2[1],
      m1[0] * m2[2] + m1[2] * m2[3],
      m1[1] * m2[2] + m1[3] * m2[3],
      m1[0] * m2[4] + m1[2] * m2[5] + m1[4],
      m1[1] * m2[4] + m1[3] * m2[5] + m1[5]
    ];
  }
}