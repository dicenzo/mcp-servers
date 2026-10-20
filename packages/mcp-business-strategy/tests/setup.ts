import 'dotenv/config';

// Mock console.error to avoid noise in tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

// Mock environment variables for testing
process.env.TAVILY_API_KEY = 'test-tavily-key';
process.env.SERPAPI_KEY = 'test-serpapi-key';
process.env.BRAVE_API_KEY = 'test-brave-key';

// Global test timeout
jest.setTimeout(10000);
