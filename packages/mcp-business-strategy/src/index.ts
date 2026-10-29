import 'dotenv/config';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Resource, ListResourcesResult, CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

import { webSearchTool } from './tools/webSearch.js';
import { dataEnrichTool } from './tools/dataEnrich.js';
import { unitEconTool } from './tools/unitEcon.js';
import { scenarioTool } from './tools/scenario.js';
import { templatesTool } from './tools/templates.js';
import { templatesResourceProvider } from './resources/templates.resource.js';
import { ExecutableTool, ToolTextResult } from './tools/types.js';

const server = new Server(
  {
    name: 'mcp-business-strategy',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
      resources: {},
    },
  }
);

// Enhanced tool registry with error handling and logging
const tools: ExecutableTool[] = [webSearchTool, dataEnrichTool, unitEconTool, scenarioTool, templatesTool];
const toolMap = new Map<string, ExecutableTool>();

// Build tool map for efficient lookup
tools.forEach(tool => {
  toolMap.set(tool.name, tool);
  console.error(`[MCP] Registered tool: ${tool.name}`);
});

// Optimized tool handler with comprehensive error handling
server.setRequestHandler(
  z.object({ 
    method: z.literal('tools/call'),
    params: z.object({
      name: z.string(),
      arguments: z.any().optional().default({})
    })
  }),
  async (request): Promise<CallToolResult> => {
    const { name, arguments: args } = request.params;
    const startTime = Date.now();
    
    console.error(`[MCP] Tool call: ${name} with args:`, JSON.stringify(args));
    
    try {
      const tool = toolMap.get(name);
      if (!tool) {
        const availableTools = Array.from(toolMap.keys()).join(', ');
        throw new Error(`Tool '${name}' not found. Available tools: ${availableTools}`);
      }
      
      // Validate tool has invoke method
      if (!tool.invoke || typeof tool.invoke !== 'function') {
        throw new Error(`Tool '${name}' is misconfigured - missing invoke method`);
      }
      
      // Execute tool with timeout protection
      const timeoutMs = 60000; // 60 second timeout
      const toolPromise = (async () => {
        const generator = tool.invoke(args);
        const result = await generator.next();
        return result.value;
      })();
      
      let timeoutHandle: NodeJS.Timeout | undefined;
      const timeoutPromise = new Promise((_, reject) => {
        timeoutHandle = setTimeout(() => reject(new Error(`Tool '${name}' timed out after ${timeoutMs}ms`)), timeoutMs);
      });
      
      // Clear the timer either way so a finished call doesn't leave it pending for 60s
      const result = await Promise.race([toolPromise, timeoutPromise])
        .finally(() => clearTimeout(timeoutHandle)) as ToolTextResult;

      const duration = Date.now() - startTime;
      console.error(`[MCP] Tool '${name}' completed in ${duration}ms`);

      // Tools yield a single text item; MCP expects it inside a content array
      return { content: [result] };
      
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`[MCP] Tool '${name}' failed after ${duration}ms:`, errorMessage);
      
      // Return structured error response
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: true,
            tool: name,
            message: errorMessage,
            duration_ms: duration,
            timestamp: new Date().toISOString()
          }, null, 2)
        }],
        isError: true
      };
    }
  }
);

// Enhanced resource handlers with error handling
server.setRequestHandler(
  z.object({ method: z.literal('resources/list') }),
  async (): Promise<ListResourcesResult> => {
    try {
      console.error('[MCP] Listing available resources');
      const resources: Resource[] = await templatesResourceProvider.list();
      console.error(`[MCP] Found ${resources.length} resources`);
      return { resources };
    } catch (error) {
      console.error('[MCP] Error listing resources:', error);
      return { resources: [] };
    }
  }
);

server.setRequestHandler(
  z.object({ 
    method: z.literal('resources/read'),
    params: z.object({ uri: z.string() })
  }),
  async (request) => {
    try {
      console.error(`[MCP] Reading resource: ${request.params.uri}`);
      const result = await templatesResourceProvider.read(request.params);
      console.error(`[MCP] Successfully read resource: ${request.params.uri}`);
      return result;
    } catch (error) {
      console.error(`[MCP] Error reading resource ${request.params.uri}:`, error);
      throw new Error(`Failed to read resource: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
);

// Enhanced server error handling
server.onerror = (error) => {
  console.error('[MCP] Server error:', error);
};

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.error('[MCP] Received SIGINT, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.error('[MCP] Received SIGTERM, shutting down gracefully...');
  process.exit(0);
});

// Enhanced startup with validation
async function startServer() {
  try {
    // Validate environment
    console.error('[MCP] Validating server environment...');
    
    // Check for optional API keys and warn if missing
    const apiKeys = [
      { name: 'TAVILY_API_KEY', service: 'Tavily Search' },
      { name: 'SERPAPI_KEY', service: 'SerpAPI' },
      { name: 'BRAVE_API_KEY', service: 'Brave Search' }
    ];
    
    const missingKeys = apiKeys.filter(key => !process.env[key.name]);
    if (missingKeys.length === apiKeys.length) {
      console.error('[MCP] ⚠️  No search API keys found - web search will use mock data');
    } else {
      const availableAPIs = apiKeys.filter(key => process.env[key.name]).map(key => key.service);
      console.error(`[MCP] ✅ Search APIs available: ${availableAPIs.join(', ')}`);
    }
    
    // Start transport
    const transport = new StdioServerTransport();
    await server.connect(transport);
    
    console.error('[MCP] ✅ Business Strategy Agents server started successfully');
    console.error(`[MCP] 📊 Registered ${tools.length} tools: ${tools.map(t => t.name).join(', ')}`);
    console.error('[MCP] 📁 Template resources available');
    console.error('[MCP] 🔄 Ready for agent workflow execution');
    
  } catch (error) {
    console.error('[MCP] ❌ Failed to start server:', error);
    process.exit(1);
  }
}

// Start the server
startServer();
