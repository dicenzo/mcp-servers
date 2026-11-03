import { z } from 'zod';
import { JSDOM } from 'jsdom';
import { SVGError, SVGErrorCode } from '../types/svg.js';

/** Elements that can run script or embed active foreign content */
const ACTIVE_ELEMENTS = new Set(['script', 'foreignobject', 'iframe', 'embed', 'object', 'handler']);

/** Animation elements whose `attributeName` can retarget event handlers or links */
const ANIMATION_ELEMENTS = new Set(['set', 'animate', 'animatetransform', 'animatemotion', 'animatecolor']);

const NODE_ELEMENT = 1;
const NODE_PROCESSING_INSTRUCTION = 7;

type DOMNode = JSDOM['window']['Node']['prototype'];
type DOMElement = JSDOM['window']['Element']['prototype'];

/**
 * Zod 3's name for the type of a value, as used in its `received` field.
 * Zod 4 issues carry only the raw input (with `reportInput`), so this keeps
 * error details reporting a type name, never the value itself.
 */
function receivedType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  if (typeof value === 'number' && Number.isNaN(value)) return 'nan';
  return typeof value;
}

/**
 * Enhanced validation utility for SVG operations with comprehensive error handling
 */
export class SVGValidator {
  /**
   * Validates input against a Zod schema with enhanced error reporting
   */
  static validateInput<T>(schema: z.ZodSchema<T>, input: unknown): T {
    try {
      return schema.parse(input, { reportInput: true });
    } catch (error) {
      if (error instanceof z.ZodError) {
        const validationError: SVGError = {
          code: SVGErrorCode.INVALID_INPUT,
          message: 'Input validation failed',
          details: {
            errors: error.issues.map(err => ({
              path: err.path.join('.'),
              message: err.message,
              received: err.code === 'invalid_type' ? receivedType(err.input) : 'unknown'
            }))
          },
          suggestions: this.generateValidationSuggestions(error)
        };
        throw new Error(JSON.stringify(validationError));
      }
      throw error;
    }
  }

