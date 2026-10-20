/**
 * Image Server Test Suite
 * Comprehensive test cases for mcp-graphics-image server
 */

import { TestCase } from '../types/performance.js';

export class ImageTestSuite {
  // Sample base64 images for testing (small test images)
  private readonly testImages = {
    small: this.generateTestImageBase64(100, 100),
    medium: this.generateTestImageBase64(800, 600),
    large: this.generateTestImageBase64(1920, 1080),
    square: this.generateTestImageBase64(500, 500)
  };

  private testCases: TestCase[] = [
    // Image resize tests
    {
      name: 'resize-small-to-thumbnail',
      toolName: 'image.resize',
      input: {
        image: { data: this.testImages.small },
        dimensions: { width: 50, height: 50 },
        method: 'lanczos3'
      }
    },
    {
      name: 'resize-medium-to-web',
      toolName: 'image.resize',
      input: {
        image: { data: this.testImages.medium },
        dimensions: { width: 400, height: 300 },
        method: 'bicubic'
      }
    },
    {
      name: 'resize-large-downscale',
      toolName: 'image.resize',
      input: {
        image: { data: this.testImages.large },
        dimensions: { width: 1024, height: 768 },
        method: 'lanczos3',
        preserveAspectRatio: true
      }
    },
    {
      name: 'resize-upscale-with-enlargement',
      toolName: 'image.resize',
      input: {
        image: { data: this.testImages.small },
        dimensions: { width: 200, height: 200 },
        allowEnlargement: true,
        method: 'cubic'
      }
    },

    // Image format conversion tests
    {
      name: 'convert-png-to-jpeg',
      toolName: 'image.convert',
      input: {
        image: { data: this.testImages.large },
        format: 'jpeg',
        quality: 85
      }
    },
    {
      name: 'convert-png-to-webp',
      toolName: 'image.convert',
      input: {
        image: { data: this.testImages.medium },
        format: 'webp',
        quality: 80
      }
    },
    {
      name: 'convert-to-avif-high-compression',
      toolName: 'image.convert',
      input: {
        image: { data: this.testImages.medium },
        format: 'avif',
        quality: 60
      }
    },
    {
      name: 'convert-lossless-webp',
      toolName: 'image.convert',
      input: {
        image: { data: this.testImages.square },
        format: 'webp',
        lossless: true
      }
    },

    // Image cropping tests
    {
      name: 'crop-center-large-image',
      toolName: 'image.crop',
      input: {
        image: { data: this.testImages.large },
        bounds: { left: 400, top: 200, width: 800, height: 600 }
      }
    },
    {
      name: 'crop-corner-medium-image',
      toolName: 'image.crop',
      input: {
        image: { data: this.testImages.medium },
        bounds: { left: 0, top: 0, width: 300, height: 300 }
      }
    },
    {
      name: 'crop-precise-small-area',
      toolName: 'image.crop',
      input: {
        image: { data: this.testImages.square },
        bounds: { left: 100, top: 100, width: 200, height: 200 }
      }
    },

    // Image filtering tests
    {
      name: 'filter-single-blur',
      toolName: 'image.filter',
      input: {
        image: { data: this.testImages.medium },
        filters: [{ type: 'blur', intensity: 5 }]
      }
    },
    {
      name: 'filter-color-adjustments',
      toolName: 'image.filter',
      input: {
        image: { data: this.testImages.medium },
        filters: [
          { type: 'brightness', intensity: 10 },
          { type: 'contrast', intensity: 15 },
          { type: 'saturation', intensity: 20 }
        ]
      }
    },
    {
      name: 'filter-complex-chain',
      toolName: 'image.filter',
      input: {
        image: { data: this.testImages.small },
        filters: [
          { type: 'sharpen', intensity: 30 },
          { type: 'brightness', intensity: -10 },
          { type: 'hue', intensity: 45 },
          { type: 'blur', intensity: 2 }
        ]
      }
    },
    {
      name: 'filter-heavy-processing',
      toolName: 'image.filter',
      input: {
        image: { data: this.testImages.large },
        filters: [
          { type: 'blur', intensity: 20 },
          { type: 'contrast', intensity: 50 }
        ]
      }
    },

    // Image optimization tests
    {
      name: 'optimize-for-size',
      toolName: 'image.optimize',
      input: {
        image: { data: this.testImages.large },
        strategy: 'size',
        target: { maxFileSize: 100000 }
      }
    },
    {
      name: 'optimize-for-quality',
      toolName: 'image.optimize',
      input: {
        image: { data: this.testImages.medium },
        strategy: 'quality',
        target: { minQuality: 80 }
      }
    },
    {
      name: 'optimize-balanced',
      toolName: 'image.optimize',
      input: {
        image: { data: this.testImages.large },
        strategy: 'balanced',
        target: { maxFileSize: 200000, minQuality: 70 }
      }
    },
    {
      name: 'optimize-aggressive-compression',
      toolName: 'image.optimize',
      input: {
        image: { data: this.testImages.square },
        strategy: 'size',
        target: { maxFileSize: 50000 }
      }
    },

    // Image composition tests
    {
      name: 'composite-two-images-over',
      toolName: 'image.composite',
      input: {
        images: [
          { data: this.testImages.medium },
          { data: this.testImages.small }
        ],
        composition: { mode: 'over' }
      }
    },
    {
      name: 'composite-multiple-images-multiply',
      toolName: 'image.composite',
      input: {
        images: [
          { data: this.testImages.square },
          { data: this.testImages.small },
          { data: this.testImages.small }
        ],
        composition: { mode: 'multiply' }
      }
    },
    {
      name: 'composite-complex-blending',
      toolName: 'image.composite',
      input: {
        images: [
          { data: this.testImages.large },
          { data: this.testImages.medium },
          { data: this.testImages.small }
        ],
        composition: { 
          mode: 'screen',
          opacity: 0.7,
          offset: { x: 100, y: 100 }
        }
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
      case 'image.resize':
        return this.mockImageResize.bind(this);
      case 'image.convert':
        return this.mockImageConvert.bind(this);
      case 'image.crop':
        return this.mockImageCrop.bind(this);
      case 'image.filter':
        return this.mockImageFilter.bind(this);
      case 'image.optimize':
        return this.mockImageOptimize.bind(this);
      case 'image.composite':
        return this.mockImageComposite.bind(this);
      default:
        throw new Error(`Unknown tool: ${toolName}`);
    }
  }

  // Mock implementations with realistic processing times
  
  private async mockImageResize(input: any): Promise<any> {
    const { image, dimensions } = input;
    const processingTime = this.calculateImageProcessingTime(image.data, 'resize', dimensions);
    await this.simulateProcessing(processingTime);
    
    return {
      success: true,
      result: {
        data: this.generateTestImageBase64(dimensions.width, dimensions.height),
        format: 'png',
        originalDimensions: { width: 800, height: 600 },
        dimensions,
        scaleFactor: dimensions.width / 800,
        method: input.method || 'lanczos3'
      },
      metadata: {
        processingTime,
        operation: 'resize',
        processedAt: new Date().toISOString()
      }
    };
  }

  private async mockImageConvert(input: any): Promise<any> {
    const processingTime = this.calculateImageProcessingTime(input.image.data, 'convert', input.format);
    await this.simulateProcessing(processingTime);
    
    return {
      success: true,
      result: {
        data: input.image.data, // In real implementation, would be converted
        originalFormat: 'png',
        format: input.format,
        quality: input.quality || 80,
        compressionRatio: 0.65
      },
      metadata: {
        processingTime,
        operation: 'convert',
        processedAt: new Date().toISOString()
      }
    };
  }

  private async mockImageCrop(input: any): Promise<any> {
    const { bounds } = input;
    const processingTime = this.calculateImageProcessingTime(input.image.data, 'crop', bounds);
    await this.simulateProcessing(processingTime);
    
    return {
      success: true,
      result: {
        data: this.generateTestImageBase64(bounds.width, bounds.height),
        originalDimensions: { width: 800, height: 600 },
        bounds,
        format: 'png'
      },
      metadata: {
        processingTime,
        operation: 'crop',
        processedAt: new Date().toISOString()
      }
    };
  }

  private async mockImageFilter(input: any): Promise<any> {
    const { filters } = input;
    const baseTime = this.calculateImageProcessingTime(input.image.data, 'filter');
    const processingTime = baseTime * (1 + filters.length * 0.5); // More filters = more time
    await this.simulateProcessing(processingTime);
    
    return {
      success: true,
      result: {
        data: input.image.data, // In real implementation, would be filtered
        appliedFilters: filters,
        format: 'png'
      },
      metadata: {
        processingTime,
        operation: 'filter',
        processedAt: new Date().toISOString()
      }
    };
  }

  private async mockImageOptimize(input: any): Promise<any> {
    const processingTime = this.calculateImageProcessingTime(input.image.data, 'optimize', input.strategy);
    await this.simulateProcessing(processingTime);
    
    return {
      success: true,
      result: {
        data: input.image.data, // In real implementation, would be optimized
        originalSize: 150000,
        optimizedSize: 85000,
        compressionRatio: 0.43,
        strategy: input.strategy,
        format: 'webp'
      },
      metadata: {
        processingTime,
        operation: 'optimize',
        processedAt: new Date().toISOString()
      }
    };
  }

  private async mockImageComposite(input: any): Promise<any> {
    const { images } = input;
    const baseTime = this.calculateImageProcessingTime(images[0].data, 'composite');
    const processingTime = baseTime * (1 + images.length * 0.3); // More images = more time
    await this.simulateProcessing(processingTime);
    
    return {
      success: true,
      result: {
        data: images[0].data, // In real implementation, would be composite
        inputCount: images.length,
        composition: input.composition,
        format: 'png'
      },
      metadata: {
        processingTime,
        operation: 'composite',
        processedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Calculate realistic processing time based on operation and image characteristics
   */
  private calculateImageProcessingTime(imageData: string, operation: string, params?: any): number {
    // Estimate image size from base64 data length
    const estimatedPixels = imageData.length / 8; // Rough estimate
    
    let baseTime = 50; // Base processing time
    let complexityMultiplier = 1;
    
    // Adjust for image size
    if (estimatedPixels > 2000000) { // Large image (~1920x1080)
      baseTime = 200;
    } else if (estimatedPixels > 500000) { // Medium image (~800x600)
      baseTime = 100;
    }
    
    // Adjust for operation complexity
    switch (operation) {
      case 'resize':
        complexityMultiplier = params?.width > 1024 ? 1.5 : 1.0;
        break;
      case 'convert':
        complexityMultiplier = params === 'avif' ? 2.0 : params === 'webp' ? 1.3 : 1.0;
        break;
      case 'filter':
        complexityMultiplier = 1.2;
        break;
      case 'optimize':
        complexityMultiplier = params === 'size' ? 2.5 : 1.8;
        break;
      case 'composite':
        complexityMultiplier = 1.5;
        break;
    }
    
    // Add realistic variation
    const variation = (Math.random() - 0.5) * 0.4; // ±20% variation
    return Math.max(10, baseTime * complexityMultiplier * (1 + variation));
  }

  /**
   * Generate a simple test image as base64
   */
  private generateTestImageBase64(width: number, height: number): string {
    // Generate a minimal PNG header for testing
    // In a real implementation, this would create actual image data
    const size = width * height;
    return `data:image/png;base64,${Buffer.from(`fake-image-${size}-pixels`).toString('base64')}`;
  }

  /**
   * Simulate processing time
   */
  private async simulateProcessing(timeMs: number): Promise<void> {
    await new Promise(resolve => setTimeout(resolve, timeMs));
  }
}