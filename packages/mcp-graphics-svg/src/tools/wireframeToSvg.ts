import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { SVG, registerWindow, type Container } from '@svgdotjs/svg.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

const WireframeToSvgSchema = z.object({
  wireframe_text: z.string().describe('ASCII wireframe text to convert'),
  width: z.number().default(800).describe('Output SVG width'),
  height: z.number().default(600).describe('Output SVG height'),
  style: z.enum(['minimal', 'detailed', 'interactive']).default('minimal').describe('Wireframe style'),
  colors: z.object({
    border: z.string().default('#333333'),
    background: z.string().default('#ffffff'),
    text: z.string().default('#000000'),
    accent: z.string().default('#0066cc')
  }).optional().describe('Color scheme for wireframe')
});

export const wireframeToSvgTool: ExecutableTool = {
  name: 'wireframe.to.svg',
  description: 'Convert ASCII wireframes from markdown to clean SVG graphics',
  inputSchema: {
    type: 'object',
    properties: {
      wireframe_text: {
        type: 'string',
        description: 'ASCII wireframe text to convert'
      },
      width: {
        type: 'number',
        default: 800,
        description: 'Output SVG width'
      },
      height: {
        type: 'number',
        default: 600,
        description: 'Output SVG height'
      },
      style: {
        type: 'string',
        enum: ['minimal', 'detailed', 'interactive'],
        default: 'minimal',
        description: 'Wireframe style'
      },
      colors: {
        type: 'object',
        properties: {
          border: { type: 'string', default: '#333333' },
          background: { type: 'string', default: '#ffffff' },
          text: { type: 'string', default: '#000000' },
          accent: { type: 'string', default: '#0066cc' }
        },
        description: 'Color scheme for wireframe'
      }
    },
    required: ['wireframe_text']
  },
  invoke: async (args: unknown) => {
    const validatedArgs = WireframeToSvgSchema.parse(args);
    const svg = await executeWireframeToSvg(validatedArgs);
    return {
      content: [
        {
          type: 'text',
          text: svg
        }
      ]
    };
  }
};

interface WireframeElement {
  type: 'box' | 'text' | 'button' | 'link' | 'icon';
  x: number;
  y: number;
  width: number;
  height: number;
  content: string;
  style?: string;
}

class WireframeParser {
  private lines: string[] = [];
  private elements: WireframeElement[] = [];
  private charWidth = 8;
  private charHeight = 16;

  parse(wireframeText: string): WireframeElement[] {
    this.lines = wireframeText.split('\n');
    this.elements = [];

    this.extractElements();
    return this.elements;
  }

  private extractElements(): void {
    // Find ASCII boxes (using ┌─────┐ pattern)
    this.findBoxes();
    
    // Find text content
    this.findTextContent();
    
    // Find buttons and links
    this.findInteractiveElements();
  }

