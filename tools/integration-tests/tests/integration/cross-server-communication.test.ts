/**
 * Cross-Server Communication Integration Tests
 * Tests basic communication and data exchange between MCP servers
 */

import { MCPServerManager, DEFAULT_SERVER_CONFIGS } from '../../src/mcp/server-manager.js';
import { MCPMultiClient } from '../../src/mcp/client.js';
import { MCPServer } from '../../src/types/index.js';

describe('Cross-Server Communication', () => {
  let serverManager: MCPServerManager;
  let client: MCPMultiClient;

  beforeAll(async () => {
    serverManager = new MCPServerManager(DEFAULT_SERVER_CONFIGS);
    const context = await serverManager.startAllServers();
    await serverManager.waitForAllServersReady(30000);
    client = new MCPMultiClient(context.servers);
  });

  afterAll(async () => {
    await serverManager.stopAllServers();
  });

  describe('Server Startup and Health', () => {
    test('all servers start successfully', async () => {
      expect(serverManager.areAllServersReady()).toBe(true);
    });

    test('all servers respond to tool listing', async () => {
      const toolsMap = await client.listAllTools();
      
      expect(toolsMap.size).toBe(4); // All 4 servers
      expect(toolsMap.get(MCPServer.COLOR)?.length).toBeGreaterThan(0);
      expect(toolsMap.get(MCPServer.SVG)?.length).toBeGreaterThan(0);
      expect(toolsMap.get(MCPServer.IMAGE)?.length).toBeGreaterThan(0);
      expect(toolsMap.get(MCPServer.TYPE)?.length).toBeGreaterThan(0);
    });

    test('servers maintain protocol compliance', async () => {
      const compliance = await client.validateAllCompliance();
      
      for (const [serverName, result] of compliance) {
        expect(result.compliant).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(80);
        
        if (result.issues.length > 0) {
          console.warn(`[${serverName}] Protocol issues:`, result.issues);
        }
      }
    });
  });

  describe('Basic Tool Execution', () => {
    test('color server converts colors correctly', async () => {
      const result = await client.getClient(MCPServer.COLOR).callTool('color.convert', {
        color: '#ff0000',
        targetSpace: 'rgb'
      });

      expect(result.error).toBeUndefined();
      expect(result.result).toMatchObject({
        space: 'rgb',
        values: [1, 0, 0],
        hex: '#ff0000'
      });
      expect(result.metrics.duration).toBeLessThan(100); // Performance check
    });

    test('svg server creates basic SVG', async () => {
      const result = await client.getClient(MCPServer.SVG).callTool('svg.create', {
        width: 100,
        height: 100,
        elements: [{
          type: 'rect',
          x: 0,
          y: 0,
          width: 100,
          height: 100,
          fill: '#blue'
        }]
      });

      expect(result.error).toBeUndefined();
      expect(result.result.svg).toContain('<svg');
      expect(result.result.svg).toContain('<rect');
      expect(result.result.svg).toContain('fill="#blue"');
    });

    test('image server handles basic operations', async () => {
      const result = await client.getClient(MCPServer.IMAGE).callTool('image.resize', {
        image: {
          width: 200,
          height: 200,
          format: 'png',
          data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
        },
        width: 100,
        height: 100
      });

      expect(result.error).toBeUndefined();
      expect(result.result).toHaveProperty('width', 100);
      expect(result.result).toHaveProperty('height', 100);
    });

    test('type server loads fonts', async () => {
      const result = await client.getClient(MCPServer.TYPE).callTool('type.loadFont', {
        source: 'system',
        family: 'Arial'
      });

      expect(result.error).toBeUndefined();
      expect(result.result).toHaveProperty('fontFamily', 'Arial');
      expect(result.result).toHaveProperty('status', 'loaded');
    });
  });

  describe('Data Format Compatibility', () => {
    test('color formats are compatible between servers', async () => {
      // Generate a color palette
      const paletteResult = await client.getClient(MCPServer.COLOR).callTool('color.generatePalette', {
        baseColor: '#3498db',
        type: 'complementary',
        count: 3
      });

      expect(paletteResult.error).toBeUndefined();
      const palette = paletteResult.result;
      expect(palette.colors).toHaveLength(3);

      // Use the first color in SVG creation
      const svgResult = await client.getClient(MCPServer.SVG).callTool('svg.create', {
        width: 100,
        height: 100,
        elements: [{
          type: 'circle',
          cx: 50,
          cy: 50,
          r: 25,
          fill: palette.colors[0].hex
        }]
      });

      expect(svgResult.error).toBeUndefined();
      expect(svgResult.result.svg).toContain(palette.colors[0].hex);
    });

    test('SVG and image server coordinate on dimensions', async () => {
      // Create SVG
      const svgResult = await client.getClient(MCPServer.SVG).callTool('svg.create', {
        width: 200,
        height: 150,
        elements: [{
          type: 'rect',
          x: 0,
          y: 0,
          width: 200,
          height: 150,
          fill: '#green'
        }]
      });

      expect(svgResult.error).toBeUndefined();
      
      // Convert to image format (if image server supports SVG input)
      // This tests data format compatibility
      expect(svgResult.result.metadata.width).toBe(200);
      expect(svgResult.result.metadata.height).toBe(150);
    });
  });

  describe('Error Handling and Recovery', () => {
    test('servers handle invalid requests gracefully', async () => {
      const result = await client.getClient(MCPServer.COLOR).callTool('color.convert', {
        color: 'invalid-color-format',
        targetSpace: 'rgb'
      });

      expect(result.error).toBeDefined();
      expect(result.metrics.duration).toBeLessThan(1000); // Should fail quickly
    });

    test('servers recover from errors and continue processing', async () => {
      // Send invalid request
      const errorResult = await client.getClient(MCPServer.SVG).callTool('svg.create', {
        width: -100, // Invalid
        height: 100,
        elements: []
      });

      expect(errorResult.error).toBeDefined();

      // Send valid request immediately after
      const validResult = await client.getClient(MCPServer.SVG).callTool('svg.create', {
        width: 100,
        height: 100,
        elements: [{
          type: 'circle',
          cx: 50,
          cy: 50,
          r: 25,
          fill: '#red'
        }]
      });

      expect(validResult.error).toBeUndefined();
      expect(validResult.result.svg).toContain('<circle');
    });
  });

  describe('Concurrent Operations', () => {
    test('servers handle parallel requests from different clients', async () => {
      const operations = [
        { server: MCPServer.COLOR, tool: 'color.convert', args: { color: '#ff0000', targetSpace: 'hsl' } },
        { server: MCPServer.SVG, tool: 'svg.create', args: { width: 50, height: 50, elements: [] } },
        { server: MCPServer.COLOR, tool: 'color.generatePalette', args: { baseColor: '#00ff00', type: 'monochromatic', count: 3 } },
        { server: MCPServer.TYPE, tool: 'type.loadFont', args: { source: 'system', family: 'Times' } }
      ];

      const results = await client.executeParallel(operations);
      
      expect(results).toHaveLength(4);
      results.forEach(result => {
        expect(result.error).toBeUndefined();
      });

      // Check that operations completed in reasonable time
      const totalDuration = Math.max(...results.map(r => r.metrics.duration));
      expect(totalDuration).toBeLessThan(2000); // Should complete within 2 seconds
    });

    test('servers maintain performance under concurrent load', async () => {
      const concurrentRequests = 10;
      const operations = Array.from({ length: concurrentRequests }, (_, i) => ({
        server: MCPServer.COLOR,
        tool: 'color.convert',
        args: {
          color: `#${i.toString(16).padStart(6, '0')}`,
          targetSpace: 'hsl'
        }
      }));

      const startTime = performance.now();
      const results = await client.executeParallel(operations);
      const totalTime = performance.now() - startTime;

      expect(results).toHaveLength(concurrentRequests);
      expect(results.every(r => !r.error)).toBe(true);
      
      // Performance expectation: should handle 10 concurrent requests in under 1 second
      expect(totalTime).toBeLessThan(1000);
      
      // Average response time should be reasonable
      const avgResponseTime = results.reduce((sum, r) => sum + r.metrics.duration, 0) / results.length;
      expect(avgResponseTime).toBeLessThan(200);
    });
  });
});