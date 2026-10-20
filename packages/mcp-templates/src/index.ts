#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Import all template tools
import { templateCreateTool } from './tools/templateCreate.js';
import { templateRenderTool } from './tools/templateRender.js';
import { templateValidateTool } from './tools/templateValidate.js';
import { templateExportTool } from './tools/templateExport.js';
import { templateLibraryAddTool } from './tools/templateLibraryAdd.js';
import { templateLibraryComposeTool } from './tools/templateLibraryCompose.js';

// Import utilities
import { PerformanceMonitor } from './util/performance.js';
import { TemplateExporter } from './util/export.js';

// Server information
const SERVER_INFO = {
  name: 'mcp-templates',
  version: '1.0.0',
  description: 'MCP Server for design template management, rendering, and multi-format export',
  author: 'Tony DiCenzo',
};

// Performance targets from PRD (in milliseconds)
const PERFORMANCE_TARGETS = {
  'template.create': 200,            // 200ms for template creation
  'template.render': 500,            // 500ms for template rendering
  'template.validate': 200,          // 200ms for template validation
  'template.export': 500,            // 500ms for template export
  'template.library.add': 100,       // 100ms for library addition
  'template.library.compose': 300    // 300ms for library composition
};

/**
 * Main MCP Server for Template Operations
 */
class MCPTemplatesServer {
  private server: Server;
  private startTime: number;
  private performanceMonitor: PerformanceMonitor;

  constructor() {
    this.server = new Server(SERVER_INFO, {
      capabilities: {
        tools: {},
      },
    });
    
    this.startTime = Date.now();
    this.performanceMonitor = PerformanceMonitor.getInstance();
    
    this.setupToolHandlers();
    this.setupEventHandlers();
  }

  /**
   * Setup tool request handlers
   */
  private setupToolHandlers(): void {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          templateCreateTool,
          templateRenderTool,
          templateValidateTool,
          templateExportTool,
          templateLibraryAddTool,
          templateLibraryComposeTool
        ]
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;
      const startTime = performance.now();
      
      try {
        let result;
        
        // Route to appropriate tool handler
        switch (name) {
          case 'template.create':
            result = await templateCreateTool.invoke(args);
            break;
            
          case 'template.render':
            result = await templateRenderTool.invoke(args);
            break;
            
          case 'template.validate':
            result = await templateValidateTool.invoke(args);
            break;
            
          case 'template.export':
            result = await templateExportTool.invoke(args);
            break;
            
          case 'template.library.add':
            result = await templateLibraryAddTool.invoke(args);
            break;
            
          case 'template.library.compose':
            result = await templateLibraryComposeTool.invoke(args);
            break;
            
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
        
        // Performance monitoring
        const duration = performance.now() - startTime;
        const target = PERFORMANCE_TARGETS[name as keyof typeof PERFORMANCE_TARGETS];
        
        if (target && duration > target) {
          console.warn(
            `[Performance Warning] ${name} took ${duration.toFixed(2)}ms ` +
            `(target: ${target}ms, ${((duration / target - 1) * 100).toFixed(1)}% over)`
          );
        }
        
        // Log successful operations
        console.error(`[MCP Templates] ${name} completed in ${duration.toFixed(2)}ms`);
        
        return result;
        
      } catch (error) {
        const duration = performance.now() - startTime;
        const errorMessage = error instanceof Error ? error.message : String(error);
        
        console.error(`[MCP Templates] Tool error for ${name}: ${errorMessage} (${duration.toFixed(2)}ms)`);
        
        // Return structured error response
        if (error instanceof McpError) {
          throw error;
        }
        
        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${errorMessage}`
        );
      }
    });
  }

  /**
   * Setup server event handlers
   */
  private setupEventHandlers(): void {
    // Server error handling
    this.server.onerror = (error) => {
      console.error('[MCP Templates] Server error:', error);
    };

    // Graceful shutdown handlers
    const shutdownHandler = async (signal: string) => {
      console.log(`[MCP Templates] Received ${signal}, shutting down gracefully...`);
      
      try {
        // Close browser instance for PDF exports
        await TemplateExporter.closeBrowser();
        
        // Generate performance report
        const report = this.performanceMonitor.generateReport();
        if (report) {
          console.log('[MCP Templates] Performance Report:\n', report);
        }
        
        // Close server
        await this.server.close();
        
        console.log('[MCP Templates] Server shutdown completed');
        process.exit(0);
        
      } catch (error) {
        console.error('[MCP Templates] Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle different shutdown signals
    process.on('SIGINT', () => shutdownHandler('SIGINT'));
    process.on('SIGTERM', () => shutdownHandler('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('[MCP Templates] Uncaught exception:', error);
      process.exit(1);
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('[MCP Templates] Unhandled rejection at:', promise, 'reason:', reason);
      process.exit(1);
    });
  }

  /**
   * Start the MCP server
   */
  async start(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    const bootTime = Date.now() - this.startTime;
    console.error(`[MCP Templates] Server started in ${bootTime}ms and listening on stdio`);
    console.error(`[MCP Templates] Available tools: template.create, template.render, template.validate, template.export, template.library.add, template.library.compose`);
    console.error(`[MCP Templates] Performance targets: ${JSON.stringify(PERFORMANCE_TARGETS)}`);
  }

  /**
   * Get server statistics
   */
  getStats(): {
    uptime: number;
    performance: Record<string, any>;
    server: typeof SERVER_INFO;
  } {
    return {
      uptime: Date.now() - this.startTime,
      performance: {
        targets: PERFORMANCE_TARGETS,
        operations: Object.fromEntries(
          Object.keys(PERFORMANCE_TARGETS).map(op => [
            op,
            this.performanceMonitor.getOperationStats(op)
          ])
        )
      },
      server: SERVER_INFO
    };
  }
}

// Create and start server
const server = new MCPTemplatesServer();

server.start().catch((error) => {
  console.error('[MCP Templates] Failed to start server:', error);
  process.exit(1);
});

// Export server class for testing
export { MCPTemplatesServer };
