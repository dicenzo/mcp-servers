import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';

// Import all color tools
import { colorConvert, colorConvertTool } from './tools/colorConvert.js';
import { colorContrast, colorContrastTool } from './tools/colorContrast.js';
import { colorGeneratePalette, colorGeneratePaletteTool } from './tools/colorGeneratePalette.js';
import { colorBrandMatch, colorBrandMatchTool } from './tools/colorBrandMatch.js';
import { colorLintBrand, colorLintBrandTool } from './tools/colorLintBrand.js';
import { colorValidateAccessibility, colorValidateAccessibilityTool } from './tools/colorValidateAccessibility.js';

// Server information
const SERVER_INFO = {
  name: 'mcp-graphics-color',
  version: '1.0.0',
  description: 'MCP Server for color science, accessibility validation, and brand color operations',
  author: 'Tony DiCenzo',
};

// Performance monitoring
const PERFORMANCE_TARGETS = {
  'color.convert': 10,        // 10ms for color conversion
  'color.contrast': 50,       // 50ms for contrast checking  
  'color.generatePalette': 100, // 100ms for palette generation
  'color.brandMatch': 150,    // 150ms for brand matching
  'color.lintBrand': 200,     // 200ms for brand linting
  'color.validateAccessibility': 50 // 50ms for accessibility validation
};

/**
 * Main MCP Server for Color Operations
 */
export class MCPColorServer {
  private server: Server;
  private startTime: number;

  constructor() {
    this.server = new Server(SERVER_INFO, {
      capabilities: {
        tools: {},
      },
    });
    
    this.startTime = Date.now();
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
          colorConvertTool,
          colorContrastTool,
          colorGeneratePaletteTool,
          colorBrandMatchTool,
          colorLintBrandTool,
          colorValidateAccessibilityTool
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
          case 'color.convert':
            result = await colorConvert(args);
            break;
            
          case 'color.contrast':
            result = await colorContrast(args);
            break;
            
          case 'color.generatePalette':
            result = await colorGeneratePalette(args);
            break;
            
          case 'color.brandMatch':
            result = await colorBrandMatch(args);
            break;
            
          case 'color.lintBrand':
            result = await colorLintBrand(args);
            break;
            
          case 'color.validateAccessibility':
            result = await colorValidateAccessibility(args);
            break;
            
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }

        // Monitor performance
        const processingTime = performance.now() - startTime;
        const target = PERFORMANCE_TARGETS[name as keyof typeof PERFORMANCE_TARGETS];
        
        if (target && processingTime > target) {
          console.warn(`[PERFORMANCE] Tool ${name} took ${processingTime.toFixed(2)}ms (target: ${target}ms)`);
        }
        
        // Log successful tool usage
        console.error(`[INFO] Tool ${name} completed in ${processingTime.toFixed(2)}ms`);

        // Return result in MCP format
        if (result.success) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result.result, null, 2)
              }
            ]
          };
        } else {
          // Handle tool errors
          throw new McpError(
            ErrorCode.InternalError,
            result.error.message,
            result.error.details
          );
        }
        
      } catch (error) {
        const processingTime = performance.now() - startTime;
        console.error(`[ERROR] Tool ${name} failed after ${processingTime.toFixed(2)}ms:`, error);
        
        if (error instanceof McpError) {
          throw error;
        }
        
        throw new McpError(
          ErrorCode.InternalError,
          error instanceof Error ? error.message : 'Unknown error occurred',
          { tool: name, processingTime }
        );
      }
    });
  }

  /**
   * Setup server event handlers
   */
  private setupEventHandlers(): void {
    // Handle server errors
    this.server.onerror = (error) => {
      console.error('[SERVER ERROR]', error);
    };

    // Log server lifecycle events
    process.on('SIGINT', async () => {
      const uptime = Date.now() - this.startTime;
      console.error(`[SHUTDOWN] Server ran for ${uptime}ms`);
      await this.server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      const uptime = Date.now() - this.startTime;
      console.error(`[SHUTDOWN] Server ran for ${uptime}ms`);
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Start the MCP server
   */
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    
    console.error(`[STARTUP] ${SERVER_INFO.name} v${SERVER_INFO.version} starting...`);
    console.error('[STARTUP] Available tools:');
    console.error('  - color.convert: Convert colors between different color spaces');
    console.error('  - color.contrast: Check WCAG contrast ratios');
    console.error('  - color.generatePalette: Generate harmonious color palettes');
    console.error('  - color.brandMatch: Find matching colors in brand palette');
    console.error('  - color.lintBrand: Validate brand color consistency');
    console.error('  - color.validateAccessibility: Comprehensive accessibility validation');
    
    await this.server.connect(transport);
    console.error('[STARTUP] Server ready and listening for requests');
  }
}

/**
 * Main entry point
 */
export async function main(): Promise<void> {
  try {
    const server = new MCPColorServer();
    await server.run();
  } catch (error) {
    console.error('[FATAL ERROR] Failed to start server:', error);
    process.exit(1);
  }
}
