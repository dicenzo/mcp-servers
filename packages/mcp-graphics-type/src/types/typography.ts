import { z } from 'zod';

// Font Input Types
const fontSourceType = <T extends 'file' | 'buffer' | 'url' | 'system'>(type: T) => z.literal(type).describe('Font input type');
const fontFormat = () => z.enum(['ttf', 'otf', 'woff', 'woff2']).optional().describe('Font format hint (optional)');

export const FontInputSchema = z.union([
  z.object({
    type: fontSourceType('file'),
    path: z.string()
      .describe('Path to a .ttf/.otf/.ttc/.otc/.woff/.woff2 file in a system font directory or a directory listed in MCP_FONT_DIRS (for file type; a collection loads its first font)'),
    format: fontFormat()
  }),
  z.object({
    type: fontSourceType('buffer'),
    // A Buffer from in-process callers, or base64 text (what JSON tool arguments carry).
    // The advertised schema leaves the Buffer out.
    data: z.union([z.instanceof(Buffer), z.string()]).describe('Base64 encoded font data (for buffer type)'),
    format: fontFormat()
  }),
  z.object({
    type: fontSourceType('url'),
    url: z.string().url().describe('Public https:// URL to a font file, no redirects (for url type)'),
    format: fontFormat()
  }),
  z.object({
    type: fontSourceType('system'),
    name: z.string()
      .describe('Installed font\'s family, full or PostScript name, e.g. "Georgia", "Georgia Bold" or "Georgia-Bold" (for system type). A family name loads its regular style')
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
  direction: z.enum(['ltr', 'rtl', 'ttb', 'btt']).optional()
    .describe('Paragraph direction. When omitted it comes from the first strong character; mixed-direction text is reordered with the Unicode bidi algorithm either way'),
  script: z.string().optional()
    .describe('Script code (ISO 15924) to shape the whole text as. When omitted each run of one script is shaped as that script'),
  language: z.string().default('und').describe('BCP 47 language tag ("en", "en-US", "zh-Hant-TW"), for language-specific forms'),
  features: z.record(z.string(), z.union([z.boolean(), z.number()])).optional()
    .describe('OpenType features to enable/disable, such as { "liga": false, "smcp": true, "salt": 2 }. Defaults are the script\'s usual features (ligatures, kerning, contextual forms)'),
  fontSize: z.number().positive().default(16).describe('Font size in pixels'),
  letterSpacing: z.number().default(0).describe('Additional letter spacing'),
  wordSpacing: z.number().default(0).describe('Additional word spacing'),
  variations: z.record(z.string(), z.number()).optional().describe('Variable font axis values')
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
  runs: z.array(z.object({
    start: z.number(),
    end: z.number(),
    direction: z.enum(['ltr', 'rtl', 'ttb', 'btt']),
    script: z.string(),
    level: z.number()
  })),
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
/** Highest valid Unicode codepoint */
export const MAX_CODEPOINT = 0x10FFFF;

/** Upper bound on unicodeRanges entries accepted by type.subsetFont */
export const MAX_UNICODE_RANGES = 256;

export const FontSubsetOptionsSchema = z.object({
  characters: z.string().describe('Characters to include in subset'),
  unicodeRanges: z.array(z.object({
    start: z.number().int().min(0).max(MAX_CODEPOINT),
    end: z.number().int().min(0).max(MAX_CODEPOINT)
  })).max(MAX_UNICODE_RANGES).optional().describe('Unicode ranges to include'),
  features: z.array(z.string()).optional().describe('OpenType features to preserve'),
  hinting: z.boolean().default(true).describe('Preserve font hinting'),
  desubroutinize: z.boolean().default(false).describe('Remove subroutines (reduces size but may affect quality)'),
  removeKerning: z.boolean().default(false).describe('Remove kerning information'),
  removeNames: z.boolean().default(false).describe('Remove font name table'),
  removeLayout: z.boolean().default(false).describe('Remove OpenType layout tables'),
  optimize: z.boolean().default(true).describe('Apply additional optimizations')
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
  format: z.enum(['ttf', 'otf', 'woff', 'woff2', 'ttc', 'unknown']).optional(),
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
    isWebOptimized: z.boolean().describe('WOFF or WOFF2, without the legacy hinting tables browsers ignore (hdmx, VDMX, LTSH)'),
    hasLicense: z.boolean(),
    hasEmbeddingPermissions: z.boolean().describe('The font may be embedded for installable or editable use (OS/2 fsType)'),
    embedding: z.object({
      fsType: z.number(),
      usage: z.enum(['installable', 'restricted', 'previewPrint', 'editable'])
        .describe('From fsType bits 1-3; when several are set, the least restrictive applies'),
      noSubsetting: z.boolean().describe('fsType bit 8: the font must not be subset before embedding'),
      bitmapOnly: z.boolean().describe('fsType bit 9: only embedded bitmaps may be embedded')
    }).optional()
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
      version: z.string().describe('Unicode version of the block data'),
      supportedBlocks: z.array(z.string()).describe('Blocks the font covers completely'),
      missingBlocks: z.array(z.string()).describe('Blocks the font covers only in part'),
      blocks: z.array(z.object({
        name: z.string(),
        covered: z.number(),
        total: z.number().describe('Assigned characters in the block, leaving out controls and private use'),
        percent: z.number()
      })).describe('Every block the font maps at least one character in')
    })
  }),
  recommendations: z.array(z.string())
});

