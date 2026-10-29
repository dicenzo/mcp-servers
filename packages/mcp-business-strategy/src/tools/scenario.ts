import { ExecutableTool } from './types.js';
import { z } from 'zod';

const Input = z.object({ 
  base: z.record(z.number()), 
  knobs: z.record(z.array(z.number())),
  metrics: z.array(z.string()).optional().default(['revenue', 'ltv', 'payback'])
});

interface ScenarioResult {
  scenario_id: string;
  inputs: Record<string, number>;
  outputs: Record<string, number>;
  sensitivity: Record<string, number>;
}

interface ScenarioAnalysis {
  base_case: Record<string, number>;
  scenarios: ScenarioResult[];
  sensitivity_matrix: {
    variable: string;
    impact_on_revenue: number;
    impact_on_ltv: number;
    impact_on_payback: number;
    rank: number;
  }[];
  summary: {
    most_sensitive_variable: string;
    best_case_scenario: string;
    worst_case_scenario: string;
    total_scenarios: number;
  };
  recommendations: string[];
  generated_at: string;
}

export const scenarioTool: ExecutableTool = {
  name: 'scenario.run',
  description: 'Generate comprehensive scenario analysis with sensitivity testing for business model variables and financial projections.',
  inputSchema: { 
    type: 'object', 
    properties: { 
      base: { 
        type: 'object', 
        description: 'Base case scenario with numeric values',
        additionalProperties: { type: 'number' }
      }, 
      knobs: { 
        type: 'object', 
        description: 'Variables to test with array of values for each',
        additionalProperties: { 
          type: 'array',
          items: { type: 'number' }
        }
      },
      metrics: {
        type: 'array',
        items: { type: 'string' },
        description: 'Metrics to calculate for each scenario'
      }
    }, 
    required: ['base', 'knobs'] 
  },
  // The tool contract is a generator (index.ts reads one next()); this tool returns its single result
  // eslint-disable-next-line require-yield
  async *invoke(input: z.infer<typeof Input>) {
    try {
      const { base, knobs, metrics } = Input.parse(input);
      console.error(`[MCP Tool] scenario.run called with ${Object.keys(knobs).length} variables to test`);
      
      const analysis = generateScenarioAnalysis(base, knobs, metrics);
      
      console.error(`[MCP Tool] scenario.run generated ${analysis.scenarios.length} scenarios`);
      return { 
        type: 'text', 
        text: JSON.stringify(analysis, null, 2)
      };
      
    } catch (error) {
      console.error(`[MCP Tool Error] scenario.run failed:`, error);
      throw new Error(`Scenario analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
};

function generateScenarioAnalysis(
  base: Record<string, number>, 
  knobs: Record<string, number[]>,
  metrics: string[]
): ScenarioAnalysis {
  // Generate all scenario combinations
  const scenarios = generateScenarios(base, knobs);
  
  // Calculate outputs for each scenario
  const scenarioResults: ScenarioResult[] = scenarios.map((scenario, index) => {
    const outputs = calculateScenarioOutputs(scenario, metrics);
    const sensitivity = calculateSensitivity(base, scenario, outputs);
    
    return {
      scenario_id: `scenario_${index + 1}`,
      inputs: scenario,
      outputs,
      sensitivity
    };
  });
  
  // Calculate base case outputs
  const baseCaseOutputs = calculateScenarioOutputs(base, metrics);
  
  // Generate sensitivity matrix
  const sensitivityMatrix = generateSensitivityMatrix(base, knobs, baseCaseOutputs);
  
  // Generate summary
  const summary = generateSummary(scenarioResults, sensitivityMatrix);
  
  // Generate recommendations
  const recommendations = generateScenarioRecommendations(scenarioResults, sensitivityMatrix, base);
  
  return {
    base_case: { ...base, ...baseCaseOutputs },
    scenarios: scenarioResults,
    sensitivity_matrix: sensitivityMatrix,
    summary,
    recommendations,
    generated_at: new Date().toISOString()
  };
}

function generateScenarios(base: Record<string, number>, knobs: Record<string, number[]>): Record<string, number>[] {
  const keys = Object.keys(knobs);
  const scenarios: Record<string, number>[] = [];
  
  function recurse(index: number, current: Record<string, number>) {
    if (index === keys.length) {
      scenarios.push({ ...current });
      return;
    }
    
    const key = keys[index];
    for (const value of knobs[key]) {
      recurse(index + 1, { ...current, [key]: value });
    }
  }
  
  recurse(0, base);
  return scenarios;
}

function calculateScenarioOutputs(scenario: Record<string, number>, metrics: string[]): Record<string, number> {
  const outputs: Record<string, number> = {};
  
  // Extract common business variables
  const {
    price = 100,
    cac = 50,
    churnMonthlyPct = 0.05,
    grossMarginPct = 0.8,
    customers = 1000,
    arpuMonthly = price
  } = scenario;
  
  // Calculate standard business metrics
  const monthlyRevenue = customers * arpuMonthly;
  const annualRevenue = monthlyRevenue * 12;
  const monthlyContributionMargin = arpuMonthly * grossMarginPct;
  const averageLifetimeMonths = 1 / Math.max(churnMonthlyPct, 0.001);
  const ltv = monthlyContributionMargin * averageLifetimeMonths;
  const paybackMonths = cac / Math.max(monthlyContributionMargin, 0.01);
  const ltvCacRatio = ltv / Math.max(cac, 0.01);
  
  // Calculate additional metrics based on requested metrics
  if (metrics.includes('revenue') || metrics.includes('all')) {
    outputs.monthly_revenue = Math.round(monthlyRevenue * 100) / 100;
    outputs.annual_revenue = Math.round(annualRevenue * 100) / 100;
  }
  
  if (metrics.includes('ltv') || metrics.includes('all')) {
    outputs.ltv = Math.round(ltv * 100) / 100;
    outputs.ltv_cac_ratio = Math.round(ltvCacRatio * 100) / 100;
  }
  
  if (metrics.includes('payback') || metrics.includes('all')) {
    outputs.payback_months = Math.round(paybackMonths * 100) / 100;
  }
  
  if (metrics.includes('margins') || metrics.includes('all')) {
    outputs.monthly_contribution_margin = Math.round(monthlyContributionMargin * 100) / 100;
    outputs.gross_margin_dollars = Math.round(monthlyRevenue * grossMarginPct * 100) / 100;
  }
  
  if (metrics.includes('growth') || metrics.includes('all')) {
    outputs.customer_lifetime_months = Math.round(averageLifetimeMonths * 100) / 100;
    outputs.monthly_retention_rate = Math.round((1 - churnMonthlyPct) * 10000) / 100;
  }
  
  // Default metrics if none specified
  if (metrics.length === 0 || metrics.includes('revenue')) {
    outputs.revenue = annualRevenue;
  }
  if (metrics.length === 0 || metrics.includes('ltv')) {
    outputs.ltv = ltv;
  }
  if (metrics.length === 0 || metrics.includes('payback')) {
    outputs.payback = paybackMonths;
  }
  
  return outputs;
}

function calculateSensitivity(
  base: Record<string, number>, 
  scenario: Record<string, number>, 
  _outputs: Record<string, number>
): Record<string, number> {
  const sensitivity: Record<string, number> = {};
  
  // Calculate percentage change from base case for each input variable
  for (const [key, value] of Object.entries(scenario)) {
    if (base[key] && base[key] !== 0) {
      const percentChange = ((value - base[key]) / base[key]) * 100;
      sensitivity[`${key}_change_pct`] = Math.round(percentChange * 100) / 100;
    }
  }
  
  return sensitivity;
}

function generateSensitivityMatrix(
  base: Record<string, number>,
  knobs: Record<string, number[]>,
  baseCaseOutputs: Record<string, number>
): Array<{
  variable: string;
  impact_on_revenue: number;
  impact_on_ltv: number;
  impact_on_payback: number;
  rank: number;
}> {
  // combined_impact is only used for ranking, but it stays on each row (and so in the output)
  const matrix: Array<{
    variable: string;
    impact_on_revenue: number;
    impact_on_ltv: number;
    impact_on_payback: number;
    rank: number;
    combined_impact: number;
  }> = [];
  
  // Test each variable independently with +20% change
  for (const [variable, values] of Object.entries(knobs)) {
    const baseValue = base[variable];
    // Skip knobs with no base value; 0 is a valid base (e.g. zero CAC)
    if (baseValue === undefined) continue;
    
    // Find a test value (preferably 20% higher, or use max value)
    const testValue = values.find(v => v > baseValue) || Math.max(...values);
    
    // Calculate outputs with this variable changed
    const testScenario = { ...base, [variable]: testValue };
    const testOutputs = calculateScenarioOutputs(testScenario, ['revenue', 'ltv', 'payback']);
    
    // Calculate impact percentages
    const revenueImpact = baseCaseOutputs.revenue ? 
      ((testOutputs.revenue - baseCaseOutputs.revenue) / baseCaseOutputs.revenue) * 100 : 0;
    const ltvImpact = baseCaseOutputs.ltv ? 
      ((testOutputs.ltv - baseCaseOutputs.ltv) / baseCaseOutputs.ltv) * 100 : 0;
    const paybackImpact = baseCaseOutputs.payback ? 
      ((testOutputs.payback - baseCaseOutputs.payback) / baseCaseOutputs.payback) * 100 : 0;
    
    matrix.push({
      variable,
      impact_on_revenue: Math.round(revenueImpact * 100) / 100,
      impact_on_ltv: Math.round(ltvImpact * 100) / 100,
      impact_on_payback: Math.round(paybackImpact * 100) / 100,
      rank: 0, // Will be calculated after all variables
      combined_impact: 0 // Set during ranking below
    });
  }
  
  // Rank variables by combined impact (weighted average)
  matrix.forEach(item => {
    const combinedImpact = Math.abs(item.impact_on_revenue) * 0.4 + 
                          Math.abs(item.impact_on_ltv) * 0.4 + 
                          Math.abs(item.impact_on_payback) * 0.2;
    item.combined_impact = combinedImpact;
  });
  
  matrix.sort((a, b) => b.combined_impact - a.combined_impact);
  matrix.forEach((item, index) => {
    item.rank = index + 1;
  });
  
  return matrix;
}

function generateSummary(
  scenarios: ScenarioResult[],
  sensitivityMatrix: Array<{ variable: string; impact_on_revenue: number; rank: number }>
): {
  most_sensitive_variable: string;
  best_case_scenario: string;
  worst_case_scenario: string;
  total_scenarios: number;
} {
  // Find most sensitive variable
  const mostSensitive = sensitivityMatrix.length > 0 ? sensitivityMatrix[0].variable : 'none';
  
  // Find best and worst case scenarios based on revenue
  let bestScenario = scenarios[0];
  let worstScenario = scenarios[0];
  
  for (const scenario of scenarios) {
    if (scenario.outputs.revenue && bestScenario.outputs.revenue && 
        scenario.outputs.revenue > bestScenario.outputs.revenue) {
      bestScenario = scenario;
    }
    if (scenario.outputs.revenue && worstScenario.outputs.revenue && 
        scenario.outputs.revenue < worstScenario.outputs.revenue) {
      worstScenario = scenario;
    }
  }
  
  return {
    most_sensitive_variable: mostSensitive,
    best_case_scenario: bestScenario.scenario_id,
    worst_case_scenario: worstScenario.scenario_id,
    total_scenarios: scenarios.length
  };
}

function generateScenarioRecommendations(
  scenarios: ScenarioResult[],
  sensitivityMatrix: Array<{ variable: string; impact_on_revenue: number; rank: number }>,
  _base: Record<string, number>
): string[] {
  const recommendations: string[] = [];
  
  // Recommendation based on most sensitive variable
  if (sensitivityMatrix.length > 0) {
    const topVariable = sensitivityMatrix[0];
    recommendations.push(
      `🎯 Focus on optimizing ${topVariable.variable} - it has the highest impact on business performance (rank #${topVariable.rank})`
    );
  }
  
  // Recommendation based on scenario spread
  const revenues = scenarios.map(s => s.outputs.revenue || 0).filter(r => r > 0);
  if (revenues.length > 1) {
    const minRevenue = Math.min(...revenues);
    const maxRevenue = Math.max(...revenues);
    const spread = ((maxRevenue - minRevenue) / minRevenue) * 100;
    
    if (spread > 50) {
      recommendations.push(
        `📊 High scenario variability (${Math.round(spread)}% revenue spread) suggests significant optimization opportunity`
      );
    }
  }
  
  // Recommendations based on key ratios
  const avgLtvCac = scenarios.reduce((sum, s) => sum + (s.outputs.ltv_cac_ratio || 0), 0) / scenarios.length;
  if (avgLtvCac < 3) {
    recommendations.push(
      `⚠️ Average LTV:CAC ratio of ${avgLtvCac.toFixed(1)}:1 across scenarios suggests need for retention or acquisition optimization`
    );
  }
  
  const avgPayback = scenarios.reduce((sum, s) => sum + (s.outputs.payback_months || 0), 0) / scenarios.length;
  if (avgPayback > 12) {
    recommendations.push(
      `💰 Average payback period of ${avgPayback.toFixed(1)} months may strain cash flow - consider pricing or activation improvements`
    );
  }
  
  // Top 3 variables recommendation
  if (sensitivityMatrix.length >= 3) {
    const top3 = sensitivityMatrix.slice(0, 3).map(v => v.variable);
    recommendations.push(
      `🔍 Monitor these top 3 variables closely: ${top3.join(', ')} - they drive most of your business variability`
    );
  }
  
  return recommendations;
}
