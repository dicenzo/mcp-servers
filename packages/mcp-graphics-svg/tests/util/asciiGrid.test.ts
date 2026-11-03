import { toCharGrid } from '../../src/util/asciiGrid';
import { executeSvgbobToSvg } from '../../src/tools/svgbobToSvg';
import { executeWireframeToSvg } from '../../src/tools/wireframeToSvg';

const bob = (ascii_art: string) => executeSvgbobToSvg({ ascii_art } as never);
const wireframe = (wireframe_text: string) => executeWireframeToSvg({ wireframe_text, width: 300, height: 100 } as never);

describe('toCharGrid', () => {
  test('splits CRLF, CR and LF line endings the same way', () => {
    expect(toCharGrid('ab\r\ncd\ref\ngh')).toEqual([['a', 'b'], ['c', 'd'], ['e', 'f'], ['g', 'h']]);
  });

  test('expands tabs to the next 8-column tab stop', () => {
    expect(toCharGrid('\tx')[0]).toEqual([...' '.repeat(8), 'x']);
    expect(toCharGrid('abc\tx')[0]).toEqual(['a', 'b', 'c', ...' '.repeat(5), 'x']);
  });

  test('keeps characters outside the BMP in one cell', () => {
    expect(toCharGrid('😀+')[0]).toEqual(['😀', '+']);
  });
});

describe('svgbob.to.svg reads the grid with toCharGrid', () => {
  test('CRLF input gives the same SVG as LF input', async () => {
    expect(await bob('+--+\r\n|  |\r\n+--+')).toBe(await bob('+--+\n|  |\n+--+'));
  });

  test('a tab is indentation, not a glyph', async () => {
    expect(await bob('\t+--+')).toBe(await bob(' '.repeat(8) + '+--+'));
  });

  test('an emoji is drawn as one character', async () => {
    const svg = await bob('😀+--+');
    expect(svg).toContain('>😀</text>');
    expect(svg).not.toContain('�');
    expect(svg).toContain('width="60"');
  });
});

describe('wireframe.to.svg reads the grid with toCharGrid', () => {
  test('a box after an emoji label starts at the right column', async () => {
    const svg = await wireframe('😀 ┌──┐\n  │  │\n  └──┘');
    // ┌ is in column 2 (emoji, space, corner), and characters are 8 px wide
    expect(svg).toMatch(/<rect[^>]*width="32"[^>]*x="16"|<rect[^>]*x="16"[^>]*width="32"/);
  });

  test('a tab-indented box gives the same SVG as a space-indented one', async () => {
    expect(await wireframe('\t┌──┐\n\t│  │\n\t└──┘')).toBe(await wireframe(' '.repeat(8) + '┌──┐\n' + ' '.repeat(8) + '│  │\n' + ' '.repeat(8) + '└──┘'));
  });
});
