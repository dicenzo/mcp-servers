#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { createGridTool } from './tools/createGrid.js';
import { createFlexTool } from './tools/createFlex.js';
import { addConstraintsTool } from './tools/addConstraints.js';
import { autoLayoutTool } from './tools/autoLayout.js';
import { responsiveTool } from './tools/responsive.js';
import { measureTool } from './tools/measure.js';

/**
 * MCP Server for layout computation, CSS Grid, Flexbox, and constraint-based positioning
 * 
 * This server provides comprehensive layout tools including:
 * - CSS Grid layout computation with areas and track sizing
 * - Flexbox layout with advanced flex item sizing
 * - Constraint-based positioning system
 * - Auto-layout with content-aware spacing
 * - Responsive breakpoint management
 * - Layout metrics and quality analysis
 */
class LayoutServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: 'mcp-layout',
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
    // Register available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        createGridTool,
        createFlexTool,
        addConstraintsTool,
        autoLayoutTool,
        responsiveTool,
        measureTool,
      ],
    }));

    // Register tool call handlers
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
        case 'layout.createGrid':
          return await (createGridTool as any).invoke(args);
            
        case 'layout.createFlex':
          return await (createFlexTool as any).invoke(args);
            
        case 'layout.addConstraints':
          return await (addConstraintsTool as any).invoke(args);
            
        case 'layout.autoLayout':
          return await (autoLayoutTool as any).invoke(args);
            
        case 'layout.responsive':
          return await (responsiveTool as any).invoke(args);
            
        case 'layout.measure':
          return await (measureTool as any).invoke(args);
            
        default:
          throw new Error(`Unknown tool: ${name}`);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`[MCP Layout] Tool error for ${name}: ${errorMessage}`);
        
        // Return structured error response
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              success: false,
              error: `Tool execution failed: ${errorMessage}`,
              tool: name,
              timestamp: new Date().toISOString()
            }, null, 2)
          }]
        };
      }
    });
  }

  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      console.error('[MCP Layout] Server error:', error);
    };

    process.on('SIGINT', async () => {
      console.log('[MCP Layout] Shutting down server...');
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('[MCP Layout] Shutting down server...');
      await this.server.close();
      process.exit(0);
    });

    process.on('uncaughtException', (error) => {
      console.error('[MCP Layout] Uncaught exception:', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      console.error('[MCP Layout] Unhandled rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }

  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error('[MCP Layout] Server started and listening on stdio');
    console.error('[MCP Layout] Available tools: layout.createGrid, layout.createFlex, layout.addConstraints, layout.autoLayout, layout.responsive, layout.measure');
  }
}

// Start the server
const server = new LayoutServer();
server.start().catch((error) => {
  console.error('[MCP Layout] Failed to start server:', error);
  process.exit(1);
});