  /**
   * Validates SVG string format and structure
   */
  static validateSVGString(svgString: string): void {
    if (!svgString || typeof svgString !== 'string') {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_SVG,
        message: 'SVG input must be a non-empty string',
        suggestions: ['Provide a valid SVG string', 'Check that SVG content is not null or undefined']
      }));
    }

    // Reject document type declarations before anything parses the input.
    // Internal <!ENTITY> definitions expand exponentially (billion laughs) in
    // SVGO's parser, and SVG has no legitimate need for a DTD.
    if (/<!(DOCTYPE|ENTITY)/i.test(svgString)) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_SVG,
        message: 'SVG input must not contain a DOCTYPE or ENTITY declaration',
        suggestions: [
          'Remove the <!DOCTYPE ...> declaration from the SVG',
          'Replace custom entities with their literal text'
        ]
      }));
    }

    // Basic SVG format validation
    const trimmed = svgString.trim();
    if (!trimmed.includes('<svg') || !trimmed.includes('</svg>')) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_SVG,
        message: 'Invalid SVG format - missing required SVG tags',
        suggestions: [
          'Ensure SVG string contains opening <svg> tag',
          'Ensure SVG string contains closing </svg> tag',
          'Validate SVG syntax using an online validator'
        ]
      }));
    }
  }

  /**
   * Validates SVG dimensions for performance constraints
   */
  static validateDimensions(width: number, height: number): void {
    const maxDimension = 10000;
    const maxArea = 50000000; // 50 megapixels

    if (width <= 0 || height <= 0) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_INPUT,
        message: 'SVG dimensions must be positive numbers',
        details: { width, height },
        suggestions: ['Use positive numbers for width and height']
      }));
    }

    if (width > maxDimension || height > maxDimension) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_INPUT,
        message: `SVG dimensions exceed maximum allowed size (${maxDimension}px)`,
        details: { width, height, maxDimension },
        suggestions: [`Reduce dimensions to ${maxDimension}px or smaller`]
      }));
    }

    if (width * height > maxArea) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_INPUT,
        message: `SVG area exceeds maximum allowed size (${maxArea} pixels)`,
        details: { area: width * height, maxArea },
        suggestions: ['Reduce overall SVG area by decreasing width or height']
      }));
    }
  }

  /**
   * Validates path data syntax
   */
  static validatePathData(pathData: string): void {
    if (!pathData || typeof pathData !== 'string') {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_INPUT,
        message: 'Path data must be a non-empty string',
        suggestions: ['Provide valid SVG path data', 'Check path data format']
      }));
    }

    const problem = findPathDataProblem(pathData);
    if (problem) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_INPUT,
        message: 'Invalid path data - no valid path commands found',
        details: { pathData: pathData.substring(0, 100), problem },
        suggestions: [
          'Use valid SVG path commands (M, L, C, Q, A, Z, etc.)',
          'Check SVG path syntax documentation',
          'Validate path data with an SVG path validator'
        ]
      }));
    }
  }

  /**
   * Validates SVG paint values: CSS colors, currentColor, none, inherit and url(#id)
   */
  static validateColor(color: string): void {
    // Optional colors are allowed: an absent or empty value means "not specified"
    if (color === undefined || color === null || color === '') return;

    if (typeof color !== 'string') {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_INPUT,
        message: 'Color must be a string',
        details: { color, receivedType: typeof color },
        suggestions: ['Provide the color as a string, e.g. "#ff0000", "rgb(255, 0, 0)" or "red"']
      }));
    }

    const isValid = isValidPaint(color);

    if (!isValid) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_INPUT,
        message: 'Invalid color format',
        details: { color },
        suggestions: [
          'Use hex format (#RGB, #RGBA, #RRGGBB or #RRGGBBAA)',
          'Use rgb()/rgba() with channels 0-255 or 0-100%, e.g. rgb(255, 0, 0) or rgb(255 0 0 / 50%)',
          'Use hsl()/hsla() with saturation and lightness 0-100%, e.g. hsl(210, 50%, 40%)',
          'Use a CSS named color, currentColor, none or inherit',
          'Use url(#id) to reference a gradient or pattern, optionally followed by a fallback color'
        ]
      }));
    }
  }

  /**
   * Generates helpful suggestions based on validation errors
   */
  private static generateValidationSuggestions(error: z.ZodError): string[] {
    const suggestions: string[] = [];
    
    for (const issue of error.issues) {
      switch (issue.code) {
        case 'invalid_type':
          suggestions.push(`Expected ${issue.expected} for ${issue.path.join('.')}, received ${receivedType(issue.input)}`);
          break;
        case 'too_small':
          suggestions.push(`Value for ${issue.path.join('.')} must be at least ${issue.minimum}`);
          break;
        case 'too_big':
          suggestions.push(`Value for ${issue.path.join('.')} must be at most ${issue.maximum}`);
          break;
        case 'invalid_value':
          suggestions.push(`Valid options for ${issue.path.join('.')} are: ${issue.values.map(String).join(', ')}`);
          break;
        default:
          suggestions.push(`Fix validation error for ${issue.path.join('.')}: ${issue.message}`);
      }
    }
    
    return suggestions;
  }
}

/**
 * Performance validation utilities
 */
export class PerformanceValidator {
  /**
   * Validates operation complexity for performance constraints
   */
  static validateComplexity(elementCount: number, operationType: string): void {
    const maxElements = operationType === 'optimization' ? 1000 : 500;
    
    if (elementCount > maxElements) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.PERFORMANCE_TIMEOUT,
        message: `Operation complexity exceeds limits for ${operationType}`,
        details: { elementCount, maxElements, operationType },
        suggestions: [
          `Reduce number of elements to ${maxElements} or fewer`,
          'Consider breaking complex operations into smaller batches',
          'Use simpler elements where possible'
        ]
      }));
    }
  }

  /**
   * Creates a timeout wrapper for operations
   */
  static async withTimeout<T>(
    operation: Promise<T>, 
    timeoutMs: number, 
    operationName: string
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        reject(new Error(JSON.stringify({
          code: SVGErrorCode.PERFORMANCE_TIMEOUT,
          message: `Operation '${operationName}' timed out after ${timeoutMs}ms`,
          suggestions: [
            'Reduce operation complexity',
            'Break operation into smaller parts',
            'Optimize input data'
          ]
        })));
      }, timeoutMs);
    });

    return Promise.race([operation, timeoutPromise]);
  }
}

/**
 * Sanitization utilities for SVG content
 */
