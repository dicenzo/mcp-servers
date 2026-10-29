#!/usr/bin/env node

import sharp from 'sharp';
import {
  ImageInput,
  ImageOutput,
  ImageMetadata,
  ProcessingMetadata,
  ImageFormat,
  Dimensions,
  Rectangle,
  FilterConfig,
  OptimizationOptions,
  CompositionConfig,
  ResizeMethod,
  ImageErrorCode,
  DEFAULT_PROCESSING_CONTEXT,
  PERFORMANCE_THRESHOLDS,
  MEMORY_LIMITS,
  validateImageInput,
  validateDimensions,
  validateRectangle,
  validateFilterConfig,
  validateOptimizationOptions,
  validateCompositionConfig
} from '../types/image.js';

/**
 * ImageUtils - Comprehensive utility class for image processing operations
 * Built on Sharp library for high-performance image manipulation
 * 
 * Following the established patterns from ColorUtils in mcp-color server
 */
export class ImageUtils {
  
  /**
   * Validate file size against limits
   */
  static validateFileSize(sizeBytes: number): void {
    if (sizeBytes > MEMORY_LIMITS.MAX_IMAGE_SIZE) {
      throw new Error(`File size ${sizeBytes} exceeds maximum allowed size of ${MEMORY_LIMITS.MAX_IMAGE_SIZE} bytes`);
    }
  }

  /**
   * Convert Sharp instance to base64 string
   */
  static async sharpToBase64(sharpInstance: sharp.Sharp, format: string = 'png'): Promise<string> {
    const buffer = await sharpInstance.toFormat(format as keyof sharp.FormatEnum).toBuffer();
    return buffer.toString('base64');
  }

  /**
   * Create processing metadata
   */
  static createProcessingMetadata(
    operation: string,
    processingTime: number,
    inputSize: number = 0,
    outputSize: number = 0,
    additionalMetadata: Record<string, any> = {}
  ): ProcessingMetadata {
    return {
      operation,
      processingTime,
      inputSize,
      outputSize,
      processedAt: new Date().toISOString(),
      ...additionalMetadata
    };
  }

  /**
   * Parse and validate image input data
   */
  static parseImageInput(input: unknown): ImageInput {
    try {
      return validateImageInput(input);
    } catch (error) {
      throw new Error(JSON.stringify({
        code: ImageErrorCode.INVALID_INPUT,
        message: 'Invalid image input format',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        suggestions: [
          'Ensure image data is base64 encoded',
          'Verify format is one of: png, jpeg, jpg, webp, avif, gif, tiff, bmp',
          'Check that data field is not empty'
        ]
      }));
    }
  }

  /**
   * Extract metadata from Sharp instance
   */
  static async extractMetadata(sharpInstance: sharp.Sharp): Promise<ImageMetadata> {
    try {
      const metadata = await sharpInstance.metadata();
      
      return {
        width: metadata.width || 0,
        height: metadata.height || 0,
        format: (metadata.format as ImageFormat) || 'png',
        channels: metadata.channels || 3,
        hasAlpha: metadata.hasAlpha || false,
        density: metadata.density || undefined,
        colorspace: metadata.space || undefined,
        compression: metadata.compression || undefined,
        quality: undefined, // Sharp doesn't provide quality in metadata
        exif: metadata.exif ? JSON.parse(metadata.exif.toString()) : undefined
      };
    } catch (error) {
      throw new Error(JSON.stringify({
        code: ImageErrorCode.PROCESSING_FAILED,
        message: 'Failed to extract image metadata',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }));
    }
  }

