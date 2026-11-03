import { describe, test, expect, beforeAll } from '@jest/globals';
import sharp from 'sharp';
import { imageConvert } from '../../src/tools/imageConvert';
import { imageOptimize } from '../../src/tools/imageOptimize';

/** A noisy photo-like JPEG, so encoder quality visibly changes the file size */
async function noisyJpeg(width: number, height: number): Promise<string> {
  const pixels = Buffer.alloc(width * height * 3);
  for (let i = 0; i < pixels.length; i++) {
    pixels[i] = (i * 2654435761) % 251;
  }
  const buffer = await sharp(pixels, { raw: { width, height, channels: 3 } }).jpeg({ quality: 95 }).toBuffer();
  return buffer.toString('base64');
}

function decodedSize(data: string): number {
  return Buffer.from(data, 'base64').length;
}

describe('encoder quality', () => {
  let jpeg: string;

  beforeAll(async () => {
    jpeg = await noisyJpeg(200, 150);
  });

  test.each(['jpeg', 'webp', 'avif'] as const)('image.convert to %s honours quality', async (format) => {
    const low = await imageConvert({ image: { data: jpeg, format: 'jpeg' }, format, quality: 10 });
    const high = await imageConvert({ image: { data: jpeg, format: 'jpeg' }, format, quality: 100 });
    if (!low.success || !high.success) throw new Error('conversion failed');
    expect(decodedSize(low.result.data)).toBeLessThan(decodedSize(high.result.data));
  });

  test('image.optimize honours options.quality', async () => {
    const low = await imageOptimize({ image: { data: jpeg, format: 'jpeg' }, options: { target: 'web', quality: 10 } });
    const high = await imageOptimize({ image: { data: jpeg, format: 'jpeg' }, options: { target: 'web', quality: 100 } });
    if (!low.success || !high.success) throw new Error('optimization failed');
    expect(decodedSize(low.result.data)).toBeLessThan(decodedSize(high.result.data));
  });

  test('image.optimize maxFileSize lowers quality and keeps the target resize', async () => {
    const large = await noisyJpeg(1200, 800);
    const unconstrained = await imageOptimize({ image: { data: large, format: 'jpeg' }, options: { target: 'thumbnail' } });
    if (!unconstrained.success) throw new Error('optimization failed');
    const limit = Math.floor(decodedSize(unconstrained.result.data) * 0.6);

    const result = await imageOptimize({ image: { data: large, format: 'jpeg' }, options: { target: 'thumbnail', maxFileSize: limit } });
    if (!result.success) throw new Error('optimization failed');
    expect(decodedSize(result.result.data)).toBeLessThanOrEqual(limit);
    const { width } = await sharp(Buffer.from(result.result.data, 'base64')).metadata();
    expect(width).toBe(400);
  });
});
