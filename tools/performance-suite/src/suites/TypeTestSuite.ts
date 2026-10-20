/**
 * Typography Server Test Suite
 * Comprehensive test cases for mcp-graphics-type server
 */

import { TestCase } from '../types/performance.js';

export class TypeTestSuite {
  // Sample font data and text for testing
  private readonly sampleTexts = {
    short: 'Hello World',
    medium: 'The quick brown fox jumps over the lazy dog. This pangram contains every letter of the alphabet.',
    long: `Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.`,
    multilingual: 'Hello World • Bonjour le monde • 世界，您好 • مرحبا بالعالم • Γεια σας κόσμε • Привет мир'
  };

  private readonly fontUrls = {
    openSans: 'https://fonts.gstatic.com/s/opensans/v40/memSYaGs126MiZpBA-UvWbX2vVnXBbObj2OVZyOOSr4dVJWUgsjZ0B4gaVc.woff2',
    roboto: 'https://fonts.gstatic.com/s/roboto/v30/KFOmCnqEu92Fr1Mu4mxKKTU1Kg.woff2',
    notoSans: 'https://fonts.gstatic.com/s/notosans/v36/o-0IIpQlx3QUlC5A4PNb4j5Ba_2c7A.woff2',
    playfair: 'https://fonts.gstatic.com/s/playfairdisplay/v37/nuFvD-vYSZviVYUb_rj3ij__anPXJzDwcbmjWBN2PKdFvXDXbtXK-F2qO0isEw.woff2'
  };

