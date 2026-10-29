import { ExecutableTool } from './types.js';
import fetch from 'node-fetch';
import { z } from 'zod';

const MAX_QUERY_LENGTH = 1000;
const REQUEST_TIMEOUT_MS = 15000;

const Input = z.object({ 
  query: z.string()
    .min(1, "Query cannot be empty")
    .max(MAX_QUERY_LENGTH, `Query must be at most ${MAX_QUERY_LENGTH} characters`), 
  k: z.number().min(1).max(20).default(5) 
});

/**
 * One-line description of an error that is safe to log. node-fetch errors include the request URL,
 * and SerpAPI takes its key in the query string, so strip any api_key value from the message.
 */
function describeError(error: unknown): string {
  if (!(error instanceof Error)) return 'Unknown error';
  const code = (error as NodeJS.ErrnoException).code;
  const message = error.message.replace(/(api_key=)[^&\s'"]*/gi, '$1[REDACTED]');
  return `${error.name}${code ? ` (${code})` : ''}: ${message}`;
}

// Shapes of the fields read from each provider's JSON response (all external data, so optional)
interface TavilyResponse {
  results?: { title: string; url: string; content: string; published_date?: string }[];
}

interface SerpApiResponse {
  organic_results?: { title: string; link: string; snippet: string }[];
}

interface BraveResponse {
  web?: { results?: { title: string; url: string; description: string; age?: string }[] };
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  published_date?: string;
  domain?: string;
}

export const webSearchTool: ExecutableTool = {
  name: 'web.search',
  description: 'Search the web and return curated business/market research results with credible sources.',
  inputSchema: {
    type: 'object',
    properties: { 
      query: { type: 'string', description: 'Search query for business/market research', maxLength: MAX_QUERY_LENGTH }, 
      k: { type: 'number', description: 'Number of results to return (1-20)', minimum: 1, maximum: 20 } 
    },
    required: ['query']
  },
  // The tool contract is a generator (index.ts reads one next()); this tool returns its single result
  // eslint-disable-next-line require-yield
  async *invoke(input: z.infer<typeof Input>) {
    try {
      const { query, k } = Input.parse(input);
      console.error(`[MCP Tool] web.search called with query: "${query}", k: ${k}`);
      
      // Try multiple search strategies based on available APIs
      let results: SearchResult[] = [];
      
      // Strategy 1: Try Tavily API (if API key available)
      if (process.env.TAVILY_API_KEY) {
        try {
          results = await searchWithTavily(query, k);
        } catch (error) {
          console.error('[MCP Tool] Tavily search failed:', describeError(error));
        }
      }
      
      // Strategy 2: Try SerpAPI (if API key available)
      const serpApiKey = process.env.SERPAPI_KEY;
      if (results.length === 0 && serpApiKey) {
        try {
          results = await searchWithSerpAPI(query, k, serpApiKey);
        } catch (error) {
          console.error('[MCP Tool] SerpAPI search failed:', describeError(error));
        }
      }
      
      // Strategy 3: Try Brave Search API (if API key available)
      const braveApiKey = process.env.BRAVE_API_KEY;
      if (results.length === 0 && braveApiKey) {
        try {
          results = await searchWithBrave(query, k, braveApiKey);
        } catch (error) {
          console.error('[MCP Tool] Brave search failed:', describeError(error));
        }
      }
      
      // Fallback: Enhanced mock data with business-relevant results
      const usedMockData = results.length === 0;
      if (usedMockData) {
        console.error('[MCP Tool] All search APIs failed, using enhanced mock data');
        results = generateBusinessMockData(query, k);
      }
      
      // Filter and rank results for business analysis quality
      const filteredResults = filterForBusinessQuality(results, k);
      
      console.error(`[MCP Tool] web.search returning ${filteredResults.length} results`);
      return { 
        type: 'text', 
        text: JSON.stringify({
          query,
          results: filteredResults,
          source: usedMockData ? 'mock_data' : 'live_search',
          timestamp: new Date().toISOString()
        }, null, 2)
      };
      
    } catch (error) {
      console.error(`[MCP Tool Error] web.search failed:`, describeError(error));
      throw new Error(`Web search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

async function searchWithTavily(query: string, k: number): Promise<SearchResult[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.TAVILY_API_KEY}`
    },
    body: JSON.stringify({
      query,
      max_results: k,
      search_depth: 'advanced',
      include_domains: ['forbes.com', 'techcrunch.com', 'statista.com', 'mckinsey.com', 'bcg.com', 'gartner.com'],
      exclude_domains: ['reddit.com', 'twitter.com', 'facebook.com']
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  
  if (!response.ok) {
    throw new Error(`Tavily API error: ${response.status}`);
  }
  
  const data = await response.json() as TavilyResponse;
  return data.results?.map((result) => ({
    title: result.title,
    url: result.url,
    snippet: result.content,
    published_date: result.published_date,
    domain: new URL(result.url).hostname
  })) || [];
}

async function searchWithSerpAPI(query: string, k: number, apiKey: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    engine: 'google',
    q: query,
    api_key: apiKey,
    num: k.toString(),
    hl: 'en',
    gl: 'us'
  });
  
  const response = await fetch(`https://serpapi.com/search?${params}`, { signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  
  if (!response.ok) {
    throw new Error(`SerpAPI error: ${response.status}`);
  }
  
  const data = await response.json() as SerpApiResponse;
  return data.organic_results?.map((result) => ({
    title: result.title,
    url: result.link,
    snippet: result.snippet,
    domain: new URL(result.link).hostname
  })) || [];
}

async function searchWithBrave(query: string, k: number, apiKey: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    q: query,
    count: k.toString(),
    result_filter: 'web',
    safesearch: 'moderate'
  });
  
  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: {
      'Accept': 'application/json',
      'X-Subscription-Token': apiKey
    },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
  });
  
  if (!response.ok) {
    throw new Error(`Brave API error: ${response.status}`);
  }
  
  const data = await response.json() as BraveResponse;
  return data.web?.results?.map((result) => ({
    title: result.title,
    url: result.url,
    snippet: result.description,
    published_date: result.age,
    domain: new URL(result.url).hostname
  })) || [];
}

function generateBusinessMockData(query: string, k: number): SearchResult[] {
  const businessSources = [
    'techcrunch.com', 'forbes.com', 'businessinsider.com', 'mckinsey.com', 
    'bcg.com', 'statista.com', 'gartner.com', 'cbinsights.com'
  ];
  
  const templates = [
    'Market Analysis: {query} - Industry trends and growth projections for 2024',
    '{query} Market Size and Competitive Landscape Report',
    'AI and Technology Trends in {query} - Investment Opportunities',
    '{query} Business Model Innovation and Revenue Strategies',
    'Customer Acquisition Strategies for {query} Companies'
  ];
  
  return Array.from({ length: k }, (_, i) => {
    const template = templates[i % templates.length];
    const domain = businessSources[i % businessSources.length];
    const title = template.replace('{query}', query);
    
    return {
      title,
      url: `https://${domain}/${encodeURIComponent(query.toLowerCase().replace(/\s+/g, '-'))}-${i + 1}`,
      snippet: `Professional analysis of ${query} including market sizing, competitive dynamics, and growth opportunities. Research-backed insights for business strategy development.`,
      published_date: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      domain
    };
  });
}

function filterForBusinessQuality(results: SearchResult[], maxResults: number): SearchResult[] {
  // Prioritize credible business sources
  const credibleDomains = [
    'forbes.com', 'businessinsider.com', 'techcrunch.com', 'reuters.com',
    'bloomberg.com', 'wsj.com', 'ft.com', 'economist.com',
    'mckinsey.com', 'bcg.com', 'deloitte.com', 'pwc.com',
    'statista.com', 'gartner.com', 'idc.com', 'forrester.com',
    'cbinsights.com', 'pitchbook.com', 'crunchbase.com'
  ];
  
  // Score results based on domain credibility and content relevance
  const scoredResults = results.map(result => {
    let score = 0;
    
    // Domain credibility score
    if (result.domain && credibleDomains.includes(result.domain)) {
      score += 10;
    } else if (result.domain?.includes('.edu') || result.domain?.includes('.gov')) {
      score += 8;
    }
    
    // Content relevance score
    const businessKeywords = ['market', 'revenue', 'growth', 'analysis', 'strategy', 'business', 'industry', 'trends'];
    const snippet = result.snippet.toLowerCase();
    businessKeywords.forEach(keyword => {
      if (snippet.includes(keyword)) score += 1;
    });
    
    // Recency bonus (if published_date available)
    if (result.published_date) {
      const publishedDate = new Date(result.published_date);
      const daysSincePublished = (Date.now() - publishedDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSincePublished < 365) score += 2; // Published within last year
      if (daysSincePublished < 90) score += 2;  // Published within last 3 months
    }
    
    return { ...result, score };
  });
  
  // Sort by score and return top results
  return scoredResults
    .sort((a, b) => b.score - a.score)
    .slice(0, maxResults)
    .map(({ score: _score, ...result }) => result);
}
