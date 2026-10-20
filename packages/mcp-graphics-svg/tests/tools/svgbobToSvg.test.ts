import { svgbobToSvgTool, executeSvgbobToSvg } from '../../src/tools/svgbobToSvg';

describe('svgbobToSvg Tool', () => {
  describe('svgbobToSvgTool', () => {
    it('should have correct tool metadata', () => {
      expect(svgbobToSvgTool.name).toBe('svgbob.to.svg');
      expect(svgbobToSvgTool.description).toContain('Convert ASCII art diagrams to SVG');
      expect(svgbobToSvgTool.inputSchema).toBeDefined();
    });

    it('should have valid input schema', () => {
      const schema = svgbobToSvgTool.inputSchema;
      expect(schema.type).toBe('object');
      expect(schema.properties).toHaveProperty('ascii_art');
      expect(schema.properties).toHaveProperty('scale');
      expect(schema.properties).toHaveProperty('stroke_width');
      expect(schema.properties).toHaveProperty('background');
      expect(schema.properties).toHaveProperty('stroke_color');
      expect(schema.properties).toHaveProperty('font_family');
      expect(schema.properties).toHaveProperty('font_size');
      expect(schema.properties).toHaveProperty('fill_color');
      expect(schema.required).toContain('ascii_art');
    });

    it('should invoke with simple ASCII art', async () => {
      const args = {
        ascii_art: '┌─────┐\n│     │\n└─────┘'
      };

      const result = await svgbobToSvgTool.invoke(args);
      expect(result).toBeDefined();
      expect(result.content).toBeDefined();
      expect(Array.isArray(result.content)).toBe(true);
      expect(result.content.length).toBeGreaterThan(0);
      expect(result.content[0].type).toBe('text');
      expect(result.content[0].text).toContain('<svg');
    });

    it('should handle custom scale', async () => {
      const args = {
        ascii_art: '┌─┐\n└─┘',
        scale: 2
      };

      const result = await svgbobToSvgTool.invoke(args);
      expect(result).toBeDefined();
      expect(result.content[0].text).toContain('<svg');
    });

    it('should handle custom stroke width', async () => {
      const args = {
        ascii_art: '─────',
        stroke_width: 4
      };

      const result = await svgbobToSvgTool.invoke(args);
      expect(result.content[0].text).toContain('stroke-width="4"');
    });

    it('should handle custom colors', async () => {
      const args = {
        ascii_art: '┌─┐\n└─┘',
        background: '#ffffff',
        stroke_color: '#ff0000',
        fill_color: '#00ff00'
      };

      const result = await svgbobToSvgTool.invoke(args);
      expect(result.content[0].text).toContain('fill="#ffffff"');
      expect(result.content[0].text).toContain('stroke="#ff0000"');
    });

    it('should handle custom font settings', async () => {
      const args = {
        ascii_art: 'Hello',
        font_family: 'Arial',
        font_size: 16
      };

      const result = await svgbobToSvgTool.invoke(args);
      expect(result.content[0].text).toContain('font-family="Arial"');
      expect(result.content[0].text).toContain('font-size="16"');
    });

    it('should throw error for invalid arguments', async () => {
      const invalidArgs = {
        ascii_art: 123 // Should be string
      };

      await expect(svgbobToSvgTool.invoke(invalidArgs)).rejects.toThrow();
    });

    it('should throw error for missing required field', async () => {
      const invalidArgs = {
        scale: 2 // Missing required ascii_art
      };

      await expect(svgbobToSvgTool.invoke(invalidArgs)).rejects.toThrow();
    });
  });

  describe('executeSvgbobToSvg', () => {
    it('should convert simple box', async () => {
      const args = {
        ascii_art: '┌─────┐\n│     │\n└─────┘',
        scale: 1,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
      expect(result).toContain('</svg>');
    });

    it('should handle horizontal lines', async () => {
      const args = {
        ascii_art: '─────────',
        scale: 1,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('<line');
      expect(result).toContain('stroke="#000000"');
    });

    it('should handle vertical lines', async () => {
      const args = {
        ascii_art: '│\n│\n│',
        scale: 1,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('<line');
    });

    it('should handle corners', async () => {
      const args = {
        ascii_art: '┌┐\n└┘',
        scale: 1,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('<path');
    });

    it('should handle junctions', async () => {
      const args = {
        ascii_art: '┬\n┼\n┴',
        scale: 1,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('<line');
    });

    it('should handle plus signs', async () => {
      const args = {
        ascii_art: '+',
        scale: 1,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('<line');
    });

    it('should handle pipe characters', async () => {
      const args = {
        ascii_art: '|\n|\n|',
        scale: 1,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('<line');
    });

    it('should handle dashes', async () => {
      const args = {
        ascii_art: '-----',
        scale: 1,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('<line');
    });

    it('should handle diagonal lines', async () => {
      const args = {
        ascii_art: '/\\',
        scale: 1,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('<line');
    });

    it('should handle circles', async () => {
      const args = {
        ascii_art: '*o',
        scale: 1,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('<circle');
    });

    it('should handle text characters', async () => {
      const args = {
        ascii_art: 'Hello',
        scale: 1,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('<text');
      // Each character is rendered as separate text element
      expect(result).toContain('>H</text>');
      expect(result).toContain('>e</text>');
      expect(result).toContain('>l</text>');
    });

    it('should handle custom scale', async () => {
      const args = {
        ascii_art: '┌─┐\n└─┘',
        scale: 2,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('<svg');
      // Width and height should be scaled
    });

    it('should handle background color', async () => {
      const args = {
        ascii_art: '┌─┐\n└─┘',
        scale: 1,
        stroke_width: 2,
        background: '#ffffff',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('fill="#ffffff"');
    });

    it('should handle custom stroke color', async () => {
      const args = {
        ascii_art: '─',
        scale: 1,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#ff0000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('stroke="#ff0000"');
    });

    it('should handle empty input', async () => {
      const args = {
        ascii_art: '',
        scale: 1,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('<svg');
      expect(result).toContain('</svg>');
    });

    it('should handle spaces properly', async () => {
      const args = {
        ascii_art: '  text  ',
        scale: 1,
        stroke_width: 2,
        background: 'transparent',
        stroke_color: '#000000',
        font_family: 'monospace',
        font_size: 14,
        fill_color: 'none'
      };

      const result = await executeSvgbobToSvg(args);
      expect(result).toContain('text');
    });
  });
});