  private testCases: TestCase[] = [
    // Font loading tests
    {
      name: 'load-web-font-opensans',
      toolName: 'type.loadFont',
      input: {
        source: this.fontUrls.openSans,
        format: 'woff2',
        fontFamily: 'Open Sans'
      }
    },
    {
      name: 'load-web-font-roboto',
      toolName: 'type.loadFont',
      input: {
        source: this.fontUrls.roboto,
        format: 'woff2',
        fontFamily: 'Roboto'
      }
    },
    {
      name: 'load-font-with-fallback',
      toolName: 'type.loadFont',
      input: {
        source: this.fontUrls.playfair,
        format: 'woff2',
        fontFamily: 'Playfair Display',
        fallbacks: ['serif', 'Times New Roman']
      }
    },
    {
      name: 'load-system-font',
      toolName: 'type.loadFont',
      input: {
        fontFamily: 'Arial',
        source: 'system'
      }
    },

    // Text shaping tests
    {
      name: 'shape-simple-text',
      toolName: 'type.shapeText',
      input: {
        text: this.sampleTexts.short,
        fontFamily: 'Open Sans',
        fontSize: 16,
        features: []
      }
    },
    {
      name: 'shape-paragraph-text',
      toolName: 'type.shapeText',
      input: {
        text: this.sampleTexts.medium,
        fontFamily: 'Roboto',
        fontSize: 14,
        lineHeight: 1.4,
        features: ['kern', 'liga']
      }
    },
    {
      name: 'shape-multilingual-text',
      toolName: 'type.shapeText',
      input: {
        text: this.sampleTexts.multilingual,
        fontFamily: 'Noto Sans',
        fontSize: 18,
        direction: 'auto',
        features: ['kern', 'liga', 'clig']
      }
    },
    {
      name: 'shape-large-text-block',
      toolName: 'type.shapeText',
      input: {
        text: this.sampleTexts.long,
        fontFamily: 'Open Sans',
        fontSize: 12,
        lineHeight: 1.5,
        maxWidth: 400,
        features: ['kern', 'liga', 'clig', 'calt']
      }
    },
    {
      name: 'shape-with-advanced-features',
      toolName: 'type.shapeText',
      input: {
        text: 'Typography with fi fl ffi ffl ligatures 1234567890',
        fontFamily: 'Playfair Display',
        fontSize: 24,
        features: ['kern', 'liga', 'dlig', 'hlig', 'clig', 'onum']
      }
    },

    // Text measurement tests
    {
      name: 'measure-single-line',
      toolName: 'type.measureText',
      input: {
        text: this.sampleTexts.short,
        fontFamily: 'Arial',
        fontSize: 16
      }
    },
    {
      name: 'measure-multi-line',
      toolName: 'type.measureText',
      input: {
        text: this.sampleTexts.medium,
        fontFamily: 'Open Sans',
        fontSize: 14,
        maxWidth: 300,
        lineHeight: 1.4
      }
    },
    {
      name: 'measure-large-sizes',
      toolName: 'type.measureText',
      input: {
        text: 'HEADLINE TEXT',
        fontFamily: 'Playfair Display',
        fontSize: 48,
        letterSpacing: 0.02
      }
    },
    {
      name: 'measure-constrained-width',
      toolName: 'type.measureText',
      input: {
        text: this.sampleTexts.long,
        fontFamily: 'Roboto',
        fontSize: 12,
        maxWidth: 200,
        lineHeight: 1.3
      }
    },

    // Font subsetting tests
    {
      name: 'subset-basic-latin',
      toolName: 'type.subsetFont',
      input: {
        fontSource: this.fontUrls.openSans,
        characters: 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,!?'
      }
    },
    {
      name: 'subset-specific-text',
      toolName: 'type.subsetFont',
      input: {
        fontSource: this.fontUrls.roboto,
        text: this.sampleTexts.medium
      }
    },
    {
      name: 'subset-unicode-ranges',
      toolName: 'type.subsetFont',
      input: {
        fontSource: this.fontUrls.notoSans,
        unicodeRanges: [
          'U+0020-007F', // Basic Latin
          'U+00A0-00FF', // Latin-1 Supplement
          'U+0100-017F'  // Latin Extended-A
        ]
      }
    },
    {
      name: 'subset-large-font',
      toolName: 'type.subsetFont',
      input: {
        fontSource: this.fontUrls.playfair,
        characters: this.sampleTexts.long + this.sampleTexts.multilingual,
        options: {
          preserveNames: true,
          removeHinting: false
        }
      }
    },

    // Font fallback generation tests
    {
      name: 'generate-fallback-sans-serif',
      toolName: 'type.generateFallback',
      input: {
        primaryFont: 'Open Sans',
        category: 'sans-serif',
        targetMetrics: {
          unitsPerEm: 2048,
          ascender: 1638,
          descender: -410,
          xHeight: 1062,
          capHeight: 1462
        }
      }
    },
    {
      name: 'generate-fallback-serif',
      toolName: 'type.generateFallback',
      input: {
        primaryFont: 'Playfair Display',
        category: 'serif',
        targetMetrics: {
          unitsPerEm: 1000,
          ascender: 800,
          descender: -200,
          xHeight: 500,
          capHeight: 700
        }
      }
    },
    {
      name: 'generate-fallback-monospace',
      toolName: 'type.generateFallback',
      input: {
        primaryFont: 'Courier New',
        category: 'monospace',
        options: {
          adjustSizeAdjust: true,
          adjustLineGap: true,
          adjustAscentOverride: true,
          adjustDescentOverride: true
        }
      }
    },

    // Font validation tests
    {
      name: 'validate-web-font',
      toolName: 'type.validateFont',
      input: {
        fontSource: this.fontUrls.openSans,
        checks: ['format', 'tables', 'metrics', 'encoding']
      }
    },
    {
      name: 'validate-system-font',
      toolName: 'type.validateFont',
      input: {
        fontFamily: 'Arial',
        checks: ['availability', 'metrics', 'features']
      }
    },
    {
      name: 'validate-font-features',
      toolName: 'type.validateFont',
      input: {
        fontSource: this.fontUrls.playfair,
        checks: ['features', 'ligatures', 'kerning', 'opentype'],
        requiredFeatures: ['kern', 'liga', 'clig']
      }
    },
    {
      name: 'validate-comprehensive',
      toolName: 'type.validateFont',
      input: {
        fontSource: this.fontUrls.notoSans,
        checks: ['format', 'tables', 'metrics', 'encoding', 'features', 'hinting'],
        strictMode: true
      }
    }
  ];

