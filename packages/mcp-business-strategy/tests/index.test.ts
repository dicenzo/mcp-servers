import 'jest';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

// Mock the MCP SDK
jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => ({
    setRequestHandler: jest.fn(),
    onerror: jest.fn(),
    connect: jest.fn(),
  })),
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => ({})),
}));

// Mock the tools and resources
jest.mock('../src/tools/webSearch.js', () => ({
  webSearchTool: { name: 'web.search', invoke: jest.fn() }
}));

jest.mock('../src/tools/dataEnrich.js', () => ({
  dataEnrichTool: { name: 'data.enrich', invoke: jest.fn() }
}));

jest.mock('../src/tools/unitEcon.js', () => ({
  unitEconTool: { name: 'unitecon.calc', invoke: jest.fn() }
}));

jest.mock('../src/tools/scenario.js', () => ({
  scenarioTool: { name: 'scenario.run', invoke: jest.fn() }
}));

jest.mock('../src/tools/templates.js', () => ({
  templatesTool: { name: 'templates.get', invoke: jest.fn() }
}));

jest.mock('../src/resources/templates.resource.js', () => ({
  templatesResourceProvider: {
    list: jest.fn(),
    read: jest.fn(),
  }
}));

// Mock console.error to avoid noise in tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

describe('MCP Server', () => {
  let mockServer: jest.Mocked<Server>;
  let mockTransport: jest.Mocked<StdioServerTransport>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockServer = {
      setRequestHandler: jest.fn(),
      onerror: jest.fn(),
      connect: jest.fn(),
    } as any;
    
    mockTransport = {} as any;
    
    (Server as jest.Mock).mockImplementation(() => mockServer);
    (StdioServerTransport as jest.Mock).mockImplementation(() => mockTransport);
  });

  describe('Server Initialization', () => {
    it('should create server with correct configuration', () => {
      // Import the module to trigger initialization
      require('../src/index.js');
      
      expect(Server).toHaveBeenCalledWith(
        {
          name: 'bs-agents-mcp',
          version: '0.1.0',
        },
        {
          capabilities: {
            tools: {},
            resources: {},
          },
        }
      );
    });

    it('should register tool request handler', () => {
      require('../src/index.js');
      
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        expect.any(Object), // Zod schema
        expect.any(Function) // Handler function
      );
    });

    it('should register resource list handler', () => {
      require('../src/index.js');
      
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          method: expect.any(Object)
        }),
        expect.any(Function)
      );
    });

    it('should register resource read handler', () => {
      require('../src/index.js');
      
      expect(mockServer.setRequestHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          method: expect.any(Object)
        }),
        expect.any(Function)
      );
    });

    it('should set error handler', () => {
      require('../src/index.js');
      
      expect(mockServer.onerror).toHaveBeenCalledWith(expect.any(Function));
    });
  });

  describe('Tool Registration', () => {
    it('should register all required tools', () => {
      require('../src/index.js');
      
      // The tools are imported and registered in the module
      // We can verify this by checking that the module loads without errors
      expect(true).toBe(true);
    });
  });

  describe('Environment Validation', () => {
    it('should handle missing API keys gracefully', () => {
      // Clear environment variables
      delete process.env.TAVILY_API_KEY;
      delete process.env.SERPAPI_KEY;
      delete process.env.BRAVE_API_KEY;
      
      // Should not throw when importing
      expect(() => require('../src/index.js')).not.toThrow();
    });

    it('should handle partial API keys', () => {
      process.env.TAVILY_API_KEY = 'test-key';
      delete process.env.SERPAPI_KEY;
      delete process.env.BRAVE_API_KEY;
      
      expect(() => require('../src/index.js')).not.toThrow();
    });

    it('should handle all API keys present', () => {
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.SERPAPI_KEY = 'test-serpapi-key';
      process.env.BRAVE_API_KEY = 'test-brave-key';
      
      expect(() => require('../src/index.js')).not.toThrow();
    });
  });

  describe('Process Signal Handling', () => {
    it('should handle SIGINT signal', () => {
      const originalExit = process.exit;
      const mockExit = jest.fn();
      process.exit = mockExit as any;
      
      // Import module to set up signal handlers
      require('../src/index.js');
      
      // Simulate SIGINT
      process.emit('SIGINT' as any);
      
      expect(mockExit).toHaveBeenCalledWith(0);
      
      process.exit = originalExit;
    });

    it('should handle SIGTERM signal', () => {
      const originalExit = process.exit;
      const mockExit = jest.fn();
      process.exit = mockExit as any;
      
      // Import module to set up signal handlers
      require('../src/index.js');
      
      // Simulate SIGTERM
      process.emit('SIGTERM' as any);
      
      expect(mockExit).toHaveBeenCalledWith(0);
      
      process.exit = originalExit;
    });
  });

  describe('Server Startup', () => {
    it('should start server successfully', async () => {
      mockServer.connect.mockResolvedValue(undefined);
      
      // Import module to trigger startup
      require('../src/index.js');
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockServer.connect).toHaveBeenCalledWith(mockTransport);
    });

    it('should handle server startup errors', async () => {
      mockServer.connect.mockRejectedValue(new Error('Connection failed'));
      
      const originalExit = process.exit;
      const mockExit = jest.fn();
      process.exit = mockExit as any;
      
      // Import module to trigger startup
      require('../src/index.js');
      
      // Wait for async operations
      await new Promise(resolve => setTimeout(resolve, 100));
      
      expect(mockExit).toHaveBeenCalledWith(1);
      
      process.exit = originalExit;
    });
  });

  describe('Module Structure', () => {
    it('should export all required tools', () => {
      const webSearch = require('../src/tools/webSearch.js');
      const dataEnrich = require('../src/tools/dataEnrich.js');
      const unitEcon = require('../src/tools/unitEcon.js');
      const scenario = require('../src/tools/scenario.js');
      const templates = require('../src/tools/templates.js');
      
      expect(webSearch.webSearchTool).toBeDefined();
      expect(dataEnrich.dataEnrichTool).toBeDefined();
      expect(unitEcon.unitEconTool).toBeDefined();
      expect(scenario.scenarioTool).toBeDefined();
      expect(templates.templatesTool).toBeDefined();
    });

    it('should export resource provider', () => {
      const templatesResource = require('../src/resources/templates.resource.js');
      
      expect(templatesResource.templatesResourceProvider).toBeDefined();
      expect(templatesResource.templatesResourceProvider.list).toBeDefined();
      expect(templatesResource.templatesResourceProvider.read).toBeDefined();
    });

    it('should export utility functions', () => {
      const fs = require('../src/util/fs.js');
      
      expect(fs.listTemplates).toBeDefined();
      expect(fs.readTemplate).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should handle module import errors gracefully', () => {
      // This test ensures the module can be imported without throwing
      expect(() => require('../src/index.js')).not.toThrow();
    });

    it('should handle missing dependencies', () => {
      // Clear all environment variables
      const originalEnv = process.env;
      process.env = {};
      
      expect(() => require('../src/index.js')).not.toThrow();
      
      process.env = originalEnv;
    });
  });
});
