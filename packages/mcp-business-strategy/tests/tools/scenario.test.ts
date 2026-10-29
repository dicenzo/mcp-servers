import 'jest';
import { scenarioTool } from '../../src/tools/scenario.js';

// Type assertion to fix TypeScript inference issue with MCP SDK
const tool = scenarioTool as any;

describe('Scenario Analysis Tool', () => {
  describe('Tool Configuration', () => {
    it('should have correct tool configuration', () => {
      expect(scenarioTool.name).toBe('scenario.run');
      expect(scenarioTool.description).toContain('Generate comprehensive scenario analysis');
      expect(scenarioTool.inputSchema).toBeDefined();
      expect(scenarioTool.inputSchema.required).toEqual(['base', 'knobs']);
    });
  });

  describe('Input Validation', () => {
    // Tools throw on invalid input; src/index.ts turns the throw into the MCP error response
    // ({ error: true, message } with isError), which tests/index.test.ts covers.
    it('should validate required base parameter', async () => {
      const generator = tool.invoke({} as any);

      await expect(generator.next()).rejects.toThrow(/Scenario analysis failed: .*"base"/s);
    });

    it('should validate required knobs parameter', async () => {
      const generator = tool.invoke({ base: { price: 100 } } as any);

      await expect(generator.next()).rejects.toThrow(/Scenario analysis failed: .*"knobs"/s);
    });

    it('should validate knobs contains arrays of numbers', async () => {
      const generator = tool.invoke({
        base: { price: 100 },
        knobs: { price: 'invalid' }
      } as any);

      await expect(generator.next()).rejects.toThrow('Expected array, received string');
    });

    it('should accept valid input', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50 },
        knobs: { price: [80, 100, 120], cac: [40, 50, 60] }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.base_case.price).toBe(100);
      expect(response.base_case.cac).toBe(50);
    });
  });

  describe('Scenario Generation', () => {
    it('should generate all combinations of scenario variables', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50 },
        knobs: { price: [80, 120], cac: [40, 60] }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      // Should generate 2 * 2 = 4 scenarios
      expect(response.scenarios).toHaveLength(4);
      expect(response.summary.total_scenarios).toBe(4);
      
      // Check that all combinations are present
      const scenarios = response.scenarios;
      const combinations = scenarios.map((s: any) => ({ price: s.inputs.price, cac: s.inputs.cac }));
      
      expect(combinations).toContainEqual({ price: 80, cac: 40 });
      expect(combinations).toContainEqual({ price: 80, cac: 60 });
      expect(combinations).toContainEqual({ price: 120, cac: 40 });
      expect(combinations).toContainEqual({ price: 120, cac: 60 });
    });

    it('should handle single variable scenarios', async () => {
      const generator = tool.invoke({
        base: { price: 100 },
        knobs: { price: [80, 100, 120] }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.scenarios).toHaveLength(3);
      expect(response.summary.total_scenarios).toBe(3);
    });

    it('should handle many variables', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50, churn: 0.05 },
        knobs: { 
          price: [90, 110], 
          cac: [45, 55], 
          churn: [0.04, 0.06] 
        }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      // Should generate 2 * 2 * 2 = 8 scenarios
      expect(response.scenarios).toHaveLength(8);
      expect(response.summary.total_scenarios).toBe(8);
    });
  });

  describe('Output Calculations', () => {
    it('should calculate standard business metrics', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50, churnMonthlyPct: 0.05, grossMarginPct: 0.8, customers: 1000 },
        knobs: { price: [100] }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      const scenario = response.scenarios[0];
      
      expect(scenario.outputs).toHaveProperty('revenue');
      expect(scenario.outputs).toHaveProperty('ltv');
      expect(scenario.outputs).toHaveProperty('payback');
      expect(scenario.outputs).toHaveProperty('ltv_cac_ratio');
    });

    it('should calculate custom metrics when specified', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50, churnMonthlyPct: 0.05, grossMarginPct: 0.8, customers: 1000 },
        knobs: { price: [100] },
        metrics: ['revenue', 'margins', 'growth']
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      const scenario = response.scenarios[0];
      
      expect(scenario.outputs).toHaveProperty('monthly_revenue');
      expect(scenario.outputs).toHaveProperty('annual_revenue');
      expect(scenario.outputs).toHaveProperty('monthly_contribution_margin');
      expect(scenario.outputs).toHaveProperty('gross_margin_dollars');
      expect(scenario.outputs).toHaveProperty('customer_lifetime_months');
      expect(scenario.outputs).toHaveProperty('monthly_retention_rate');
    });

    it('should use default metrics when none specified', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50, churnMonthlyPct: 0.05, grossMarginPct: 0.8, customers: 1000 },
        knobs: { price: [100] }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      const scenario = response.scenarios[0];
      
      expect(scenario.outputs).toHaveProperty('revenue');
      expect(scenario.outputs).toHaveProperty('ltv');
      expect(scenario.outputs).toHaveProperty('payback');
    });
  });

  describe('Sensitivity Analysis', () => {
    it('should calculate sensitivity for each variable', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50 },
        knobs: { price: [80, 120], cac: [40, 60] }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.sensitivity_matrix).toHaveLength(2);
      expect(response.sensitivity_matrix[0]).toHaveProperty('variable');
      expect(response.sensitivity_matrix[0]).toHaveProperty('impact_on_revenue');
      expect(response.sensitivity_matrix[0]).toHaveProperty('impact_on_ltv');
      expect(response.sensitivity_matrix[0]).toHaveProperty('impact_on_payback');
      expect(response.sensitivity_matrix[0]).toHaveProperty('rank');
    });

    it('should rank variables by impact', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50, churnMonthlyPct: 0.05, grossMarginPct: 0.8, customers: 1000 },
        knobs: { 
          price: [90, 110], 
          cac: [45, 55], 
          churnMonthlyPct: [0.04, 0.06] 
        }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      const matrix = response.sensitivity_matrix;
      expect(matrix[0].rank).toBe(1);
      expect(matrix[1].rank).toBe(2);
      expect(matrix[2].rank).toBe(3);
    });

    it('should identify most sensitive variable', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50, churnMonthlyPct: 0.05, grossMarginPct: 0.8, customers: 1000 },
        knobs: { 
          price: [90, 110], 
          cac: [45, 55], 
          churnMonthlyPct: [0.04, 0.06] 
        }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.summary.most_sensitive_variable).toBe(response.sensitivity_matrix[0].variable);
    });
  });

  describe('Summary Generation', () => {
    it('should generate comprehensive summary', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50, churnMonthlyPct: 0.05, grossMarginPct: 0.8, customers: 1000 },
        knobs: { price: [80, 120], cac: [40, 60] }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.summary).toHaveProperty('most_sensitive_variable');
      expect(response.summary).toHaveProperty('best_case_scenario');
      expect(response.summary).toHaveProperty('worst_case_scenario');
      expect(response.summary).toHaveProperty('total_scenarios');
      
      expect(response.summary.total_scenarios).toBe(4);
      expect(response.summary.best_case_scenario).toMatch(/scenario_\d+/);
      expect(response.summary.worst_case_scenario).toMatch(/scenario_\d+/);
    });

    it('should identify best and worst case scenarios by revenue', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50, churnMonthlyPct: 0.05, grossMarginPct: 0.8, customers: 1000 },
        knobs: { price: [80, 120] }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      const scenarios = response.scenarios;
      const revenues = scenarios.map((s: any) => s.outputs.revenue);
      const maxRevenue = Math.max(...revenues);
      const minRevenue = Math.min(...revenues);
      
      const bestScenario = scenarios.find((s: any) => s.outputs.revenue === maxRevenue);
      const worstScenario = scenarios.find((s: any) => s.outputs.revenue === minRevenue);
      
      expect(response.summary.best_case_scenario).toBe(bestScenario.scenario_id);
      expect(response.summary.worst_case_scenario).toBe(worstScenario.scenario_id);
    });
  });

  describe('Recommendations', () => {
    it('should provide recommendations based on sensitivity analysis', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50, churnMonthlyPct: 0.05, grossMarginPct: 0.8, customers: 1000 },
        knobs: { 
          price: [90, 110], 
          cac: [45, 55], 
          churnMonthlyPct: [0.04, 0.06] 
        }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(Array.isArray(response.recommendations)).toBe(true);
      expect(response.recommendations.length).toBeGreaterThan(0);
      
      // Should have recommendation about most sensitive variable
      const topVariable = response.sensitivity_matrix[0].variable;
      expect(response.recommendations.some((r: string) => r.includes(topVariable))).toBe(true);
    });

    it('should provide recommendations for high scenario variability', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50, churnMonthlyPct: 0.05, grossMarginPct: 0.8, customers: 1000 },
        knobs: { price: [50, 200] } // High variability
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.recommendations.some((r: string) => r.includes('High scenario variability'))).toBe(true);
    });

    it('should provide recommendations for poor LTV:CAC ratios', async () => {
      // LTV = 50 * 0.5 / 0.05 = 500; LTV:CAC = 500 / 300 = 1.67 (below the 3:1 threshold)
      const generator = tool.invoke({
        base: { price: 50, cac: 300, churnMonthlyPct: 0.05, grossMarginPct: 0.5, customers: 1000 },
        knobs: { price: [50] }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.recommendations.some((r: string) => r.includes('LTV:CAC ratio'))).toBe(true);
    });

    it('should provide recommendations for long payback periods', async () => {
      // Payback = CAC / monthly contribution = 400 / (50 * 0.5) = 16 months (over the 12-month threshold)
      const generator = tool.invoke({
        base: { price: 50, cac: 400, churnMonthlyPct: 0.05, grossMarginPct: 0.5, customers: 1000 },
        knobs: { price: [50] }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.recommendations.some((r: string) => r.includes('payback period'))).toBe(true);
    });

    it('should provide top 3 variables recommendation', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50, churnMonthlyPct: 0.05, grossMarginPct: 0.8, customers: 1000 },
        knobs: { 
          price: [90, 110], 
          cac: [45, 55], 
          churnMonthlyPct: [0.04, 0.06],
          grossMarginPct: [0.7, 0.9]
        }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.recommendations.some((r: string) => r.includes('top 3 variables'))).toBe(true);
    });
  });

  describe('Data Structure Validation', () => {
    it('should return properly structured scenario analysis', async () => {
      const generator = tool.invoke({
        base: { price: 100, cac: 50, churnMonthlyPct: 0.05, grossMarginPct: 0.8, customers: 1000 },
        knobs: { price: [80, 120], cac: [40, 60] }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      // Required fields
      expect(response).toHaveProperty('base_case');
      expect(response).toHaveProperty('scenarios');
      expect(response).toHaveProperty('sensitivity_matrix');
      expect(response).toHaveProperty('summary');
      expect(response).toHaveProperty('recommendations');
      expect(response).toHaveProperty('generated_at');
      
      // Data types
      expect(typeof response.base_case).toBe('object');
      expect(Array.isArray(response.scenarios)).toBe(true);
      expect(Array.isArray(response.sensitivity_matrix)).toBe(true);
      expect(typeof response.summary).toBe('object');
      expect(Array.isArray(response.recommendations)).toBe(true);
      expect(typeof response.generated_at).toBe('string');
      
      // Scenario structure
      const scenario = response.scenarios[0];
      expect(scenario).toHaveProperty('scenario_id');
      expect(scenario).toHaveProperty('inputs');
      expect(scenario).toHaveProperty('outputs');
      expect(scenario).toHaveProperty('sensitivity');
      
      // Summary structure
      expect(response.summary).toHaveProperty('most_sensitive_variable');
      expect(response.summary).toHaveProperty('best_case_scenario');
      expect(response.summary).toHaveProperty('worst_case_scenario');
      expect(response.summary).toHaveProperty('total_scenarios');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty knobs arrays', async () => {
      const generator = tool.invoke({
        base: { price: 100 },
        knobs: { price: [] }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.scenarios).toHaveLength(0);
      expect(response.summary.total_scenarios).toBe(0);
      expect(response.summary.best_case_scenario).toBe('none');
      expect(response.summary.worst_case_scenario).toBe('none');
      // A knob with no values has nothing to test, so it gets no sensitivity row
      expect(response.sensitivity_matrix).toHaveLength(0);
    });

    it('should handle single value in knobs', async () => {
      const generator = tool.invoke({
        base: { price: 100 },
        knobs: { price: [100] }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.scenarios).toHaveLength(1);
      expect(response.scenarios[0].inputs.price).toBe(100);
    });

    it('should handle missing base values in knobs', async () => {
      const generator = tool.invoke({
        base: { price: 100, other: 50 },
        knobs: { price: [80, 120] }
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.scenarios).toHaveLength(2);
      expect(response.scenarios[0].inputs.other).toBe(50);
    });
  });
});
