import { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

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
