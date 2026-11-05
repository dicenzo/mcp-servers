import { SVGErrorCode } from '../types/svg.js';

/**
 * A failed tool call as an MCP result flagged with isError. SVGValidator throws
 * errors whose message is a JSON-encoded SVGError; those keep their code,
 * details and suggestions, and anything else is reported under `fallbackCode`.
 */
export function errorResult(tool: string, error: unknown, fallbackCode = SVGErrorCode.PROCESSING_FAILED) {
  let structured: { code?: string; message?: string; details?: unknown; suggestions?: string[] } = {};
  const message = error instanceof Error ? error.message : String(error);
  try {
    const parsed: unknown = JSON.parse(message);
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
      structured = parsed;
    }
  } catch {
    // A plain message, not a structured SVGError
  }
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        error: true,
        code: structured.code ?? fallbackCode,
        message: structured.message ?? message,
        details: structured.details,
        suggestions: structured.suggestions,
        tool,
        timestamp: new Date().toISOString()
      }, null, 2)
    }],
    isError: true
  };
}
