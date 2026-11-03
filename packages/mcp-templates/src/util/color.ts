/**
 * The one colour check shared by template validation, variable checking and rendering.
 *
 * Accepts what CSS accepts for hex, rgb[a]() and hsl[a]() (comma or space syntax,
 * decimals, percentages and a `/ alpha`), every CSS named colour, `transparent`,
 * `currentColor`, and the SVG paint keyword `none`. Anything else is rejected, which
 * also keeps values from breaking out of an SVG attribute or a CSS declaration.
 */

const NUMBER = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?`;
const CHANNEL = `${NUMBER}%?`;
const HUE = `${NUMBER}(?:deg|grad|rad|turn)?`;
const PERCENT = `${NUMBER}%?`;

const HEX = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const RGB = new RegExp(
  String.raw`^rgba?\(\s*(?:` +
  String.raw`${CHANNEL}\s*,\s*${CHANNEL}\s*,\s*${CHANNEL}(?:\s*,\s*${CHANNEL})?` +
  String.raw`|${CHANNEL}\s+${CHANNEL}\s+${CHANNEL}(?:\s*/\s*${CHANNEL})?` +
  String.raw`)\s*\)$`,
  'i'
);
const HSL = new RegExp(
  String.raw`^hsla?\(\s*(?:` +
  String.raw`${HUE}\s*,\s*${PERCENT}\s*,\s*${PERCENT}(?:\s*,\s*${CHANNEL})?` +
  String.raw`|${HUE}\s+${PERCENT}\s+${PERCENT}(?:\s*/\s*${CHANNEL})?` +
  String.raw`)\s*\)$`,
  'i'
);

/** CSS Color Module Level 4 named colours */
const NAMED_COLORS = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue', 'darkcyan',
  'darkgoldenrod', 'darkgray', 'darkgreen', 'darkgrey', 'darkkhaki', 'darkmagenta',
  'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon', 'darkseagreen',
  'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise', 'darkviolet', 'deeppink',
  'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick', 'floralwhite', 'forestgreen',
  'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod', 'gray', 'green', 'greenyellow',
  'grey', 'honeydew', 'hotpink', 'indianred', 'indigo', 'ivory', 'khaki', 'lavender',
  'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue', 'lightcoral', 'lightcyan',
  'lightgoldenrodyellow', 'lightgray', 'lightgreen', 'lightgrey', 'lightpink', 'lightsalmon',
  'lightseagreen', 'lightskyblue', 'lightslategray', 'lightslategrey', 'lightsteelblue',
  'lightyellow', 'lime', 'limegreen', 'linen', 'magenta', 'maroon', 'mediumaquamarine',
  'mediumblue', 'mediumorchid', 'mediumpurple', 'mediumseagreen', 'mediumslateblue',
  'mediumspringgreen', 'mediumturquoise', 'mediumvioletred', 'midnightblue', 'mintcream',
  'mistyrose', 'moccasin', 'navajowhite', 'navy', 'oldlace', 'olive', 'olivedrab', 'orange',
  'orangered', 'orchid', 'palegoldenrod', 'palegreen', 'paleturquoise', 'palevioletred',
  'papayawhip', 'peachpuff', 'peru', 'pink', 'plum', 'powderblue', 'purple', 'rebeccapurple',
  'red', 'rosybrown', 'royalblue', 'saddlebrown', 'salmon', 'sandybrown', 'seagreen', 'seashell',
  'sienna', 'silver', 'skyblue', 'slateblue', 'slategray', 'slategrey', 'snow', 'springgreen',
  'steelblue', 'tan', 'teal', 'thistle', 'tomato', 'turquoise', 'violet', 'wheat', 'white',
  'whitesmoke', 'yellow', 'yellowgreen'
]);

const KEYWORDS = new Set(['transparent', 'currentcolor', 'none']);

export function isValidColor(color: string): boolean {
  const value = color.trim();
  const lower = value.toLowerCase();
  return HEX.test(value) || RGB.test(value) || HSL.test(value) || NAMED_COLORS.has(lower) || KEYWORDS.has(lower);
}
