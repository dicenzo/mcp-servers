/**
 * Concurrent Operations Performance Tests
 * Tests system behavior under concurrent load across multiple MCP servers
 */

import { MCPServerManager, DEFAULT_SERVER_CONFIGS } from '../../src/mcp/server-manager.js';
import { MCPMultiClient } from '../../src/mcp/client.js';
import { MCPServer } from '../../src/types/index.js';

describe('Concurrent Operations Performance', () => {
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

  describe('Single Server Load Testing', () => {
    test('color server handles high concurrent load', async () => {
      const concurrency = 50;
      const operations = Array.from({ length: concurrency }, (_, i) => ({
        server: MCPServer.COLOR,
        tool: 'color.convert',
        args: {
          color: `hsl(${i * 7}, 70%, 50%)`,
          targetSpace: 'rgb'
        }
      }));

      const startTime = performance.now();
      const initialMemory = process.memoryUsage();
      
      const results = await client.executeParallel(operations);
      
      const endTime = performance.now();
      const finalMemory = process.memoryUsage();
      
      // Validate results
      expect(results).toHaveLength(concurrency);
      expect(results.every(r => !r.error)).toBe(true);
      
      // Performance assertions
      const totalTime = endTime - startTime;
      const avgResponseTime = results.reduce((sum, r) => sum + r.metrics.duration, 0) / results.length;
      
      expect(totalTime).toBeLessThan(5000); // 5 seconds max for 50 operations
      expect(avgResponseTime).toBeLessThan(500); // 500ms average per operation
      
      // Memory usage shouldn't increase dramatically
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024); // Less than 100MB increase
      
      console.log(`[Performance] Color server: ${concurrency} ops in ${totalTime.toFixed(2)}ms, avg ${avgResponseTime.toFixed(2)}ms/op`);
    });

    test('svg server maintains performance under load', async () => {
      const concurrency = 30;
      const operations = Array.from({ length: concurrency }, (_, i) => ({
        server: MCPServer.SVG,
        tool: 'svg.create',
        args: {
          width: 200 + i * 10,
          height: 150 + i * 8,
          elements: [{
            type: 'circle',
            cx: 100 + i * 5,
            cy: 75 + i * 4,
            r: 25 + i,
            fill: `hsl(${i * 12}, 60%, 50%)`
          }]
        }
      }));

      const startTime = performance.now();
      const results = await client.executeParallel(operations);
      const endTime = performance.now();

      expect(results).toHaveLength(concurrency);
      expect(results.every(r => !r.error)).toBe(true);

      const totalTime = endTime - startTime;
      const throughput = concurrency / (totalTime / 1000); // ops per second
      
      expect(totalTime).toBeLessThan(10000); // 10 seconds max
      expect(throughput).toBeGreaterThan(3); // At least 3 ops per second
      
      console.log(`[Performance] SVG server: ${throughput.toFixed(2)} ops/sec`);
    });

    test('image server handles batch processing efficiently', async () => {
      const batchSize = 20;
      const operations = Array.from({ length: batchSize }, (_, i) => ({
        server: MCPServer.IMAGE,
        tool: 'image.resize',
        args: {
          image: {
            width: 400,
            height: 300,
            format: 'png',
            data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
          },
          width: 100 + i * 10,
          height: 75 + i * 7
        }
      }));

      const startTime = performance.now();
      const results = await client.executeParallel(operations);
      const endTime = performance.now();

      expect(results).toHaveLength(batchSize);
      expect(results.every(r => !r.error)).toBe(true);

      const totalTime = endTime - startTime;
      const avgTime = totalTime / batchSize;
      
      expect(avgTime).toBeLessThan(1000); // Average under 1 second per image
      
      // Validate that images were actually resized
      results.forEach((result, i) => {
        expect(result.result.width).toBe(100 + i * 10);
        expect(result.result.height).toBe(75 + i * 7);
      });
    });
  });

  describe('Multi-Server Concurrent Operations', () => {
    test('distributes load evenly across all servers', async () => {
      const operationsPerServer = 10;
      const operations = [
        // Color operations
        ...Array.from({ length: operationsPerServer }, (_, i) => ({
          server: MCPServer.COLOR,
          tool: 'color.generatePalette',
          args: {
            baseColor: `hsl(${i * 36}, 70%, 50%)`,
            type: 'complementary',
            count: 3
          }
        })),
        // SVG operations
        ...Array.from({ length: operationsPerServer }, (_, i) => ({
          server: MCPServer.SVG,
          tool: 'svg.create',
          args: {
            width: 100,
            height: 100,
            elements: [{
              type: 'rect',
              x: i * 5,
              y: i * 5,
              width: 50,
              height: 50,
              fill: '#333333'
            }]
          }
        })),
        // Image operations
        ...Array.from({ length: operationsPerServer }, (_, i) => ({
          server: MCPServer.IMAGE,
          tool: 'image.crop',
          args: {
            image: {
              width: 200,
              height: 200,
              format: 'png',
              data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
            },
            x: i * 2,
            y: i * 2,
            width: 50 + i,
            height: 50 + i
          }
        })),
        // Type operations
        ...Array.from({ length: operationsPerServer }, (_, i) => ({
          server: MCPServer.TYPE,
          tool: 'type.loadFont',
          args: {
            source: 'system',
            family: i % 2 === 0 ? 'Arial' : 'Times'
          }
        }))
      ];

      const startTime = performance.now();
      const results = await client.executeParallel(operations);
      const endTime = performance.now();

      expect(results).toHaveLength(operationsPerServer * 4);
      
      // Group results by server
      const resultsByServer = results.reduce((acc, result) => {
        acc[result.server] = acc[result.server] || [];
        acc[result.server].push(result);
        return acc;
      }, {} as Record<string, any[]>);

      // Validate each server processed its operations
      expect(resultsByServer[MCPServer.COLOR]).toHaveLength(operationsPerServer);
      expect(resultsByServer[MCPServer.SVG]).toHaveLength(operationsPerServer);
      expect(resultsByServer[MCPServer.IMAGE]).toHaveLength(operationsPerServer);
      expect(resultsByServer[MCPServer.TYPE]).toHaveLength(operationsPerServer);

      // Check that operations completed successfully across all servers
      Object.entries(resultsByServer).forEach(([serverName, serverResults]) => {
        const successRate = serverResults.filter(r => !r.error).length / serverResults.length;
        expect(successRate).toBeGreaterThan(0.9); // At least 90% success rate per server
      });

      const totalTime = endTime - startTime;
      const overallThroughput = results.length / (totalTime / 1000);
      
      expect(overallThroughput).toBeGreaterThan(2); // At least 2 ops/sec overall
      
      console.log(`[Performance] Multi-server: ${overallThroughput.toFixed(2)} ops/sec across 4 servers`);
    });

    test('maintains performance under mixed workload patterns', async () => {
      // Simulate realistic workload with different operation types and complexities
      const lightOperations = Array.from({ length: 20 }, (_, i) => ({
        server: MCPServer.COLOR,
        tool: 'color.convert',
        args: { color: `#${(i * 123456).toString(16).padStart(6, '0').slice(0, 6)}`, targetSpace: 'hsl' }
      }));

      const mediumOperations = Array.from({ length: 10 }, (_, i) => ({
        server: MCPServer.SVG,
        tool: 'svg.create',
        args: {
          width: 300,
          height: 200,
          elements: Array.from({ length: 5 }, (_, j) => ({
            type: 'circle',
            cx: j * 60 + 30,
            cy: 100,
            r: 20,
            fill: `hsl(${(i + j) * 30}, 70%, 50%)`
          }))
        }
      }));

      const heavyOperations = Array.from({ length: 5 }, (_, i) => ({
        server: MCPServer.COLOR,
        tool: 'color.generatePalette',
        args: {
          baseColor: `hsl(${i * 72}, 60%, 50%)`,
          type: 'analogous',
          count: 10
        }
      }));

      const allOperations = [...lightOperations, ...mediumOperations, ...heavyOperations];
      
      const startTime = performance.now();
      const results = await client.executeParallel(allOperations);
      const endTime = performance.now();

      expect(results).toHaveLength(allOperations.length);
      
      // Analyze performance by operation complexity
      const lightResults = results.slice(0, lightOperations.length);
      const mediumResults = results.slice(lightOperations.length, lightOperations.length + mediumOperations.length);
      const heavyResults = results.slice(-heavyOperations.length);

      const lightAvgTime = lightResults.reduce((sum, r) => sum + r.metrics.duration, 0) / lightResults.length;
      const mediumAvgTime = mediumResults.reduce((sum, r) => sum + r.metrics.duration, 0) / mediumResults.length;
      const heavyAvgTime = heavyResults.reduce((sum, r) => sum + r.metrics.duration, 0) / heavyResults.length;

      // Light operations should be fastest
      expect(lightAvgTime).toBeLessThan(mediumAvgTime);
      expect(mediumAvgTime).toBeLessThan(heavyAvgTime);

      // Performance bounds
      expect(lightAvgTime).toBeLessThan(100);   // < 100ms for light ops
      expect(mediumAvgTime).toBeLessThan(500);  // < 500ms for medium ops
      expect(heavyAvgTime).toBeLessThan(2000);  // < 2s for heavy ops

      const totalTime = endTime - startTime;
      expect(totalTime).toBeLessThan(15000); // All operations complete within 15 seconds

      console.log(`[Performance] Mixed workload - Light: ${lightAvgTime.toFixed(2)}ms, Medium: ${mediumAvgTime.toFixed(2)}ms, Heavy: ${heavyAvgTime.toFixed(2)}ms`);
    });
  });

  describe('Resource Management Under Load', () => {
    test('memory usage remains stable under sustained load', async () => {
      const rounds = 5;
      const operationsPerRound = 20;
      const memoryReadings: number[] = [];

      // Take initial memory reading
      global.gc?.(); // Force garbage collection if available
      await new Promise(resolve => setTimeout(resolve, 100));
      memoryReadings.push(process.memoryUsage().heapUsed);

      for (let round = 0; round < rounds; round++) {
        const operations = Array.from({ length: operationsPerRound }, (_, i) => ({
          server: [MCPServer.COLOR, MCPServer.SVG, MCPServer.IMAGE, MCPServer.TYPE][i % 4],
          tool: ['color.convert', 'svg.create', 'image.resize', 'type.loadFont'][i % 4],
          args: {
            // Generic args that work for basic calls
            color: '#ff0000',
            targetSpace: 'rgb',
            width: 100,
            height: 100,
            elements: [],
            image: {
              width: 100,
              height: 100,
              format: 'png',
              data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg=='
            },
            source: 'system',
            family: 'Arial'
          }
        }));

        await client.executeParallel(operations);

        // Take memory reading after each round
        global.gc?.(); // Force garbage collection if available
        await new Promise(resolve => setTimeout(resolve, 100));
        memoryReadings.push(process.memoryUsage().heapUsed);
      }

      // Analyze memory trend
      const initialMemory = memoryReadings[0];
      const finalMemory = memoryReadings[memoryReadings.length - 1];
      const memoryIncrease = finalMemory - initialMemory;

      // Memory should not increase by more than 50MB over the test
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);

      // Check for memory leaks (consistent upward trend)
      const memoryGrowthRate = memoryIncrease / rounds;
      expect(memoryGrowthRate).toBeLessThan(10 * 1024 * 1024); // Less than 10MB growth per round

      console.log(`[Performance] Memory usage - Initial: ${(initialMemory / 1024 / 1024).toFixed(2)}MB, Final: ${(finalMemory / 1024 / 1024).toFixed(2)}MB, Growth: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
    });

    test('servers recover from resource exhaustion', async () => {
      // Create a very demanding workload to stress the servers
      const exhaustingOperations = Array.from({ length: 100 }, (_, i) => ({
        server: MCPServer.SVG,
        tool: 'svg.create',
        args: {
          width: 1000,
          height: 800,
          elements: Array.from({ length: 50 }, (_, j) => ({
            type: 'circle',
            cx: Math.random() * 1000,
            cy: Math.random() * 800,
            r: Math.random() * 50 + 10,
            fill: `hsl(${(i + j) * 7}, 70%, 50%)`
          }))
        }
      }));

      // Execute exhausting workload
      const exhaustResults = await client.executeParallel(exhaustingOperations);
      
      // Some operations might fail due to resource constraints, but servers should not crash
      const successfulOperations = exhaustResults.filter(r => !r.error).length;
      expect(successfulOperations).toBeGreaterThan(exhaustingOperations.length * 0.5); // At least 50% should succeed

      // Wait for recovery
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Test that servers can handle normal operations after stress
      const recoveryOperations = [
        { server: MCPServer.COLOR, tool: 'color.convert', args: { color: '#ff0000', targetSpace: 'hsl' } },
        { server: MCPServer.SVG, tool: 'svg.create', args: { width: 100, height: 100, elements: [] } },
        { server: MCPServer.IMAGE, tool: 'image.resize', args: { 
          image: { width: 100, height: 100, format: 'png', data: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==' },
          width: 50, 
          height: 50 
        }},
        { server: MCPServer.TYPE, tool: 'type.loadFont', args: { source: 'system', family: 'Arial' } }
      ];

      const recoveryResults = await client.executeParallel(recoveryOperations);
      
      // All recovery operations should succeed
      expect(recoveryResults.every(r => !r.error)).toBe(true);
      
      // Response times should be back to normal
      const avgRecoveryTime = recoveryResults.reduce((sum, r) => sum + r.metrics.duration, 0) / recoveryResults.length;
      expect(avgRecoveryTime).toBeLessThan(1000); // Should be responsive again

      console.log(`[Performance] Resource recovery - ${successfulOperations}/${exhaustingOperations.length} stress ops succeeded, recovery avg: ${avgRecoveryTime.toFixed(2)}ms`);
    });
  });

  describe('Scalability Testing', () => {
    test('performance scales predictably with load', async () => {
      const loadLevels = [5, 10, 20, 30];
      const results: Array<{ load: number; avgTime: number; throughput: number }> = [];

      for (const load of loadLevels) {
        const operations = Array.from({ length: load }, (_, i) => ({
          server: MCPServer.COLOR,
          tool: 'color.generatePalette',
          args: {
            baseColor: `hsl(${i * (360 / load)}, 70%, 50%)`,
            type: 'complementary',
            count: 3
          }
        }));

        const startTime = performance.now();
        const operationResults = await client.executeParallel(operations);
        const endTime = performance.now();

        const totalTime = endTime - startTime;
        const avgTime = operationResults.reduce((sum, r) => sum + r.metrics.duration, 0) / operationResults.length;
        const throughput = load / (totalTime / 1000);

        results.push({ load, avgTime, throughput });

        // All operations should succeed
        expect(operationResults.every(r => !r.error)).toBe(true);
      }

      // Analyze scalability
      console.log('[Performance] Scalability analysis:');
      results.forEach(r => {
        console.log(`  Load ${r.load}: ${r.avgTime.toFixed(2)}ms avg, ${r.throughput.toFixed(2)} ops/sec`);
      });

      // Throughput should generally increase with load (until bottleneck)
      const throughputs = results.map(r => r.throughput);
      const maxThroughput = Math.max(...throughputs);
      const minThroughput = Math.min(...throughputs);
      
      // Maximum throughput should be at least 2x minimum throughput
      expect(maxThroughput / minThroughput).toBeGreaterThan(2);

      // Average response time should remain reasonable even at highest load
      const highestLoadResult = results[results.length - 1];
      expect(highestLoadResult.avgTime).toBeLessThan(3000); // Less than 3 seconds average
    });
  });
});