import { describe, test, expect } from '@jest/globals';
import { ColorUtils } from '../../src/util/colorUtils.js';
import { colorContrast } from '../../src/tools/colorContrast.js';
import { colorValidateAccessibility } from '../../src/tools/colorValidateAccessibility.js';
import { colorLintBrand } from '../../src/tools/colorLintBrand.js';

const parse = (input: Parameters<typeof ColorUtils.parseColorInput>[0]) => ColorUtils.parseColorInput(input);
const ratio = (fg: string | object, bg: string | object) =>
  ColorUtils.calculateContrastRatio(parse(fg as never), parse(bg as never));

describe('hsla and rgba object colours', () => {
  test('hsla objects parse', () => {
    const color = parse({ space: 'hsla', values: [120, 1, 0.5], alpha: 0.5 });
    expect(color.hex).toBe('#00ff00');
    expect(color.alpha).toBe(0.5);
  });

  test('rgba objects parse', () => {
    const color = parse({ space: 'rgba', values: [0, 0, 1], alpha: 0.25 });
    expect(color.hex).toBe('#0000ff');
    expect(color.alpha).toBe(0.25);
  });

  test('a fourth value is read as alpha for rgba and hsla', () => {
    expect(parse({ space: 'rgba', values: [1, 0, 0, 0.5] }).alpha).toBe(0.5);
    expect(parse({ space: 'hsla', values: [0, 1, 0.5, 0.4] }).alpha).toBe(0.4);
  });
});

describe('WCAG thresholds use the unrounded ratio', () => {
  test('calculateContrastRatio is not rounded', () => {
    // #097acc on white is 4.4993:1, which used to round to 4.5
    expect(ratio('#097acc', '#ffffff')).toBeLessThan(4.5);
    expect(ratio('#097acc', '#ffffff')).toBeGreaterThan(4.49);
  });

  test('color.contrast fails AA for 4.4993:1 and displays it truncated, not rounded up', async () => {
    const result = await colorContrast({ foreground: '#097acc', background: '#ffffff' });
    if (!result.success) throw new Error('contrast failed');
    expect(result.result.score.AA.normal).toBe(false);
    expect(result.result.ratio).toBe(4.49);
  });

  test('color.validateAccessibility fails AA normal for 4.4975:1', async () => {
    const result = await colorValidateAccessibility({
      colors: ['#028580', '#ffffff'],
      contexts: [{ name: 'body', foreground: 0, background: 1, textSize: 'normal', level: 'AA' }]
    });
    if (!result.success) throw new Error('validation failed');
    expect(result.result.overallPassed).toBe(false);
  });

  test('color.lintBrand flags a 4.499:1 pair against minContrast 4.5', async () => {
    const result = await colorLintBrand({
      palette: ['#7171ad', '#ffffff'],
      rules: { minContrast: 4.5 }
    });
    if (!result.success) throw new Error('lint failed');
    const contrastIssues = result.result.issues.filter(issue => issue.type === 'contrast');
    expect(contrastIssues.length).toBeGreaterThan(0);
  });
});

describe('contrast of translucent and out-of-gamut colours', () => {
  test('a translucent foreground is composited over the background', () => {
    // 30% black over white is about #b3b3b3, roughly 2.1:1
    expect(ratio('#0000004d', '#ffffff')).toBeLessThan(2.5);
    expect(ratio('transparent', '#ffffff')).toBeCloseTo(1, 5);
  });

  test('out-of-gamut colours are measured as the hex they are returned as', () => {
    const vivid = { space: 'oklch', values: [1, 0.4, 140] };
    const measured = ratio(vivid, '#000000');
    expect(measured).toBeLessThanOrEqual(21);
    expect(measured).toBeCloseTo(ratio(parse(vivid as never).hex as string, '#000000'), 5);
  });
});

describe('APCA', () => {
  test('ColorUtils.calculateAPCAContrast matches the APCA reference', () => {
    // apca-w3 reference: #777 text on white is Lc 71.1; white text on #777 is about -73
    expect(ColorUtils.calculateAPCAContrast(parse('#777777'), parse('#ffffff'))).toBeCloseTo(71.1, 0);
    expect(ColorUtils.calculateAPCAContrast(parse('#ffffff'), parse('#777777'))).toBeLessThan(-70);
  });

  test('color.contrast with algorithm apca reports the APCA Lc value', async () => {
    const result = await colorContrast({ foreground: '#777777', background: '#ffffff', algorithm: 'apca' });
    if (!result.success) throw new Error('contrast failed');
    expect(result.result.apca?.lc).toBeCloseTo(71.1, 0);
    expect(result.result.apca?.polarity).toBe('dark-on-light');
  });

  test('color.validateAccessibility uses real APCA', async () => {
    const result = await colorValidateAccessibility({
      colors: ['#000000', '#777777'],
      contexts: [{ name: 'body', foreground: 0, background: 1 }],
      includeAPCA: true
    });
    if (!result.success) throw new Error('validation failed');
    const apca = result.result.validations[0]?.apca;
    // Black on #777 is about Lc 38 (the old luminance difference gave 18)
    expect(apca?.score).toBeGreaterThan(30);
    expect(apca?.score).toBeLessThan(45);
  });
});
