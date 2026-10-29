import { describe, test, expect, afterEach, jest } from '@jest/globals';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { ImageUtils, SHARP_INPUT_OPTIONS } from '../../src/util/imageUtils';
import {
  ImageInputSchema,
  CompositionConfigSchema,
  ImageErrorCode,
  MEMORY_LIMITS
} from '../../src/types/image';
import { imageResize } from '../../src/tools/imageResize';
import { imageConvert } from '../../src/tools/imageConvert';
import { imageCrop } from '../../src/tools/imageCrop';
import { imageFilter } from '../../src/tools/imageFilter';
import { imageOptimize } from '../../src/tools/imageOptimize';
import { imageComposite } from '../../src/tools/imageComposite';

/** 1x1 white PNG */
const tinyPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';

/**
 * Rewrite the IHDR width/height of a PNG (and fix its CRC) so the header
 * claims a huge image while the file itself stays a few dozen bytes.
 */
function forgePngDimensions(base64Png: string, width: number, height: number): string {
  const png = Buffer.from(base64Png, 'base64');
  // Signature (8) + IHDR length (4) + 'IHDR' (4) => width at 16, height at 20
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  // CRC covers chunk type + data: bytes 12..29, stored at 29
  png.writeUInt32BE(crc32(png.subarray(12, 29)), 29);
  return png.toString('base64');
}

async function solidImage(format: 'png' | 'jpeg' | 'avif', size = 4): Promise<string> {
  const buffer = await sharp({
    create: { width: size, height: size, channels: 3, background: '#336699' }
  }).toFormat(format).toBuffer();
  return buffer.toString('base64');
}