  private findBoxes(): void {
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      
      // Look for box top-left corners (┌ or ┌─)
      let boxStart = line.indexOf('┌');
      while (boxStart !== -1) {
        const box = this.traceBox(i, boxStart);
        if (box) {
          this.elements.push(box);
        }
        boxStart = line.indexOf('┌', boxStart + 1);
      }
    }
  }

  private traceBox(startRow: number, startCol: number): WireframeElement | null {
    const startLine = this.lines[startRow];
    
    // Find the end of the top border
    let endCol = startCol + 1;
    while (endCol < startLine.length && (startLine[endCol] === '─' || startLine[endCol] === '┬')) {
      endCol++;
    }
    
    if (endCol >= startLine.length || startLine[endCol] !== '┐') {
      return null;
    }

    // Find the bottom of the box
    let endRow = startRow + 1;
    while (endRow < this.lines.length) {
      const line = this.lines[endRow];
      if (line[startCol] === '└' && line[endCol] === '┘') {
        break;
      }
      if (line[startCol] !== '│' || line[endCol] !== '│') {
        return null;
      }
      endRow++;
    }

    if (endRow >= this.lines.length) {
      return null;
    }

    return {
      type: 'box',
      x: startCol * this.charWidth,
      y: startRow * this.charHeight,
      width: (endCol - startCol + 1) * this.charWidth,
      height: (endRow - startRow + 1) * this.charHeight,
      content: ''
    };
  }

  private findTextContent(): void {
    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];
      
      // Look for text content (non-box characters)
      let textStart = -1;
      for (let j = 0; j < line.length; j++) {
        const char = line[j];
        const isBoxChar = '┌┐└┘│─┬┴├┤┼'.includes(char);
        
        if (!isBoxChar && char !== ' ' && textStart === -1) {
          textStart = j;
        } else if ((isBoxChar || char === ' ' || j === line.length - 1) && textStart !== -1) {
          const content = line.substring(textStart, j + (j === line.length - 1 ? 1 : 0)).trim();
          if (content.length > 0) {
            this.elements.push({
              type: 'text',
              x: textStart * this.charWidth,
              y: i * this.charHeight,
              width: content.length * this.charWidth,
              height: this.charHeight,
              content
            });
          }
          textStart = -1;
        }
      }
    }
  }

  private findInteractiveElements(): void {
    // Look for button patterns [TEXT] and link patterns
    for (const element of this.elements) {
      if (element.type === 'text') {
        if (element.content.match(/^\[.*\]$/)) {
          element.type = 'button';
          element.content = element.content.slice(1, -1);
        } else if (element.content.includes('→') || element.content.toLowerCase().includes('learn more')) {
          element.type = 'link';
        }
      }
    }
  }
}

/**
 * Adds a single-line text element whose top-left corner sits at (x, y).
 *
 * svg.js's `text()` and `move()` on text measure the element with getBBox(),
 * which does not exist in server-side DOMs such as jsdom, so this tool would
 * throw for any wireframe containing text. `plain()` plus explicit x/y
 * attributes builds the same markup without layout measurement.
 */
function addText(
  parent: Container,
  content: string,
  x: number,
  y: number,
  options: { fill: string; weight?: string }
): void {
  parent.plain(content)
    .attr({ x, y, 'dominant-baseline': 'hanging' })
    .font({ family: 'Arial, sans-serif', size: 14, ...(options.weight ? { weight: options.weight } : {}) })
    .fill(options.fill);
}

export async function executeWireframeToSvg(args: z.infer<typeof WireframeToSvgSchema>): Promise<string> {
  // Use JSDOM for SVG creation
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="drawing"></div></body></html>');
  const window = dom.window as any;
  const document = window.document;
  registerWindow(window, document);

  const colors = args.colors || {
    border: '#333333',
    background: '#ffffff',
    text: '#000000',
    accent: '#0066cc'
  };

  // Create SVG canvas
  const draw = SVG().size(args.width, args.height);
  
  // Add background
  draw.rect(args.width, args.height).fill(colors.background);

  // Parse wireframe
  const parser = new WireframeParser();
  const elements = parser.parse(args.wireframe_text);

  // Render elements
  for (const element of elements) {
    switch (element.type) {
      case 'box':
        draw.rect(element.width, element.height)
          .move(element.x, element.y)
          .fill('none')
          .stroke({ color: colors.border, width: 1 });
        break;

      case 'text':
        addText(draw, element.content, element.x, element.y, { fill: colors.text });
        break;

      case 'button':
        const button = draw.group();
        button.rect(element.width + 20, element.height + 10)
          .move(element.x - 10, element.y - 5)
          .fill(colors.accent)
          .stroke({ color: colors.border, width: 1 })
          .radius(4);
        addText(button, element.content, element.x, element.y, { fill: '#ffffff', weight: 'bold' });
        break;

      case 'link':
        addText(draw, element.content, element.x, element.y, { fill: colors.accent });
        break;
    }
  }

  return draw.svg();
}