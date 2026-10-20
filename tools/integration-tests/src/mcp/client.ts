/**
 * MCP Client for Integration Testing
 * Provides utilities for communicating with MCP servers during tests
 */

import { 
  CallToolRequest, 
  CallToolResult, 
  ListToolsRequest,
  Tool
} from '@modelcontextprotocol/sdk/types.js';
import { MCPServer, TestServerInstance, ToolExecutionResult } from '../types/index.js';

/**
 * MCP Client for testing server interactions
 */
export class MCPTestClient {
  private serverInstance: TestServerInstance;

  constructor(serverInstance: TestServerInstance) {
    this.serverInstance = serverInstance;
  }

  /**
   * List available tools on the server
   */
  async listTools(): Promise<Tool[]> {
    if (!this.isServerReady()) {
      throw new Error(`Server ${this.serverInstance.config.name} is not ready`);
    }

    try {
      // Send list tools request via stdio
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/list',
        params: {}
      } as any;

      const response = await this.sendRequest(request);
      return response.tools || [];
    } catch (error) {
      console.error(`[MCP Client] Failed to list tools for ${this.serverInstance.config.name}:`, error);
      throw error;
    }
  }

  /**
   * Call a tool on the server
   */
  async callTool<T = any>(
    toolName: string, 
    args: any,
    options: {
      timeout?: number;
      retries?: number;
      captureMetrics?: boolean;
    } = {}
  ): Promise<ToolExecutionResult<T>> {
    if (!this.isServerReady()) {
      throw new Error(`Server ${this.serverInstance.config.name} is not ready`);
    }

    const startTime = performance.now();
    const startMemory = options.captureMetrics ? process.memoryUsage() : undefined;
    const startCpu = options.captureMetrics ? process.cpuUsage() : undefined;

    try {
      const request = {
        jsonrpc: '2.0',
        id: Date.now(),
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args
        }
      } as any;

      const result = await this.sendRequest(request, {
        timeout: options.timeout || 30000,
        retries: options.retries || 1
      });

      const endTime = performance.now();
      const endMemory = options.captureMetrics ? process.memoryUsage() : undefined;
      const endCpu = options.captureMetrics ? process.cpuUsage(startCpu) : undefined;

      return {
        server: this.serverInstance.config.name,
        toolName,
        input: args,
        result: result.content?.[0]?.text ? JSON.parse(result.content[0].text) : result,
        metrics: {
          startTime,
          endTime,
          duration: endTime - startTime,
          memoryUsage: endMemory,
          cpuUsage: endCpu
        }
      };
    } catch (error) {
      const endTime = performance.now();
      
      return {
        server: this.serverInstance.config.name,
        toolName,
        input: args,
        error: error instanceof Error ? error : new Error(String(error)),
        metrics: {
          startTime,
          endTime,
          duration: endTime - startTime
        }
      };
    }
  }

  /**
   * Check if server is ready to receive requests
   */
  private isServerReady(): boolean {
    return this.serverInstance.status === 'ready' && 
           this.serverInstance.process && 
           !this.serverInstance.process.killed;
  }

  /**
   * Send a request to the MCP server
   */
  private async sendRequest(
    request: any, 
    options: { timeout?: number; retries?: number } = {}
  ): Promise<any> {
    const timeout = options.timeout || 10000;
    const maxRetries = options.retries || 1;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.attemptRequest(request, timeout);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          console.warn(`[MCP Client] Attempt ${attempt} failed, retrying: ${lastError.message}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
        }
      }
    }

    throw lastError!;
  }

  /**
   * Attempt to send a single request
   */
  private async attemptRequest(request: any, timeout: number): Promise<any> {
    return new Promise((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Request timeout after ${timeout}ms`));
      }, timeout);

      try {
        const process = this.serverInstance.process!;
        const requestId = request.id || Date.now();
        const requestData = JSON.stringify({ ...request, id: requestId }) + '\n';
        
        let responseBuffer = '';
        let responseReceived = false;

        const dataHandler = (data: Buffer) => {
          if (responseReceived) return;
          
          responseBuffer += data.toString();
          
          // Look for complete JSON response
          const lines = responseBuffer.split('\n');
          for (const line of lines) {
            if (line.trim()) {
              try {
                const response = JSON.parse(line.trim());
                if (response.id === requestId) {
                  responseReceived = true;
                  clearTimeout(timeoutHandle);
                  process.stdout?.off('data', dataHandler);
                  
                  if (response.error) {
                    reject(new Error(response.error.message || 'Server error'));
                  } else {
                    resolve(response.result || response);
                  }
                  return;
                }
              } catch (parseError) {
                // Ignore parse errors, might be partial data
              }
            }
          }
        };

        process.stdout?.on('data', dataHandler);
        process.stdin?.write(requestData);
        
      } catch (error) {
        clearTimeout(timeoutHandle);
        reject(error);
      }
    });
  }

  /**
   * Validate server's MCP protocol compliance
   */
  async validateProtocolCompliance(): Promise<{
    compliant: boolean;
    issues: string[];
    score: number;
  }> {
    const issues: string[] = [];
    let score = 100;

    try {
      // Test 1: Tool Discovery
      const tools = await this.listTools();
      if (!Array.isArray(tools)) {
        issues.push('tools/list does not return an array');
        score -= 20;
      }

      // Test 2: Tool Execution (if tools are available)
      if (tools.length > 0) {
        const testTool = tools[0];
        try {
          // Try to call the tool with empty args (should return error or result)
          const result = await this.callTool(testTool.name, {});
          // If we get here without throwing, the protocol is working
        } catch (error) {
          // Expected to fail with validation error, but should not throw network/protocol errors
          const errorMessage = error instanceof Error ? error.message : String(error);
          if (errorMessage.includes('timeout') || errorMessage.includes('connection')) {
            issues.push('Tool execution has protocol-level issues');
            score -= 30;
          }
        }
      } else {
        issues.push('No tools available to test execution');
        score -= 10;
      }

      // Test 3: Error Handling
      try {
        await this.callTool('nonexistent.tool', {});
        issues.push('Server does not properly handle unknown tools');
        score -= 25;
      } catch (error) {
        // Expected behavior
      }

      return {
        compliant: issues.length === 0,
        issues,
        score: Math.max(0, score)
      };
    } catch (error) {
      return {
        compliant: false,
        issues: [`Protocol validation failed: ${error instanceof Error ? error.message : String(error)}`],
        score: 0
      };
    }
  }
}

