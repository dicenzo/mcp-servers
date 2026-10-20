import { describe, test, expect } from '@jest/globals';
import { ImageUtils } from '../../src/util/imageUtils.js';

describe('ImageUtils', () => {
  describe('validateFileSize', () => {
    test('should pass for valid file size', () => {
      expect(() => ImageUtils.validateFileSize(1024)).not.toThrow();
    });

    test('should throw for oversized files', () => {
      expect(() => ImageUtils.validateFileSize(100 * 1024 * 1024 * 1024)).toThrow();
    });
  });

  describe('createProcessingMetadata', () => {
    test('should create processing metadata with all fields', () => {
      const metadata = ImageUtils.createProcessingMetadata(
        'test-operation',
        100,
        1024,
        512
      );

      expect(metadata.operation).toBe('test-operation');
      expect(metadata.processingTime).toBe(100);
      expect(metadata.inputSize).toBe(1024);
      expect(metadata.outputSize).toBe(512);
      expect(metadata.processedAt).toBeDefined();
    });

    test('should create processing metadata with defaults', () => {
      const metadata = ImageUtils.createProcessingMetadata('test-operation', 50);

      expect(metadata.operation).toBe('test-operation');
      expect(metadata.processingTime).toBe(50);
      expect(metadata.inputSize).toBe(0);
      expect(metadata.outputSize).toBe(0);
      expect(metadata.processedAt).toBeDefined();
    });
  });

  describe('getFormatOptions', () => {
    test('should return PNG options', () => {
      const options = ImageUtils.getFormatOptions('png');
      expect(options).toEqual({
        compressionLevel: 6,
        progressive: true
      });
    });

    test('should return JPEG options', () => {
      const options = ImageUtils.getFormatOptions('jpeg');
      expect(options).toEqual({
        quality: 85,
        progressive: true
      });
    });

    test('should return WebP options', () => {
      const options = ImageUtils.getFormatOptions('webp');
      expect(options).toEqual({
        quality: 85,
        lossless: false
      });
    });

    test('should return AVIF options', () => {
      const options = ImageUtils.getFormatOptions('avif');
      expect(options).toEqual({
        quality: 85,
        lossless: false
      });
    });
  });

  describe('getOptimizationSettings', () => {
    test('should return web optimization settings', () => {
      const settings = ImageUtils.getOptimizationSettings({ target: 'web' });
      expect(settings.quality).toBe(80);
      expect(settings.maxDimension).toBe(1920);
      expect(settings.progressive).toBe(true);
    });

    test('should return mobile optimization settings', () => {
      const settings = ImageUtils.getOptimizationSettings({ target: 'mobile' });
      expect(settings.quality).toBe(75);
      expect(settings.maxDimension).toBe(1080);
      expect(settings.progressive).toBe(true);
    });

    test('should return thumbnail optimization settings', () => {
      const settings = ImageUtils.getOptimizationSettings({ target: 'thumbnail' });
      expect(settings.quality).toBe(70);
      expect(settings.maxDimension).toBe(400);
      expect(settings.progressive).toBe(true);
    });

    test('should return print optimization settings', () => {
      const settings = ImageUtils.getOptimizationSettings({ target: 'print' });
      expect(settings.quality).toBe(95);
      expect(settings.maxDimension).toBeUndefined();
      expect(settings.progressive).toBe(true);
    });

    test('should use custom quality when provided', () => {
      const settings = ImageUtils.getOptimizationSettings({ 
        target: 'web', 
        quality: 90 
      });
      expect(settings.quality).toBe(90);
    });
  });
});
