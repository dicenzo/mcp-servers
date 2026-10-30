/**
 * Test stand-in for puppeteer, wired up by moduleNameMapper in jest.config.js.
 *
 * puppeteer 25 is ESM-only, and jest runs this package's TypeScript as CommonJS, so loading the
 * real module fails with "Unexpected token 'export'". No unit test renders a PDF; any test that
 * reaches launch() rejects rather than starting Chrome.
 */
const puppeteer = {
  launch: jest.fn(() => Promise.reject(new Error('puppeteer is stubbed in tests; PDF export is not available')))
};

export default puppeteer;