  /**
   * Create Sharp instance from base64 image data
   */
  static createSharpFromInput(imageInput: ImageInput): sharp.Sharp {
    try {
      // Remove data URL prefix if present
      const base64Data = imageInput.data.replace(/^data:image\/[a-z]+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      
      // Validate file size
      if (buffer.length > MEMORY_LIMITS.MAX_IMAGE_SIZE) {
        throw new Error(JSON.stringify({
          code: ImageErrorCode.FILE_TOO_LARGE,
          message: `Image file too large: ${buffer.length} bytes (max: ${MEMORY_LIMITS.MAX_IMAGE_SIZE} bytes)`,
          suggestions: ['Reduce image file size before processing']
        }));
      }
      
      return sharp(buffer);
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        throw error; // Re-throw structured errors
      }
      throw new Error(JSON.stringify({
        code: ImageErrorCode.DECODE_ERROR,
        message: 'Failed to decode image data',
        details: { error: error instanceof Error ? error.message : 'Unknown error' },
        suggestions: [
          'Verify image data is properly base64 encoded',
          'Check that the image format matches the specified format',
          'Ensure image file is not corrupted'
        ]
      }));
    }
  }

  /**
   * Convert Sharp instance to base64 output
   */
  static async sharpToOutput(
    sharpInstance: sharp.Sharp,
    format: ImageFormat,
    operation: string,
    startTime: number,
    inputSize: number
  ): Promise<ImageOutput> {
    try {
      // Apply format-specific options
      const formatOptions = ImageUtils.getFormatOptions(format);
      const outputSharp = sharpInstance.toFormat(format as any, formatOptions);
      
      // Generate output buffer
      const outputBuffer = await outputSharp.toBuffer();
      const base64Data = outputBuffer.toString('base64');
      
      // Extract metadata
      const metadata = await ImageUtils.extractMetadata(sharp(outputBuffer));
      
      // Calculate processing metrics
      const endTime = performance.now();
      const processingTime = Math.round((endTime - startTime) * 100) / 100;
      
      const processingMetadata: ProcessingMetadata = {
        processingTime,
        operation,
        inputSize,
        outputSize: outputBuffer.length,
        optimizationRatio: inputSize > 0 ? outputBuffer.length / inputSize : 1,
        processedAt: new Date().toISOString()
      };

      return {
        data: base64Data,
        format,
        dimensions: {
          width: metadata.width,
          height: metadata.height
        },
        metadata: {
          ...metadata,
          fileSize: outputBuffer.length
        },
        processingMetadata
      };
    } catch (error) {
      throw new Error(JSON.stringify({
        code: ImageErrorCode.ENCODE_ERROR,
        message: 'Failed to encode output image',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }));
    }
  }

  /**
   * Get format-specific options for Sharp
   */
  static getFormatOptions(format: ImageFormat): Record<string, any> {
    switch (format) {
      case 'jpeg':
      case 'jpg':
        return { quality: DEFAULT_PROCESSING_CONTEXT.quality, progressive: true };
      case 'png':
        return { compressionLevel: 6, progressive: true };
      case 'webp':
        return { quality: DEFAULT_PROCESSING_CONTEXT.quality, lossless: false };
      case 'avif':
        return { quality: DEFAULT_PROCESSING_CONTEXT.quality, lossless: false };
      case 'tiff':
        return { quality: DEFAULT_PROCESSING_CONTEXT.quality, compression: 'lzw' };
      default:
        return {};
    }
  }

