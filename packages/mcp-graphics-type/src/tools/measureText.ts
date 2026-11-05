import { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { TextToolResult } from '../types/typography.js';
import { TypographyValidator } from '../util/validation.js';
import { PerformanceMonitor } from '../util/performance.js';
import { 
  MeasureTextInputSchema, 
  MeasureTextInput, 
  TextMetrics, 
  TypographyErrorCode 
} from '../types/typography.js';
import { loadFontBuffer } from './loadFont.js';
import { fontLineGap } from '../util/fontMetrics.js';
import { layoutGlyphRun } from '../util/glyphRun.js';
import { parseFont } from '../util/parseFont.js';
import { toolInputSchema } from '../util/toolSchema.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<TextToolResult>;
}

/**
 * Text Measurement Tool - Measures text dimensions and provides detailed metrics
 */
export const measureTextTool: ExecutableTool = {
  name: 'type.measureText',
  description: 'Measure text dimensions and provide detailed typography metrics including baselines, bounding boxes, and character-level metrics',
  inputSchema: toolInputSchema(MeasureTextInputSchema),

  async invoke(args: unknown) {
    try {
      const { result, metrics } = await PerformanceMonitor.measureOperation('type.measureText', async () => {
        
        // Validate input
        const input = TypographyValidator.validateInput(MeasureTextInputSchema, args) as MeasureTextInput;
        
        // Validate text input
        TypographyValidator.validateTextInput(input.text);
        
        // Validate script and language if provided
        if (input.options?.script && input.options?.language) {
          TypographyValidator.validateScriptLanguage(input.options.script, input.options.language);
        }
        
        // Load font
        const fontBuffer = await loadFontBuffer(input.font);
        
        // Measure text
        const textMetrics = await measureTextDimensions(input.text, fontBuffer, input.fontSize, input.options || {});
        
        return {
          metrics: textMetrics,
          inputLength: input.text.length,
          fontSize: input.fontSize
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
      console.error('[type.measureText] Error:', error);
      
      let errorResponse;
      if (error instanceof Error) {
        try {
          const parsedError = JSON.parse(error.message);
          errorResponse = {
            error: true,
            code: parsedError.code || TypographyErrorCode.MEASUREMENT_FAILED,
            message: parsedError.message || error.message,
            details: parsedError.details,
            suggestions: parsedError.suggestions,
            tool: 'type.measureText',
            timestamp: new Date().toISOString()
          };
        } catch {
          errorResponse = {
            error: true,
            code: TypographyErrorCode.MEASUREMENT_FAILED,
            message: error.message,
            tool: 'type.measureText',
            timestamp: new Date().toISOString()
          };
        }
      } else {
        errorResponse = {
          error: true,
          code: TypographyErrorCode.MEASUREMENT_FAILED,
          message: 'Text measurement failed',
          tool: 'type.measureText',
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
 * Measures text dimensions and provides detailed metrics
 */
async function measureTextDimensions(
  text: string, 
  fontBuffer: Buffer, 
  fontSize: number,
  options: {
    letterSpacing?: number;
    wordSpacing?: number;
    direction?: string;
    script?: string;
    language?: string;
    includeCharacterMetrics?: boolean;
  }
): Promise<TextMetrics> {
  try {
    // Use opentype.js for text measurement
    const font = await parseFont(fontBuffer);
    
    const scale = fontSize / font.unitsPerEm;
    
    // Measure overall text dimensions
    let totalWidth = 0;
    let minX = 0;
    let maxX = 0;
    let minY = 0;
    let maxY = 0;
    
    const advances: number[] = [];
    const characterMetrics: Array<{
      char: string;
      advance: number;
      leftSideBearing: number;
      rightSideBearing: number;
      bbox: { xMin: number; yMin: number; xMax: number; yMax: number; };
    }> = [];
    
    // Measure each character
    const run = layoutGlyphRun(font, text, {
      fontSize,
      letterSpacing: options.letterSpacing,
      wordSpacing: options.wordSpacing
    });
    for (const { char, glyph, advance } of run) {
      advances.push(advance);
      totalWidth += advance;
      
      // Calculate glyph bounding box
      const glyphBBox = glyph.getBoundingBox();
      const scaledBBox = {
        xMin: glyphBBox.x1 * scale,
        yMin: glyphBBox.y1 * scale,
        xMax: glyphBBox.x2 * scale,
        yMax: glyphBBox.y2 * scale
      };
      
      // Update overall bounding box
      const glyphLeft = totalWidth - advance + scaledBBox.xMin;
      const glyphRight = totalWidth - advance + scaledBBox.xMax;
      
      minX = Math.min(minX, glyphLeft);
      maxX = Math.max(maxX, glyphRight);
      minY = Math.min(minY, scaledBBox.yMin);
      maxY = Math.max(maxY, scaledBBox.yMax);
      
      // Collect character metrics if requested
      if (options.includeCharacterMetrics) {
        characterMetrics.push({
          char: char,
          advance: advance,
          leftSideBearing: (glyph.leftSideBearing || 0) * scale,
          rightSideBearing: ((glyph.advanceWidth || 0) - (glyph.rightSideBearing || 0)) * scale,
          bbox: scaledBBox
        });
      }
    }
    
    // Calculate font metrics
    const ascender = font.ascender * scale;
    const descender = font.descender * scale;
    const lineGap = fontLineGap(font) * scale;
    const lineHeight = ascender - descender + lineGap;
    
    // Calculate baseline positions
    const alphabeticBaseline = 0;
    const hangingBaseline = ascender;
    const ideographicBaseline = descender;
    
    // Get additional metrics from font tables
    const os2Table = font.tables.os2;
    const capHeight = os2Table?.sCapHeight ? os2Table.sCapHeight * scale : ascender * 0.7;
    const xHeight = os2Table?.sxHeight ? os2Table.sxHeight * scale : ascender * 0.5;
    
    const textMetrics: TextMetrics = {
      width: totalWidth,
      height: maxY - minY,
      actualBoundingBoxLeft: -minX,
      actualBoundingBoxRight: maxX,
      actualBoundingBoxAscent: maxY,
      actualBoundingBoxDescent: -minY,
      fontBoundingBoxAscent: ascender,
      fontBoundingBoxDescent: -descender,
      emHeightAscent: ascender,
      emHeightDescent: -descender,
      hangingBaseline: hangingBaseline,
      alphabeticBaseline: alphabeticBaseline,
      ideographicBaseline: ideographicBaseline,
      advances: advances,
      lineHeight: lineHeight,
      capHeight: capHeight,
      xHeight: xHeight,
      baseline: alphabeticBaseline
    };
    
    // Add character metrics if requested
    if (options.includeCharacterMetrics && characterMetrics.length > 0) {
      textMetrics.characterMetrics = characterMetrics;
    }
    
    return textMetrics;
    
  } catch (error) {
    throw new Error(JSON.stringify({
      code: TypographyErrorCode.MEASUREMENT_FAILED,
      message: `Text measurement failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      suggestions: [
        'Check if the font file is valid',
        'Verify the text contains supported characters',
        'Try with a smaller font size',
        'Ensure font metrics are available'
      ]
    }));
  }
}