export class SVGSanitizer {
  /**
   * Sanitizes SVG content to prevent XSS and other security issues
   */
  static sanitizeSVG(svgContent: string): string {
    // Every pattern here runs in linear time; inputs come from MCP callers.
    let sanitized = removeScriptBlocks(svgContent);

    const dangerous = [
      // The leading \b anchors each match at the start of a word, so a long
      // run like "ononon..." is scanned once rather than once per position
      /\bon\w+\s*=\s*["'][^"']*["']/gi, // Remove event handlers
      /javascript:/gi,
      /data:text\/html/gi
    ];

    for (const pattern of dangerous) {
      sanitized = sanitized.replace(pattern, '');
    }

    return sanitized;
  }

  /**
   * Removes active content from SVG markup using an XML parser (jsdom), so
   * encodings that slip past string matching are still caught:
   * - script, foreignObject and other embedding elements
   * - every on* event handler attribute
   * - set/animate elements that target on* attributes or href
   * - href values other than local fragments (#id) and data:image/ URIs
   * - processing instructions such as xml-stylesheet
   *
   * Returns the input unchanged when nothing was removed. Throws when the
   * markup cannot be parsed, so unparseable content is never passed through.
   */
  static removeActiveContent(svgContent: string): string {
    let dom: JSDOM;
    try {
      dom = new JSDOM(svgContent, { contentType: 'image/svg+xml' });
    } catch (error) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_SVG,
        message: 'SVG could not be parsed as XML for security sanitization',
        details: { reason: error instanceof Error ? error.message : String(error) },
        suggestions: [
          'Ensure the SVG is well-formed XML',
          'Declare every namespace prefix you use, e.g. xmlns:xlink="http://www.w3.org/1999/xlink"'
        ]
      }));
    }

    const { document } = dom.window;
    let changed = false;

    const visit = (node: DOMNode): void => {
      // Copy first: children may be removed while iterating
      for (const child of Array.from(node.childNodes)) {
        if (child.nodeType === NODE_PROCESSING_INSTRUCTION) {
          child.parentNode?.removeChild(child);
          changed = true;
          continue;
        }
        if (child.nodeType !== NODE_ELEMENT) continue;

        const element = child as DOMElement;
        const name = element.localName.toLowerCase();
        if (ACTIVE_ELEMENTS.has(name) || (ANIMATION_ELEMENTS.has(name) && targetsUnsafeAttribute(element))) {
          element.parentNode?.removeChild(element);
          changed = true;
          continue;
        }

        for (const attr of Array.from(element.attributes)) {
          const attrName = attr.localName.toLowerCase();
          if (attrName.startsWith('on') || (attrName === 'href' && !isSafeHref(attr.value))) {
            element.removeAttributeNode(attr);
            changed = true;
          }
        }

        visit(element);
      }
    };

    visit(document);

    return changed ? dom.serialize() : svgContent;
  }

  /**
   * Validates that SVG content is safe for processing
   */
  static validateSafeSVG(svgContent: string): void {
    const originalLength = svgContent.length;
    const sanitized = this.sanitizeSVG(svgContent);
    
    if (sanitized.length !== originalLength) {
      throw new Error(JSON.stringify({
        code: SVGErrorCode.INVALID_SVG,
        message: 'SVG content contains potentially unsafe elements',
        suggestions: [
          'Remove script tags from SVG content',
          'Remove event handlers (onclick, onload, etc.)',
          'Remove javascript: URLs',
          'Use only standard SVG elements and attributes'
        ]
      }));
    }
  }
}

/**
 * Removes every `<script ...>...</script>` block (case-insensitive) in a single
 * left-to-right pass. Equivalent to the regex
 * `/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi`, which backtracks
 * quadratically when many `<script` openings have no closing tag.
 */
function removeScriptBlocks(content: string): string {
  const lower = content.toLowerCase();
  const open = '<script';
  const close = '</script>';
  let result = '';
  let cursor = 0;
  let searchFrom = 0;

  while (searchFrom < lower.length) {
    const start = lower.indexOf(open, searchFrom);
    if (start === -1) break;

    // Match the regex's \b: "<scripts" or "<script_" is not a script tag
    const next = lower.charAt(start + open.length);
    if (/\w/.test(next)) {
      searchFrom = start + open.length;
      continue;
    }

    const end = lower.indexOf(close, start + open.length);
    // Any later opening tag would have no closing tag either
    if (end === -1) break;

    result += content.slice(cursor, start);
    cursor = end + close.length;
    searchFrom = cursor;
  }

  return result + content.slice(cursor);
}