// Tool Input Schemas
export const LoadFontInputSchema = FontInputSchema;

export const ShapeTextInputSchema = z.object({
  text: z.string().describe('Text to shape'),
  font: FontInputSchema.describe('Font to use for shaping'),
  options: ShapingOptionsSchema.optional()
});

export const MeasureTextInputSchema = z.object({
  text: z.string().describe('Text to measure'),
  font: FontInputSchema.describe('Font to use for measurement'),
  fontSize: z.number().positive().describe('Font size in pixels'),
  options: z.object({
    letterSpacing: z.number().default(0).describe('Additional letter spacing'),
    wordSpacing: z.number().default(0).describe('Additional word spacing'),
    direction: z.enum(['ltr', 'rtl']).optional()
      .describe('Paragraph direction. When omitted it comes from the first strong character'),
    script: z.string().optional().describe('Script code (ISO 15924) to shape the whole text as. When omitted it comes from the text'),
    language: z.string().default('und').describe('BCP 47 language tag ("en", "en-US")'),
    includeCharacterMetrics: z.boolean().default(false).describe('Include per-character metrics')
  }).optional()
});

export const SubsetFontInputSchema = z.object({
  font: FontInputSchema.describe('Font to subset'),
  options: FontSubsetOptionsSchema
});

export const GenerateFallbackInputSchema = z.object({
  primaryFont: FontInputSchema.describe('Primary font to generate fallbacks for'),
  targetPlatforms: z.array(z.enum(['windows', 'macos', 'linux', 'ios', 'android', 'web'])).default(['web'])
    .describe('Target platforms for font stack'),
  textContent: z.string().optional().describe('Sample text content to analyze for character coverage (optional)'),
  preferredGenericFamily: z.enum(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui']).optional()
    .describe('Preferred generic font family fallback'),
  includeWebFonts: z.boolean().default(false).describe('Include web font fallbacks in the stack')
});

export const ValidateFontInputSchema = z.object({
  font: FontInputSchema.describe('Font to validate'),
  options: z.object({
    checkLicense: z.boolean().default(true).describe('Check font license and embedding permissions'),
    checkPerformance: z.boolean().default(true).describe('Analyze font performance characteristics'),
    checkCompatibility: z.boolean().default(true).describe('Test compatibility across platforms and browsers'),
    targetPlatforms: z.array(z.enum(['windows', 'macos', 'linux', 'ios', 'android', 'web'])).default(['web'])
      .describe('Platforms to report: "web" for browsers, the rest for whether the font can be installed'),
    maxFileSize: z.number().optional().describe('Maximum acceptable file size in bytes'),
    requiredFeatures: z.array(z.string()).optional().describe('OpenType features that must be present')
  }).prefault({})
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

/**
 * Result shape every tool's invoke() returns: JSON serialized into a single text block.
 * Declared as a type alias (not an interface) so it stays assignable to the SDK's
 * CallToolResult, while letting callers read content[i].text as a string.
 */
export type TextToolResult = {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
};

// Performance Constraints
export const PERFORMANCE_LIMITS = {
  // Hard timeouts, not performance targets. Loading allows for a remote fetch
  // (REMOTE_FONT_TIMEOUT_MS is 15s); subsetting runs fontTools in a Python subprocess.
  FONT_LOADING_TIMEOUT: 20_000, // ms
  TEXT_SHAPING_TIMEOUT: 50, // ms
  FONT_SUBSETTING_TIMEOUT: 30_000, // ms
  MAX_MEMORY_USAGE: 50 * 1024 * 1024, // 50MB
  MAX_FONT_FILE_SIZE: 10 * 1024 * 1024, // 10MB
  MAX_DECOMPRESSED_FONT_SIZE: 32 * 1024 * 1024, // 32MB, for WOFF2 (large CJK fonts are ~20MB)
  MAX_TEXT_LENGTH: 10000, // characters
  MAX_GLYPHS_PER_FONT: 65536
} as const;

// Unicode and Script Constants
export const SCRIPT_CODES = [
  'arab', 'armn', 'beng', 'bopo', 'brai', 'cans', 'cher', 'cyrl', 
  'deva', 'ethi', 'geor', 'grek', 'gujr', 'guru', 'hang', 'hani', 
  'hebr', 'hira', 'kana', 'knda', 'khmr', 'laoo', 'latn', 'mlym', 
  'mong', 'mymr', 'ogam', 'orya', 'runr', 'sinh', 'syrc', 'taml', 
  'telu', 'thaa', 'thai', 'tibt', 'yiii', 'zinh', 'zyyy', 'qaai'
] as const;