import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { TextToolResult } from '../types/typography.js';
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
import { shapeLine } from '../util/shaping.js';
import { toolInputSchema } from '../util/toolSchema.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<TextToolResult>;
}

/**
 * Text Shaping Tool - Performs text shaping with proper Unicode and script support
 */
export const shapeTextTool: ExecutableTool = {
  name: 'type.shapeText',
  description: 'Shape text using advanced typography with proper Unicode support, script analysis, and OpenType features',
  inputSchema: toolInputSchema(ShapeTextInputSchema),

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
          TypographyValidator.validateScriptLanguage(input.options.script, input.options.language);
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
 * Shapes text with HarfBuzz (see util/shaping.ts)
 */
async function performTextShaping(
  text: string,
  fontBuffer: Buffer,
  options: Partial<ShapingOptions>
): Promise<ShapedText> {
  try {
    const line = await shapeLine(fontBuffer, text, {
      fontSize: options.fontSize ?? 16,
      direction: options.direction,
      script: options.script,
      language: options.language,
      features: options.features,
      variations: options.variations,
      letterSpacing: options.letterSpacing,
      wordSpacing: options.wordSpacing
    });
    const glyphs: GlyphInfo[] = line.glyphs;
    return {
      glyphs,
      advance: line.advance,
      clusters: glyphs.map(glyph => glyph.cluster),
      direction: line.direction,
      script: options.script ?? line.runs[0]?.script ?? 'Zyyy',
      language: options.language ?? 'und',
      runs: line.runs,
      features: options.features
    };
  } catch (error) {
    throw new Error(JSON.stringify({
      code: TypographyErrorCode.SHAPING_FAILED,
      message: `Text shaping failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestions: [
        'Check if the font file is valid',
        'Check if the font supports the specified script and language',
        'Verify OpenType features are valid for this font'
      ]
    }));
  }
}

// Export helper function for use in other tools
export { loadFontBuffer } from './loadFont.js';