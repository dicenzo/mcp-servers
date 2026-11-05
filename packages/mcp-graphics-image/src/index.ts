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
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { callTool, tools } from './callTool.js';

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
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

    // Handle tool execution
    this.server.setRequestHandler(CallToolRequestSchema, async (request) =>
      callTool(request.params.name, request.params.arguments)
    );
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