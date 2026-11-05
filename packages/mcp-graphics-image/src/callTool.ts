import { CallToolResult, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

import { imageConvert, imageConvertTool } from './tools/imageConvert.js';
import { imageResize, imageResizeTool } from './tools/imageResize.js';
import { imageCrop, imageCropTool } from './tools/imageCrop.js';
import { imageFilter, imageFilterTool } from './tools/imageFilter.js';
import { imageOptimize, imageOptimizeTool } from './tools/imageOptimize.js';
import { imageComposite, imageCompositeTool } from './tools/imageComposite.js';
import { ImageErrorCode } from './types/image.js';
import { ImageToolError } from './util/imageError.js';

/** The tools this server lists, in listing order */
export const tools = [
  imageConvertTool,
  imageResizeTool,
  imageCropTool,
  imageFilterTool,
  imageOptimizeTool,
  imageCompositeTool
];

type ToolOutcome = { success: true } | { success: false; error: ImageToolError };

const handlers: Record<string, (args: unknown) => Promise<ToolOutcome>> = {
  'image.convert': imageConvert,
  'image.resize': imageResize,
  'image.crop': imageCrop,
  'image.filter': imageFilter,
  'image.optimize': imageOptimize,
  'image.composite': imageComposite
};

/** A tool result reporting a failed call, with the structured error as its text */
function errorResult(error: ImageToolError): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(error, null, 2) }],
    isError: true
  };
}

/**
 * Runs a tool and converts its outcome to an MCP result. A failed call (invalid
 * input or a processing error) is a result flagged with isError, so the client
 * shows the model the error code and suggestions; only an unknown tool name is
 * a protocol error.
 */
export async function callTool(name: string, args: unknown): Promise<CallToolResult> {
  const handler = Object.hasOwn(handlers, name) ? handlers[name] : undefined;
  if (!handler) {
    throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
  }

  try {
    const result = await handler(args);
    if (!result.success) {
      return errorResult(result.error);
    }
    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
  } catch (error) {
    // Log to stderr: stdout is reserved for the MCP protocol
    console.error(`[MCP Image Server] Tool execution error for ${name}:`, error);
    return errorResult({
      code: ImageErrorCode.PROCESSING_FAILED,
      message: `Image processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      details: { tool: name }
    });
  }
}