/** True when an animation element's attributeName targets an event handler or link */
function targetsUnsafeAttribute(element: DOMElement): boolean {
  const target = (element.getAttribute('attributeName') ?? '').trim().toLowerCase();
  // Strip any namespace prefix, e.g. xlink:href -> href
  const localTarget = target.slice(target.lastIndexOf(':') + 1);
  return localTarget.startsWith('on') || localTarget === 'href';
}

/** Only same-document fragment references and inline images are allowed */
function isSafeHref(value: string): boolean {
  const trimmed = value.trim();
  return trimmed.startsWith('#') || /^data:image\//i.test(trimmed);
}

/**
 * Escapes XML special characters for use in text content and attribute values
 */
export function escapeXML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ---------------------------------------------------------------------------
// SVG path data grammar (SVG 1.1 §8.3.9 / SVG 2 path data)
// ---------------------------------------------------------------------------

/** Number of arguments each path command takes per repetition */
const PATH_ARG_COUNTS: Record<string, number> = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
const PATH_NUMBER = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;
const PATH_FLAG = /[01]/y;
const PATH_COMMA_WSP = /\s*,?\s*/y;
const PATH_WSP = /\s*/y;

/**
 * Returns a description of the first grammar error in path data, or undefined if it is valid.
 * Handles compact syntax (`M-5-5`, `M.5.5`, `1e2`, arc flags without separators).
 */
