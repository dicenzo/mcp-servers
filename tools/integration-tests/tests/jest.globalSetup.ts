/**
 * Global setup for integration tests
 * Ensures all MCP servers are built and ready before running tests
 */

import path from 'path';
import { execSync } from 'child_process';
import fs from 'fs/promises';

export default async function globalSetup(): Promise<void> {
  console.log('[Global Setup] Preparing MCP Graphics Integration Tests...');
  
  const projectRoot = path.resolve(process.cwd(), '..', '..', 'packages');
  const servers = [
    'mcp-graphics-color',
    'mcp-graphics-svg', 
    'mcp-graphics-image',
    'mcp-graphics-type'
  ];

  // Build all servers
  for (const server of servers) {
    const serverPath = path.join(projectRoot, server);
    
    try {
      // Check if server directory exists
      await fs.access(serverPath);
      
      console.log(`[Global Setup] Building ${server}...`);
      
      // Install dependencies if needed
      try {
        await fs.access(path.join(serverPath, 'node_modules'));
      } catch {
        console.log(`[Global Setup] Installing dependencies for ${server}...`);
        execSync('npm install', { cwd: serverPath, stdio: 'pipe' });
      }
      
      // Build the server
      execSync('npm run build', { cwd: serverPath, stdio: 'pipe' });
      
      // Verify dist exists
      await fs.access(path.join(serverPath, 'dist', 'index.js'));
      
      console.log(`[Global Setup] ✓ ${server} built successfully`);
      
    } catch (error) {
      console.error(`[Global Setup] ✗ Failed to build ${server}:`, error);
      throw error;
    }
  }

  // Create test assets directory
  const assetsDir = path.join(process.cwd(), 'assets');
  try {
    await fs.access(assetsDir);
  } catch {
    await fs.mkdir(assetsDir, { recursive: true });
  }

  // Create test output directory
  const outputDir = path.join(process.cwd(), 'test-output');
  try {
    await fs.access(outputDir);
  } catch {
    await fs.mkdir(outputDir, { recursive: true });
  }

  console.log('[Global Setup] ✓ All servers built and ready for testing');
}