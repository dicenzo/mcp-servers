#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { svgCreateTool } from './tools/svgCreate.js';
import { svgOptimizeTool } from './tools/svgOptimize.js';
import { svgTransformTool } from './tools/svgTransform.js';
import { svgPathOperationsTool } from './tools/svgPathOperations.js';
import { wireframeToSvgTool } from './tools/wireframeToSvg.js';
import { mermaidToSvgTool } from './tools/mermaidToSvg.js';
import { svgbobToSvgTool } from './tools/svgbobToSvg.js';
import { fabricWireframeTool } from './tools/fabricWireframe.js';

/**
 * MCP Server for SVG graphics operations
 * Provides tools for creating, optimizing, transforming, and manipulating SVG graphics
 */
class SVGGraphicsServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-graphics-svg',
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
        svgCreateTool,
        svgOptimizeTool,
        svgTransformTool,
        svgPathOperationsTool,
        wireframeToSvgTool,
        mermaidToSvgTool,
        svgbobToSvgTool,
        fabricWireframeTool,
      ],
    }));

    // Register tool call handlers  
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case 'svg.create':
            return await (svgCreateTool as any).invoke(args);
          case 'svg.optimize':
            return await (svgOptimizeTool as any).invoke(args);
          case 'svg.transform':
            return await (svgTransformTool as any).invoke(args);
          case 'svg.path.operations':
            return await (svgPathOperationsTool as any).invoke(args);
          case 'wireframe.to.svg':
            return await (wireframeToSvgTool as any).invoke(args);
          case 'mermaid.to.svg':
            return await (mermaidToSvgTool as any).invoke(args);
          case 'svgbob.to.svg':
            return await (svgbobToSvgTool as any).invoke(args);
          case 'fabric.wireframe':
            return await (fabricWireframeTool as any).invoke(args);
          default:
            throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[MCP SVG Graphics] Tool error for ${name}: ${errorMessage}`);
        throw new Error(`Tool execution failed: ${errorMessage}`);
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP SVG Graphics] Server error:', error);
    };

    process.on('SIGINT', async () => {
      console.log('[MCP SVG Graphics] Shutting down server...');
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('[MCP SVG Graphics] Shutting down server...');
      await this.server.close();
      process.exit(0);
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[MCP SVG Graphics] Server started and listening on stdio');
  }
}

// Start the server
const server = new SVGGraphicsServer();
server.start().catch((error) => {
  console.error('[MCP SVG Graphics] Failed to start server:', error);
  process.exit(1);
});