describe('Security hardening', () => {
  describe('pixel / decompression bombs', () => {
    test('every sharp input is constructed with an 8192x8192 pixel limit', () => {
      expect(SHARP_INPUT_OPTIONS.limitInputPixels).toBe(
        MEMORY_LIMITS.MAX_DIMENSION * MEMORY_LIMITS.MAX_DIMENSION
      );
    });

    test('rejects a tiny PNG whose header declares 16000x16000 before decoding it', async () => {
      const bomb = forgePngDimensions(tinyPng, 16000, 16000);
      const started = performance.now();

      const result = await imageResize({
        image: { data: bomb, format: 'png' },
        dimensions: { width: 10, height: 10 },
        allowEnlargement: true
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ImageErrorCode.DIMENSION_TOO_LARGE);
      }
      expect(performance.now() - started).toBeLessThan(2000);
    });

    test('rejects an input wider than MAX_DIMENSION even if total pixels are small', async () => {
      const wide = forgePngDimensions(tinyPng, MEMORY_LIMITS.MAX_DIMENSION + 1, 1);
      const result = await imageConvert({ image: { data: wide, format: 'png' }, format: 'jpeg' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ImageErrorCode.DIMENSION_TOO_LARGE);
      }
    });

    test('rejects a pixel bomb used as a composite layer', async () => {
      const bomb = forgePngDimensions(tinyPng, 16000, 16000);
      const result = await imageComposite({
        config: {
          width: 10,
          height: 10,
          layers: [{ image: { data: bomb, format: 'png' }, opacity: 0.5 }]
        }
      });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ImageErrorCode.DIMENSION_TOO_LARGE);
      }
    });
  });

  describe('schema caps', () => {
    test('composition width/height are capped at MAX_DIMENSION', () => {
      const layer = { image: { data: tinyPng, format: 'png' } };
      expect(CompositionConfigSchema.safeParse({ width: 8193, height: 10, layers: [layer] }).success).toBe(false);
      expect(CompositionConfigSchema.safeParse({ width: 10, height: 8193, layers: [layer] }).success).toBe(false);
      expect(CompositionConfigSchema.safeParse({ width: 8192, height: 8192, layers: [layer] }).success).toBe(true);
    });

    test('composition layer count is capped', () => {
      const layer = { image: { data: tinyPng, format: 'png' } };
      const tooMany = Array.from({ length: MEMORY_LIMITS.MAX_COMPOSITE_LAYERS + 1 }, () => layer);
      const maxAllowed = tooMany.slice(1);

      expect(CompositionConfigSchema.safeParse({ width: 10, height: 10, layers: tooMany }).success).toBe(false);
      expect(CompositionConfigSchema.safeParse({ width: 10, height: 10, layers: maxAllowed }).success).toBe(true);
    });

    test('declared image width/height are capped at MAX_DIMENSION', () => {
      expect(ImageInputSchema.safeParse({ data: tinyPng, format: 'png', width: 8193 }).success).toBe(false);
      expect(ImageInputSchema.safeParse({ data: tinyPng, format: 'png', height: 8193 }).success).toBe(false);
    });

    test('base64 input length is capped', () => {
      const oversized = 'A'.repeat(MEMORY_LIMITS.MAX_BASE64_LENGTH + 1);
      expect(ImageInputSchema.safeParse({ data: oversized, format: 'png' }).success).toBe(false);
    });
  });

  describe('format smuggling', () => {
    test('rejects an SVG declared as png', async () => {
      const svg = Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100"/></svg>'
      ).toString('base64');

      const result = await imageConvert({ image: { data: svg, format: 'png' }, format: 'webp' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ImageErrorCode.UNSUPPORTED_FORMAT);
        expect(result.error.message).toContain('svg');
      }
    });

    test('rejects a JPEG declared as png', async () => {
      const jpeg = await solidImage('jpeg');
      const result = await imageConvert({ image: { data: jpeg, format: 'png' }, format: 'webp' });

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(ImageErrorCode.UNSUPPORTED_FORMAT);
      }
    });

    test('treats jpg and jpeg as the same declared format', async () => {
      const jpeg = await solidImage('jpeg');
      const asJpg = await imageConvert({ image: { data: jpeg, format: 'jpg' }, format: 'png' });
      const asJpeg = await imageConvert({ image: { data: jpeg, format: 'jpeg' }, format: 'png' });

      expect(asJpg.success).toBe(true);
      expect(asJpeg.success).toBe(true);
    });

    test('accepts a real AVIF declared as avif', async () => {
      const avif = await solidImage('avif');
      const result = await imageConvert({ image: { data: avif, format: 'avif' }, format: 'png' });

      expect(result.success).toBe(true);
    });
  });

  describe('error responses do not echo raw input', () => {
    const marker = 'SECRET_BASE64_PAYLOAD_SHOULD_NOT_LEAK';
    // A syntactically valid image is not needed: the util call is mocked to fail.
    const image = { data: `${tinyPng}${marker}`, format: 'png' as const };

    afterEach(() => {
      jest.restoreAllMocks();
    });

    const cases: Array<[string, keyof typeof ImageUtils, () => Promise<unknown>]> = [
      ['image.convert', 'convertFormat', () => imageConvert({ image, format: 'jpeg' })],
      ['image.resize', 'resizeImage', () => imageResize({ image, dimensions: { width: 1, height: 1 } })],
      ['image.crop', 'cropImage', () => imageCrop({ image, bounds: { x: 0, y: 0, width: 1, height: 1 } })],
      ['image.filter', 'applyFilters', () => imageFilter({ image, filters: [{ type: 'blur', intensity: 10 }] })],
      ['image.optimize', 'optimizeImage', () => imageOptimize({ image, options: { target: 'web' } })],
      ['image.composite', 'compositeImages', () => imageComposite({ config: { width: 1, height: 1, layers: [{ image }] } })]
    ];

    test.each(cases)('%s omits the input from error details', async (_name, method, run) => {
      // Let crop/resize get past their own pre-flight decode of the input
      jest.spyOn(ImageUtils, 'createSharpFromInput').mockResolvedValue(sharp(Buffer.from(tinyPng, 'base64')));
      jest.spyOn(ImageUtils, method as 'convertFormat').mockRejectedValue(new Error('boom'));

      const result = await run() as { success: boolean; error?: { details?: Record<string, unknown> } };

      expect(result.success).toBe(false);
      expect(JSON.stringify(result)).not.toContain(marker);
      expect(result.error?.details).not.toHaveProperty('input');
    });
  });
});
