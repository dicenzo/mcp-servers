import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

const Input = z.object({
  price: z.number().positive("Price must be positive"),
  grossMarginPct: z.number().min(0).max(1, "Gross margin must be between 0 and 1"),
  cac: z.number().nonnegative("CAC cannot be negative"),
  churnMonthlyPct: z.number().min(0).max(1, "Monthly churn must be between 0 and 1"),
  arpuMonthly: z.number().positive().optional(),
  months: z.number().positive().default(24)
});

interface UnitEconomics {
  // Input parameters
  price: number;
  grossMarginPct: number;
  cac: number;
  churnMonthlyPct: number;
  arpuMonthly: number;
  months: number;
  
  // Calculated metrics
  ltv: number;
  ltvGross: number;
  paybackMonths: number;
  ltvCacRatio: number;
  monthlyGrossRevenue: number;
  monthlyContributionMargin: number;
  
  // Retention and growth metrics
  retentionMonthly: number;
  retentionAnnual: number;
  averageLifetimeMonths: number;
  
  // Financial health indicators
  healthScore: string;
  recommendations: string[];
  
  // Scenario analysis
  scenarios: {
    optimistic: UnitEconScenario;
    pessimistic: UnitEconScenario;
  };
  
  calculatedAt: string;
}

interface UnitEconScenario {
  label: string;
  assumptions: string;
  ltv: number;
  ltvCacRatio: number;
  paybackMonths: number;
}

