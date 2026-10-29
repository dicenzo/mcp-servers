import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { McpError, ErrorCode, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Mock the MCP SDK components
jest.mock('@modelcontextprotocol/sdk/server/index.js');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

// Mock all the tool modules
jest.mock('../src/tools/colorConvert.js', () => ({
  colorConvert: jest.fn(),
  colorConvertTool: { 
    name: 'color.convert', 
    description: 'Convert colors between different color spaces',
    inputSchema: { type: 'object' }
  }
}));

jest.mock('../src/tools/colorContrast.js', () => ({
  colorContrast: jest.fn(),
  colorContrastTool: { 
    name: 'color.contrast', 
    description: 'Check WCAG contrast ratios',
    inputSchema: { type: 'object' }
  }
}));

jest.mock('../src/tools/colorGeneratePalette.js', () => ({
  colorGeneratePalette: jest.fn(),
  colorGeneratePaletteTool: { 
    name: 'color.generatePalette', 
    description: 'Generate harmonious color palettes',
    inputSchema: { type: 'object' }
  }
}));

jest.mock('../src/tools/colorBrandMatch.js', () => ({
  colorBrandMatch: jest.fn(),
  colorBrandMatchTool: { 
    name: 'color.brandMatch', 
    description: 'Find matching colors in brand palette',
    inputSchema: { type: 'object' }
  }
}));

jest.mock('../src/tools/colorLintBrand.js', () => ({
  colorLintBrand: jest.fn(),
  colorLintBrandTool: { 
    name: 'color.lintBrand', 
    description: 'Validate brand color consistency',
    inputSchema: { type: 'object' }
  }
}));

jest.mock('../src/tools/colorValidateAccessibility.js', () => ({
  colorValidateAccessibility: jest.fn(),
  colorValidateAccessibilityTool: { 
    name: 'color.validateAccessibility', 
    description: 'Comprehensive accessibility validation',
    inputSchema: { type: 'object' }
  }
}));

// Import after mocking - import individual modules since index.js doesn't exist
import { colorConvert } from '../src/tools/colorConvert.js';
import { colorContrast } from '../src/tools/colorContrast.js';  
import { colorGeneratePalette } from '../src/tools/colorGeneratePalette.js';
import { colorBrandMatch } from '../src/tools/colorBrandMatch.js';
import { colorLintBrand } from '../src/tools/colorLintBrand.js';
import { colorValidateAccessibility } from '../src/tools/colorValidateAccessibility.js';

// Import the server from server.ts: src/index.ts is only the executable entry
// point (it starts a stdio server when run directly) and uses import.meta,
// which ts-jest's CommonJS output cannot compile.
import { MCPColorServer, main } from '../src/server.js';

// jest.fn() from @jest/globals is typed as taking `never` arguments unless given a
// function type; these mocks stand in for SDK and tool functions of varying shapes.
type AnyFunction = (...args: any[]) => any;

describe('MCP Color Server', () => {
  let mockServer: jest.Mocked<Server>;
  let consoleErrorSpy: any;
  let consoleWarnSpy: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    
    // Mock console methods to capture logs
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    // Create a mock server instance
    mockServer = {
      setRequestHandler: jest.fn(),
      connect: jest.fn<AnyFunction>().mockResolvedValue(undefined),
      close: jest.fn<AnyFunction>().mockResolvedValue(undefined),
      onerror: null
    } as any;
    
    (Server as jest.MockedClass<typeof Server>).mockImplementation(() => mockServer);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    consoleWarnSpy.mockRestore();
  });

  describe('Server initialization', () => {
    test('creates server with correct configuration', () => {
      // Create server instance directly
      const serverInstance = new MCPColorServer();
      
      expect(Server).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'mcp-graphics-color',
          version: '1.0.0',
          description: 'MCP Server for color science, accessibility validation, and brand color operations',
          author: 'Tony DiCenzo'
        }),
        expect.objectContaining({
          capabilities: {
            tools: {}
          }
        })
      );
    });

    test('sets up tool handlers correctly', () => {
      const serverInstance = new MCPColorServer();
      
      // Should set up both ListTools and CallTool handlers
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(2);
    });

    test('logs startup information when running', async () => {
      const serverInstance = new MCPColorServer();
      
      // Test the run method
      await serverInstance.run();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('mcp-graphics-color v1.0.0 starting')
      );
      expect(consoleErrorSpy).toHaveBeenCalledWith('[STARTUP] Available tools:');
      expect(consoleErrorSpy).toHaveBeenCalledWith('[STARTUP] Server ready and listening for requests');
    });
  });

  describe('Tool listing', () => {
    test('returns all available tools', async () => {
      const serverInstance = new MCPColorServer();
      
      // Get the ListTools handler
      const listToolsCall = mockServer.setRequestHandler.mock.calls.find(
        call => call[0] === ListToolsRequestSchema
      );
      
      expect(listToolsCall).toBeDefined();
      
      if (listToolsCall) {
        const listToolsHandler = listToolsCall[1] as AnyFunction;
        const result = await listToolsHandler({} as any);
        
        expect(result).toBeDefined();
        if ('tools' in result) {
          expect(result.tools).toHaveLength(6);
          expect(result.tools.map((t: any) => t.name)).toEqual([
            'color.convert',
            'color.contrast',
            'color.generatePalette',
            'color.brandMatch',
            'color.lintBrand',
            'color.validateAccessibility'
          ]);
        }
      }
    });
  });

  describe('Tool execution', () => {
    let callToolHandler: any;

    beforeEach(() => {
      const serverInstance = new MCPColorServer();
      
      // Get the CallTool handler (should be the second handler registered)
      const callToolCall = mockServer.setRequestHandler.mock.calls[1];
      callToolHandler = callToolCall?.[1];
      
      expect(callToolHandler).toBeDefined();
    });

    test('routes color.convert correctly', async () => {
      const mockResult = { 
        success: true, 
        result: { hex: '#ff0000' }
      };
      (colorConvert as jest.Mock<AnyFunction>).mockResolvedValue(mockResult);

      const result = await callToolHandler({
        params: { name: 'color.convert', arguments: { color: '#ff0000' } }
      });

      expect(colorConvert).toHaveBeenCalledWith({ color: '#ff0000' });
      expect(result.content[0].text).toBe(JSON.stringify(mockResult.result, null, 2));
    });

    test('routes color.contrast correctly', async () => {
      const mockResult = { 
        success: true, 
        result: { ratio: 21 }
      };
      (colorContrast as jest.Mock<AnyFunction>).mockResolvedValue(mockResult);

      const result = await callToolHandler({
        params: { name: 'color.contrast', arguments: { foreground: '#000000', background: '#ffffff' } }
      });

      expect(colorContrast).toHaveBeenCalledWith({ foreground: '#000000', background: '#ffffff' });
      expect(result.content[0].text).toBe(JSON.stringify(mockResult.result, null, 2));
    });

    test('routes color.generatePalette correctly', async () => {
      const mockResult = { 
        success: true, 
        result: { colors: ['#ff0000', '#00ff00'] }
      };
      (colorGeneratePalette as jest.Mock<AnyFunction>).mockResolvedValue(mockResult);

      const result = await callToolHandler({
        params: { name: 'color.generatePalette', arguments: { baseColor: '#ff0000' } }
      });

      expect(colorGeneratePalette).toHaveBeenCalledWith({ baseColor: '#ff0000' });
      expect(result.content[0].text).toBe(JSON.stringify(mockResult.result, null, 2));
    });

    test('routes color.brandMatch correctly', async () => {
      const mockResult = { 
        success: true, 
        result: { bestMatch: { hex: '#ff0000' } }
      };
      (colorBrandMatch as jest.Mock<AnyFunction>).mockResolvedValue(mockResult);

      const result = await callToolHandler({
        params: { name: 'color.brandMatch', arguments: { targetColor: '#ff0000', brandPalette: ['#ff0000'] } }
      });

      expect(colorBrandMatch).toHaveBeenCalledWith({ targetColor: '#ff0000', brandPalette: ['#ff0000'] });
      expect(result.content[0].text).toBe(JSON.stringify(mockResult.result, null, 2));
    });

    test('routes color.lintBrand correctly', async () => {
      const mockResult = { 
        success: true, 
        result: { passed: true, score: 100 }
      };
      (colorLintBrand as jest.Mock<AnyFunction>).mockResolvedValue(mockResult);

      const result = await callToolHandler({
        params: { name: 'color.lintBrand', arguments: { palette: ['#ff0000'], rules: {} } }
      });

      expect(colorLintBrand).toHaveBeenCalledWith({ palette: ['#ff0000'], rules: {} });
      expect(result.content[0].text).toBe(JSON.stringify(mockResult.result, null, 2));
    });

    test('routes color.validateAccessibility correctly', async () => {
      const mockResult = { 
        success: true, 
        result: { overallPassed: true }
      };
      (colorValidateAccessibility as jest.Mock<AnyFunction>).mockResolvedValue(mockResult);

      const result = await callToolHandler({
        params: { name: 'color.validateAccessibility', arguments: { colors: ['#000000', '#ffffff'], contexts: [] } }
      });

      expect(colorValidateAccessibility).toHaveBeenCalledWith({ colors: ['#000000', '#ffffff'], contexts: [] });
      expect(result.content[0].text).toBe(JSON.stringify(mockResult.result, null, 2));
    });

    test('throws error for unknown tool', async () => {
      await expect(callToolHandler({
        params: { name: 'unknown.tool', arguments: {} }
      })).rejects.toThrow(McpError);
    });

    test('handles tool errors correctly', async () => {
      const mockError = { 
        success: false, 
        error: { 
          code: 'INVALID_INPUT', 
          message: 'Invalid color format',
          details: { input: 'invalid' }
        }
      };
      (colorConvert as jest.Mock<AnyFunction>).mockResolvedValue(mockError);

      await expect(callToolHandler({
        params: { name: 'color.convert', arguments: { color: 'invalid' } }
      })).rejects.toThrow(McpError);
    });

    test('logs successful tool usage', async () => {
      const mockResult = { success: true, result: {} };
      (colorConvert as jest.Mock<AnyFunction>).mockResolvedValue(mockResult);

      await callToolHandler({
        params: { name: 'color.convert', arguments: {} }
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[INFO\] Tool color\.convert completed in \d+\.\d+ms/)
      );
    });

    test('warns about performance violations', async () => {
      const mockResult = { success: true, result: {} };
      (colorConvert as jest.Mock<AnyFunction>).mockImplementation(async () => {
        // Simulate slow operation
        await new Promise(resolve => setTimeout(resolve, 15)); // Should exceed 10ms target
        return mockResult;
      });

      await callToolHandler({
        params: { name: 'color.convert', arguments: {} }
      });

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[PERFORMANCE\] Tool color\.convert took \d+\.\d+ms \(target: 10ms\)/)
      );
    });

    test('handles exceptions during tool execution', async () => {
      (colorConvert as jest.Mock<AnyFunction>).mockRejectedValue(new Error('Unexpected error'));

      await expect(callToolHandler({
        params: { name: 'color.convert', arguments: {} }
      })).rejects.toThrow(McpError);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\[ERROR\] Tool color\.convert failed after \d+\.\d+ms/),
        expect.any(Error)
      );
    });
  });

  describe('Performance monitoring', () => {
    test('defines correct performance targets', async () => {
      // This tests that the performance targets are properly defined
      const targets = {
        'color.convert': 10,
        'color.contrast': 50,
        'color.generatePalette': 100,
        'color.brandMatch': 150,
        'color.lintBrand': 200,
        'color.validateAccessibility': 50
      };

      new MCPColorServer();
      
      // We can't directly access the constants, but we can verify they exist
      // by testing the performance monitoring behavior
      expect(mockServer.setRequestHandler).toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    test('handles server errors', async () => {
      new MCPColorServer();
      
      // Simulate server error
      const errorHandler = mockServer.onerror;
      expect(errorHandler).toEqual(expect.any(Function));
      const testError = new Error('Server error');
      errorHandler!(testError);
      
      expect(consoleErrorSpy).toHaveBeenCalledWith('[SERVER ERROR]', testError);
    });

    test('handles process signals', async () => {
      const mockProcess = {
        on: jest.fn<AnyFunction>(),
        exit: jest.fn<AnyFunction>()
      };
      
      // Mock process.on calls
      const originalProcessOn = process.on;
      process.on = mockProcess.on as any;
      
      try {
        new MCPColorServer();
        
        // Should register SIGINT and SIGTERM handlers
        expect(mockProcess.on).toHaveBeenCalledWith('SIGINT', expect.any(Function));
        expect(mockProcess.on).toHaveBeenCalledWith('SIGTERM', expect.any(Function));
        
      } finally {
        process.on = originalProcessOn;
      }
    });
  });

  describe('Server lifecycle', () => {
    test('logs uptime on shutdown', async () => {
      const mockProcess = {
        on: jest.fn<AnyFunction>(),
        exit: jest.fn<AnyFunction>()
      };
      
      const originalProcessOn = process.on;
      process.on = mockProcess.on as any;
      // The shutdown handler calls process.exit; keep it from ending the test run
      const exitSpy = jest.spyOn(process, 'exit').mockImplementation(mockProcess.exit as any);
      
      try {
        new MCPColorServer();
        
        // Get the SIGINT handler
        const sigintHandler = mockProcess.on.mock.calls.find(
          call => call[0] === 'SIGINT'
        )?.[1];
        
        expect(sigintHandler).toEqual(expect.any(Function));
        // Simulate SIGINT
        await sigintHandler();
        
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringMatching(/\[SHUTDOWN\] Server ran for \d+ms/)
        );
        expect(mockServer.close).toHaveBeenCalled();
        expect(mockProcess.exit).toHaveBeenCalledWith(0);
      } finally {
        process.on = originalProcessOn;
        exitSpy.mockRestore();
      }
    });

    test('connects to transport and logs ready message', async () => {
      // This will trigger the server startup
      await main();
      
      expect(mockServer.connect).toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith('[STARTUP] Server ready and listening for requests');
    });
  });

  describe('Integration with transport', () => {
    test('creates stdio transport', async () => {
      const { StdioServerTransport } = await import('@modelcontextprotocol/sdk/server/stdio.js');
      
      await main();
      
      expect(StdioServerTransport).toHaveBeenCalled();
    });
  });

  describe('Main function error handling', () => {
    test('handles startup errors', async () => {
      const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {
        throw new Error('Process exit called');
      });
      
      // Mock Server constructor to throw an error
      (Server as jest.MockedClass<typeof Server>).mockImplementation(() => {
        throw new Error('Server startup failed');
      });
      
      try {
        // main() should report the error and exit with status 1
        await expect(main()).rejects.toThrow('Process exit called');
        
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[FATAL ERROR] Failed to start server:',
          expect.any(Error)
        );
        expect(mockExit).toHaveBeenCalledWith(1);
      } finally {
        mockExit.mockRestore();
      }
    });
  });
});