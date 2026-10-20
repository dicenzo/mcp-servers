#!/usr/bin/env node

/**
 * MCP Graphics Image Server
 * High-performance image processing server using Sharp library
 * 
 * Provides comprehensive image manipulation capabilities:
 * - Format conversion (PNG, JPEG, WebP, AVIF, etc.)
 * - Resize with quality preservation
 * - Cropping operations
 * - Filter application (blur, sharpen, brightness, etc.)
 * - Web optimization
 * - Multi-image composition
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Import all image tools
import { imageConvert, imageConvertTool } from './tools/imageConvert.js';
import { imageResize, imageResizeTool } from './tools/imageResize.js';
import { imageCrop, imageCropTool } from './tools/imageCrop.js';
import { imageFilter, imageFilterTool } from './tools/imageFilter.js';
import { imageOptimize, imageOptimizeTool } from './tools/imageOptimize.js';
import { imageComposite, imageCompositeTool } from './tools/imageComposite.js';

/**
 * MCP Graphics Image Server
 * Implements the Model Context Protocol for image processing operations
 */
class McpGraphicsImageServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-graphics-image',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    );

    this.setupToolHandlers();
    this.setupErrorHandling();
  }

  private setupToolHandlers(): void {
    // Register all image processing tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          imageConvertTool,
          imageResizeTool,
          imageCropTool,
          imageFilterTool,
          imageOptimizeTool,
          imageCompositeTool
        ],
      };
    });

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        let result;

        switch (name) {
          case 'image.convert':
            result = await imageConvert(args);
            break;
          case 'image.resize':
            result = await imageResize(args);
            break;
          case 'image.crop':
            result = await imageCrop(args);
            break;
          case 'image.filter':
            result = await imageFilter(args);
            break;
          case 'image.optimize':
            result = await imageOptimize(args);
            break;
          case 'image.composite':
            result = await imageComposite(args);
            break;
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }

        // Handle structured error responses
        if (result && typeof result === 'object' && 'success' in result && result.success === false) {
          throw new McpError(
            ErrorCode.InternalError,
            result.error.message,
            result.error.details
          );
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        // Log error details for debugging (to stderr, not stdout to avoid MCP protocol issues)
        console.error(`[MCP Image Server] Tool execution error for ${name}:`, error);

        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Image processing failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          { tool: name, args }
        );
      }
    });
  }

  private setupErrorHandling(): void {
    // Handle uncaught errors gracefully
    this.server.onerror = (error) => {
      console.error('[MCP Image Server] Uncaught error:', error);
    };

    process.on('SIGINT', async () => {
      console.error('[MCP Image Server] Received SIGINT, shutting down gracefully...');
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error('[MCP Image Server] Received SIGTERM, shutting down gracefully...');
      await this.server.close();
      process.exit(0);
    });
  }

  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    // Log startup message to stderr (stdout is reserved for MCP protocol)
    console.error('[MCP Image Server] Started successfully');
    console.error('[MCP Image Server] Available tools: image.convert, image.resize, image.crop, image.filter, image.optimize, image.composite');
  }
}

/**
 * Start the MCP Graphics Image Server
 */
async function main(): Promise<void> {
  try {
    const server = new McpGraphicsImageServer();
    await server.run();
  } catch (error) {
    console.error('[MCP Image Server] Failed to start:', error);
    process.exit(1);
  }
}

// Only run if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('[MCP Image Server] Fatal error:', error);
    process.exit(1);
  });
}

export { McpGraphicsImageServer };