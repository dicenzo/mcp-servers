import { SVGValidator } from '../../src/util/validation';

const message = (fn: () => void): string => {
  try {
    fn();
  } catch (error) {
    return JSON.parse((error as Error).message).message;
  }
  return '';
};

describe('validatePathData follows the SVG path grammar', () => {
  test.each([
    'M-5-5L10 10',          // no separator before a minus sign
    'M.5.5L10 10',          // second decimal point starts a new number
    'M1e2 0L10 10',         // exponent
    'M+5 5L10 10',          // explicit plus sign
    'M0 0L10-5L20 0Z',
    'M0 0h10v10H0z',
    'M0 0 10 10 20 0',      // implicit lineto after moveto
    'M10 10a5 5 0 1 0 10 0',
    'M10 10a5 5 0 1010 0',  // compact arc flags
    'M0 0C1 1 2 2 3 3S5 5 6 6Q7 7 8 8T9 9',
    'M0 0Z M5 5 L6 6'
  ])('accepts %s', path => {
    expect(() => SVGValidator.validatePathData(path)).not.toThrow();
  });

  test.each([
    'M0 0 hello <world>',
    'M 0 0 L 1 1"/><script>alert(1)</script>',
    'M0 0 L10',             // missing coordinate
    'M0 0 C1 1 2 2',        // curve needs 6 numbers
    'M0',
    'M0 0 A5 5 0 2 0 10 0', // arc flags must be 0 or 1
    'M0 0 L1 1 Z 5',        // numbers after closepath
    'M0 0 L1..1 2'
  ])('rejects %s', path => {
    expect(message(() => SVGValidator.validatePathData(path))).toBe('Invalid path data - no valid path commands found');
  });
});

describe('validateColor', () => {
  test.each([
    'currentColor', 'currentcolor', 'inherit',
    '#ff000080', '#f008',
    'rgb(255 0 0 / 50%)', 'rgb(100%, 0%, 0%)', 'rgba(0, 0, 0, .5)',
    'hsl(210.5, 50%, 40%)', 'hsl(210 50% 40% / 0.5)', 'hsl(120deg, 100%, 50%)',
    'url(#g)', 'url(#grad-1) red', 'url( #a_b )', 'rebeccapurple'
  ])('accepts %s', color => {
    expect(() => SVGValidator.validateColor(color)).not.toThrow();
  });

  test.each([
    'rgb(999, 999, 999)', 'rgb(256,0,0)', 'rgba(0,0,0,1.5)', 'hsl(0, 101%, 50%)',
    '#ff000', 'url(http://evil.example/x)', 'url(#g) notacolor', 'url(#g', 'red;fill:blue', 'rgb(0 0 0'
  ])('rejects %s', color => {
    expect(message(() => SVGValidator.validateColor(color))).toBe('Invalid color format');
  });
});
