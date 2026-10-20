/**
 * Jest setup for integration tests
 */

import { jest } from '@jest/globals';

// Extend Jest timeout for integration tests
jest.setTimeout(60000);

// Mock console methods for cleaner test output
const originalError = console.error;
const originalWarn = console.warn;
const originalLog = console.log;

beforeAll(() => {
  // Suppress server startup logs during tests
  console.error = jest.fn();
  console.warn = jest.fn();
  console.log = jest.fn();
});

afterAll(() => {
  // Restore original console methods
  console.error = originalError;
  console.warn = originalWarn;
  console.log = originalLog;
});

// Global test utilities
(global as any).testUtils = {
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  
  retryUntil: async (
    condition: () => boolean | Promise<boolean>, 
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    throw new Error(`Condition not met within ${timeout}ms`);
  },

  expectEventually: async (
    fn: () => void | Promise<void>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> => {
    const start = Date.now();
    let lastError: Error;

    while (Date.now() - start < timeout) {
      try {
        await fn();
        return; // Success
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        await new Promise(resolve => setTimeout(resolve, interval));
      }
    }

    throw lastError!;
  }
};