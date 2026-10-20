/**
 * MCP Protocol Compliance Tests
 * Validates that all servers properly implement the MCP protocol standards
 */

import { MCPServerManager, DEFAULT_SERVER_CONFIGS } from '../../src/mcp/server-manager.js';
import { MCPMultiClient, MCPTestClient } from '../../src/mcp/client.js';
import { MCPServer } from '../../src/types/index.js';

describe('MCP Protocol Compliance', () => {
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

  describe('Tool Discovery Protocol', () => {
    test('all servers implement tools/list correctly', async () => {
      const toolsMap = await client.listAllTools();

      for (const [serverName, tools] of toolsMap) {
        // Each server should expose tools
        expect(tools.length).toBeGreaterThan(0);

        // Each tool should have required MCP Tool properties
        tools.forEach(tool => {
          expect(tool).toHaveProperty('name');
          expect(tool).toHaveProperty('description');
          expect(tool).toHaveProperty('inputSchema');

          // Name should follow expected pattern
          expect(tool.name).toMatch(/^[a-z]+\.[a-zA-Z]+$/);

          // Description should be non-empty
          expect(tool.description?.length || 0).toBeGreaterThan(0);

          // Input schema should be valid JSON Schema
          expect(tool.inputSchema).toHaveProperty('type');
          if (tool.inputSchema.type === 'object') {
            expect(tool.inputSchema).toHaveProperty('properties');
          }
        });

        console.log(`[Protocol] ${serverName} exposes ${tools.length} tools`);
      }
    });

    test('tool schemas are valid and complete', async () => {
      const expectedToolsByServer = {
        [MCPServer.COLOR]: [
          'color.convert',
          'color.contrast',
          'color.generatePalette',
          'color.validateAccessibility'
        ],
        [MCPServer.SVG]: [
          'svg.create',
          'svg.optimize',
          'svg.transform'
        ],
        [MCPServer.IMAGE]: [
          'image.resize',
          'image.crop',
          'image.convert'
        ],
        [MCPServer.TYPE]: [
          'type.loadFont',
          'type.validateText'
        ]
      };

      const toolsMap = await client.listAllTools();

      for (const [serverName, expectedTools] of Object.entries(expectedToolsByServer)) {
        const serverTools = toolsMap.get(serverName as MCPServer) || [];
        const toolNames = serverTools.map(tool => tool.name);

        // Check that expected tools are present
        expectedTools.forEach(expectedTool => {
          expect(toolNames).toContain(expectedTool);
        });

        // Validate specific tool schemas
        serverTools.forEach(tool => {
          const schema = tool.inputSchema;

          // Schema should be a valid JSON Schema object
          expect(schema.type).toBeDefined();
          
          if (schema.type === 'object') {
            expect(schema.properties).toBeDefined();
            expect(typeof schema.properties).toBe('object');

            // Required fields should be specified
            if (schema.required) {
              expect(Array.isArray(schema.required)).toBe(true);
              schema.required.forEach((field: string) => {
                expect(schema.properties).toHaveProperty(field);
              });
            }
          }
        });
      }
    });
  });

  describe('Tool Execution Protocol', () => {
    test('all servers handle tools/call requests correctly', async () => {
      const testCases = [
        {
          server: MCPServer.COLOR,
          tool: 'color.convert',
          validArgs: { color: '#ff0000', targetSpace: 'rgb' },
          invalidArgs: { color: 'invalid', targetSpace: 'invalid' }
        },
        {
          server: MCPServer.SVG,
          tool: 'svg.create',
          validArgs: { width: 100, height: 100, elements: [] },
          invalidArgs: { width: -1, height: 'invalid', elements: 'not-array' }
        },
        {
          server: MCPServer.IMAGE,
          tool: 'image.resize',
          validArgs: {
            image: {
              width: 100,
              height: 100,
              format: 'png',
              data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
            },
            width: 50,
            height: 50
          },
          invalidArgs: { image: 'invalid', width: 'invalid', height: -1 }
        },
        {
          server: MCPServer.TYPE,
          tool: 'type.loadFont',
          validArgs: { source: 'system', family: 'Arial' },
          invalidArgs: { source: null, family: '' }
        }
      ];

      for (const testCase of testCases) {
        const serverClient = client.getClient(testCase.server);

        // Test valid request
        const validResult = await serverClient.callTool(testCase.tool, testCase.validArgs);
        expect(validResult.error).toBeUndefined();
        expect(validResult.result).toBeDefined();

        // Test invalid request - should return error, not crash
        const invalidResult = await serverClient.callTool(testCase.tool, testCase.invalidArgs);
        expect(invalidResult.error).toBeDefined();
        expect(invalidResult.error?.message).toBeDefined();
        expect(invalidResult.error?.message.length).toBeGreaterThan(0);
      }
    });

    test('servers return properly formatted responses', async () => {
      const result = await client.getClient(MCPServer.COLOR).callTool('color.convert', {
        color: '#3498db',
        targetSpace: 'hsl'
      });

      expect(result.error).toBeUndefined();
      
      // Response should be properly structured
      expect(result.result).toBeDefined();
      expect(typeof result.result).toBe('object');

      // Should include metadata about the operation
      expect(result.metrics).toBeDefined();
      expect(result.metrics.startTime).toBeDefined();
      expect(result.metrics.endTime).toBeDefined();
      expect(result.metrics.duration).toBeDefined();
      expect(result.metrics.duration).toBeGreaterThan(0);
    });

    test('servers handle unknown tools gracefully', async () => {
      const serverClients = [
        [MCPServer.COLOR, client.getClient(MCPServer.COLOR)],
        [MCPServer.SVG, client.getClient(MCPServer.SVG)],
        [MCPServer.IMAGE, client.getClient(MCPServer.IMAGE)],
        [MCPServer.TYPE, client.getClient(MCPServer.TYPE)]
      ] as const;
      
      for (const [serverName, serverClient] of serverClients) {
        const result = await serverClient.callTool('nonexistent.tool', {});
        
        expect(result.error).toBeDefined();
        expect(result.error?.message).toContain('Unknown tool');
        
        // Server should not crash - next request should work
        const followUpResult = await serverClient.listTools();
        expect(Array.isArray(followUpResult)).toBe(true);
      }
    });
  });

  describe('Error Handling Protocol', () => {
    test('servers return standardized error formats', async () => {
      const errorCases = [
        {
          server: MCPServer.COLOR,
          tool: 'color.convert',
          args: { color: null, targetSpace: 'rgb' },
          expectedErrorType: 'validation'
        },
        {
          server: MCPServer.SVG,
          tool: 'svg.create',
          args: { width: 0, height: 0, elements: null },
          expectedErrorType: 'validation'
        }
      ];

      for (const errorCase of errorCases) {
        const result = await client.getClient(errorCase.server).callTool(errorCase.tool, errorCase.args);
        
        expect(result.error).toBeDefined();
        
        // Error should have proper structure
        const error = result.error!;
        expect(error.message).toBeDefined();
        expect(typeof error.message).toBe('string');
        expect(error.message.length).toBeGreaterThan(0);

        // Error message should be helpful
        expect(error.message).not.toBe('Unknown error');
        expect(error.message).not.toBe('Error');
      }
    });

    test('servers recover from errors and continue processing', async () => {
      const serverClient = client.getClient(MCPServer.COLOR);

      // Send invalid request
      const errorResult = await serverClient.callTool('color.convert', { 
        color: 'definitely-invalid-color',
        targetSpace: 'rgb'
      });
      expect(errorResult.error).toBeDefined();

      // Immediately send valid request
      const validResult = await serverClient.callTool('color.convert', {
        color: '#ff0000',
        targetSpace: 'hsl'
      });
      expect(validResult.error).toBeUndefined();
      expect(validResult.result).toBeDefined();

      // Server should be fully operational
      const tools = await serverClient.listTools();
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
    });
  });

  describe('Request/Response Format Compliance', () => {
    test('servers accept standard MCP request format', async () => {
      // Test that servers properly handle the standard MCP request structure
      const serverClient = client.getClient(MCPServer.COLOR);
      
      const result = await serverClient.callTool('color.convert', {
        color: '#00ff00',
        targetSpace: 'oklch',
        precision: 3
      });

      expect(result.error).toBeUndefined();
      expect(result.result).toBeDefined();
      
      // Response should include all expected fields
      expect(result.server).toBe(MCPServer.COLOR);
      expect(result.toolName).toBe('color.convert');
      expect(result.input).toEqual({
        color: '#00ff00',
        targetSpace: 'oklch',
        precision: 3
      });
    });

    test('servers return responses in standard format', async () => {
      const operations = [
        { server: MCPServer.COLOR, tool: 'color.convert', args: { color: '#ff0000', targetSpace: 'rgb' } },
        { server: MCPServer.SVG, tool: 'svg.create', args: { width: 50, height: 50, elements: [] } }
      ];

      const results = await client.executeParallel(operations);

      results.forEach(result => {
        // Standard MCP response structure
        expect(result).toHaveProperty('server');
        expect(result).toHaveProperty('toolName');
        expect(result).toHaveProperty('input');
        expect(result).toHaveProperty('metrics');

        // Either result or error should be present
        expect(result.result || result.error).toBeDefined();

        // Metrics should be properly formatted
        expect(typeof result.metrics.startTime).toBe('number');
        expect(typeof result.metrics.endTime).toBe('number');
        expect(typeof result.metrics.duration).toBe('number');
        expect(result.metrics.endTime).toBeGreaterThanOrEqual(result.metrics.startTime);
      });
    });
  });

  describe('Timeout and Resource Management', () => {
    test('servers respect timeout constraints', async () => {
      const serverClient = client.getClient(MCPServer.SVG);

      // Create a complex operation that might take time
      const complexOperation = {
        width: 1000,
        height: 1000,
        elements: Array.from({ length: 100 }, (_, i) => ({
          type: 'circle',
          cx: Math.random() * 1000,
          cy: Math.random() * 1000,
          r: Math.random() * 50,
          fill: `hsl(${i * 3.6}, 70%, 50%)`
        }))
      };

      // Test with reasonable timeout
      const result = await serverClient.callTool('svg.create', complexOperation, { 
        timeout: 30000 // 30 seconds
      });
      
      // Should complete or timeout gracefully
      if (result.error) {
        // If it times out, the error should indicate timeout
        expect(result.error.message.toLowerCase()).toMatch(/(timeout|time)/);
      } else {
        // If it completes, it should be within reasonable time
        expect(result.metrics.duration).toBeLessThan(30000);
      }
    });

    test('servers handle concurrent requests without interference', async () => {
      // Send multiple requests to same server simultaneously
      const serverClient = client.getClient(MCPServer.COLOR);
      
      const concurrentOperations = Array.from({ length: 10 }, (_, i) => 
        serverClient.callTool('color.convert', {
          color: `hsl(${i * 36}, 70%, 50%)`,
          targetSpace: 'rgb'
        })
      );

      const results = await Promise.all(concurrentOperations);
      
      // All requests should complete successfully
      expect(results.every(r => !r.error)).toBe(true);
      
      // Each should have unique results based on input
      const uniqueResults = new Set(results.map(r => JSON.stringify(r.result)));
      expect(uniqueResults.size).toBe(10); // All results should be different
    });
  });

  describe('Server Lifecycle Management', () => {
    test('servers start up and shut down cleanly', async () => {
      // This test validates the server management itself
      expect(serverManager.areAllServersReady()).toBe(true);
      
      const statusSummary = serverManager.getStatusSummary();
      
      Object.values(statusSummary).forEach(status => {
        expect(status.status).toBe('ready');
        expect(status.pid).toBeDefined();
        expect(status.uptime).toBeGreaterThan(0);
      });
    });

    test('servers maintain state consistency', async () => {
      // Load a font and verify it remains available
      const typeClient = client.getClient(MCPServer.TYPE);
      
      const loadResult = await typeClient.callTool('type.loadFont', {
        source: 'system',
        family: 'Arial'
      });
      expect(loadResult.error).toBeUndefined();

      // Font should remain loaded for subsequent operations
      const validateResult = await typeClient.callTool('type.validateText', {
        text: 'Test Text',
        fontFamily: 'Arial'
      });
      
      if (!validateResult.error) {
        expect(validateResult.result.fontAvailable).toBe(true);
      }
    });
  });

  describe('Integration Compliance Score', () => {
    test('all servers achieve minimum compliance score', async () => {
      const complianceResults = await client.validateAllCompliance();
      
      const overallScores: Record<string, number> = {};
      
      for (const [serverName, compliance] of complianceResults) {
        console.log(`[Compliance] ${serverName}: Score ${compliance.score}/100, Compliant: ${compliance.compliant}`);
        
        if (compliance.issues.length > 0) {
          console.log(`[Compliance] ${serverName} Issues:`, compliance.issues);
        }

        // Minimum compliance score requirement
        expect(compliance.score).toBeGreaterThanOrEqual(80);
        
        overallScores[serverName] = compliance.score;
      }

      // Overall system compliance
      const averageScore = Object.values(overallScores).reduce((sum, score) => sum + score, 0) / Object.values(overallScores).length;
      expect(averageScore).toBeGreaterThanOrEqual(85);

      console.log(`[Compliance] Overall system compliance score: ${averageScore.toFixed(2)}/100`);
    });
  });
});