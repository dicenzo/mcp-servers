import 'jest';
import { unitEconTool } from '../../src/tools/unitEcon.js';

// Type assertion to fix TypeScript inference issue with MCP SDK
const tool = unitEconTool as any;

describe('Unit Economics Tool', () => {
  describe('Tool Configuration', () => {
    it('should have correct tool configuration', () => {
      expect(unitEconTool.name).toBe('unitecon.calc');
      expect(unitEconTool.description).toContain('Calculate comprehensive unit economics');
      expect(unitEconTool.inputSchema).toBeDefined();
      expect(unitEconTool.inputSchema.required).toEqual(['price', 'grossMarginPct', 'cac', 'churnMonthlyPct']);
    });
  });

  describe('Input Validation', () => {
    // Tools throw on invalid input; src/index.ts turns the throw into the MCP error response
    // ({ error: true, message } with isError), which tests/index.test.ts covers.
    it('should validate required parameters', async () => {
      const generator = tool.invoke({} as any);

      await expect(generator.next()).rejects.toThrow(/Unit economics calculation failed: .*"price".*"grossMarginPct".*"cac".*"churnMonthlyPct"/s);
    });

    it('should validate price is positive', async () => {
      const generator = tool.invoke({
        price: -10,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.05
      });

      await expect(generator.next()).rejects.toThrow('Price must be positive');
    });

    it('should validate gross margin is between 0 and 1', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 1.5,
        cac: 50,
        churnMonthlyPct: 0.05
      });

      await expect(generator.next()).rejects.toThrow('Gross margin must be between 0 and 1');
    });

    it('should validate CAC is non-negative', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: -10,
        churnMonthlyPct: 0.05
      });

      await expect(generator.next()).rejects.toThrow('CAC cannot be negative');
    });

    it('should validate churn rate is between 0 and 1', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 1.5
      });

      await expect(generator.next()).rejects.toThrow('Monthly churn must be between 0 and 1');
    });

    it('should accept valid input', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.05
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.price).toBe(100);
      expect(response.grossMarginPct).toBe(0.8);
      expect(response.cac).toBe(50);
      expect(response.churnMonthlyPct).toBe(0.05);
    });
  });

  describe('Core Calculations', () => {
    it('should calculate LTV correctly', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.05
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      // LTV = (ARPU * Gross Margin) / Monthly Churn
      // LTV = (100 * 0.8) / 0.05 = 80 / 0.05 = 1600
      expect(response.ltv).toBe(1600);
      expect(response.ltvGross).toBe(2000); // 100 / 0.05
      expect(response.monthlyContributionMargin).toBe(80);
    });

    it('should calculate payback period correctly', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.05
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      // Payback = CAC / Monthly Contribution Margin
      // Payback = 50 / 80 = 0.625 months, reported like every money/month figure to 2 decimals
      expect(response.paybackMonths).toBe(0.63);
    });

    it('should calculate LTV:CAC ratio correctly', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.05
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      // LTV:CAC = 1600 / 50 = 32:1
      expect(response.ltvCacRatio).toBe(32);
    });

    it('should calculate retention metrics correctly', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.05
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.retentionMonthly).toBe(95); // (1 - 0.05) * 100
      expect(response.retentionAnnual).toBeCloseTo(54.04, 1); // (0.95^12) * 100
      expect(response.averageLifetimeMonths).toBe(20); // 1 / 0.05
    });
  });

  describe('Optional Parameters', () => {
    it('should use price as ARPU when arpuMonthly not provided', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.05
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.arpuMonthly).toBe(100);
    });

    it('should use custom ARPU when provided', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.05,
        arpuMonthly: 120
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.arpuMonthly).toBe(120);
      expect(response.monthlyGrossRevenue).toBe(120);
      expect(response.monthlyContributionMargin).toBe(96); // 120 * 0.8
    });

    it('should use default months value when not provided', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.05
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.months).toBe(24);
    });

    it('should use custom months value when provided', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.05,
        months: 36
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.months).toBe(36);
    });
  });

  describe('Edge Cases', () => {
    it('should handle zero churn rate with minimum threshold', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.averageLifetimeMonths).toBe(1000); // 1 / 0.001
    });

    it('should handle zero CAC', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 0,
        churnMonthlyPct: 0.05
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.paybackMonths).toBe(0);
      // JSON has no Infinity (it serializes as null), so the tool divides by a CAC floor of $0.01:
      // LTV 1600 / 0.01 = 160000
      expect(response.ltvCacRatio).toBe(160000);
      expect(response.healthScore).toBe('Excellent');
    });

    it('should handle very high churn rate', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.5
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.averageLifetimeMonths).toBe(2); // 1 / 0.5
      expect(response.ltv).toBe(160); // 80 / 0.5
    });
  });

  describe('Health Assessment', () => {
    it('should assess excellent health for good metrics', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.02 // 2% monthly churn
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.healthScore).toBe('Excellent');
    });

    it('should assess good health for moderate metrics', async () => {
      // Contribution 50/mo, LTV 1000, LTV:CAC 2.5 (2 pts), payback 8 months (1 pt), churn 5% (1 pt) = 4 -> Good
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.5,
        cac: 400,
        churnMonthlyPct: 0.05 // 5% monthly churn
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.healthScore).toBe('Good');
    });

    it('should assess poor health for bad metrics', async () => {
      // Contribution 50/mo, LTV 333, LTV:CAC 0.83 (0 pts), payback 8 months (1 pt), churn 15% (0 pts) = 1 -> Poor
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.5,
        cac: 400,
        churnMonthlyPct: 0.15 // 15% monthly churn
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.healthScore).toBe('Poor');
    });
  });

  describe('Recommendations', () => {
    it('should provide recommendations for poor LTV:CAC ratio', async () => {
      // LTV = 100 * 0.5 / 0.1 = 500; LTV:CAC = 500 / 600 = 0.83 (below 1:1)
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.5,
        cac: 600,
        churnMonthlyPct: 0.1
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      // Recommendations are full sentences; match on the leading phrase
      expect(response.recommendations.some((r: string) => r.startsWith('🚨 CRITICAL: LTV:CAC ratio below 1:1'))).toBe(true);
    });

    it('should provide recommendations for high payback period', async () => {
      // Payback = 400 / (50 * 0.5) = 16 months (over 12)
      const generator = tool.invoke({
        price: 50,
        grossMarginPct: 0.5,
        cac: 400,
        churnMonthlyPct: 0.05
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.recommendations.some((r: string) => r.includes('Payback period over 12 months'))).toBe(true);
    });

    it('should provide recommendations for high churn', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.15
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.recommendations.some((r: string) => r.includes('High monthly churn'))).toBe(true);
    });

    it('should provide positive reinforcement for excellent metrics', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.02
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      expect(response.recommendations.some((r: string) => r.includes('Excellent unit economics'))).toBe(true);
    });
  });

  describe('Scenario Analysis', () => {
    it('should generate optimistic and pessimistic scenarios', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.05
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.scenarios).toHaveProperty('optimistic');
      expect(response.scenarios).toHaveProperty('pessimistic');
      
      expect(response.scenarios.optimistic).toHaveProperty('label', 'Optimistic');
      expect(response.scenarios.optimistic).toHaveProperty('assumptions');
      expect(response.scenarios.optimistic).toHaveProperty('ltv');
      expect(response.scenarios.optimistic).toHaveProperty('ltvCacRatio');
      expect(response.scenarios.optimistic).toHaveProperty('paybackMonths');
      
      expect(response.scenarios.pessimistic).toHaveProperty('label', 'Pessimistic');
      expect(response.scenarios.pessimistic).toHaveProperty('assumptions');
      expect(response.scenarios.pessimistic).toHaveProperty('ltv');
      expect(response.scenarios.pessimistic).toHaveProperty('ltvCacRatio');
      expect(response.scenarios.pessimistic).toHaveProperty('paybackMonths');
    });

    it('should have optimistic scenario with better metrics than base', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.05
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.scenarios.optimistic.ltv).toBeGreaterThan(response.ltv);
      expect(response.scenarios.optimistic.ltvCacRatio).toBeGreaterThan(response.ltvCacRatio);
      expect(response.scenarios.optimistic.paybackMonths).toBeLessThan(response.paybackMonths);
    });

    it('should have pessimistic scenario with worse metrics than base', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.05
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      expect(response.scenarios.pessimistic.ltv).toBeLessThan(response.ltv);
      expect(response.scenarios.pessimistic.ltvCacRatio).toBeLessThan(response.ltvCacRatio);
      expect(response.scenarios.pessimistic.paybackMonths).toBeGreaterThan(response.paybackMonths);
    });
  });

  describe('Data Structure Validation', () => {
    it('should return properly structured unit economics data', async () => {
      const generator = tool.invoke({
        price: 100,
        grossMarginPct: 0.8,
        cac: 50,
        churnMonthlyPct: 0.05
      });
      const result = await generator.next();
      
      const response = JSON.parse(result.value.text);
      
      // Required fields
      expect(response).toHaveProperty('price');
      expect(response).toHaveProperty('grossMarginPct');
      expect(response).toHaveProperty('cac');
      expect(response).toHaveProperty('churnMonthlyPct');
      expect(response).toHaveProperty('arpuMonthly');
      expect(response).toHaveProperty('months');
      expect(response).toHaveProperty('ltv');
      expect(response).toHaveProperty('ltvGross');
      expect(response).toHaveProperty('paybackMonths');
      expect(response).toHaveProperty('ltvCacRatio');
      expect(response).toHaveProperty('monthlyGrossRevenue');
      expect(response).toHaveProperty('monthlyContributionMargin');
      expect(response).toHaveProperty('retentionMonthly');
      expect(response).toHaveProperty('retentionAnnual');
      expect(response).toHaveProperty('averageLifetimeMonths');
      expect(response).toHaveProperty('healthScore');
      expect(response).toHaveProperty('recommendations');
      expect(response).toHaveProperty('scenarios');
      expect(response).toHaveProperty('calculatedAt');
      
      // Data types
      expect(typeof response.price).toBe('number');
      expect(typeof response.grossMarginPct).toBe('number');
      expect(typeof response.cac).toBe('number');
      expect(typeof response.churnMonthlyPct).toBe('number');
      expect(typeof response.arpuMonthly).toBe('number');
      expect(typeof response.months).toBe('number');
      expect(typeof response.ltv).toBe('number');
      expect(typeof response.ltvGross).toBe('number');
      expect(typeof response.paybackMonths).toBe('number');
      expect(typeof response.ltvCacRatio).toBe('number');
      expect(typeof response.healthScore).toBe('string');
      expect(Array.isArray(response.recommendations)).toBe(true);
      expect(typeof response.scenarios).toBe('object');
      expect(typeof response.calculatedAt).toBe('string');
    });
  });
});