function findPathDataProblem(pathData: string): string | undefined {
  let index = 0;
  const skip = (pattern: RegExp) => {
    pattern.lastIndex = index;
    pattern.exec(pathData);
    index = pattern.lastIndex;
  };
  const read = (pattern: RegExp): boolean => {
    pattern.lastIndex = index;
    const match = pattern.exec(pathData);
    if (!match) return false;
    index = pattern.lastIndex;
    return true;
  };
  const startsNumber = () => /[\d.+-]/.test(pathData[index] ?? '');

  skip(PATH_WSP);
  if (!/[Mm]/.test(pathData[index] ?? '')) {
    return 'path data must start with a moveto (M or m) command';
  }

  while (index < pathData.length) {
    const command = pathData[index];
    const argCount = PATH_ARG_COUNTS[command.toLowerCase()];
    if (argCount === undefined) {
      return `unexpected '${command}' at position ${index}`;
    }
    index++;

    if (argCount > 0) {
      do {
        for (let arg = 0; arg < argCount; arg++) {
          skip(arg === 0 ? PATH_WSP : PATH_COMMA_WSP);
          // Arc arguments 4 and 5 are the large-arc and sweep flags
          const isFlag = command.toLowerCase() === 'a' && (arg === 3 || arg === 4);
          if (!read(isFlag ? PATH_FLAG : PATH_NUMBER)) {
            return `'${command}' at position ${index} needs ${argCount} ${isFlag ? 'arguments (arc flags are 0 or 1)' : 'numeric arguments'}`;
          }
        }
        skip(PATH_COMMA_WSP);
      } while (startsNumber());
    }
    skip(PATH_WSP);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// SVG paint values
// ---------------------------------------------------------------------------

const NAMED_COLORS = new Set([
  'aliceblue', 'antiquewhite', 'aqua', 'aquamarine', 'azure', 'beige', 'bisque', 'black',
  'blanchedalmond', 'blue', 'blueviolet', 'brown', 'burlywood', 'cadetblue', 'chartreuse',
  'chocolate', 'coral', 'cornflowerblue', 'cornsilk', 'crimson', 'cyan', 'darkblue',
  'darkcyan', 'darkgoldenrod', 'darkgray', 'darkgrey', 'darkgreen', 'darkkhaki',
  'darkmagenta', 'darkolivegreen', 'darkorange', 'darkorchid', 'darkred', 'darksalmon',
  'darkseagreen', 'darkslateblue', 'darkslategray', 'darkslategrey', 'darkturquoise',
  'darkviolet', 'deeppink', 'deepskyblue', 'dimgray', 'dimgrey', 'dodgerblue', 'firebrick',
  'floralwhite', 'forestgreen', 'fuchsia', 'gainsboro', 'ghostwhite', 'gold', 'goldenrod',
  'gray', 'grey', 'green', 'greenyellow', 'honeydew', 'hotpink', 'indianred', 'indigo',
  'ivory', 'khaki', 'lavender', 'lavenderblush', 'lawngreen', 'lemonchiffon', 'lightblue',
  'lightcoral', 'lightcyan', 'lightgoldenrodyellow', 'lightgray', 'lightgrey', 'lightgreen',
  'lightpink', 'lightsalmon', 'lightseagreen', 'lightskyblue', 'lightslategray',
  'lightslategrey', 'lightsteelblue', 'lightyellow', 'lime', 'limegreen', 'linen',
  'magenta', 'maroon', 'mediumaquamarine', 'mediumblue', 'mediumorchid', 'mediumpurple',
  'mediumseagreen', 'mediumslateblue', 'mediumspringgreen', 'mediumturquoise',
  'mediumvioletred', 'midnightblue', 'mintcream', 'mistyrose', 'moccasin', 'navajowhite',
  'navy', 'oldlace', 'olive', 'olivedrab', 'orange', 'orangered', 'orchid', 'palegoldenrod',
  'palegreen', 'paleturquoise', 'palevioletred', 'papayawhip', 'peachpuff', 'peru', 'pink',
  'plum', 'powderblue', 'purple', 'rebeccapurple', 'red', 'rosybrown', 'royalblue', 'saddlebrown',
  'salmon', 'sandybrown', 'seagreen', 'seashell', 'sienna', 'silver', 'skyblue', 'slateblue',
  'slategray', 'slategrey', 'snow', 'springgreen', 'steelblue', 'tan', 'teal', 'thistle',
  'tomato', 'turquoise', 'violet', 'wheat', 'white', 'whitesmoke', 'yellow', 'yellowgreen'
]);
const PAINT_KEYWORDS = new Set(['transparent', 'none', 'currentcolor', 'inherit']);
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FUNCTIONAL_COLOR = /^(rgba?|hsla?)\(\s*([^()]*?)\s*\)$/i;
const PAINT_SERVER = /^url\(\s*#[A-Za-z_][\w.:-]*\s*\)(?:\s+(.+))?$/;
const CSS_NUMBER = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:e[+-]?\\d+)?';
const PERCENT_OR_NUMBER = new RegExp(`^(${CSS_NUMBER})(%?)$`, 'i');
const HUE = new RegExp(`^${CSS_NUMBER}(?:deg|grad|rad|turn)?$`, 'i');

/** A number or percentage within range: `max` for plain numbers, 100 for percentages */
function inRange(value: string, max: number, percentOnly = false): boolean {
  const match = PERCENT_OR_NUMBER.exec(value);
  if (!match || (percentOnly && !match[2])) return false;
  const n = Number(match[1]);
  return n >= 0 && n <= (match[2] ? 100 : max);
}

/** rgb[a]() / hsl[a]() in comma syntax or CSS Color 4 space syntax with `/ alpha` */
function isValidFunctionalColor(color: string): boolean {
  const match = FUNCTIONAL_COLOR.exec(color);
  if (!match) return false;
  const isHsl = match[1].toLowerCase().startsWith('hsl');
  const body = match[2];

  let channels: string[];
  let alpha: string | undefined;
  if (body.includes(',')) {
    const parts = body.split(/\s*,\s*/);
    if (parts.length !== 3 && parts.length !== 4) return false;
    [channels, alpha] = [parts.slice(0, 3), parts[3]];
  } else {
    const [main, slashAlpha, extra] = body.split(/\s*\/\s*/);
    if (extra !== undefined) return false;
    channels = main.split(/\s+/);
    alpha = slashAlpha;
    if (channels.length !== 3) return false;
  }

  if (alpha !== undefined && !inRange(alpha, 1)) return false;
  if (isHsl) {
    // Comma syntax requires percentages for saturation and lightness
    const percentOnly = body.includes(',');
    return HUE.test(channels[0]) && inRange(channels[1], 100, percentOnly) && inRange(channels[2], 100, percentOnly);
  }
  return channels.every(channel => inRange(channel, 255));
}

function isValidCssColor(color: string): boolean {
  const lower = color.toLowerCase();
  return HEX_COLOR.test(color) || NAMED_COLORS.has(lower) || PAINT_KEYWORDS.has(lower) || isValidFunctionalColor(color);
}

/** An SVG paint: a CSS color or keyword, or url(#id) with an optional fallback color */
function isValidPaint(value: string): boolean {
  const color = value.trim();
  const paintServer = PAINT_SERVER.exec(color);
  if (paintServer) {
    return paintServer[1] === undefined || isValidCssColor(paintServer[1]);
  }
  return isValidCssColor(color);
}