/**
 * Multi-server client for orchestrating cross-server operations
 */
export class MCPMultiClient {
  private clients: Map<MCPServer, MCPTestClient> = new Map();

  constructor(serverInstances: Map<MCPServer, TestServerInstance>) {
    for (const [serverName, instance] of serverInstances) {
      this.clients.set(serverName, new MCPTestClient(instance));
    }
  }

  /**
   * Get client for specific server
   */
  getClient(server: MCPServer): MCPTestClient {
    const client = this.clients.get(server);
    if (!client) {
      throw new Error(`No client available for server: ${server}`);
    }
    return client;
  }

  /**
   * Execute tools on multiple servers in parallel
   */
  async executeParallel(operations: Array<{
    server: MCPServer;
    tool: string;
    args: any;
  }>): Promise<ToolExecutionResult[]> {
    const promises = operations.map(op => 
      this.getClient(op.server).callTool(op.tool, op.args, { captureMetrics: true })
    );

    return Promise.all(promises);
  }

  /**
   * Execute tools in sequence across servers
   */
  async executeSequential(operations: Array<{
    server: MCPServer;
    tool: string;
    args: any;
    inputMapping?: (previousResults: ToolExecutionResult[]) => any;
  }>): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    for (const op of operations) {
      let args = op.args;
      
      // Apply input mapping if provided
      if (op.inputMapping && results.length > 0) {
        args = op.inputMapping(results);
      }

      const result = await this.getClient(op.server).callTool(op.tool, args, { 
        captureMetrics: true 
      });
      
      results.push(result);

      // Stop execution if there's an error (unless configured otherwise)
      if (result.error) {
        console.warn(`[Multi Client] Error in sequential execution at step ${results.length}:`, result.error);
        break;
      }
    }

    return results;
  }

  /**
   * List all tools across all servers
   */
  async listAllTools(): Promise<Map<MCPServer, Tool[]>> {
    const toolsMap = new Map<MCPServer, Tool[]>();

    for (const [serverName, client] of this.clients) {
      try {
        const tools = await client.listTools();
        toolsMap.set(serverName, tools);
      } catch (error) {
        console.error(`[Multi Client] Failed to list tools for ${serverName}:`, error);
        toolsMap.set(serverName, []);
      }
    }

    return toolsMap;
  }

  /**
   * Validate protocol compliance across all servers
   */
  async validateAllCompliance(): Promise<Map<MCPServer, any>> {
    const results = new Map();

    for (const [serverName, client] of this.clients) {
      try {
        const compliance = await client.validateProtocolCompliance();
        results.set(serverName, compliance);
      } catch (error) {
        results.set(serverName, {
          compliant: false,
          issues: [`Validation failed: ${error instanceof Error ? error.message : String(error)}`],
          score: 0
        });
      }
    }

    return results;
  }
}