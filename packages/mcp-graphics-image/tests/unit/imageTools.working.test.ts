import { imageResize } from '../../src/tools/imageResize';
import { imageConvert } from '../../src/tools/imageConvert';
import { imageFilter } from '../../src/tools/imageFilter';
import { imageOptimize } from '../../src/tools/imageOptimize';
import { imageCrop } from '../../src/tools/imageCrop';
import { imageComposite } from '../../src/tools/imageComposite';
import { describe, test, expect, it } from '@jest/globals';

describe('Image Processing Tools - Working Tests', () => {
  // Test image data (1x1 white PNG)
  const testPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
  const testInput = { data: testPng, format: 'png' as const };

  describe('imageResize', () => {
    it('should resize image successfully', async () => {
      const result = await imageResize({
        image: testInput,
        dimensions: { width: 10, height: 10 },
        allowEnlargement: true
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.dimensions.width).toBe(10);
        expect(result.result.dimensions.height).toBe(10);
        expect(result.metadata.operation).toContain('resize');
      }
    });

    it('should reject invalid dimensions', async () => {
      const result = await imageResize({
        image: testInput,
        dimensions: { width: -1, height: 10 }
      });

      expect(result.success).toBe(false);
    });
  });

  describe('imageConvert', () => {
    it('should convert to different formats', async () => {
      const result = await imageConvert({
        image: testInput,
        format: 'jpeg'
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.format).toBe('jpeg');
        expect(typeof result.result.data).toBe('string');
      }
    });
  });

  describe('imageFilter', () => {
    it('should apply single filter', async () => {
      const result = await imageFilter({
        image: testInput,
        filters: [{ type: 'brightness', intensity: 10 }]
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result as any).result.appliedFilters).toHaveLength(1);
        expect((result as any).result.appliedFilters[0]?.type).toBe('brightness');
        expect((result as any).result.processingMetadata).toBeTruthy();
      }
    });

    it('should reject invalid filter intensity', async () => {
      const result = await imageFilter({
        image: testInput,
        filters: [{ type: 'brightness', intensity: 150 }] // > 100
      });

      expect(result.success).toBe(false);
    });
  });

  describe('imageOptimize', () => {
    it('should optimize image', async () => {
      const result = await imageOptimize({
        image: testInput,
        options: { target: 'web' }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect((result as any).result.processingMetadata?.operation).toContain('optimize');
        expect((result as any).result.optimizationTarget).toBe('web');
      }
    });

    it('should handle different optimization targets', async () => {
      const targets = ['web', 'print', 'mobile', 'thumbnail'] as const;
      
      for (const target of targets) {
        const result = await imageOptimize({
          image: testInput,
          options: { target }
        });
        
        expect(result.success).toBe(true);
        if (result.success) {
          expect((result as any).result.optimizationTarget).toBe(target);
        }
      }
    });
  });

  describe('imageCrop', () => {
    it('should crop image successfully', async () => {
      // Create larger test image for cropping
      // Valid 10x10 red PNG (the previous fixture had a truncated IDAT that libpng rejects)
      const largerImg = 'iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAFklEQVQYlWP4z8DwnxjMMKrwP12DBwCSw8c5bHZncwAAAABJRU5ErkJggg==';
      
      const result = await imageCrop({
        image: { data: largerImg, format: 'png' },
        bounds: { x: 1, y: 1, width: 5, height: 5 }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result.dimensions.width).toBe(5);
        expect(result.result.dimensions.height).toBe(5);
        expect(result.metadata.operation).toContain('crop');
      }
    });

    it('should reject invalid crop bounds', async () => {
      const result = await imageCrop({
        image: testInput,
        bounds: { x: -1, y: 0, width: 5, height: 5 }
      });

      expect(result.success).toBe(false);
    });
  });

  describe('imageComposite', () => {
    it('should composite with the normal blend mode', async () => {
      const result = await imageComposite({
        config: {
          width: 10,
          height: 10,
          layers: [{
            image: testInput,
            x: 0,
            y: 0,
            blend: 'normal',
            opacity: 0.8
          }]
        }
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.result?.layerCount).toBe(1);
        expect(result.result?.processingMetadata).toBeTruthy();
      }
    });

    it('should composite when blend is omitted (defaults to normal)', async () => {
      const result = await imageComposite({
        config: {
          width: 10,
          height: 10,
          layers: [{ image: testInput, x: 0, y: 0 }]
        }
      });

      expect(result.success).toBe(true);
    });

    it('should composite with a non-default blend mode', async () => {
      const result = await imageComposite({
        config: {
          width: 10,
          height: 10,
          layers: [{ image: testInput, x: 0, y: 0, blend: 'multiply' }]
        }
      });

      expect(result.success).toBe(true);
    });
  });
});