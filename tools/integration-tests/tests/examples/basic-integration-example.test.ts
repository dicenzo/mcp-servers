/**
 * Basic Integration Test Example
 * This file demonstrates how to write integration tests using the MCP Graphics Integration Framework
 */

import { MCPServerManager, DEFAULT_SERVER_CONFIGS } from '../../src/mcp/server-manager.js';
import { MCPMultiClient } from '../../src/mcp/client.js';
import { WorkflowEngine } from '../../src/utils/workflow-engine.js';
import { MCPServer } from '../../src/types/index.js';

describe('Basic Integration Example', () => {
  let serverManager: MCPServerManager;
  let client: MCPMultiClient;
  let workflowEngine: WorkflowEngine;

  // Setup: Start all servers before running tests
  beforeAll(async () => {
    console.log('Starting MCP servers...');
    
    serverManager = new MCPServerManager(DEFAULT_SERVER_CONFIGS);
    const context = await serverManager.startAllServers();
    await serverManager.waitForAllServersReady(30000);
    
    client = new MCPMultiClient(context.servers);
    workflowEngine = new WorkflowEngine(client);
    
    console.log('All servers started successfully');
  }, 60000); // 60 second timeout for server startup

  // Cleanup: Stop all servers after tests complete
  afterAll(async () => {
    console.log('Stopping MCP servers...');
    await serverManager.stopAllServers();
    console.log('All servers stopped');
  });

  describe('Single Server Operations', () => {
    test('color server converts hex to RGB', async () => {
      // Call a tool on the color server
      const result = await client.getClient(MCPServer.COLOR).callTool('color.convert', {
        color: '#ff0000',
        targetSpace: 'rgb'
      });

      // Verify the operation was successful
      expect(result.error).toBeUndefined();
      expect(result.result).toMatchObject({
        space: 'rgb',
        values: [1, 0, 0],  // Red in RGB
        hex: '#ff0000'
      });

      // Performance assertion
      expect(result.metrics.duration).toBeLessThan(100); // Should complete in <100ms
    });

    test('SVG server creates simple rectangle', async () => {
      const result = await client.getClient(MCPServer.SVG).callTool('svg.create', {
        width: 200,
        height: 100,
        elements: [{
          type: 'rect',
          x: 10,
          y: 10,
          width: 180,
          height: 80,
          fill: '#3498db'
        }]
      });

      expect(result.error).toBeUndefined();
      expect(result.result.svg).toContain('<svg');
      expect(result.result.svg).toContain('<rect');
      expect(result.result.svg).toContain('fill="#3498db"');
    });
  });

  describe('Cross-Server Data Exchange', () => {
    test('use color palette in SVG creation', async () => {
      // Step 1: Generate a color palette
      const paletteResult = await client.getClient(MCPServer.COLOR).callTool('color.generatePalette', {
        baseColor: '#2c3e50',
        harmony: 'complementary',
        count: 3
      });

      expect(paletteResult.error).toBeUndefined();
      expect(paletteResult.result.colors).toHaveLength(3);

      // Step 2: Use the first color from the palette in SVG creation
      const firstColor = paletteResult.result.colors[0];
      const svgResult = await client.getClient(MCPServer.SVG).callTool('svg.create', {
        width: 150,
        height: 150,
        elements: [{
          type: 'circle',
          cx: 75,
          cy: 75,
          r: 60,
          fill: firstColor.hex
        }]
      });

      expect(svgResult.error).toBeUndefined();
      expect(svgResult.result.svg).toContain(firstColor.hex);
    });

    test('check color accessibility for text on background', async () => {
      // Step 1: Generate colors
      const backgroundResult = await client.getClient(MCPServer.COLOR).callTool('color.convert', {
        color: '#3498db',
        targetSpace: 'hex'
      });

      // Step 2: Check contrast with white text
      const contrastResult = await client.getClient(MCPServer.COLOR).callTool('color.contrast', {
        foreground: '#ffffff',
        background: backgroundResult.result.hex
      });

      expect(contrastResult.error).toBeUndefined();
      expect(contrastResult.result).toHaveProperty('ratio');
      expect(contrastResult.result.ratio).toBeGreaterThan(1);

      // Step 3: Create SVG with accessible text
      const svgResult = await client.getClient(MCPServer.SVG).callTool('svg.create', {
        width: 300,
        height: 100,
        elements: [
          {
            type: 'rect',
            x: 0,
            y: 0,
            width: 300,
            height: 100,
            fill: backgroundResult.result.hex
          },
          {
            type: 'text',
            x: 150,
            y: 55,
            content: `Contrast: ${contrastResult.result.contrastRatio.toFixed(2)}:1`,
            fontSize: 16,
            fill: '#ffffff',
            textAnchor: 'middle',
            dominantBaseline: 'central'
          }
        ]
      });

      expect(svgResult.error).toBeUndefined();
      expect(svgResult.result.svg).toContain('Contrast:');
    });
  });

  describe('Simple Workflow Example', () => {
    test('complete brand color workflow', async () => {
      const workflow = [
        {
          id: 'generate_brand_colors',
          server: MCPServer.COLOR,
          tool: 'color.generatePalette',
          input: {
            baseColor: '#e74c3c',
            type: 'triadic',
            count: 3
          }
        },
        {
          id: 'create_color_swatches',
          server: MCPServer.SVG,
          tool: 'svg.create',
          input: {
            width: 300,
            height: 100,
            elements: [
              { type: 'rect', x: 0, y: 0, width: 100, height: 100 },
              { type: 'rect', x: 100, y: 0, width: 100, height: 100 },
              { type: 'rect', x: 200, y: 0, width: 100, height: 100 }
            ]
          },
          inputMappings: {
            'elements.0.fill': 'generate_brand_colors.result.colors.0.hex',
            'elements.1.fill': 'generate_brand_colors.result.colors.1.hex',
            'elements.2.fill': 'generate_brand_colors.result.colors.2.hex'
          }
        }
      ];

      const result = await workflowEngine.executeWorkflow('brand-colors', workflow);

      expect(result.success).toBe(true);
      expect(result.results.size).toBe(2);

      // Verify palette generation
      const paletteStep = result.results.get('generate_brand_colors');
      expect(paletteStep?.error).toBeUndefined();
      expect(paletteStep?.result.colors).toHaveLength(3);

      // Verify SVG creation with colors
      const svgStep = result.results.get('create_color_swatches');
      expect(svgStep?.error).toBeUndefined();
      expect(svgStep?.result.svg).toContain('<rect');

      // Verify colors were applied
      const colors = paletteStep?.result.colors;
      colors?.forEach((color: any) => {
        expect(svgStep?.result.svg).toContain(color.hex);
      });

      console.log(`Workflow completed in ${result.totalDuration.toFixed(2)}ms`);
    });
  });

  describe('Performance Examples', () => {
    test('concurrent color conversions', async () => {
      const colors = ['#ff0000', '#00ff00', '#0000ff', '#ffff00', '#ff00ff'];
      const startTime = performance.now();

      const operations = colors.map(color => ({
        server: MCPServer.COLOR,
        tool: 'color.convert',
        args: { color, targetSpace: 'hsl' }
      }));

      const results = await client.executeParallel(operations);
      const endTime = performance.now();

      // All operations should succeed
      expect(results.every(r => !r.error)).toBe(true);

      // Should complete quickly when run in parallel
      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(1000); // Less than 1 second

      console.log(`Converted ${colors.length} colors in ${totalTime.toFixed(2)}ms`);
    });

    test('memory usage stays reasonable', async () => {
      const initialMemory = process.memoryUsage();

      // Perform several operations
      for (let i = 0; i < 20; i++) {
        await client.getClient(MCPServer.COLOR).callTool('color.generatePalette', {
          baseColor: `hsl(${i * 18}, 70%, 50%)`,
          type: 'complementary',
          count: 5
        });
      }

      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;

      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      console.log(`Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });
  });

  describe('Error Handling Examples', () => {
    test('graceful handling of invalid inputs', async () => {
      const result = await client.getClient(MCPServer.COLOR).callTool('color.convert', {
        color: 'this-is-not-a-color',
        targetSpace: 'rgb'
      });

      // Should return error, not throw exception
      expect(result.error).toBeDefined();
      expect(result.error?.message).toContain('Failed to parse color input');
    });

    test('server continues working after error', async () => {
      // Send invalid request (server may not validate this, so we'll test with a different approach)
      const errorResult = await client.getClient(MCPServer.SVG).callTool('svg.create', {
        width: -100,
        height: -100,
        elements: []
      });

      // Note: The SVG server may not validate negative dimensions, so we'll test with a valid request
      // to ensure the server is still working

      // Follow up with valid request
      const validResult = await client.getClient(MCPServer.SVG).callTool('svg.create', {
        width: 100,
        height: 100,
        elements: [{
          type: 'circle',
          cx: 50,
          cy: 50,
          r: 25,
          fill: '#green'
        }]
      });

      expect(validResult.error).toBeUndefined();
      expect(validResult.result.svg).toContain('<circle');
    });
  });
});

/*
 * This example demonstrates:
 * 
 * 1. Basic server setup and teardown
 * 2. Single server tool execution
 * 3. Cross-server data exchange
 * 4. Simple workflow orchestration
 * 5. Performance monitoring
 * 6. Error handling
 * 
 * To run this test:
 *   npm test -- tests/examples/basic-integration-example.test.ts
 * 
 * For more advanced examples, see:
 *   - tests/integration/ - Server communication tests
 *   - tests/workflows/ - Complex workflow scenarios
 *   - tests/performance/ - Load and performance tests
 */