  /**
   * Convert image format
   */
  static async convertFormat(
    imageInput: ImageInput,
    targetFormat: ImageFormat,
    quality?: number
  ): Promise<ImageOutput> {
    const startTime = performance.now();
    
    try {
      const parsedInput = ImageUtils.parseImageInput(imageInput);
      const sharpInstance = ImageUtils.createSharpFromInput(parsedInput);
      
      // Apply quality if specified
      if (quality !== undefined) {
        const formatOptions = { ...ImageUtils.getFormatOptions(targetFormat), quality };
        sharpInstance.toFormat(targetFormat as any, formatOptions);
      }
      
      const base64Data = parsedInput.data.replace(/^data:image\/[a-z]+;base64,/, '');
      const inputSize = Buffer.from(base64Data, 'base64').length;
      
      const result = await ImageUtils.sharpToOutput(
        sharpInstance,
        targetFormat,
        `convert_to_${targetFormat}`,
        startTime,
        inputSize
      );

      // Validate performance
      if (result.processingMetadata.processingTime > PERFORMANCE_THRESHOLDS.FORMAT_CONVERSION) {
        console.warn(`Format conversion exceeded target: ${result.processingMetadata.processingTime}ms > ${PERFORMANCE_THRESHOLDS.FORMAT_CONVERSION}ms`);
      }

      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        throw error; // Re-throw structured errors
      }
      throw new Error(JSON.stringify({
        code: ImageErrorCode.PROCESSING_FAILED,
        message: 'Format conversion failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }));
    }
  }

  /**
   * Resize Sharp instance (for testing)
   */
  static async resizeImage(
    sharpInstance: sharp.Sharp,
    dimensions: Dimensions,
    method?: ResizeMethod
  ): Promise<sharp.Sharp>;
  
  /**
   * Resize image with quality preservation
   */
  static async resizeImage(
    imageInput: ImageInput,
    dimensions: Dimensions,
    method?: ResizeMethod,
    preserveAspectRatio?: boolean
  ): Promise<ImageOutput>;
  
  static async resizeImage(
    imageInputOrSharp: ImageInput | sharp.Sharp,
    dimensions: Dimensions,
    method: ResizeMethod = 'lanczos',
    preserveAspectRatio: boolean = true
  ): Promise<ImageOutput | sharp.Sharp> {
    const startTime = performance.now();
    
    try {
      // Check if input is a Sharp instance (for testing overload)
      const isSharpInstance = imageInputOrSharp && typeof imageInputOrSharp === 'object' && 'metadata' in imageInputOrSharp;
      
      let sharpInstance: sharp.Sharp;
      if (isSharpInstance) {
        sharpInstance = imageInputOrSharp as sharp.Sharp;
      } else {
        const parsedInput = ImageUtils.parseImageInput(imageInputOrSharp as ImageInput);
        sharpInstance = ImageUtils.createSharpFromInput(parsedInput);
      }
      
      const validDimensions = validateDimensions(dimensions);
      
      // Map resize method to Sharp kernel
      const kernelMap: Record<ResizeMethod, keyof sharp.KernelEnum> = {
        nearest: 'nearest',
        linear: 'cubic', // Sharp doesn't have linear, use cubic
        cubic: 'cubic',
        lanczos: 'lanczos3',
        mitchell: 'mitchell'
      };
      
      const resizeOptions: sharp.ResizeOptions = {
        width: validDimensions.width,
        height: validDimensions.height,
        kernel: kernelMap[method],
        fit: preserveAspectRatio ? 'inside' : 'fill',
        withoutEnlargement: false
      };
      
      sharpInstance.resize(resizeOptions);
      
      // If Sharp instance input, return Sharp instance
      if (isSharpInstance) {
        return sharpInstance;
      }
      
      // Otherwise return full ImageOutput
      const parsedInput = imageInputOrSharp as ImageInput;
      const base64Data = parsedInput.data.replace(/^data:image\/[a-z]+;base64,/, '');
      const inputSize = Buffer.from(base64Data, 'base64').length;
      
      const result = await ImageUtils.sharpToOutput(
        sharpInstance,
        parsedInput.format,
        `resize_${validDimensions.width}x${validDimensions.height}_${method}`,
        startTime,
        inputSize
      );

      // Validate performance
      if (result.processingMetadata.processingTime > PERFORMANCE_THRESHOLDS.RESIZE_OPERATION) {
        console.warn(`Resize operation exceeded target: ${result.processingMetadata.processingTime}ms > ${PERFORMANCE_THRESHOLDS.RESIZE_OPERATION}ms`);
      }

      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        throw error;
      }
      throw new Error(JSON.stringify({
        code: ImageErrorCode.PROCESSING_FAILED,
        message: 'Image resize failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }));
    }
  }

  /**
   * Crop Sharp instance (for testing)
   */
  static async cropImage(
    sharpInstance: sharp.Sharp,
    bounds: Rectangle
  ): Promise<sharp.Sharp>;
  
  /**
   * Crop image to specified rectangle
   */
  static async cropImage(
    imageInput: ImageInput,
    bounds: Rectangle
  ): Promise<ImageOutput>;
  
  static async cropImage(
    imageInputOrSharp: ImageInput | sharp.Sharp,
    bounds: Rectangle
  ): Promise<ImageOutput | sharp.Sharp> {
    const startTime = performance.now();
    
    try {
      // Check if input is a Sharp instance (for testing overload)
      const isSharpInstance = imageInputOrSharp && typeof imageInputOrSharp === 'object' && 'metadata' in imageInputOrSharp;
      
      let sharpInstance: sharp.Sharp;
      if (isSharpInstance) {
        sharpInstance = imageInputOrSharp as sharp.Sharp;
      } else {
        const parsedInput = ImageUtils.parseImageInput(imageInputOrSharp as ImageInput);
        sharpInstance = ImageUtils.createSharpFromInput(parsedInput);
      }
      
      const validBounds = validateRectangle(bounds);
      
      // Validate crop bounds against image dimensions
      const metadata = await sharpInstance.metadata();
      if (!metadata.width || !metadata.height) {
        throw new Error('Unable to determine image dimensions');
      }
      
      if (validBounds.x + validBounds.width > metadata.width ||
          validBounds.y + validBounds.height > metadata.height) {
        throw new Error('Crop bounds exceed image dimensions');
      }
      
      sharpInstance.extract({
        left: validBounds.x,
        top: validBounds.y,
        width: validBounds.width,
        height: validBounds.height
      });
      
      // If Sharp instance input, return Sharp instance
      if (isSharpInstance) {
        return sharpInstance;
      }
      
      // Otherwise return full ImageOutput
      const parsedInput = imageInputOrSharp as ImageInput;
      const base64Data = parsedInput.data.replace(/^data:image\/[a-z]+;base64,/, '');
      const inputSize = Buffer.from(base64Data, 'base64').length;
      
      const result = await ImageUtils.sharpToOutput(
        sharpInstance,
        parsedInput.format,
        `crop_${validBounds.x},${validBounds.y}_${validBounds.width}x${validBounds.height}`,
        startTime,
        inputSize
      );

      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        throw error;
      }
      throw new Error(JSON.stringify({
        code: ImageErrorCode.PROCESSING_FAILED,
        message: 'Image crop failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }));
    }
  }

  /**
   * Apply filters to image
   */
  static async applyFilters(
    imageInput: ImageInput,
    filters: FilterConfig[]
  ): Promise<ImageOutput> {
    const startTime = performance.now();
    
    try {
      const parsedInput = ImageUtils.parseImageInput(imageInput);
      let sharpInstance = ImageUtils.createSharpFromInput(parsedInput);
      
      // Apply each filter in sequence
      for (const filter of filters) {
        const validFilter = validateFilterConfig(filter);
        sharpInstance = ImageUtils.applyFilter(sharpInstance, validFilter);
      }
      
      const base64Data = parsedInput.data.replace(/^data:image\/[a-z]+;base64,/, '');
      const inputSize = Buffer.from(base64Data, 'base64').length;
      
      const filterNames = filters.map(f => f.type).join(',');
      const result = await ImageUtils.sharpToOutput(
        sharpInstance,
        parsedInput.format,
        `filter_${filterNames}`,
        startTime,
        inputSize
      );

      // Validate performance
      if (result.processingMetadata.processingTime > PERFORMANCE_THRESHOLDS.FILTER_APPLICATION) {
        console.warn(`Filter application exceeded target: ${result.processingMetadata.processingTime}ms > ${PERFORMANCE_THRESHOLDS.FILTER_APPLICATION}ms`);
      }

      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        throw error;
      }
      throw new Error(JSON.stringify({
        code: ImageErrorCode.INVALID_FILTER_PARAMS,
        message: 'Filter application failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }));
    }
  }

  /**
   * Apply single filter to Sharp instance
   */
  static applyFilter(sharpInstance: sharp.Sharp, filter: FilterConfig): sharp.Sharp {
    const intensity = filter.intensity / 100; // Convert to 0-1 range
    
    switch (filter.type) {
      case 'blur':
        return sharpInstance.blur(Math.max(0.3, filter.radius || Math.abs(intensity * 10)));
      case 'sharpen':
        return sharpInstance.sharpen(
          filter.radius || Math.abs(intensity * 3),
          1,
          2
        );
      case 'brightness':
        return sharpInstance.modulate({ brightness: 1 + intensity });
      case 'contrast':
        return sharpInstance.linear(1 + intensity, -(128 * intensity));
      case 'saturation':
        return sharpInstance.modulate({ saturation: 1 + intensity });
      case 'hue':
        return sharpInstance.modulate({ hue: intensity * 360 });
      case 'gamma':
        return sharpInstance.gamma(1 + intensity);
      case 'exposure':
        return sharpInstance.linear(Math.pow(2, intensity), 0);
      default:
        throw new Error(`Unsupported filter type: ${filter.type}`);
    }
  }

  /**
   * Optimize image for web delivery
   */
  static async optimizeImage(
    imageInput: ImageInput,
    options: OptimizationOptions
  ): Promise<ImageOutput> {
    const startTime = performance.now();
    
    try {
      const parsedInput = ImageUtils.parseImageInput(imageInput);
      const validOptions = validateOptimizationOptions(options);
      let sharpInstance = ImageUtils.createSharpFromInput(parsedInput);
      
      // Apply target-specific optimizations
      const optimizationSettings = ImageUtils.getOptimizationSettings(validOptions);
      
      // Apply quality settings
      if (optimizationSettings.quality !== undefined) {
        const formatOptions = { 
          ...ImageUtils.getFormatOptions(parsedInput.format), 
          quality: optimizationSettings.quality,
          progressive: optimizationSettings.progressive
        };
        sharpInstance = sharpInstance.toFormat(parsedInput.format as any, formatOptions);
      }
      
      // Apply size constraints if specified
      if (optimizationSettings.maxDimension) {
        sharpInstance = sharpInstance.resize({
          width: optimizationSettings.maxDimension,
          height: optimizationSettings.maxDimension,
          fit: 'inside',
          withoutEnlargement: true
        });
      }
      
      const base64Data = parsedInput.data.replace(/^data:image\/[a-z]+;base64,/, '');
      const inputSize = Buffer.from(base64Data, 'base64').length;
      
      let result = await ImageUtils.sharpToOutput(
        sharpInstance,
        parsedInput.format,
        `optimize_${validOptions.target}`,
        startTime,
        inputSize
      );

      // Enforce file size limit if specified
      if (validOptions.maxFileSize && result.metadata.fileSize! > validOptions.maxFileSize) {
        result = await ImageUtils.optimizeToFileSize(parsedInput, validOptions.maxFileSize, startTime, inputSize);
      }

      // Validate performance
      if (result.processingMetadata.processingTime > PERFORMANCE_THRESHOLDS.OPTIMIZATION) {
        console.warn(`Optimization exceeded target: ${result.processingMetadata.processingTime}ms > ${PERFORMANCE_THRESHOLDS.OPTIMIZATION}ms`);
      }

      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        throw error;
      }
      throw new Error(JSON.stringify({
        code: ImageErrorCode.OPTIMIZATION_FAILED,
        message: 'Image optimization failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }));
    }
  }

  /**
   * Get optimization settings based on target
   */
  static getOptimizationSettings(options: OptimizationOptions) {
    const settings = {
      quality: options.quality,
      progressive: true,
      maxDimension: undefined as number | undefined
    };

    switch (options.target) {
      case 'web':
        settings.quality = options.quality || 80;
        settings.maxDimension = 1920;
        break;
      case 'mobile':
        settings.quality = options.quality || 75;
        settings.maxDimension = 1080;
        break;
      case 'thumbnail':
        settings.quality = options.quality || 70;
        settings.maxDimension = 400;
        break;
      case 'print':
        settings.quality = options.quality || 95;
        break;
    }

    return settings;
  }

  /**
   * Optimize image to specific file size
   */
  static async optimizeToFileSize(
    imageInput: ImageInput,
    maxFileSize: number,
    startTime: number,
    inputSize: number
  ): Promise<ImageOutput> {
    let quality = 80;
    let result: ImageOutput;
    
    do {
      const sharpInstance = ImageUtils.createSharpFromInput(imageInput);
      const formatOptions = { 
        ...ImageUtils.getFormatOptions(imageInput.format), 
        quality 
      };
      
      sharpInstance.toFormat(imageInput.format as any, formatOptions);
      result = await ImageUtils.sharpToOutput(sharpInstance, imageInput.format, 'optimize_filesize', startTime, inputSize);
      quality -= 10;
    } while (result.metadata.fileSize! > maxFileSize && quality > 10);
    
    return result;
  }

  /**
   * Composite multiple images
   */
  static async compositeImages(config: CompositionConfig): Promise<ImageOutput> {
    const startTime = performance.now();
    
    try {
      const validConfig = validateCompositionConfig(config);
      
      // Create base canvas
      let baseSharp = sharp({
        create: {
          width: validConfig.width,
          height: validConfig.height,
          channels: 4,
          background: validConfig.background || 'transparent'
        }
      });

      // Prepare composite operations
      const compositeOps: sharp.OverlayOptions[] = [];
      let totalInputSize = 0;

      for (const layer of validConfig.layers) {
        const layerSharp = ImageUtils.createSharpFromInput(layer.image);
        
        // Calculate input size
        const base64Data = layer.image.data.replace(/^data:image\/[a-z]+;base64,/, '');
        totalInputSize += Buffer.from(base64Data, 'base64').length;
        
        // Apply opacity if needed
        let layerBuffer;
        if (layer.opacity < 1) {
          layerBuffer = await layerSharp
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });
          
          // Apply opacity to alpha channel (simplified implementation)
          const { data, info } = layerBuffer;
          if (data && info && info.width && info.height) {
            for (let i = 3; i < data.length; i += 4) {
              data[i] = Math.round((data[i] || 0) * layer.opacity);
            }
            
            layerBuffer = await sharp(data, { 
              raw: { width: info.width, height: info.height, channels: 4 } 
            }).png().toBuffer();
          } else {
            layerBuffer = await layerSharp.toBuffer();
          }
        } else {
          layerBuffer = await layerSharp.toBuffer();
        }

        compositeOps.push({
          input: layerBuffer,
          left: layer.x,
          top: layer.y,
          blend: layer.blend as any
        });
      }

      // Apply all composite operations
      baseSharp = baseSharp.composite(compositeOps);
      
      const result = await ImageUtils.sharpToOutput(
        baseSharp,
        'png', // Default to PNG for composites to preserve transparency
        `composite_${validConfig.layers.length}_layers`,
        startTime,
        totalInputSize
      );

      // Validate performance
      if (result.processingMetadata.processingTime > PERFORMANCE_THRESHOLDS.COMPOSITE) {
        console.warn(`Composite operation exceeded target: ${result.processingMetadata.processingTime}ms > ${PERFORMANCE_THRESHOLDS.COMPOSITE}ms`);
      }

      return result;
    } catch (error) {
      if (error instanceof Error && error.message.includes('JSON')) {
        throw error;
      }
      throw new Error(JSON.stringify({
        code: ImageErrorCode.COMPOSITE_FAILED,
        message: 'Image composition failed',
        details: { error: error instanceof Error ? error.message : 'Unknown error' }
      }));
    }
  }
}