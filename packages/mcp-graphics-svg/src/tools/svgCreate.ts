import { Tool } from '@modelcontextprotocol/sdk/types.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}
import { 
  SVGCreateInputSchema, 
  SVGCreateInput, 
  SVGElement,
  SVGErrorCode,
  SVG_LIMITS
} from '../types/svg.js';
import { SVGValidator, PerformanceValidator, escapeXML } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';

/**
 * SVG Creation Tool - Generates SVG documents from structured input
 */
export const svgCreateTool: ExecutableTool = {
  name: 'svg.create',
  description: 'Generate a new SVG document with specified elements and properties',
  inputSchema: {
    type: 'object',
    properties: {
      width: {
        type: 'number',
        minimum: 1,
        maximum: 10000,
        description: 'SVG width in pixels'
      },
      height: {
        type: 'number', 
        minimum: 1,
        maximum: 10000,
        description: 'SVG height in pixels'
      },
      viewBox: {
        type: 'object',
        properties: {
          x: { type: 'number', default: 0 },
          y: { type: 'number', default: 0 },
          width: { type: 'number', minimum: 1 },
          height: { type: 'number', minimum: 1 }
        },
        required: ['width', 'height'],
        description: 'SVG viewBox for scalability'
      },
      elements: {
        type: 'array',
        maxItems: SVG_LIMITS.MAX_ELEMENTS,
        items: {
          oneOf: [
            {
              type: 'object',
              properties: {
                type: { const: 'rect' },
                x: { type: 'number', default: 0 },
                y: { type: 'number', default: 0 },
                width: { type: 'number', minimum: 0 },
                height: { type: 'number', minimum: 0 },
                rx: { type: 'number', minimum: 0 },
                ry: { type: 'number', minimum: 0 },
                fill: { type: 'string' },
                stroke: { type: 'string' },
                strokeWidth: { type: 'number' }
              },
              required: ['type', 'width', 'height']
            },
            {
              type: 'object',
              properties: {
                type: { const: 'circle' },
                cx: { type: 'number', default: 0 },
                cy: { type: 'number', default: 0 },
                r: { type: 'number', minimum: 0 },
                fill: { type: 'string' },
                stroke: { type: 'string' },
                strokeWidth: { type: 'number' }
              },
              required: ['type', 'r']
            },
            {
              type: 'object',
              properties: {
                type: { const: 'path' },
                d: { type: 'string', maxLength: SVG_LIMITS.MAX_PATH_LENGTH },
                fill: { type: 'string' },
                stroke: { type: 'string' },
                strokeWidth: { type: 'number' }
              },
              required: ['type', 'd']
            },
            {
              type: 'object',
              properties: {
                type: { const: 'text' },
                x: { type: 'number', default: 0 },
                y: { type: 'number', default: 0 },
                content: { type: 'string', maxLength: SVG_LIMITS.MAX_TEXT_LENGTH },
                fontSize: { type: 'number', minimum: 1 },
                fontFamily: { type: 'string' },
                fill: { type: 'string' }
              },
              required: ['type', 'content']
            }
          ]
        },
        description: 'Array of SVG elements to include in the document'
      },
      metadata: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          description: { type: 'string' },
          keywords: { 
            type: 'array',
            items: { type: 'string' }
          }
        },
        description: 'Optional metadata for the SVG document'
      }
    },
    required: ['width', 'height', 'elements']
  },

  async invoke(args: unknown) {
    try {
      // Performance monitoring wrapper
      const { result } = await PerformanceMonitor.measureOperation('svg.create', async () => {
        
        // Validate input
        const input = SVGValidator.validateInput(SVGCreateInputSchema, args) as SVGCreateInput;
        
        // Validate dimensions for performance
        SVGValidator.validateDimensions(input.width, input.height);
        
        // Validate nesting depth and complexity, counting group children
        validateGroupDepth(input.elements, 1);
        PerformanceValidator.validateComplexity(countElements(input.elements), 'creation');

        // Create SVG document
        const svgString = createSVGDocument(input);
        
        // Validate output
        SVGValidator.validateSVGString(svgString);
        
        return {
          svg: svgString,
          metadata: {
            width: input.width,
            height: input.height,
            elementCount: input.elements.length,
            fileSize: Buffer.byteLength(svgString, 'utf8'),
            generatedAt: new Date().toISOString()
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
      console.error('[svg.create] Error:', error);
      
      // Try to parse structured error first
      let errorResponse;
      if (error instanceof Error) {
        try {
          const parsedError = JSON.parse(error.message);
          errorResponse = {
            error: true,
            code: parsedError.code || SVGErrorCode.PROCESSING_FAILED,
            message: parsedError.message || error.message,
            details: parsedError.details,
            suggestions: parsedError.suggestions,
            tool: 'svg.create',
            timestamp: new Date().toISOString()
          };
        } catch {
          // If parsing fails, use generic error
          errorResponse = {
            error: true,
            code: SVGErrorCode.PROCESSING_FAILED,
            message: error.message,
            tool: 'svg.create',
            timestamp: new Date().toISOString()
          };
        }
      } else {
        errorResponse = {
          error: true,
          code: SVGErrorCode.PROCESSING_FAILED,
          message: 'SVG creation failed',
          tool: 'svg.create',
          timestamp: new Date().toISOString()
        };
      }
      
      return {
        content: [{
          type: 'text',
          text: JSON.stringify(errorResponse, null, 2)
        }],
        isError: true
      };
    }
  }
};

/**
 * Creates an SVG document from validated input
 */
function createSVGDocument(input: SVGCreateInput): string {
  let svgContent = '';
  
  // Build SVG opening tag with dimensions
  const svgAttribs = [`width="${num(input.width)}"`, `height="${num(input.height)}"`];
  
  // Add viewBox if provided
  if (input.viewBox) {
    const { x, y, width, height } = input.viewBox;
    svgAttribs.push(`viewBox="${num(x)} ${num(y)} ${num(width)} ${num(height)}"`);
  }
  
  svgContent += `<svg xmlns="http://www.w3.org/2000/svg" ${svgAttribs.join(' ')}>\n`;
  
  // Add metadata
  if (input.metadata) {
    if (input.metadata.title) {
      svgContent += `  <title>${escapeXML(input.metadata.title)}</title>\n`;
    }
    if (input.metadata.description) {
      svgContent += `  <desc>${escapeXML(input.metadata.description)}</desc>\n`;
    }
  }
  
  // Add elements
  for (const element of input.elements) {
    svgContent += addElementToSVG(element, 2);
  }
  
  svgContent += '</svg>';
  
  return svgContent;
}

/**
 * Adds a single element to the SVG document as string
 */
function addElementToSVG(element: SVGElement, indent: number = 0): string {
  const indentStr = ' '.repeat(indent);
  const commonAttribs: string[] = [];
  
  // Add common attributes
  if (element.id) commonAttribs.push(`id="${escapeXML(element.id)}"`);
  if (element.className) commonAttribs.push(`class="${escapeXML(element.className)}"`);
  if (element.fill !== undefined) {
    SVGValidator.validateColor(element.fill);
    commonAttribs.push(`fill="${escapeXML(element.fill)}"`);
  }
  if (element.stroke !== undefined) {
    SVGValidator.validateColor(element.stroke);
    commonAttribs.push(`stroke="${escapeXML(element.stroke)}"`);
  }
  if (element.strokeWidth !== undefined) {
    commonAttribs.push(`stroke-width="${num(element.strokeWidth)}"`);
  }
  if (element.opacity !== undefined) {
    commonAttribs.push(`opacity="${num(element.opacity)}"`);
  }
  
  const commonAttribsStr = commonAttribs.length > 0 ? ' ' + commonAttribs.join(' ') : '';
  
  switch (element.type) {
    case 'rect': {
      const attribs = [
        `x="${num(element.x || 0)}"`,
        `y="${num(element.y || 0)}"`,
        `width="${num(element.width)}"`,
        `height="${num(element.height)}"`
      ];
      if (element.rx !== undefined) attribs.push(`rx="${num(element.rx)}"`);
      if (element.ry !== undefined) attribs.push(`ry="${num(element.ry)}"`);
      
      return `${indentStr}<rect ${attribs.join(' ')}${commonAttribsStr} />\n`;
    }
      
    case 'circle': {
      const attribs = [
        `cx="${num(element.cx || 0)}"`,
        `cy="${num(element.cy || 0)}"`,
        `r="${num(element.r)}"`
      ];
      
      return `${indentStr}<circle ${attribs.join(' ')}${commonAttribsStr} />\n`;
    }
      
    case 'ellipse': {
      const attribs = [
        `cx="${num(element.cx || 0)}"`,
        `cy="${num(element.cy || 0)}"`,
        `rx="${num(element.rx)}"`,
        `ry="${num(element.ry)}"`
      ];
      
      return `${indentStr}<ellipse ${attribs.join(' ')}${commonAttribsStr} />\n`;
    }
      
    case 'line': {
      const attribs = [
        `x1="${num(element.x1 || 0)}"`,
        `y1="${num(element.y1 || 0)}"`,
        `x2="${num(element.x2 || 0)}"`,
        `y2="${num(element.y2 || 0)}"`
      ];
      
      return `${indentStr}<line ${attribs.join(' ')}${commonAttribsStr} />\n`;
    }
      
    case 'polygon': {
      const points = element.points.map((p: { x: number; y: number }) => `${num(p.x)},${num(p.y)}`).join(' ');
      return `${indentStr}<polygon points="${points}"${commonAttribsStr} />\n`;
    }
      
    case 'polyline': {
      const points = element.points.map((p: { x: number; y: number }) => `${num(p.x)},${num(p.y)}`).join(' ');
      return `${indentStr}<polyline points="${points}"${commonAttribsStr} />\n`;
    }
      
    case 'path': {
      SVGValidator.validatePathData(element.d);
      return `${indentStr}<path d="${escapeXML(element.d)}"${commonAttribsStr} />\n`;
    }
      
    case 'text': {
      const attribs = [
        `x="${num(element.x || 0)}"`,
        `y="${num(element.y || 0)}"`
      ];
      if (element.fontSize) attribs.push(`font-size="${num(element.fontSize)}"`);
      if (element.fontFamily) attribs.push(`font-family="${escapeXML(element.fontFamily)}"`);
      if (element.textAnchor) attribs.push(`text-anchor="${escapeXML(element.textAnchor)}"`);
      
      return `${indentStr}<text ${attribs.join(' ')}${commonAttribsStr}>${escapeXML(element.content)}</text>\n`;
    }
      
    case 'group': {
      let groupContent = `${indentStr}<g${commonAttribsStr}>\n`;
      for (const childElement of element.elements) {
        groupContent += addElementToSVG(childElement, indent + 2);
      }
      groupContent += `${indentStr}</g>\n`;
      return groupContent;
    }
      
    default: {
      const elementType = (element as SVGElement).type;
      throw new Error(`Unsupported element type: ${elementType}`);
    }
  }
}

/**
 * Coerces a validated numeric value for interpolation into markup. Values reach
 * this point through the schema, but coercing here means a value of any other
 * type can never be written into an attribute verbatim.
 */
function num(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid numeric attribute value: ${String(value).slice(0, 50)}`);
  }
  return String(n);
}

/**
 * Counts elements recursively, including the children of groups
 */
function countElements(elements: SVGElement[]): number {
  let count = 0;
  for (const element of elements) {
    count += 1;
    if (element.type === 'group') {
      count += countElements(element.elements);
    }
  }
  return count;
}

/**
 * Rejects groups nested deeper than SVG_LIMITS.MAX_GROUP_DEPTH
 */
function validateGroupDepth(elements: SVGElement[], depth: number): void {
  for (const element of elements) {
    if (element.type !== 'group') continue;
    if (depth > SVG_LIMITS.MAX_GROUP_DEPTH) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_INPUT,
        message: `Groups are nested deeper than the maximum of ${SVG_LIMITS.MAX_GROUP_DEPTH} levels`,
        suggestions: ['Flatten nested groups']
      }));
    }
    validateGroupDepth(element.elements, depth + 1);
  }
}
