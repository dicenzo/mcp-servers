import { z } from 'zod';

// Font Input Types
export const FontInputSchema = z.union([
  z.object({
    type: z.literal('file'),
    path: z.string(),
    format: z.enum(['ttf', 'otf', 'woff', 'woff2']).optional()
  }),
  z.object({
    type: z.literal('buffer'),
    data: z.instanceof(Buffer),
    format: z.enum(['ttf', 'otf', 'woff', 'woff2']).optional()
  }),
  z.object({
    type: z.literal('url'),
    url: z.string().url(),
    format: z.enum(['ttf', 'otf', 'woff', 'woff2']).optional()
  }),
  z.object({
    type: z.literal('system'),
    name: z.string()
  })
]);

// Font Metadata Types
export const FontMetadataSchema = z.object({
  family: z.string(),
  subfamily: z.string(),
  fullName: z.string(),
  postScriptName: z.string(),
  version: z.string(),
  copyright: z.string().optional(),
  manufacturer: z.string().optional(),
  designer: z.string().optional(),
  description: z.string().optional(),
  license: z.string().optional(),
  licenseURL: z.string().optional(),
  trademark: z.string().optional(),
  unitsPerEm: z.number(),
  ascender: z.number(),
  descender: z.number(),
  lineGap: z.number(),
  capHeight: z.number().optional(),
  xHeight: z.number().optional(),
  bbox: z.object({
    xMin: z.number(),
    yMin: z.number(),
    xMax: z.number(),
    yMax: z.number()
  }),
  weightClass: z.number(),
  widthClass: z.number(),
  macStyle: z.number(),
  fsSelection: z.number(),
  isFixedPitch: z.boolean(),
  isItalic: z.boolean(),
  isBold: z.boolean(),
  isRegular: z.boolean(),
  supportedScripts: z.array(z.string()),
  supportedLanguages: z.array(z.string()),
  features: z.array(z.string()),
  numGlyphs: z.number(),
  format: z.enum(['ttf', 'otf', 'woff', 'woff2']),
  fileSize: z.number().optional(),
  checksum: z.string().optional()
});

// Text Shaping Types
export const ShapingOptionsSchema = z.object({
  direction: z.enum(['ltr', 'rtl', 'ttb', 'btt']).default('ltr'),
  script: z.string().default('latn'),
  language: z.string().default('und'),
  features: z.record(z.string(), z.union([z.boolean(), z.number()])).optional(),
  fontSize: z.number().positive().default(16),
  letterSpacing: z.number().default(0),
  wordSpacing: z.number().default(0),
  variations: z.record(z.string(), z.number()).optional()
});

export const GlyphInfoSchema = z.object({
  glyphId: z.number(),
  cluster: z.number(),
  codepoint: z.number(),
  name: z.string().optional(),
  advance: z.object({
    x: z.number(),
    y: z.number()
  }),
  offset: z.object({
    x: z.number(),
    y: z.number()
  }),
  flags: z.number()
});

export const ShapedTextSchema = z.object({
  glyphs: z.array(GlyphInfoSchema),
  advance: z.object({
    x: z.number(),
    y: z.number()
  }),
  clusters: z.array(z.number()),
  direction: z.enum(['ltr', 'rtl', 'ttb', 'btt']),
  script: z.string(),
  language: z.string(),
  features: z.record(z.string(), z.union([z.boolean(), z.number()])).optional()
});

// Text Metrics Types
export const TextMetricsSchema = z.object({
  width: z.number(),
  height: z.number(),
  actualBoundingBoxLeft: z.number(),
  actualBoundingBoxRight: z.number(),
  actualBoundingBoxAscent: z.number(),
  actualBoundingBoxDescent: z.number(),
  fontBoundingBoxAscent: z.number(),
  fontBoundingBoxDescent: z.number(),
  emHeightAscent: z.number(),
  emHeightDescent: z.number(),
  hangingBaseline: z.number(),
  alphabeticBaseline: z.number(),
  ideographicBaseline: z.number(),
  advances: z.array(z.number()),
  lineHeight: z.number(),
  capHeight: z.number().optional(),
  xHeight: z.number().optional(),
  baseline: z.number(),
  characterMetrics: z.array(z.object({
    char: z.string(),
    advance: z.number(),
    leftSideBearing: z.number(),
    rightSideBearing: z.number(),
    bbox: z.object({
      xMin: z.number(),
      yMin: z.number(),
      xMax: z.number(),
      yMax: z.number()
    })
  })).optional()
});

