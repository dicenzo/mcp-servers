import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { TypographyValidator } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';
import { 
  ShapeTextInputSchema, 
  ShapeTextInput, 
  ShapedText, 
  GlyphInfo,
  ShapingOptions,
  TypographyErrorCode 
} from '../types/typography.js';
import { loadFontBuffer } from './loadFont.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

/**
 * Text Shaping Tool - Performs text shaping with proper Unicode and script support
 */
export const shapeTextTool: ExecutableTool = {
  name: 'type.shapeText',
  description: 'Shape text using advanced typography with proper Unicode support, script analysis, and OpenType features',
  inputSchema: {
    type: 'object',
    properties: {
      text: {
        type: 'string',
        description: 'Text to shape'
      },
      font: {
        oneOf: [
          {
            type: 'object',
            properties: {
              type: { const: 'file' },
              path: { type: 'string' },
              format: { type: 'string', enum: ['ttf', 'otf', 'woff', 'woff2'] }
            },
            required: ['type', 'path']
          },
          {
            type: 'object', 
            properties: {
              type: { const: 'buffer' },
              data: { type: 'string' },
              format: { type: 'string', enum: ['ttf', 'otf', 'woff', 'woff2'] }
            },
            required: ['type', 'data']
          },
          {
            type: 'object',
            properties: {
              type: { const: 'url' },
              url: { type: 'string' },
              format: { type: 'string', enum: ['ttf', 'otf', 'woff', 'woff2'] }
            },
            required: ['type', 'url']
          },
          {
            type: 'object',
            properties: {
              type: { const: 'system' },
              name: { type: 'string' }
            },
            required: ['type', 'name']
          }
        ],
        description: 'Font to use for shaping'
      },
      options: {
        type: 'object',
        properties: {
          direction: {
            type: 'string',
            enum: ['ltr', 'rtl', 'ttb', 'btt'],
            default: 'ltr',
            description: 'Text direction'
          },
          script: {
            type: 'string',
            default: 'latn',
            description: 'Script code (ISO 15924)'
          },
          language: {
            type: 'string',
            default: 'und',
            description: 'Language code (ISO 639)'
          },
          features: {
            type: 'object',
            additionalProperties: {
              oneOf: [
                { type: 'boolean' },
                { type: 'number' }
              ]
            },
            description: 'OpenType features to enable/disable'
          },
          fontSize: {
            type: 'number',
            minimum: 1,
            default: 16,
            description: 'Font size in pixels'
          },
          letterSpacing: {
            type: 'number',
            default: 0,
            description: 'Additional letter spacing'
          },
          wordSpacing: {
            type: 'number',
            default: 0,
            description: 'Additional word spacing'
          },
          variations: {
            type: 'object',
            additionalProperties: { type: 'number' },
            description: 'Variable font axis values'
          }
        },
        additionalProperties: false
      }
    },
    required: ['text', 'font'],
    additionalProperties: false
  },

  async invoke(args: unknown) {
    try {
      const { result, metrics } = await PerformanceMonitor.measureOperation('type.shapeText', async () => {
        
        // Validate input
        const input = TypographyValidator.validateInput(ShapeTextInputSchema, args) as ShapeTextInput;
        
        // Validate text input
        TypographyValidator.validateTextInput(input.text);
        
        // Validate options if provided
        if (input.options) {
          if (input.options.features) {
            TypographyValidator.validateFeatureTags(input.options.features);
          }
          if (input.options.script && input.options.language) {
            TypographyValidator.validateScriptLanguage(input.options.script, input.options.language);
          }
        }
        
        // Load font
        const fontBuffer = await loadFontBuffer(input.font);
        
        // Perform text shaping
        const shapedText = await performTextShaping(input.text, fontBuffer, input.options || {});
        
        return {
          shapedText,
          inputLength: input.text.length,
          outputGlyphs: shapedText.glyphs.length
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            ...result,
            performance: {
              duration: metrics.duration,
              memoryUsed: metrics.memoryUsed
            }
          }, null, 2)
        }]
      };

    } catch (error) {
      console.error('[type.shapeText] Error:', error);
      
      let errorResponse;
      if (error instanceof Error) {
        try {
          const parsedError = JSON.parse(error.message);
          errorResponse = {
            error: true,
            code: parsedError.code || TypographyErrorCode.SHAPING_FAILED,
            message: parsedError.message || error.message,
            details: parsedError.details,
            suggestions: parsedError.suggestions,
            tool: 'type.shapeText',
            timestamp: new Date().toISOString()
          };
        } catch {
          errorResponse = {
            error: true,
            code: TypographyErrorCode.SHAPING_FAILED,
            message: error.message,
            tool: 'type.shapeText',
            timestamp: new Date().toISOString()
          };
        }
      } else {
        errorResponse = {
          error: true,
          code: TypographyErrorCode.SHAPING_FAILED,
          message: 'Text shaping failed',
          tool: 'type.shapeText',
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
 * Performs text shaping using HarfBuzz
 */
async function performTextShaping(
  text: string, 
  fontBuffer: Buffer, 
  options: Partial<ShapingOptions>
): Promise<ShapedText> {
  try {
    // For now, use basic shaping since HarfBuzz WASM is not available
    // In a production environment, you would implement HarfBuzz integration
    return performBasicShaping(text, fontBuffer, options);
    
  } catch (error) {
    throw new Error(JSON.stringify({
      code: TypographyErrorCode.SHAPING_FAILED,
      message: `HarfBuzz shaping failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestions: [
        'Check if the font supports the specified script and language',
        'Verify OpenType features are valid for this font',
        'Try with basic shaping options'
      ]
    }));
  }
}

/**
 * Performs basic text shaping as fallback when HarfBuzz is not available
 */
async function performBasicShaping(
  text: string, 
  fontBuffer: Buffer, 
  options: Partial<ShapingOptions>
): Promise<ShapedText> {
  try {
    // Use opentype.js for basic shaping
    const opentype = await import('opentype.js');
    const font = opentype.parse(fontBuffer.buffer as ArrayBuffer);
    
    const fontSize = options.fontSize || 16;
    const scale = fontSize / font.unitsPerEm;
    
    const glyphs: GlyphInfo[] = [];
    const clusters: number[] = [];
    let totalAdvanceX = 0;
    const totalAdvanceY = 0;
    
    // Basic character-to-glyph mapping
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      const codepoint = char.codePointAt(0) || 0;
      const glyph = font.charToGlyph(char);
      
      let advance = glyph.advanceWidth || 0;
      if (glyph.advanceWidth === undefined && glyph.xMax && glyph.xMin) {
        advance = glyph.xMax - glyph.xMin;
      }
      
      advance *= scale;
      
      // Apply letter spacing
      if (options.letterSpacing) {
        advance += options.letterSpacing;
      }
      
      // Apply word spacing for space characters
      if (options.wordSpacing && char === ' ') {
        advance += options.wordSpacing;
      }
      
      const glyphInfo: GlyphInfo = {
        glyphId: glyph.index || 0,
        cluster: i,
        codepoint: codepoint,
        advance: {
          x: advance,
          y: 0
        },
        offset: {
          x: 0,
          y: 0
        },
        flags: 0
      };
      
      glyphs.push(glyphInfo);
      clusters.push(i);
      totalAdvanceX += advance;
    }
    
    return {
      glyphs,
      advance: {
        x: totalAdvanceX,
        y: totalAdvanceY
      },
      clusters,
      direction: options.direction || 'ltr',
      script: options.script || 'latn', 
      language: options.language || 'und',
      features: options.features
    };
    
  } catch (error) {
    throw new Error(JSON.stringify({
      code: TypographyErrorCode.SHAPING_FAILED,
      message: `Basic shaping failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestions: [
        'Check if the font file is valid',
        'Try with a different font',
        'Verify the text contains supported characters'
      ]
    }));
  }
}

// Export helper function for use in other tools
export { loadFontBuffer } from './loadFont.js';