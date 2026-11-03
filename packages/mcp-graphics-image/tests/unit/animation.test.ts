import { describe, test, expect, beforeAll } from '@jest/globals';
import sharp from 'sharp';
import { ImageErrorCode } from '../../src/types/image';
import { imageConvert } from '../../src/tools/imageConvert';
import { imageResize } from '../../src/tools/imageResize';
import { imageCrop } from '../../src/tools/imageCrop';
import { imageFilter } from '../../src/tools/imageFilter';
import { imageOptimize } from '../../src/tools/imageOptimize';
import { imageComposite } from '../../src/tools/imageComposite';

/** A 3-frame 20x10 animated GIF (red, green, blue) */
async function animatedGif(): Promise<string> {
  const frames = await Promise.all(
    ['#ff0000', '#00ff00', '#0000ff'].map(background =>
      sharp({ create: { width: 20, height: 10, channels: 4, background } }).png().toBuffer()
    )
  );
  const gif = await sharp(frames, { join: { animated: true } }).gif({ delay: [100, 100, 100] }).toBuffer();
  return gif.toString('base64');
}

/** Frame count and per-frame size of encoded output */
async function framesOf(data: string): Promise<{ pages: number; width?: number; height?: number }> {
  const metadata = await sharp(Buffer.from(data, 'base64'), { animated: true }).metadata();
  return { pages: metadata.pages ?? 1, width: metadata.width, height: metadata.pageHeight ?? metadata.height };
}

describe('animated input', () => {
  let gif: string;
  const image = () => ({ data: gif, format: 'gif' as const });

  beforeAll(async () => {
    gif = await animatedGif();
  });

  test('image.convert gif to webp keeps every frame', async () => {
    const result = await imageConvert({ image: image(), format: 'webp' });
    if (!result.success) throw new Error('conversion failed');
    expect(await framesOf(result.result.data)).toEqual({ pages: 3, width: 20, height: 10 });
  });

  test('image.convert to a still format keeps the first frame and warns', async () => {
    const result = await imageConvert({ image: image(), format: 'png' });
    if (!result.success) throw new Error('conversion failed');
    expect(await framesOf(result.result.data)).toEqual({ pages: 1, width: 20, height: 10 });
    expect(result.result.warnings?.[0]).toMatch(/3 frames/);
  });

  test('image.resize scales every frame', async () => {
    const result = await imageResize({ image: image(), dimensions: { width: 10, height: 5 } });
    if (!result.success) throw new Error('resize failed');
    expect(result.result.originalDimensions).toEqual({ width: 20, height: 10 });
    expect(await framesOf(result.result.data)).toEqual({ pages: 3, width: 10, height: 5 });
  });

  test('image.resize rejects enlarging an animation past the pixel limit', async () => {
    const result = await imageResize({
      image: image(),
      dimensions: { width: 8192, height: 4096 },
      allowEnlargement: true
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.code).toBe(ImageErrorCode.MEMORY_EXCEEDED);
    }
  });

  test('image.crop crops every frame within the frame bounds', async () => {
    const result = await imageCrop({ image: image(), bounds: { x: 5, y: 2, width: 10, height: 5 } });
    if (!result.success) throw new Error('crop failed');
    expect(await framesOf(result.result.data)).toEqual({ pages: 3, width: 10, height: 5 });

    const outside = await imageCrop({ image: image(), bounds: { x: 0, y: 15, width: 5, height: 5 } });
    expect(outside.success).toBe(false);
  });

  test('image.filter keeps every frame', async () => {
    const result = await imageFilter({ image: image(), filters: [{ type: 'brightness', intensity: 20 }] });
    if (!result.success) throw new Error('filter failed');
    expect((await framesOf(result.result.data)).pages).toBe(3);
  });

  test('image.optimize keeps every frame', async () => {
    const result = await imageOptimize({ image: image(), options: { target: 'web' } });
    if (!result.success) throw new Error('optimization failed');
    expect((await framesOf(result.result.data)).pages).toBe(3);
  });

  test('image.composite warns that an animated layer uses its first frame', async () => {
    const result = await imageComposite({ config: { width: 20, height: 10, layers: [{ image: image() }] } });
    if (!result.success) throw new Error('composite failed');
    expect(result.result.warnings?.[0]).toMatch(/3 frames/);
  });
});
