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
import { parseFont } from '../util/parseFont.js';
import { shapeLine } from '../util/shaping.js';
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
        TypographyValidator.validateScriptLanguage(input.options?.script, input.options?.language);
        
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
    const line = await shapeLine(fontBuffer, text, {
      fontSize,
      direction: options.direction as 'ltr' | 'rtl' | undefined,
      script: options.script,
      language: options.language,
      letterSpacing: options.letterSpacing,
      wordSpacing: options.wordSpacing
    });

    // Overall ink bounds, with glyphs placed left to right in visual order
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

    // Each glyph's characters run from its cluster to the next cluster in the text
    const clusterStarts = [...new Set(line.glyphs.map(glyph => glyph.cluster))].sort((a, b) => a - b);
    const clusterText = (cluster: number) =>
      text.slice(cluster, clusterStarts.find(start => start > cluster) ?? text.length);

    for (const glyph of line.glyphs) {
      const advance = glyph.advance.x;
      const bounds = line.glyphBounds(glyph.glyphId) ?? { xMin: 0, yMin: 0, xMax: 0, yMax: 0 };
      const scaledBBox = {
        xMin: bounds.xMin + glyph.offset.x,
        yMin: bounds.yMin + glyph.offset.y,
        xMax: bounds.xMax + glyph.offset.x,
        yMax: bounds.yMax + glyph.offset.y
      };
      if (scaledBBox.xMax > scaledBBox.xMin) {
        minX = Math.min(minX, totalWidth + scaledBBox.xMin);
        maxX = Math.max(maxX, totalWidth + scaledBBox.xMax);
        minY = Math.min(minY, scaledBBox.yMin);
        maxY = Math.max(maxY, scaledBBox.yMax);
      }
      advances.push(advance);
      totalWidth += advance;

      if (options.includeCharacterMetrics) {
        characterMetrics.push({
          char: clusterText(glyph.cluster),
          advance,
          leftSideBearing: bounds.xMin,
          rightSideBearing: advance - bounds.xMax,
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
