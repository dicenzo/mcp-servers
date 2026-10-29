/**
 * Test stand-in for node-fetch, wired up by moduleNameMapper in jest.config.js.
 *
 * node-fetch v3 is ESM-only, and jest runs this package's TypeScript as CommonJS, so loading the
 * real module (including jest's automock, which loads it to read its shape) fails with
 * "Cannot use import statement outside a module". Tests stub responses with
 * jest.mock('node-fetch') and mockResolvedValue; any request a test leaves unstubbed rejects
 * rather than reaching the network.
 */
const fetch = jest.fn(() => Promise.reject(new Error('node-fetch is stubbed in tests; mock a response')));

export default fetch;
