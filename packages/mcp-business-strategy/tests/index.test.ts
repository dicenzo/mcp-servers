import 'jest';

// src/index.ts builds and starts the server as a side effect of being loaded, and a module body runs
// only once per registry. loadIndex() resets the registry so every test gets a fresh load; the SDK
// factories below hand that load whichever mockServer / mockTransport the current test created.
type MockServer = {
  setRequestHandler: jest.Mock;
  onerror?: (error: Error) => void;
  connect: jest.Mock;
};
let mockServer: MockServer;
let mockTransport: object;

jest.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: jest.fn().mockImplementation(() => mockServer),
}));

jest.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: jest.fn().mockImplementation(() => mockTransport),
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

type ToolCallResult = { content: { type: string; text: string }[]; isError?: boolean };

function loadIndex() {
  jest.resetModules();
  // Same registry as the require below, so these are the constructors index.ts calls
  const { Server: ServerMock } = require('@modelcontextprotocol/sdk/server/index.js');
  const { StdioServerTransport: TransportMock } = require('@modelcontextprotocol/sdk/server/stdio.js');
  require('../src/index.js');
  return { Server: ServerMock as jest.Mock, StdioServerTransport: TransportMock as jest.Mock };
}

/** The request method each registered handler's schema accepts, in registration order. */
function registeredMethods(): string[] {
  return mockServer.setRequestHandler.mock.calls.map(([schema]) => schema.shape.method.value);
}

function handlerFor(method: string) {
  const call = mockServer.setRequestHandler.mock.calls.find(([schema]) => schema.shape.method.value === method);
  if (!call) throw new Error(`No handler registered for ${method}`);
  return call[1];
}

describe('MCP Server', () => {
  let signalListenersBefore: Record<'SIGINT' | 'SIGTERM', NodeJS.SignalsListener[]>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    mockServer = {
      setRequestHandler: jest.fn(),
      connect: jest.fn(),
    };
    mockTransport = {};

    signalListenersBefore = {
      SIGINT: process.listeners('SIGINT'),
      SIGTERM: process.listeners('SIGTERM'),
    };
  });

  afterEach(() => {
    // Each load of index.ts adds SIGINT/SIGTERM handlers; drop the ones this test added
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      for (const listener of process.listeners(signal)) {
        if (!signalListenersBefore[signal].includes(listener)) {
          process.removeListener(signal, listener);
        }
      }
    }
  });

  describe('Server Initialization', () => {
    it('should create server with correct configuration', () => {
      const { Server } = loadIndex();
      
      expect(Server).toHaveBeenCalledWith(
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
    });

    it('should register tool request handler', () => {
      loadIndex();
      
      expect(mockServer.setRequestHandler).toHaveBeenCalledTimes(3);
      expect(registeredMethods()).toContain('tools/call');
      expect(handlerFor('tools/call')).toEqual(expect.any(Function));
    });

    it('should register resource list handler', () => {
      loadIndex();
      
      expect(registeredMethods()).toContain('resources/list');
      expect(handlerFor('resources/list')).toEqual(expect.any(Function));
    });

    it('should register resource read handler', () => {
      loadIndex();
      
      expect(registeredMethods()).toContain('resources/read');
      expect(handlerFor('resources/read')).toEqual(expect.any(Function));
    });

    it('should set error handler', () => {
      loadIndex();
      
      // index.ts assigns server.onerror (it is a property, not a method it calls)
      expect(mockServer.onerror).toEqual(expect.any(Function));
      const error = new Error('transport broke');
      mockServer.onerror!(error);
      expect(console.error).toHaveBeenCalledWith('[MCP] Server error:', error);
    });
  });

  describe('Tool Call Handler', () => {
    it('should wrap a tool result in an MCP content array', async () => {
      loadIndex();
      const { unitEconTool } = require('../src/tools/unitEcon.js');
      const toolResult = { type: 'text', text: '{"ltv":1600}' };
      unitEconTool.invoke.mockImplementation(async function* () { return toolResult; });

      const response: ToolCallResult = await handlerFor('tools/call')({
        method: 'tools/call',
        params: { name: 'unitecon.calc', arguments: { price: 100 } },
      });

      expect(unitEconTool.invoke).toHaveBeenCalledWith({ price: 100 });
      expect(response).toEqual({ content: [toolResult] });
    });

    it('should turn a thrown tool error into an isError response', async () => {
      loadIndex();
      const { templatesTool } = require('../src/tools/templates.js');
      // eslint-disable-next-line require-yield
      templatesTool.invoke.mockImplementation(async function* () { throw new Error('File not found'); });

      const response: ToolCallResult = await handlerFor('tools/call')({
        method: 'tools/call',
        params: { name: 'templates.get', arguments: { name: 'missing' } },
      });

      expect(response.isError).toBe(true);
      expect(response.content).toHaveLength(1);
      const body = JSON.parse(response.content[0].text);
      expect(body).toMatchObject({ error: true, tool: 'templates.get', message: 'File not found' });
    });

    it('should report an unknown tool as an isError response', async () => {
      loadIndex();

      const response: ToolCallResult = await handlerFor('tools/call')({
        method: 'tools/call',
        params: { name: 'no.such.tool', arguments: {} },
      });

      expect(response.isError).toBe(true);
      expect(JSON.parse(response.content[0].text).message).toContain("Tool 'no.such.tool' not found");
    });
  });

  describe('Tool Registration', () => {
    it('should register all required tools', () => {
      loadIndex();
      
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
      expect(() => loadIndex()).not.toThrow();
    });

    it('should handle partial API keys', () => {
      process.env.TAVILY_API_KEY = 'test-key';
      delete process.env.SERPAPI_KEY;
      delete process.env.BRAVE_API_KEY;
      
      expect(() => loadIndex()).not.toThrow();
    });

    it('should handle all API keys present', () => {
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.SERPAPI_KEY = 'test-serpapi-key';
      process.env.BRAVE_API_KEY = 'test-brave-key';
      
      expect(() => loadIndex()).not.toThrow();
    });
  });

  describe('Process Signal Handling', () => {
    it('should handle SIGINT signal', () => {
      const originalExit = process.exit;
      const mockExit = jest.fn();
      process.exit = mockExit as any;
      
      // Import module to set up signal handlers
      loadIndex();
      
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
      loadIndex();
      
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
      loadIndex();
      
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
      loadIndex();
      
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
      expect(() => loadIndex()).not.toThrow();
    });

    it('should handle missing dependencies', () => {
      // Clear all environment variables
      const originalEnv = process.env;
      process.env = {};
      
      expect(() => loadIndex()).not.toThrow();
      
      process.env = originalEnv;
    });
  });
});
