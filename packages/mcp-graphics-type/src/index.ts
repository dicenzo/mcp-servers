#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { loadFontTool } from './tools/loadFont.js';
import { shapeTextTool } from './tools/shapeText.js';
import { measureTextTool } from './tools/measureText.js';
import { subsetFontTool } from './tools/subsetFont.js';
import { generateFallbackTool } from './tools/generateFallback.js';
import { validateFontTool } from './tools/validateFont.js';

/**
 * MCP Server for Typography and Font Operations
 * Provides comprehensive tools for font loading, text shaping, measurement,
 * subsetting, fallback generation, and font validation
 */
class TypographyServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-graphics-type',
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
    // Register tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        loadFontTool,
        shapeTextTool,
        measureTextTool,
        subsetFontTool,
        generateFallbackTool,
        validateFontTool,
      ],
    }));

    // Register tool call handlers  
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'type.loadFont':
            return await (loadFontTool as any).invoke(args);
          case 'type.shapeText':
            return await (shapeTextTool as any).invoke(args);
          case 'type.measureText':
            return await (measureTextTool as any).invoke(args);
          case 'type.subsetFont':
            return await (subsetFontTool as any).invoke(args);
          case 'type.generateFallback':
            return await (generateFallbackTool as any).invoke(args);
          case 'type.validateFont':
            return await (validateFontTool as any).invoke(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[MCP Typography] Tool error for ${name}: ${errorMessage}`);
        throw new Error(`Tool execution failed: ${errorMessage}`);
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Typography] Server error:', error);
    };

    process.on('SIGINT', async () => {
      console.log('[MCP Typography] Shutting down server...');
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('[MCP Typography] Shutting down server...');
      await this.server.close();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[MCP Typography] Server started and listening on stdio');
  }
}

// Start the server
const server = new TypographyServer();
server.start().catch((error) => {
  console.error('[MCP Typography] Failed to start server:', error);
  process.exit(1);
});