export const unitEconTool: Tool = {
  name: 'unitecon.calc',
  description: 'Calculate comprehensive unit economics including LTV, CAC payback, retention metrics, and business health indicators.',
  inputSchema: {
    type: 'object',
    properties: {
      price: { type: 'number', description: 'Product price per period', minimum: 0.01 },
      grossMarginPct: { type: 'number', description: 'Gross margin as decimal (0.0-1.0)', minimum: 0, maximum: 1 },
      cac: { type: 'number', description: 'Customer Acquisition Cost', minimum: 0 },
      churnMonthlyPct: { type: 'number', description: 'Monthly churn rate as decimal (0.0-1.0)', minimum: 0, maximum: 1 },
      arpuMonthly: { type: 'number', description: 'Average Revenue Per User per month (optional)', minimum: 0.01 },
      months: { type: 'number', description: 'Analysis period in months', minimum: 1 }
    },
    required: ['price', 'grossMarginPct', 'cac', 'churnMonthlyPct']
  },
  async *invoke(input: z.infer<typeof Input>) {
    try {
      const validated = Input.parse(input);
      console.error(`[MCP Tool] unitecon.calc called with CAC: $${validated.cac}, Price: $${validated.price}`);
      
      const unitEconomics = calculateUnitEconomics(validated);
      
      console.error(`[MCP Tool] unitecon.calc returning LTV: $${unitEconomics.ltv.toFixed(2)}, Ratio: ${unitEconomics.ltvCacRatio.toFixed(1)}:1`);
      return { 
        type: 'text', 
        text: JSON.stringify(unitEconomics, null, 2)
      };
      
    } catch (error) {
      console.error(`[MCP Tool Error] unitecon.calc failed:`, error);
      throw new Error(`Unit economics calculation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

function calculateUnitEconomics(input: z.infer<typeof Input>): UnitEconomics {
  const {
    price,
    grossMarginPct,
    cac,
    churnMonthlyPct,
    arpuMonthly = price,
    months
  } = input;
  
  // Prevent division by zero and ensure realistic bounds
  const effectiveChurn = Math.max(churnMonthlyPct, 0.001); // Minimum 0.1% monthly churn
  const monthlyRetention = 1 - effectiveChurn;
  
  // Core calculations
  const monthlyGrossRevenue = arpuMonthly;
  const monthlyContributionMargin = monthlyGrossRevenue * grossMarginPct;
  
  // LTV calculations
  const averageLifetimeMonths = 1 / effectiveChurn;
  const ltvGross = monthlyGrossRevenue * averageLifetimeMonths;
  const ltv = monthlyContributionMargin * averageLifetimeMonths;
  
  // Payback and ratios
  const paybackMonths = cac / Math.max(monthlyContributionMargin, 0.01);
  const ltvCacRatio = ltv / Math.max(cac, 0.01);
  
  // Retention metrics
  const retentionAnnual = Math.pow(monthlyRetention, 12);
  
  // Health assessment
  const healthScore = assessBusinessHealth(ltvCacRatio, paybackMonths, effectiveChurn);
  const recommendations = generateRecommendations(ltvCacRatio, paybackMonths, effectiveChurn, grossMarginPct);
  
  // Scenario analysis
  const scenarios = generateScenarios(input);
  
  return {
    // Input parameters
    price,
    grossMarginPct,
    cac,
    churnMonthlyPct,
    arpuMonthly,
    months,
    
    // Calculated metrics
    ltv: Math.round(ltv * 100) / 100,
    ltvGross: Math.round(ltvGross * 100) / 100,
    paybackMonths: Math.round(paybackMonths * 100) / 100,
    ltvCacRatio: Math.round(ltvCacRatio * 100) / 100,
    monthlyGrossRevenue: Math.round(monthlyGrossRevenue * 100) / 100,
    monthlyContributionMargin: Math.round(monthlyContributionMargin * 100) / 100,
    
    // Retention and growth metrics
    retentionMonthly: Math.round(monthlyRetention * 10000) / 100, // Convert to percentage
    retentionAnnual: Math.round(retentionAnnual * 10000) / 100,
    averageLifetimeMonths: Math.round(averageLifetimeMonths * 100) / 100,
    
    // Health indicators
    healthScore,
    recommendations,
    scenarios,
    
    calculatedAt: new Date().toISOString()
  };
}

function assessBusinessHealth(ltvCacRatio: number, paybackMonths: number, churnMonthlyPct: number): string {
  let score = 0;
  
  // LTV:CAC ratio scoring
  if (ltvCacRatio >= 3) score += 3;
  else if (ltvCacRatio >= 2) score += 2;
  else if (ltvCacRatio >= 1) score += 1;
  
  // Payback period scoring
  if (paybackMonths <= 6) score += 2;
  else if (paybackMonths <= 12) score += 1;
  else if (paybackMonths <= 18) score += 0.5;
  
  // Churn rate scoring
  if (churnMonthlyPct <= 0.02) score += 2; // ≤2% monthly churn
  else if (churnMonthlyPct <= 0.05) score += 1; // ≤5% monthly churn
  else if (churnMonthlyPct <= 0.10) score += 0.5; // ≤10% monthly churn
  
  if (score >= 6) return "Excellent";
  if (score >= 4) return "Good";
  if (score >= 2) return "Fair";
  return "Poor";
}

function generateRecommendations(
  ltvCacRatio: number, 
  paybackMonths: number, 
  churnMonthlyPct: number, 
  grossMarginPct: number
): string[] {
  const recommendations: string[] = [];
  
  // LTV:CAC ratio recommendations
  if (ltvCacRatio < 3) {
    if (ltvCacRatio < 1) {
      recommendations.push("🚨 CRITICAL: LTV:CAC ratio below 1:1 indicates unsustainable unit economics. Focus on reducing CAC or increasing retention immediately.");
    } else {
      recommendations.push("⚠️ LTV:CAC ratio below 3:1. Consider optimizing customer acquisition channels or improving retention to reach sustainable ratios.");
    }
  }
  
  // Payback period recommendations
  if (paybackMonths > 12) {
    recommendations.push("💰 Payback period over 12 months may strain cash flow. Focus on faster customer activation or higher initial pricing.");
  } else if (paybackMonths > 6) {
    recommendations.push("⏰ Consider strategies to reduce payback period below 6 months for better cash efficiency.");
  }
  
  // Churn rate recommendations
  if (churnMonthlyPct > 0.1) {
    recommendations.push("📉 High monthly churn (>10%) significantly impacts LTV. Prioritize customer success and product engagement initiatives.");
  } else if (churnMonthlyPct > 0.05) {
    recommendations.push("🔄 Monthly churn above 5% suggests room for retention improvement. Analyze churn reasons and implement retention programs.");
  }
  
  // Gross margin recommendations
  if (grossMarginPct < 0.7) {
    recommendations.push("📊 Gross margins below 70% may limit scaling potential. Explore pricing optimization or cost reduction opportunities.");
  }
  
  // Positive reinforcement
  if (ltvCacRatio >= 3 && paybackMonths <= 6 && churnMonthlyPct <= 0.05) {
    recommendations.push("✅ Excellent unit economics! Focus on scaling customer acquisition while maintaining these healthy metrics.");
  }
  
  return recommendations;
}

function generateScenarios(input: z.infer<typeof Input>): {
  optimistic: UnitEconScenario;
  pessimistic: UnitEconScenario;
} {
  // Optimistic scenario: 20% better retention, 15% higher ARPU
  const optimisticChurn = Math.max(input.churnMonthlyPct * 0.8, 0.001);
  const optimisticARPU = (input.arpuMonthly || input.price) * 1.15;
  const optimisticContribution = optimisticARPU * input.grossMarginPct;
  const optimisticLTV = optimisticContribution / optimisticChurn;
  const optimisticRatio = optimisticLTV / Math.max(input.cac, 0.01);
  const optimisticPayback = input.cac / Math.max(optimisticContribution, 0.01);
  
  // Pessimistic scenario: 30% worse retention, 10% lower ARPU
  const pessimisticChurn = Math.min(input.churnMonthlyPct * 1.3, 0.5);
  const pessimisticARPU = (input.arpuMonthly || input.price) * 0.9;
  const pessimisticContribution = pessimisticARPU * input.grossMarginPct;
  const pessimisticLTV = pessimisticContribution / pessimisticChurn;
  const pessimisticRatio = pessimisticLTV / Math.max(input.cac, 0.01);
  const pessimisticPayback = input.cac / Math.max(pessimisticContribution, 0.01);
  
  return {
    optimistic: {
      label: "Optimistic",
      assumptions: "20% better retention, 15% higher ARPU",
      ltv: Math.round(optimisticLTV * 100) / 100,
      ltvCacRatio: Math.round(optimisticRatio * 100) / 100,
      paybackMonths: Math.round(optimisticPayback * 100) / 100
    },
    pessimistic: {
      label: "Pessimistic", 
      assumptions: "30% worse retention, 10% lower ARPU",
      ltv: Math.round(pessimisticLTV * 100) / 100,
      ltvCacRatio: Math.round(pessimisticRatio * 100) / 100,
      paybackMonths: Math.round(pessimisticPayback * 100) / 100
    }
  };
}
