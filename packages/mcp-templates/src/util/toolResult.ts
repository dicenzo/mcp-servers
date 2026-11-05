import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { ZodError } from 'zod';
import { TemplateErrorCode } from '../types/template.js';

/**
 * A failed tool call: the JSON body (which carries `success: false`), flagged
 * with `isError` so MCP clients treat it as an error rather than a result.
 */
export function failureResult(body: Record<string, unknown>): CallToolResult {
  return {
    content: [{
      type: 'text',
      text: JSON.stringify(body, null, 2)
    }],
    isError: true
  };
}

/**
 * A failed tool call for input that didn't match the tool's zod schema: each
 * issue is listed in `details.errors` with its dotted path, and the
 * suggestions name the fields to fix.
 */
export function invalidInputResult(toolName: string, error: ZodError): CallToolResult {
  const errors = error.issues.map(issue => ({
    code: TemplateErrorCode.INVALID_TEMPLATE,
    path: issue.path.map(String).join('.'),
    message: issue.message
  }));
  return failureResult({
    success: false,
    error: `Invalid ${toolName} input`,
    code: TemplateErrorCode.INVALID_TEMPLATE,
    details: { errors },
    suggestions: errors.map(({ path, message }) => (path ? `Fix ${path}: ${message}` : message))
  });
}
