import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

const SvgbobToSvgSchema = z.object({
  ascii_art: z.string().describe('ASCII art to convert to SVG'),
  scale: z.number().default(1).describe('Scale factor for the output'),
  stroke_width: z.number().default(2).describe('Stroke width for lines'),
  background: z.string().default('transparent').describe('Background color'),
  stroke_color: z.string().default('#000000').describe('Stroke color'),
  font_family: z.string().default('monospace').describe('Font family for text'),
  font_size: z.number().default(14).describe('Font size for text'),
  fill_color: z.string().default('none').describe('Fill color for shapes')
});

export const svgbobToSvgTool: ExecutableTool = {
  name: 'svgbob.to.svg',
  description: 'Convert ASCII art diagrams to SVG using svgbob-style rendering',
  inputSchema: {
    type: 'object',
    properties: {
      ascii_art: {
        type: 'string',
        description: 'ASCII art to convert to SVG'
      },
      scale: {
        type: 'number',
        default: 1,
        description: 'Scale factor for the output'
      },
      stroke_width: {
        type: 'number',
        default: 2,
        description: 'Stroke width for lines'
      },
      background: {
        type: 'string',
        default: 'transparent',
        description: 'Background color'
      },
      stroke_color: {
        type: 'string',
        default: '#000000',
        description: 'Stroke color'
      },
      font_family: {
        type: 'string',
        default: 'monospace',
        description: 'Font family for text'
      },
      font_size: {
        type: 'number',
        default: 14,
        description: 'Font size for text'
      },
      fill_color: {
        type: 'string',
        default: 'none',
        description: 'Fill color for shapes'
      }
    },
    required: ['ascii_art']
  },
  invoke: async (args: unknown) => {
    const validatedArgs = SvgbobToSvgSchema.parse(args);
    const svg = await executeSvgbobToSvg(validatedArgs);
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

// Since svgbob_wasm may have loading issues, let's implement a custom ASCII-to-SVG converter
// that handles the specific patterns used in wireframes
class ASCIIToSVGConverter {
  private grid: string[][] = [];
  private svgElements: string[] = [];
  private cellWidth = 12;
  private cellHeight = 20;
  private options: z.infer<typeof SvgbobToSvgSchema>;

  constructor(options: z.infer<typeof SvgbobToSvgSchema>) {
    this.options = options;
    this.cellWidth *= options.scale;
    this.cellHeight *= options.scale;
  }

  convert(asciiArt: string): string {
    const lines = asciiArt.split('\n');
    this.grid = lines.map(line => line.split(''));
    
    const width = Math.max(...lines.map(line => line.length)) * this.cellWidth;
    const height = lines.length * this.cellHeight;

    this.svgElements = [];
    
    // Add background if not transparent
    if (this.options.background !== 'transparent') {
      this.svgElements.push(
        `<rect width="${width}" height="${height}" fill="${this.options.background}"/>`
      );
    }

    this.processGrid();

    return this.generateSVG(width, height);
  }

  private processGrid(): void {
    for (let row = 0; row < this.grid.length; row++) {
      for (let col = 0; col < this.grid[row].length; col++) {
        const char = this.grid[row][col];
        this.processCharacter(char, row, col);
      }
    }
  }

  private processCharacter(char: string, row: number, col: number): void {
    const x = col * this.cellWidth;
    const y = row * this.cellHeight;

    switch (char) {
      case '┌':
        this.addCorner(x, y, 'top-left');
        break;
      case '┐':
        this.addCorner(x, y, 'top-right');
        break;
      case '└':
        this.addCorner(x, y, 'bottom-left');
        break;
      case '┘':
        this.addCorner(x, y, 'bottom-right');
        break;
      case '─':
        this.addHorizontalLine(x, y);
        break;
      case '│':
        this.addVerticalLine(x, y);
        break;
      case '┬':
        this.addJunction(x, y, 'top');
        break;
      case '┴':
        this.addJunction(x, y, 'bottom');
        break;
      case '├':
        this.addJunction(x, y, 'left');
        break;
      case '┤':
        this.addJunction(x, y, 'right');
        break;
      case '┼':
        this.addJunction(x, y, 'cross');
        break;
      case '+':
        this.addPlus(x, y);
        break;
      case '|':
        this.addVerticalLine(x, y);
        break;
      case '-':
        this.addHorizontalLine(x, y);
        break;
      case '/':
        this.addDiagonalLine(x, y, 'forward');
        break;
      case '\\':
        this.addDiagonalLine(x, y, 'backward');
        break;
      case '*':
        this.addCircle(x, y);
        break;
      case 'o':
        this.addCircle(x, y, false);
        break;
      default:
        if (char !== ' ') {
          this.addText(char, x, y);
        }
        break;
    }
  }

  private addCorner(x: number, y: number, type: string): void {
    const hw = this.cellWidth / 2;
    const hh = this.cellHeight / 2;
    const cx = x + hw;
    const cy = y + hh;

    let path = '';
    switch (type) {
      case 'top-left':
        path = `M ${cx} ${cy + hh} L ${cx} ${cy} L ${cx + hw} ${cy}`;
        break;
      case 'top-right':
        path = `M ${cx - hw} ${cy} L ${cx} ${cy} L ${cx} ${cy + hh}`;
        break;
      case 'bottom-left':
        path = `M ${cx} ${cy - hh} L ${cx} ${cy} L ${cx + hw} ${cy}`;
        break;
      case 'bottom-right':
        path = `M ${cx - hw} ${cy} L ${cx} ${cy} L ${cx} ${cy - hh}`;
        break;
    }

    this.svgElements.push(
      `<path d="${path}" stroke="${this.options.stroke_color}" stroke-width="${this.options.stroke_width}" fill="none"/>`
    );
  }

  private addHorizontalLine(x: number, y: number): void {
    const cy = y + this.cellHeight / 2;
    this.svgElements.push(
      `<line x1="${x}" y1="${cy}" x2="${x + this.cellWidth}" y2="${cy}" stroke="${this.options.stroke_color}" stroke-width="${this.options.stroke_width}"/>`
    );
  }

  private addVerticalLine(x: number, y: number): void {
    const cx = x + this.cellWidth / 2;
    this.svgElements.push(
      `<line x1="${cx}" y1="${y}" x2="${cx}" y2="${y + this.cellHeight}" stroke="${this.options.stroke_color}" stroke-width="${this.options.stroke_width}"/>`
    );
  }

  private addJunction(x: number, y: number, type: string): void {
    const hw = this.cellWidth / 2;
    const hh = this.cellHeight / 2;
    const cx = x + hw;
    const cy = y + hh;

    let lines: string[] = [];
    switch (type) {
      case 'top':
        lines = [
          `<line x1="${cx - hw}" y1="${cy}" x2="${cx + hw}" y2="${cy}"/>`,
          `<line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy + hh}"/>`
        ];
        break;
      case 'bottom':
        lines = [
          `<line x1="${cx - hw}" y1="${cy}" x2="${cx + hw}" y2="${cy}"/>`,
          `<line x1="${cx}" y1="${cy - hh}" x2="${cx}" y2="${cy}"/>`
        ];
        break;
      case 'left':
        lines = [
          `<line x1="${cx}" y1="${cy - hh}" x2="${cx}" y2="${cy + hh}"/>`,
          `<line x1="${cx}" y1="${cy}" x2="${cx + hw}" y2="${cy}"/>`
        ];
        break;
      case 'right':
        lines = [
          `<line x1="${cx}" y1="${cy - hh}" x2="${cx}" y2="${cy + hh}"/>`,
          `<line x1="${cx - hw}" y1="${cy}" x2="${cx}" y2="${cy}"/>`
        ];
        break;
      case 'cross':
        lines = [
          `<line x1="${cx - hw}" y1="${cy}" x2="${cx + hw}" y2="${cy}"/>`,
          `<line x1="${cx}" y1="${cy - hh}" x2="${cx}" y2="${cy + hh}"/>`
        ];
        break;
    }

    lines.forEach(line => {
      this.svgElements.push(
        line.replace('<line', `<line stroke="${this.options.stroke_color}" stroke-width="${this.options.stroke_width}"`)
      );
    });
  }

  private addPlus(x: number, y: number): void {
    this.addJunction(x, y, 'cross');
  }

  private addDiagonalLine(x: number, y: number, direction: string): void {
    const x1 = direction === 'forward' ? x : x + this.cellWidth;
    const y1 = direction === 'forward' ? y + this.cellHeight : y;
    const x2 = direction === 'forward' ? x + this.cellWidth : x;
    const y2 = direction === 'forward' ? y : y + this.cellHeight;

    this.svgElements.push(
      `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${this.options.stroke_color}" stroke-width="${this.options.stroke_width}"/>`
    );
  }

  private addCircle(x: number, y: number, filled: boolean = true): void {
    const cx = x + this.cellWidth / 2;
    const cy = y + this.cellHeight / 2;
    const r = Math.min(this.cellWidth, this.cellHeight) / 4;

    this.svgElements.push(
      `<circle cx="${cx}" cy="${cy}" r="${r}" stroke="${this.options.stroke_color}" stroke-width="${this.options.stroke_width}" fill="${filled ? this.options.stroke_color : 'none'}"/>`
    );
  }

  private addText(char: string, x: number, y: number): void {
    const cx = x + this.cellWidth / 2;
    const cy = y + this.cellHeight / 2 + this.options.font_size / 3;

    this.svgElements.push(
      `<text x="${cx}" y="${cy}" font-family="${this.options.font_family}" font-size="${this.options.font_size * this.options.scale}" text-anchor="middle" fill="${this.options.stroke_color}">${char}</text>`
    );
  }

  private generateSVG(width: number, height: number): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  ${this.svgElements.join('\n  ')}
</svg>`;
  }
}

export async function executeSvgbobToSvg(args: z.infer<typeof SvgbobToSvgSchema>): Promise<string> {
  // Use custom converter (svgbob_wasm not available)
  const converter = new ASCIIToSVGConverter(args);
  return converter.convert(args.ascii_art);
}