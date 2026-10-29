import 'jest';
import { webSearchTool } from '../../src/tools/webSearch.js';
import fetch from 'node-fetch';

// Type assertion to fix TypeScript inference issue with MCP SDK
const tool = webSearchTool as any;

// Mock node-fetch
jest.mock('node-fetch');
const mockFetch = fetch as jest.MockedFunction<typeof fetch>;

describe('Web Search Tool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset environment variables
    delete process.env.TAVILY_API_KEY;
    delete process.env.SERPAPI_KEY;
    delete process.env.BRAVE_API_KEY;
  });

  describe('Tool Configuration', () => {
    it('should have correct tool configuration', () => {
      expect(webSearchTool.name).toBe('web.search');
      expect(webSearchTool.description).toContain('Search the web');
      expect(webSearchTool.inputSchema).toBeDefined();
      expect(webSearchTool.inputSchema.required).toEqual(['query']);
    });
  });

  describe('Input Validation', () => {
    // Tools throw on invalid input; src/index.ts turns the throw into the MCP error response
    // ({ error: true, message } with isError), which tests/index.test.ts covers.
    it('should validate required query parameter', async () => {
      const generator = tool.invoke({} as any);

      await expect(generator.next()).rejects.toThrow(/Web search failed: .*query/s);
    });

    it('should validate query is not empty', async () => {
      const generator = tool.invoke({ query: '' });

      await expect(generator.next()).rejects.toThrow('Query cannot be empty');
    });

    it('should reject an overlong query', async () => {
      const generator = tool.invoke({ query: 'x'.repeat(1001) });

      await expect(generator.next()).rejects.toThrow(/at most 1000 character/);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should validate k parameter bounds', async () => {
      const generator = tool.invoke({ query: 'test', k: 25 });

      await expect(generator.next()).rejects.toThrow('less than or equal to 20');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should use default k value when not provided', async () => {
      const generator = tool.invoke({ query: 'test query' });
      const result = await generator.next();
      
      expect(result.value).toBeDefined();
      expect(result.value.type).toBe('text');
      const response = JSON.parse(result.value.text);
      expect(response.query).toBe('test query');
      expect(response.results).toHaveLength(5); // Default k value
    });
  });

  describe('Mock Data Fallback', () => {
    it('should return mock data when no API keys are available', async () => {
      const generator = tool.invoke({ query: 'AI market analysis', k: 3 });
      const result = await generator.next();
      
      expect(result.value).toBeDefined();
      expect(result.value.type).toBe('text');
      const response = JSON.parse(result.value.text);
      
      expect(response.query).toBe('AI market analysis');
      expect(response.results).toHaveLength(3);
      expect(response.source).toBe('mock_data');
      expect(response.results[0]).toHaveProperty('title');
      expect(response.results[0]).toHaveProperty('url');
      expect(response.results[0]).toHaveProperty('snippet');
    });

    it('should generate business-relevant mock data', async () => {
      const generator = tool.invoke({ query: 'SaaS market trends', k: 2 });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      const results = response.results;
      
      expect(results[0].title).toContain('SaaS market trends');
      expect(results[0].snippet).toContain('market');
      expect(results[0].url).toMatch(/^https:\/\//);
    });
  });

  describe('Tavily API Integration', () => {
    beforeEach(() => {
      process.env.TAVILY_API_KEY = 'test-tavily-key';
    });

    it('should call Tavily API when key is available', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          results: [
            {
              title: 'Test Result',
              url: 'https://example.com',
              content: 'Test content',
              published_date: '2024-01-01'
            }
          ]
        })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const generator = tool.invoke({ query: 'test query', k: 1 });
      const result = await generator.next();
      
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.tavily.com/search',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-tavily-key'
          }),
          body: expect.stringContaining('test query')
        })
      );

      const response = JSON.parse(result.value.text);
      expect(response.source).toBe('live_search');
      expect(response.results).toHaveLength(1);
    });

    it('should fallback to mock data when Tavily API fails', async () => {
      const mockResponse = {
        ok: false,
        status: 401
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const generator = tool.invoke({ query: 'test query', k: 1 });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.source).toBe('mock_data');
    });
  });

  describe('SerpAPI Integration', () => {
    beforeEach(() => {
      // Tavily needs a key too, or it is skipped rather than tried and failed
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.SERPAPI_KEY = 'test-serpapi-key';
    });

    it('should call SerpAPI when Tavily fails and key is available', async () => {
      // Mock Tavily failure
      const tavilyResponse = { ok: false, status: 401 };
      // Mock SerpAPI success
      const serpResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          organic_results: [
            {
              title: 'SerpAPI Result',
              link: 'https://serpapi.com/result',
              snippet: 'SerpAPI content'
            }
          ]
        })
      };
      mockFetch
        .mockResolvedValueOnce(tavilyResponse as any)
        .mockResolvedValueOnce(serpResponse as any);

      const generator = tool.invoke({ query: 'test query', k: 1 });
      const result = await generator.next();
      
      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch).toHaveBeenNthCalledWith(1, 'https://api.tavily.com/search', expect.any(Object));
      // SerpAPI takes its key in the query string; the init options carry only the timeout signal
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('serpapi.com/search'),
        { signal: expect.any(AbortSignal) }
      );
      expect(mockFetch.mock.lastCall?.[0]).toContain('api_key=test-serpapi-key');

      const response = JSON.parse(result.value.text);
      expect(response.source).toBe('live_search');
    });
  });

  describe('Brave Search Integration', () => {
    beforeEach(() => {
      // Tavily and SerpAPI need keys too, or they are skipped rather than tried and failed
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.SERPAPI_KEY = 'test-serpapi-key';
      process.env.BRAVE_API_KEY = 'test-brave-key';
    });

    it('should call Brave API when other APIs fail and key is available', async () => {
      // Mock Tavily and SerpAPI failures
      const failureResponse = { ok: false, status: 401 };
      // Mock Brave success
      const braveResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({
          web: {
            results: [
              {
                title: 'Brave Result',
                url: 'https://brave.com/result',
                description: 'Brave content',
                age: '2024-01-01'
              }
            ]
          }
        })
      };
      mockFetch
        .mockResolvedValueOnce(failureResponse as any)
        .mockResolvedValueOnce(failureResponse as any)
        .mockResolvedValueOnce(braveResponse as any);

      const generator = tool.invoke({ query: 'test query', k: 1 });
      const result = await generator.next();
      
      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch).toHaveBeenLastCalledWith(
        expect.stringContaining('api.search.brave.com'),
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Subscription-Token': 'test-brave-key'
          })
        })
      );

      const response = JSON.parse(result.value.text);
      expect(response.source).toBe('live_search');
    });
  });

  describe('Result Filtering and Quality', () => {
    it('should filter results for business quality', async () => {
      const generator = tool.invoke({ query: 'business analysis', k: 10 });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      const results = response.results;
      
      // Should prioritize credible business domains
      const credibleDomains = ['forbes.com', 'businessinsider.com', 'techcrunch.com'];
      const hasCredibleDomain = results.some((r: any) => 
        credibleDomains.some(domain => r.domain === domain)
      );
      
      expect(results.length).toBeLessThanOrEqual(10);
      expect(results.every((r: any) => r.title && r.url && r.snippet)).toBe(true);
    });

    it('should include timestamp in response', async () => {
      const generator = tool.invoke({ query: 'test', k: 1 });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.timestamp).toBeDefined();
      expect(new Date(response.timestamp)).toBeInstanceOf(Date);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const generator = tool.invoke({ query: 'test query' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.source).toBe('mock_data');
    });

    it('should give every provider request a timeout signal', async () => {
      process.env.TAVILY_API_KEY = 'test-tavily-key';
      process.env.SERPAPI_KEY = 'test-serpapi-key';
      process.env.BRAVE_API_KEY = 'test-brave-key';
      mockFetch.mockResolvedValue({ ok: false, status: 500 } as any);

      await tool.invoke({ query: 'test query', k: 1 }).next();

      expect(mockFetch).toHaveBeenCalledTimes(3);
      for (const [, init] of mockFetch.mock.calls) {
        expect(init).toEqual(expect.objectContaining({ signal: expect.any(AbortSignal) }));
      }
    });

    it('should not log the SerpAPI key when its request fails', async () => {
      process.env.SERPAPI_KEY = 'secret-serp-key';
      // node-fetch puts the request URL, query string included, in its error messages
      mockFetch.mockRejectedValue(Object.assign(
        new Error('request to https://serpapi.com/search?engine=google&q=x&api_key=secret-serp-key&num=1 failed, reason: ECONNRESET'),
        { name: 'FetchError', code: 'ECONNRESET' }
      ));
      const consoleError = console.error as jest.Mock;
      consoleError.mockClear();

      await tool.invoke({ query: 'test query', k: 1 }).next();

      const logged = consoleError.mock.calls.flat().map(arg =>
        arg instanceof Error ? `${arg.message} ${arg.stack}` : String(arg)
      ).join('\n');
      expect(logged).toContain('SerpAPI search failed');
      expect(logged).not.toContain('secret-serp-key');
    });

    it('should handle malformed API responses', async () => {
      const mockResponse = {
        ok: true,
        json: jest.fn().mockResolvedValue({ invalid: 'response' })
      };
      mockFetch.mockResolvedValue(mockResponse as any);

      const generator = tool.invoke({ query: 'test query' });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.source).toBe('mock_data');
    });
  });
});
