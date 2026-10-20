/**
 * MCP Server Management for Integration Testing
 * Handles starting, stopping, and managing MCP server instances
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs/promises';
import { 
  MCPServer, 
  ServerConfig, 
  TestServerInstance, 
  IntegrationTestContext 
} from '../types/index.js';

/**
 * Manages MCP server instances for testing
 */
export class MCPServerManager extends EventEmitter {
  private servers: Map<MCPServer, TestServerInstance> = new Map();
  private config: ServerConfig[];
  private projectRoot: string;

  constructor(config: ServerConfig[]) {
    super();
    this.config = config;
    this.projectRoot = path.resolve(process.cwd(), '..', '..', 'packages');
  }

  /**
   * Start all configured servers
   */
  async startAllServers(): Promise<IntegrationTestContext> {
    const testId = `test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    const cleanup: (() => Promise<void>)[] = [];

    console.log(`[MCP Manager] Starting ${this.config.length} servers for test ${testId}`);

    for (const serverConfig of this.config) {
      try {
        const instance = await this.startServer(serverConfig);
        this.servers.set(serverConfig.name, instance);
        
        // Add cleanup for this server
        cleanup.push(async () => {
          await this.stopServer(serverConfig.name);
        });

        console.log(`[MCP Manager] Server ${serverConfig.name} started successfully`);
      } catch (error) {
        console.error(`[MCP Manager] Failed to start ${serverConfig.name}:`, error);
        // Cleanup any already started servers
        await this.stopAllServers();
        throw error;
      }
    }

    return {
      servers: new Map(this.servers),
      testId,
      startTime,
      cleanup
    };
  }

  /**
   * Start a single MCP server
   */
  private async startServer(config: ServerConfig): Promise<TestServerInstance> {
    const executablePath = path.resolve(this.projectRoot, config.executablePath);
    
    // Verify executable exists
    try {
      await fs.access(executablePath);
    } catch (error) {
      throw new Error(`Server executable not found: ${executablePath}`);
    }

    const instance: TestServerInstance = {
      config,
      process: null,
      status: 'starting',
      startTime: Date.now()
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        instance.status = 'error';
        reject(new Error(`Server ${config.name} failed to start within ${config.timeout}ms`));
      }, config.timeout);

      try {
        // Start the server process
        const childProcess = spawn('node', [executablePath], {
          stdio: ['pipe', 'pipe', 'pipe'],
          env: {
            ...process.env,
            NODE_ENV: 'test',
            MCP_LOG_LEVEL: 'info'
          }
        });

        instance.process = childProcess;
        instance.pid = childProcess.pid;

        // Handle process events
        childProcess.on('spawn', () => {
          console.log(`[MCP Manager] Process spawned for ${config.name} (PID: ${childProcess.pid})`);
        });

        childProcess.on('error', (error) => {
          clearTimeout(timeout);
          instance.status = 'error';
          console.error(`[MCP Manager] Process error for ${config.name}:`, error);
          reject(error);
        });

        childProcess.on('exit', (code, signal) => {
          console.log(`[MCP Manager] Process exited for ${config.name} (code: ${code}, signal: ${signal})`);
          instance.status = 'stopped';
          this.emit('serverStopped', config.name, code, signal);
        });

        // Capture stdout/stderr for debugging
        let stdoutBuffer = '';
        let stderrBuffer = '';

        childProcess.stdout?.on('data', (data) => {
          const message = data.toString();
          stdoutBuffer += message;
          
          // Look for ready signal in stdout
          if (message.includes('Server started') || 
              message.includes('ready and listening') ||
              message.includes('Server ready') ||
              message.includes('Started successfully') ||
              message.includes('starting...') ||
              message.includes('listening on stdio')) {
            clearTimeout(timeout);
            instance.status = 'ready';
            resolve(instance);
          }
        });

        childProcess.stderr?.on('data', (data) => {
          const message = data.toString();
          stderrBuffer += message;
          
          // Look for ready signal in stderr as well
          if (message.includes('Server started') || 
              message.includes('ready and listening') ||
              message.includes('Server ready') ||
              message.includes('Started successfully') ||
              message.includes('starting...') ||
              message.includes('listening on stdio')) {
            clearTimeout(timeout);
            instance.status = 'ready';
            resolve(instance);
          }
        });

        // Set up health check if configured
        if (config.healthCheck.enabled) {
          this.setupHealthCheck(instance);
        }

      } catch (error) {
        clearTimeout(timeout);
        instance.status = 'error';
        reject(error);
      }
    });
  }

  /**
   * Stop all servers
   */
  async stopAllServers(): Promise<void> {
    console.log(`[MCP Manager] Stopping ${this.servers.size} servers`);
    
    const stopPromises = Array.from(this.servers.keys()).map(serverName => 
      this.stopServer(serverName)
    );

    await Promise.allSettled(stopPromises);
    this.servers.clear();
    console.log('[MCP Manager] All servers stopped');
  }

  /**
   * Stop a specific server
   */
  async stopServer(serverName: MCPServer): Promise<void> {
    const instance = this.servers.get(serverName);
    if (!instance || !instance.process) {
      return;
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        // Force kill if graceful shutdown takes too long
        if (instance.process && !instance.process.killed) {
          console.warn(`[MCP Manager] Force killing ${serverName}`);
          instance.process.kill('SIGKILL');
        }
        resolve();
      }, 5000);

      instance.process.on('exit', () => {
        clearTimeout(timeout);
        instance.status = 'stopped';
        console.log(`[MCP Manager] Server ${serverName} stopped gracefully`);
        resolve();
      });

      // Send SIGTERM for graceful shutdown
      instance.process.kill('SIGTERM');
    });
  }

  /**
   * Set up periodic health check for a server
   */
  private setupHealthCheck(instance: TestServerInstance): void {
    if (!instance.config.healthCheck.enabled) {
      return;
    }

    const checkInterval = setInterval(async () => {
      try {
        // Simple health check - verify process is still running
        if (!instance.process || instance.process.killed) {
          console.warn(`[MCP Manager] Health check failed - process not running: ${instance.config.name}`);
          instance.status = 'error';
          clearInterval(checkInterval);
          return;
        }

        instance.lastHealthCheck = Date.now();
      } catch (error) {
        console.error(`[MCP Manager] Health check error for ${instance.config.name}:`, error);
        instance.status = 'error';
        clearInterval(checkInterval);
      }
    }, instance.config.healthCheck.timeout);

    // Clear interval when server stops
    instance.process?.on('exit', () => {
      clearInterval(checkInterval);
    });
  }

  /**
   * Get server instance
   */
  getServer(serverName: MCPServer): TestServerInstance | undefined {
    return this.servers.get(serverName);
  }

  /**
   * Check if all servers are ready
   */
  areAllServersReady(): boolean {
    if (this.servers.size === 0) {
      return false;
    }

    return Array.from(this.servers.values()).every(instance => 
      instance.status === 'ready'
    );
  }

  /**
   * Get server status summary
   */
  getStatusSummary(): Record<string, any> {
    const summary: Record<string, any> = {};
    
    for (const [serverName, instance] of this.servers) {
      summary[serverName] = {
        status: instance.status,
        pid: instance.pid,
        uptime: instance.startTime ? Date.now() - instance.startTime : 0,
        lastHealthCheck: instance.lastHealthCheck
      };
    }

    return summary;
  }

  /**
   * Wait for all servers to be ready
   */
  async waitForAllServersReady(timeout: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (!this.areAllServersReady() && (Date.now() - startTime) < timeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (!this.areAllServersReady()) {
      const status = this.getStatusSummary();
      throw new Error(`Servers not ready within ${timeout}ms. Status: ${JSON.stringify(status, null, 2)}`);
    }
  }
}

/**
 * Default server configurations for testing
 */
export const DEFAULT_SERVER_CONFIGS: ServerConfig[] = [
  {
    name: MCPServer.COLOR,
    executablePath: 'mcp-graphics-color/dist/index.js',
    timeout: 10000,
    retries: 3,
    healthCheck: {
      enabled: true,
      timeout: 5000
    }
  },
  {
    name: MCPServer.SVG,
    executablePath: 'mcp-graphics-svg/dist/index.js',
    timeout: 10000,
    retries: 3,
    healthCheck: {
      enabled: true,
      timeout: 5000
    }
  },
  {
    name: MCPServer.IMAGE,
    executablePath: 'mcp-graphics-image/dist/index.js',
    timeout: 10000,
    retries: 3,
    healthCheck: {
      enabled: true,
      timeout: 5000
    }
  },
  {
    name: MCPServer.TYPE,
    executablePath: 'mcp-graphics-type/dist/index.js',
    timeout: 10000,
    retries: 3,
    healthCheck: {
      enabled: true,
      timeout: 5000
    }
  }
];