  getTestCases(): TestCase[] {
    return this.testCases;
  }

  /**
   * Get tool function for testing
   */
  getToolFunction(toolName: string): (input: any) => Promise<any> {
    switch (toolName) {
      case 'type.loadFont':
        return this.mockLoadFont.bind(this);
      case 'type.shapeText':
        return this.mockShapeText.bind(this);
      case 'type.measureText':
        return this.mockMeasureText.bind(this);
      case 'type.subsetFont':
        return this.mockSubsetFont.bind(this);
      case 'type.generateFallback':
        return this.mockGenerateFallback.bind(this);
      case 'type.validateFont':
        return this.mockValidateFont.bind(this);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // Mock implementations with realistic processing times

  private async mockLoadFont(input: any): Promise<any> {
    const isWebFont = input.source && input.source.startsWith('http');
    const processingTime = this.calculateTypeProcessingTime('loadFont', isWebFont ? 150 : 50);
    await this.simulateProcessing(processingTime);
    
    return {
      success: true,
      result: {
        fontFamily: input.fontFamily,
        source: input.source,
        format: input.format || 'unknown',
        loaded: true,
        metrics: {
          unitsPerEm: 2048,
          ascender: 1638,
          descender: -410,
          xHeight: 1062,
          capHeight: 1462
        }
      },
      metadata: {
        processingTime,
        operation: 'loadFont',
        processedAt: new Date().toISOString()
      }
    };
  }

  private async mockShapeText(input: any): Promise<any> {
    const { text, features = [] } = input;
    const complexity = text.length * (1 + features.length * 0.1);
    const processingTime = this.calculateTypeProcessingTime('shapeText', complexity / 100);
    await this.simulateProcessing(processingTime);
    
    const words = text.split(' ');
    const glyphCount = text.replace(/\s/g, '').length;
    
    return {
      success: true,
      result: {
        text,
        fontFamily: input.fontFamily,
        fontSize: input.fontSize,
        glyphCount,
        wordCount: words.length,
        lineCount: Math.ceil(glyphCount / 50), // Rough estimate
        features: features,
        shapingTime: processingTime
      },
      metadata: {
        processingTime,
        operation: 'shapeText',
        processedAt: new Date().toISOString()
      }
    };
  }

  private async mockMeasureText(input: any): Promise<any> {
    const { text } = input;
    const processingTime = this.calculateTypeProcessingTime('measureText', text.length / 200);
    await this.simulateProcessing(processingTime);
    
    // Mock measurements based on typical font metrics
    const charWidth = input.fontSize * 0.6; // Rough average
    const lineHeight = input.fontSize * (input.lineHeight || 1.2);
    const maxWidth = input.maxWidth || text.length * charWidth;
    
    const lines = Math.ceil((text.length * charWidth) / maxWidth);
    
    return {
      success: true,
      result: {
        text,
        fontFamily: input.fontFamily,
        fontSize: input.fontSize,
        width: Math.min(text.length * charWidth, maxWidth),
        height: lines * lineHeight,
        lines,
        baseline: lineHeight * 0.8,
        bounds: {
          left: 0,
          top: 0,
          right: Math.min(text.length * charWidth, maxWidth),
          bottom: lines * lineHeight
        }
      },
      metadata: {
        processingTime,
        operation: 'measureText',
        processedAt: new Date().toISOString()
      }
    };
  }

  private async mockSubsetFont(input: any): Promise<any> {
    const characterCount = input.characters?.length || 
                          input.text?.length || 
                          (input.unicodeRanges?.length * 100) || 500;
    const processingTime = this.calculateTypeProcessingTime('subsetFont', characterCount / 50);
    await this.simulateProcessing(processingTime);
    
    const originalSize = 450000; // ~450KB typical font size
    const subsetSize = Math.floor(originalSize * (characterCount / 2000)); // Rough calculation
    
    return {
      success: true,
      result: {
        originalFont: input.fontSource,
        subsetFont: 'data:font/woff2;base64,d09GMgABAAA...', // Mock base64
        originalSize,
        subsetSize,
        compressionRatio: subsetSize / originalSize,
        characterCount,
        glyphCount: Math.floor(characterCount * 1.1) // Slight overhead for ligatures etc.
      },
      metadata: {
        processingTime,
        operation: 'subsetFont',
        processedAt: new Date().toISOString()
      }
    };
  }

  private async mockGenerateFallback(input: any): Promise<any> {
    const processingTime = this.calculateTypeProcessingTime('generateFallback', 200);
    await this.simulateProcessing(processingTime);
    
    return {
      success: true,
      result: {
        primaryFont: input.primaryFont,
        category: input.category,
        fallbackStack: [
          input.primaryFont,
          this.getFallbackForCategory(input.category),
          'system-ui',
          'sans-serif'
        ],
        metrics: input.targetMetrics || {
          unitsPerEm: 2048,
          ascender: 1638,
          descender: -410,
          xHeight: 1062,
          capHeight: 1462
        },
        adjustments: {
          sizeAdjust: '100%',
          ascentOverride: 'normal',
          descentOverride: 'normal',
          lineGapOverride: 'normal'
        }
      },
      metadata: {
        processingTime,
        operation: 'generateFallback',
        processedAt: new Date().toISOString()
      }
    };
  }

  private async mockValidateFont(input: any): Promise<any> {
    const { checks = [] } = input;
    const processingTime = this.calculateTypeProcessingTime('validateFont', checks.length * 20);
    await this.simulateProcessing(processingTime);
    
    return {
      success: true,
      result: {
        fontSource: input.fontSource || input.fontFamily,
        checks,
        results: checks.reduce((acc: any, check: string) => {
          acc[check] = {
            passed: Math.random() > 0.1, // 90% pass rate
            message: `${check} validation completed`,
            details: {}
          };
          return acc;
        }, {}),
        overallScore: 0.9,
        issues: [],
        warnings: ['Minor hinting inconsistencies detected']
      },
      metadata: {
        processingTime,
        operation: 'validateFont',
        processedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Calculate realistic processing time for typography operations
   */
  private calculateTypeProcessingTime(operation: string, complexityFactor: number = 1): number {
    let baseTime = 50;
    let complexityMultiplier = 1;
    
    switch (operation) {
      case 'loadFont':
        baseTime = 120;
        complexityMultiplier = Math.max(1, complexityFactor / 100);
        break;
      case 'shapeText':
        baseTime = 25;
        complexityMultiplier = Math.max(1, complexityFactor);
        break;
      case 'measureText':
        baseTime = 15;
        complexityMultiplier = Math.max(1, complexityFactor);
        break;
      case 'subsetFont':
        baseTime = 250;
        complexityMultiplier = Math.max(1, complexityFactor);
        break;
      case 'generateFallback':
        baseTime = 180;
        complexityMultiplier = 1;
        break;
      case 'validateFont':
        baseTime = 60;
        complexityMultiplier = Math.max(1, complexityFactor / 10);
        break;
    }
    
    // Add realistic variation
    const variation = (Math.random() - 0.5) * 0.3; // ±15% variation
    return Math.max(5, baseTime * complexityMultiplier * (1 + variation));
  }

  /**
   * Get appropriate fallback font for category
   */
  private getFallbackForCategory(category: string): string {
    switch (category) {
      case 'sans-serif':
        return 'Arial';
      case 'serif':
        return 'Times New Roman';
      case 'monospace':
        return 'Courier New';
      case 'cursive':
        return 'Comic Sans MS';
      case 'fantasy':
        return 'Impact';
      default:
        return 'Arial';
    }
  }

  /**
   * Simulate processing time
   */
  private async simulateProcessing(timeMs: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, timeMs));
  }
}