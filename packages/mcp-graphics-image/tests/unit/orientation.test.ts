import { describe, test, expect, beforeAll } from '@jest/globals';
import sharp from 'sharp';
import { imageConvert } from '../../src/tools/imageConvert';
import { imageResize } from '../../src/tools/imageResize';
import { imageCrop } from '../../src/tools/imageCrop';

/**
 * A JPEG stored 40x20 with EXIF orientation 6 (rotate 90° clockwise to
 * display), so it displays as 20x40, the way phone cameras save portraits.
 * The stored left half is red, so after orientation the top half is red.
 */
async function rotatedJpeg(): Promise<string> {
  const buffer = await sharp({ create: { width: 40, height: 20, channels: 3, background: '#0000ff' } })
    .composite([{ input: { create: { width: 20, height: 20, channels: 3, background: '#ff0000' } }, left: 0, top: 0 }])
    .jpeg({ quality: 100 })
    .withMetadata({ orientation: 6 })
    .toBuffer();
  return buffer.toString('base64');
}

async function dimensionsOf(data: string): Promise<{ width?: number; height?: number }> {
  const { width, height } = await sharp(Buffer.from(data, 'base64')).metadata();
  return { width, height };
}

describe('EXIF orientation', () => {
  let jpeg: string;

  beforeAll(async () => {
    jpeg = await rotatedJpeg();
  });

  test('image.convert outputs the displayed orientation', async () => {
    const result = await imageConvert({ image: { data: jpeg, format: 'jpeg' }, format: 'png' });
    if (!result.success) throw new Error('conversion failed');
    expect(await dimensionsOf(result.result.data)).toEqual({ width: 20, height: 40 });
  });

  test('image.resize reports and scales the displayed dimensions', async () => {
    const result = await imageResize({
      image: { data: jpeg, format: 'jpeg' },
      dimensions: { width: 10, height: 20 }
    });
    if (!result.success) throw new Error('resize failed');
    expect(result.result.originalDimensions).toEqual({ width: 20, height: 40 });
    expect(await dimensionsOf(result.result.data)).toEqual({ width: 10, height: 20 });
  });

  test('image.crop uses displayed coordinates', async () => {
    const result = await imageCrop({
      image: { data: jpeg, format: 'jpeg' },
      bounds: { x: 0, y: 20, width: 20, height: 20 }
    });
    if (!result.success) throw new Error('crop failed');
    const { dominant } = await sharp(Buffer.from(result.result.data, 'base64')).stats();
    // The displayed bottom half is blue; stored coordinates would be out of bounds
    expect(dominant.b).toBeGreaterThan(200);
    expect(dominant.r).toBeLessThan(60);
  });
});

describe('colour profiles', () => {
  test('a Display P3 input keeps its profile through conversion', async () => {
    const p3 = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ff0000' } })
      .withIccProfile('p3')
      .png()
      .toBuffer();
    const result = await imageConvert({ image: { data: p3.toString('base64'), format: 'png' }, format: 'webp' });
    if (!result.success) throw new Error('conversion failed');
    const { icc } = await sharp(Buffer.from(result.result.data, 'base64')).metadata();
    expect(icc).toBeDefined();
  });
});

describe('CMYK input', () => {
  test('is converted to sRGB rather than kept as CMYK', async () => {
    const cmyk = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#ff0000' } })
      .toColourspace('cmyk')
      .jpeg()
      .toBuffer();
    const result = await imageConvert({ image: { data: cmyk.toString('base64'), format: 'jpeg' }, format: 'tiff' });
    if (!result.success) throw new Error('conversion failed');
    const { space } = await sharp(Buffer.from(result.result.data, 'base64')).metadata();
    expect(space).toBe('srgb');
  });
});
