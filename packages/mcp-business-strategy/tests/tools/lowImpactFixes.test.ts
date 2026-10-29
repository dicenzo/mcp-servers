import 'jest';

// Factory mock: the real node-fetch is ESM-only and never loaded here. Every request fails,
// so web.search falls through all providers to its mock data.
jest.mock('node-fetch', () => jest.fn(() => Promise.reject(new Error('network disabled in tests'))));

import { scenarioTool } from '../../src/tools/scenario.js';
import { webSearchTool } from '../../src/tools/webSearch.js';

describe('scenario sensitivity matrix', () => {
  it('includes variables whose base value is 0', async () => {
    const result = await scenarioTool.invoke({
      base: { price: 100, cac: 0, churnMonthlyPct: 0.05 },
      knobs: { cac: [0, 50, 100], price: [80, 120] }
    }).next();

    const response = JSON.parse(result.value!.text);
    const variables = response.sensitivity_matrix.map((row: { variable: string }) => row.variable);
    expect(variables).toContain('cac');
    expect(variables).toContain('price');
  });
});

describe('web.search source', () => {
  it('reports mock_data when every provider fails', async () => {
    const result = await webSearchTool.invoke({ query: 'saas market size', k: 3 }).next();

    const response = JSON.parse(result.value!.text);
    expect(response.results.length).toBeGreaterThan(0);
    expect(response.source).toBe('mock_data');
  });
});