// Font Subsetting Types
export const FontSubsetOptionsSchema = z.object({
  characters: z.string(),
  unicodeRanges: z.array(z.object({
    start: z.number(),
    end: z.number()
  })).optional(),
  features: z.array(z.string()).optional(),
  hinting: z.boolean().default(true),
  desubroutinize: z.boolean().default(false),
  removeKerning: z.boolean().default(false),
  removeNames: z.boolean().default(false),
  removeLayout: z.boolean().default(false),
  optimize: z.boolean().default(true)
});

export const FontSubsetSchema = z.object({
  fontData: z.instanceof(Buffer),
  originalSize: z.number(),
  subsetSize: z.number(),
  compressionRatio: z.number(),
  charactersIncluded: z.array(z.string()),
  unicodeRanges: z.array(z.object({
    start: z.number(),
    end: z.number(),
    name: z.string().optional()
  })),
  glyphsIncluded: z.number(),
  totalGlyphs: z.number(),
  featuresIncluded: z.array(z.string()),
  format: z.enum(['ttf', 'otf', 'woff', 'woff2']),
  checksum: z.string(),
  subsetInfo: z.object({
    createdAt: z.string(),
    tool: z.string(),
    version: z.string()
  })
});

// System Font Stack Types
export const SystemFontStackSchema = z.object({
  primaryFont: z.string(),
  fallbackStack: z.array(z.string()),
  genericFamily: z.enum(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']),
  cssDeclaration: z.string(),
  platform: z.enum(['windows', 'macos', 'linux', 'ios', 'android', 'web']),
  confidence: z.number().min(0).max(1),
  availableFonts: z.array(z.object({
    name: z.string(),
    path: z.string().optional(),
    isInstalled: z.boolean(),
    priority: z.number()
  }))
});

// Font Validation Types
export const FontValidationReportSchema = z.object({
  isValid: z.boolean(),
  format: z.enum(['ttf', 'otf', 'woff', 'woff2', 'unknown']).optional(),
  version: z.string().optional(),
  errors: z.array(z.object({
    code: z.string(),
    message: z.string(),
    severity: z.enum(['error', 'warning', 'info']),
    location: z.string().optional()
  })),
  warnings: z.array(z.object({
    code: z.string(),
    message: z.string(),
    recommendation: z.string().optional()
  })),
  metadata: z.object({
    hasValidTables: z.boolean(),
    hasKerningInfo: z.boolean(),
    hasOpenTypeFeatures: z.boolean(),
    hasVariationAxes: z.boolean(),
    isWebOptimized: z.boolean(),
    hasLicense: z.boolean(),
    hasEmbeddingPermissions: z.boolean()
  }),
  performance: z.object({
    loadTime: z.number(),
    fileSize: z.number(),
    glyphCount: z.number(),
    complexityScore: z.number().min(0).max(1)
  }),
  compatibility: z.object({
    webBrowsers: z.record(z.string(), z.boolean()),
    operatingSystems: z.record(z.string(), z.boolean()),
    unicodeSupport: z.object({
      version: z.string(),
      supportedBlocks: z.array(z.string()),
      missingBlocks: z.array(z.string())
    })
  }),
  recommendations: z.array(z.string())
});

// Tool Input Schemas
export const LoadFontInputSchema = FontInputSchema;

export const ShapeTextInputSchema = z.object({
  text: z.string(),
  font: FontInputSchema,
  options: ShapingOptionsSchema.optional()
});

export const MeasureTextInputSchema = z.object({
  text: z.string(),
  font: FontInputSchema,
  fontSize: z.number().positive(),
  options: z.object({
    letterSpacing: z.number().default(0),
    wordSpacing: z.number().default(0),
    direction: z.enum(['ltr', 'rtl']).default('ltr'),
    script: z.string().default('latn'),
    language: z.string().default('und'),
    includeCharacterMetrics: z.boolean().default(false)
  }).optional()
});

export const SubsetFontInputSchema = z.object({
  font: FontInputSchema,
  options: FontSubsetOptionsSchema
});

export const GenerateFallbackInputSchema = z.object({
  primaryFont: FontInputSchema,
  targetPlatforms: z.array(z.enum(['windows', 'macos', 'linux', 'ios', 'android', 'web'])).default(['web']),
  textContent: z.string().optional(),
  preferredGenericFamily: z.enum(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']).optional(),
  includeWebFonts: z.boolean().default(false)
});

export const ValidateFontInputSchema = z.object({
  font: FontInputSchema,
  options: z.object({
    checkLicense: z.boolean().default(true),
    checkPerformance: z.boolean().default(true),
    checkCompatibility: z.boolean().default(true),
    targetPlatforms: z.array(z.string()).default(['web']),
    maxFileSize: z.number().optional(),
    requiredFeatures: z.array(z.string()).optional()
  }).optional()
});

// Type exports
export type FontInput = z.infer<typeof FontInputSchema>;
export type FontMetadata = z.infer<typeof FontMetadataSchema>;
export type ShapingOptions = z.infer<typeof ShapingOptionsSchema>;
export type GlyphInfo = z.infer<typeof GlyphInfoSchema>;
export type ShapedText = z.infer<typeof ShapedTextSchema>;
export type TextMetrics = z.infer<typeof TextMetricsSchema>;
export type FontSubsetOptions = z.infer<typeof FontSubsetOptionsSchema>;
export type FontSubset = z.infer<typeof FontSubsetSchema>;
export type SystemFontStack = z.infer<typeof SystemFontStackSchema>;
export type FontValidationReport = z.infer<typeof FontValidationReportSchema>;

export type LoadFontInput = z.infer<typeof LoadFontInputSchema>;
export type ShapeTextInput = z.infer<typeof ShapeTextInputSchema>;
export type MeasureTextInput = z.infer<typeof MeasureTextInputSchema>;
export type SubsetFontInput = z.infer<typeof SubsetFontInputSchema>;
export type GenerateFallbackInput = z.infer<typeof GenerateFallbackInputSchema>;
export type ValidateFontInput = z.infer<typeof ValidateFontInputSchema>;

// Error types
export enum TypographyErrorCode {
  INVALID_INPUT = 'INVALID_INPUT',
  FONT_LOAD_FAILED = 'FONT_LOAD_FAILED',
  SHAPING_FAILED = 'SHAPING_FAILED',
  MEASUREMENT_FAILED = 'MEASUREMENT_FAILED',
  SUBSETTING_FAILED = 'SUBSETTING_FAILED',
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  SYSTEM_FONT_ACCESS_FAILED = 'SYSTEM_FONT_ACCESS_FAILED',
  UNSUPPORTED_FORMAT = 'UNSUPPORTED_FORMAT',
  PERFORMANCE_TIMEOUT = 'PERFORMANCE_TIMEOUT',
  MEMORY_LIMIT_EXCEEDED = 'MEMORY_LIMIT_EXCEEDED'
}

export interface TypographyError {
  code: TypographyErrorCode;
  message: string;
  details?: Record<string, unknown>;
  suggestions?: string[];
}

// Performance Constraints
export const PERFORMANCE_LIMITS = {
  FONT_LOADING_TIMEOUT: 200, // ms
  TEXT_SHAPING_TIMEOUT: 50, // ms
  FONT_SUBSETTING_TIMEOUT: 400, // ms
  MAX_MEMORY_USAGE: 50 * 1024 * 1024, // 50MB
  MAX_FONT_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_TEXT_LENGTH: 10000, // characters
  MAX_GLYPHS_PER_FONT: 65536
} as const;

// Unicode and Script Constants
export const UNICODE_BLOCKS = [
  'Basic Latin',
  'Latin-1 Supplement',
  'Latin Extended-A',
  'Latin Extended-B',
  'IPA Extensions',
  'Spacing Modifier Letters',
  'Combining Diacritical Marks',
  'Greek and Coptic',
  'Cyrillic',
  'Cyrillic Supplement',
  'Armenian',
  'Hebrew',
  'Arabic',
  'Syriac',
  'Arabic Supplement',
  'Thaana',
  'NKo',
  'Samaritan',
  'Mandaic',
  'Devanagari',
  'Bengali',
  'Gurmukhi',
  'Gujarati',
  'Oriya',
  'Tamil',
  'Telugu',
  'Kannada',
  'Malayalam',
  'Sinhala',
  'Thai',
  'Lao',
  'Tibetan',
  'Myanmar',
  'Georgian',
  'Hangul Jamo',
  'Ethiopic',
  'Ethiopic Supplement',
  'Cherokee',
  'Unified Canadian Aboriginal Syllabics',
  'Ogham',
  'Runic',
  'Tagalog',
  'Hanunoo',
  'Buhid',
  'Tagbanwa',
  'Khmer',
  'Mongolian',
  'Unified Canadian Aboriginal Syllabics Extended',
  'Limbu',
  'Tai Le',
  'New Tai Lue',
  'Khmer Symbols',
  'Buginese',
  'Tai Tham',
  'Combining Diacritical Marks Extended',
  'Balinese',
  'Sundanese',
  'Batak',
  'Lepcha',
  'Ol Chiki',
  'Cyrillic Extended-C',
  'Sundanese Supplement',
  'Vedic Extensions',
  'Phonetic Extensions',
  'Phonetic Extensions Supplement',
  'Combining Diacritical Marks Supplement',
  'Latin Extended Additional',
  'Greek Extended',
  'General Punctuation',
  'Superscripts and Subscripts',
  'Currency Symbols',
  'Combining Diacritical Marks for Symbols',
  'Letterlike Symbols',
  'Number Forms',
  'Arrows',
  'Mathematical Operators',
  'Miscellaneous Technical',
  'Control Pictures',
  'Optical Character Recognition',
  'Enclosed Alphanumerics',
  'Box Drawing',
  'Block Elements',
  'Geometric Shapes',
  'Miscellaneous Symbols',
  'Dingbats',
  'Miscellaneous Mathematical Symbols-A',
  'Supplemental Arrows-A',
  'Braille Patterns',
  'Supplemental Arrows-B',
  'Miscellaneous Mathematical Symbols-B',
  'Supplemental Mathematical Operators',
  'Miscellaneous Symbols and Arrows',
  'Glagolitic',
  'Latin Extended-C',
  'Coptic',
  'Georgian Supplement',
  'Tifinagh',
  'Ethiopic Extended',
  'Cyrillic Extended-A',
  'Supplemental Punctuation',
  'CJK Radicals Supplement',
  'Kangxi Radicals',
  'Ideographic Description Characters',
  'CJK Symbols and Punctuation',
  'Hiragana',
  'Katakana',
  'Bopomofo',
  'Hangul Compatibility Jamo',
  'Kanbun',
  'Bopomofo Extended',
  'CJK Strokes',
  'Katakana Phonetic Extensions',
  'Enclosed CJK Letters and Months',
  'CJK Compatibility',
  'CJK Unified Ideographs Extension A',
  'Yijing Hexagram Symbols',
  'CJK Unified Ideographs',
  'Yi Syllables',
  'Yi Radicals',
  'Lisu',
  'Vai',
  'Cyrillic Extended-B',
  'Bamum',
  'Modifier Tone Letters',
  'Latin Extended-D',
  'Syloti Nagri',
  'Common Indic Number Forms',
  'Phags-pa',
  'Saurashtra',
  'Devanagari Extended',
  'Kayah Li',
  'Rejang',
  'Hangul Jamo Extended-A',
  'Javanese',
  'Myanmar Extended-B',
  'Cham',
  'Myanmar Extended-A',
  'Tai Viet',
  'Meetei Mayek Extensions',
  'Ethiopic Extended-A',
  'Latin Extended-E',
  'Cherokee Supplement',
  'Meetei Mayek',
  'Hangul Syllables',
  'Hangul Jamo Extended-B',
  'High Surrogates',
  'High Private Use Surrogates',
  'Low Surrogates',
  'Private Use Area',
  'CJK Compatibility Ideographs',
  'Alphabetic Presentation Forms',
  'Arabic Presentation Forms-A',
  'Variation Selectors',
  'Vertical Forms',
  'Combining Half Marks',
  'CJK Compatibility Forms',
  'Small Form Variants',
  'Arabic Presentation Forms-B',
  'Halfwidth and Fullwidth Forms',
  'Specials'
] as const;

export const SCRIPT_CODES = [
  'arab', 'armn', 'beng', 'bopo', 'brai', 'cans', 'cher', 'cyrl', 
  'deva', 'ethi', 'geor', 'grek', 'gujr', 'guru', 'hang', 'hani', 
  'hebr', 'hira', 'kana', 'knda', 'khmr', 'laoo', 'latn', 'mlym', 
  'mong', 'mymr', 'ogam', 'orya', 'runr', 'sinh', 'syrc', 'taml', 
  'telu', 'thaa', 'thai', 'tibt', 'yiii', 'zinh', 'zyyy', 'qaai'
] as const;