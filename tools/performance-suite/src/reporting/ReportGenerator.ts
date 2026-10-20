/**
 * Report Generator for MCP Graphics Performance Analysis
 * Creates comprehensive performance reports with insights and recommendations
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { 
  PerformanceReport, 
  TestResult, 
  LoadTestResult,
  PRD_TARGETS
} from '../types/performance.js';

export class ReportGenerator {
  
  /**
   * Generate comprehensive HTML performance report
   */
  generateHtmlReport(report: PerformanceReport, outputPath: string = './performance-report.html'): void {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>MCP Graphics Performance Report</title>
    <style>
        ${this.getReportStyles()}
    </style>
</head>
<body>
    <div class="container">
        ${this.generateReportHeader(report)}
        ${this.generateExecutiveSummary(report)}
        ${this.generateServerResults(report)}
        ${this.generateCrossServerMetrics(report)}
        ${this.generateRecommendations(report)}
        ${this.generateAppendices(report)}
    </div>
    <script>
        ${this.getReportScripts()}
    </script>
</body>
</html>`;

    // Ensure output directory exists
    const outputDir = outputPath.split('/').slice(0, -1).join('/');
    if (outputDir) {
      mkdirSync(outputDir, { recursive: true });
    }
    
    writeFileSync(outputPath, html);
    console.log(`📊 HTML report generated: ${outputPath}`);
  }

  /**
   * Generate JSON report for programmatic use
   */
  generateJsonReport(report: PerformanceReport, outputPath: string = './performance-report.json'): void {
    const enhancedReport = {
      ...report,
      analysis: this.generateAnalysis(report),
      insights: this.generateInsights(report)
    };
    
    writeFileSync(outputPath, JSON.stringify(enhancedReport, null, 2));
    console.log(`📋 JSON report generated: ${outputPath}`);
  }

  /**
   * Generate console summary report
   */
  printConsoleSummary(report: PerformanceReport): void {
    console.log('\\n' + '='.repeat(80));
    console.log('🏁 MCP GRAPHICS PERFORMANCE ANALYSIS COMPLETE');
    console.log('='.repeat(80));
    
    console.log(`\\n📅 Generated: ${new Date(report.generatedAt).toLocaleString()}`);
    console.log(`⏱️  Duration: ${(report.testDuration / 1000).toFixed(2)} seconds`);
    console.log(`🖥️  Environment: ${report.environment.platform} ${report.environment.arch} (Node ${report.environment.nodeVersion})`);
    
    console.log('\\n📊 OVERALL RESULTS');
    console.log('-'.repeat(50));
    console.log(`Total Tests: ${report.summary.totalTests}`);
    console.log(`Passed: ${report.summary.passedTests} ✅`);
    console.log(`Failed: ${report.summary.failedTests} ❌`);
    console.log(`Pass Rate: ${report.summary.overallPassRate.toFixed(1)}%`);
    console.log(`Average Performance: ${report.summary.averagePerformance.toFixed(2)}x target`);
    
    console.log('\\n🎯 SERVER PERFORMANCE');
    console.log('-'.repeat(50));
    
    for (const [serverName, results] of Object.entries(report.serverResults)) {
      const passedTests = results.performanceTests.filter(t => t.passed).length;
      const totalTests = results.performanceTests.length;
      const passRate = totalTests > 0 ? (passedTests / totalTests) * 100 : 0;
      
      const status = passRate === 100 ? '✅' : passRate >= 80 ? '⚠️' : '❌';
      console.log(`${status} ${serverName.padEnd(20)} ${passedTests}/${totalTests} (${passRate.toFixed(1)}%)`);
      
      // Show worst performing tools
      const slowest = results.performanceTests
        .filter(t => !t.passed)
        .sort((a, b) => (b.actualTime / b.target) - (a.actualTime / a.target))
        .slice(0, 3);
      
      if (slowest.length > 0) {
        slowest.forEach(test => {
          const overrun = ((test.actualTime / test.target - 1) * 100).toFixed(0);
          console.log(`    ↳ ${test.toolName}: ${overrun}% over target (${test.actualTime.toFixed(1)}ms vs ${test.target}ms)`);
        });
      }
    }
    
    console.log('\\n💡 KEY RECOMMENDATIONS');
    console.log('-'.repeat(50));
    
    const allRecommendations = Object.values(report.serverResults)
      .flatMap(r => r.recommendations)
      .slice(0, 5);
    
    if (allRecommendations.length > 0) {
      allRecommendations.forEach((rec, i) => {
        console.log(`${i + 1}. ${rec}`);
      });
    } else {
      console.log('🎉 No critical performance issues detected!');
    }
    
    console.log('\\n🚨 CRITICAL ISSUES');
    console.log('-'.repeat(50));
    
    const criticalIssues = Object.values(report.serverResults)
      .flatMap(r => r.criticalIssues)
      .slice(0, 5);
    
    if (criticalIssues.length > 0) {
      criticalIssues.forEach((issue, i) => {
        console.log(`${i + 1}. ${issue}`);
      });
    } else {
      console.log('✅ No critical issues detected!');
    }
    
    console.log('\\n' + '='.repeat(80));
  }

  /**
   * Generate analysis insights
   */
  private generateAnalysis(report: PerformanceReport) {
    const analysis = {
      performanceDistribution: this.analyzePerformanceDistribution(report),
      bottleneckIdentification: this.identifyBottlenecks(report),
      scalabilityAssessment: this.assessScalability(report),
      reliabilityMetrics: this.calculateReliabilityMetrics(report),
      resourceUtilization: this.analyzeResourceUtilization(report)
    };
    
    return analysis;
  }

  /**
   * Generate insights and patterns
   */
  private generateInsights(report: PerformanceReport) {
    const insights = [];
    
    // Performance insights
    const allTests = Object.values(report.serverResults)
      .flatMap(r => r.performanceTests);
    
    const avgPerformance = allTests.reduce((sum, test) => 
      sum + (test.target / test.actualTime), 0) / allTests.length;
    
    if (avgPerformance > 2) {
      insights.push({
        type: 'positive',
        category: 'performance',
        message: 'Excellent overall performance - most operations well under target times',
        impact: 'high'
      });
    } else if (avgPerformance < 0.8) {
      insights.push({
        type: 'negative',
        category: 'performance',
        message: 'Performance concerns - multiple operations exceeding targets',
        impact: 'high'
      });
    }
    
    // Memory insights
    const highMemoryTests = allTests.filter(test => 
      test.memoryUsed > 100 * 1024 * 1024); // > 100MB
    
    if (highMemoryTests.length > 0) {
      insights.push({
        type: 'warning',
        category: 'memory',
        message: `${highMemoryTests.length} operations using high memory (>100MB)`,
        impact: 'medium',
        details: highMemoryTests.map(t => t.toolName)
      });
    }
    
    // Reliability insights
    const unreliableTests = allTests.filter(test => test.successRate < 95);
    if (unreliableTests.length > 0) {
      insights.push({
        type: 'negative',
        category: 'reliability',
        message: `${unreliableTests.length} operations with reliability issues (<95% success rate)`,
        impact: 'high',
        details: unreliableTests.map(t => ({ tool: t.toolName, rate: t.successRate }))
      });
    }
    
    return insights;
  }

  /**
   * Analyze performance distribution across servers
   */
  private analyzePerformanceDistribution(report: PerformanceReport) {
    const serverPerformance: Record<string, number[]> = {};
    
    for (const [serverName, results] of Object.entries(report.serverResults)) {
      serverPerformance[serverName] = results.performanceTests.map(test => 
        test.actualTime / test.target
      );
    }
    
    return serverPerformance;
  }

  /**
   * Identify primary bottlenecks
   */
  private identifyBottlenecks(report: PerformanceReport) {
    const bottlenecks = [];
    
    for (const [serverName, results] of Object.entries(report.serverResults)) {
      const slowTests = results.performanceTests
        .filter(test => test.actualTime > test.target * 1.5)
        .sort((a, b) => (b.actualTime / b.target) - (a.actualTime / a.target));
      
      if (slowTests.length > 0) {
        bottlenecks.push({
          server: serverName,
          operations: slowTests.map(test => ({
            tool: test.toolName,
            actualTime: test.actualTime,
            target: test.target,
            overrun: ((test.actualTime / test.target - 1) * 100).toFixed(1) + '%'
          }))
        });
      }
    }
    
    return bottlenecks;
  }

  /**
   * Assess scalability based on load tests
   */
  private assessScalability(report: PerformanceReport) {
    const scalabilityMetrics: Record<string, any> = {};
    
    for (const [serverName, results] of Object.entries(report.serverResults)) {
      if (results.loadTests.length > 0) {
        const avgThroughput = results.loadTests.reduce((sum, test) => 
          sum + test.throughputPerSecond, 0) / results.loadTests.length;
        const avgErrorRate = results.loadTests.reduce((sum, test) => 
          sum + test.errorRate, 0) / results.loadTests.length;
        
        scalabilityMetrics[serverName] = {
          averageThroughput: avgThroughput.toFixed(2),
          averageErrorRate: avgErrorRate.toFixed(2),
          scalabilityScore: this.calculateScalabilityScore(avgThroughput, avgErrorRate)
        };
      }
    }
    
    return scalabilityMetrics;
  }

  /**
   * Calculate reliability metrics
   */
  private calculateReliabilityMetrics(report: PerformanceReport) {
    const reliabilityMetrics: Record<string, any> = {};
    
    for (const [serverName, results] of Object.entries(report.serverResults)) {
      const avgSuccessRate = results.performanceTests.reduce((sum, test) => 
        sum + test.successRate, 0) / results.performanceTests.length;
      
      const errorCount = results.performanceTests.reduce((sum, test) => 
        sum + test.errors.length, 0);
      
      reliabilityMetrics[serverName] = {
        averageSuccessRate: avgSuccessRate.toFixed(2),
        totalErrors: errorCount,
        reliabilityGrade: this.calculateReliabilityGrade(avgSuccessRate)
      };
    }
    
    return reliabilityMetrics;
  }

  /**
   * Analyze resource utilization
   */
  private analyzeResourceUtilization(report: PerformanceReport) {
    const resourceMetrics: Record<string, any> = {};
    
    for (const [serverName, results] of Object.entries(report.serverResults)) {
      const totalMemoryUsed = results.performanceTests.reduce((sum, test) => 
        sum + test.memoryUsed, 0);
      
      const avgMemoryPerTest = totalMemoryUsed / results.performanceTests.length;
      
      resourceMetrics[serverName] = {
        totalMemoryUsed: (totalMemoryUsed / 1024 / 1024).toFixed(2) + ' MB',
        averageMemoryPerTest: (avgMemoryPerTest / 1024 / 1024).toFixed(2) + ' MB',
        memoryEfficiencyScore: this.calculateMemoryEfficiencyScore(avgMemoryPerTest)
      };
    }
    
    return resourceMetrics;
  }

  /**
   * Calculate scalability score
   */
  private calculateScalabilityScore(throughput: number, errorRate: number): string {
    if (throughput > 100 && errorRate < 1) return 'Excellent';
    if (throughput > 50 && errorRate < 5) return 'Good';
    if (throughput > 20 && errorRate < 10) return 'Fair';
    return 'Poor';
  }

  /**
   * Calculate reliability grade
   */
  private calculateReliabilityGrade(successRate: number): string {
    if (successRate >= 99) return 'A+';
    if (successRate >= 95) return 'A';
    if (successRate >= 90) return 'B';
    if (successRate >= 80) return 'C';
    return 'D';
  }

  /**
   * Calculate memory efficiency score
   */
  private calculateMemoryEfficiencyScore(avgMemoryBytes: number): string {
    const avgMemoryMB = avgMemoryBytes / 1024 / 1024;
    if (avgMemoryMB < 10) return 'Excellent';
    if (avgMemoryMB < 50) return 'Good';
    if (avgMemoryMB < 100) return 'Fair';
    return 'Poor';
  }

  // HTML Report Generation Methods
  
  private generateReportHeader(report: PerformanceReport): string {
    return `
      <header class="report-header">
        <h1>🎨 MCP Graphics Performance Report</h1>
        <div class="header-info">
          <div class="info-item">
            <strong>Generated:</strong> ${new Date(report.generatedAt).toLocaleString()}
          </div>
          <div class="info-item">
            <strong>Duration:</strong> ${(report.testDuration / 1000).toFixed(2)}s
          </div>
          <div class="info-item">
            <strong>Environment:</strong> ${report.environment.platform} ${report.environment.arch} (Node ${report.environment.nodeVersion})
          </div>
        </div>
      </header>
    `;
  }

  private generateExecutiveSummary(report: PerformanceReport): string {
    const { summary } = report;
    const passRateClass = summary.overallPassRate >= 90 ? 'excellent' : 
                         summary.overallPassRate >= 70 ? 'good' : 'poor';
    
    return `
      <section class="executive-summary">
        <h2>📊 Executive Summary</h2>
        <div class="summary-cards">
          <div class="summary-card">
            <div class="card-value">${summary.totalTests}</div>
            <div class="card-label">Total Tests</div>
          </div>
          <div class="summary-card ${passRateClass}">
            <div class="card-value">${summary.overallPassRate.toFixed(1)}%</div>
            <div class="card-label">Pass Rate</div>
          </div>
          <div class="summary-card">
            <div class="card-value">${summary.averagePerformance.toFixed(2)}x</div>
            <div class="card-label">Avg Performance</div>
          </div>
          <div class="summary-card ${summary.failedTests === 0 ? 'excellent' : 'poor'}">
            <div class="card-value">${summary.failedTests}</div>
            <div class="card-label">Failed Tests</div>
          </div>
        </div>
      </section>
    `;
  }

  private generateServerResults(report: PerformanceReport): string {
    let html = '<section class="server-results"><h2>🖥️ Server Performance Results</h2>';
    
    for (const [serverName, results] of Object.entries(report.serverResults)) {
      html += `
        <div class="server-section">
          <h3>${serverName}</h3>
          ${this.generateServerPerformanceTable(results.performanceTests)}
          ${results.loadTests.length > 0 ? this.generateLoadTestResults(results.loadTests) : ''}
          ${this.generateServerRecommendations(results.recommendations, results.criticalIssues)}
        </div>
      `;
    }
    
    html += '</section>';
    return html;
  }

  private generateServerPerformanceTable(tests: TestResult[]): string {
    let table = `
      <div class="performance-table">
        <table>
          <thead>
            <tr>
              <th>Tool</th>
              <th>Operation</th>
              <th>Target (ms)</th>
              <th>Actual (ms)</th>
              <th>Success Rate</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
    `;
    
    tests.forEach(test => {
      const statusIcon = test.passed ? '✅' : '❌';
      const statusClass = test.passed ? 'passed' : 'failed';
      
      table += `
        <tr class="${statusClass}">
          <td>${test.toolName}</td>
          <td>${test.operation}</td>
          <td>${test.target}</td>
          <td>${test.actualTime.toFixed(2)}</td>
          <td>${test.successRate.toFixed(1)}%</td>
          <td>${statusIcon}</td>
        </tr>
      `;
    });
    
    table += '</tbody></table></div>';
    return table;
  }

  private generateLoadTestResults(loadTests: LoadTestResult[]): string {
    let html = '<div class="load-test-results"><h4>Load Test Results</h4>';
    
    loadTests.forEach(test => {
      html += `
        <div class="load-test-item">
          <strong>${test.toolName}</strong>: 
          ${test.throughputPerSecond.toFixed(2)} req/s, 
          ${test.errorRate.toFixed(1)}% error rate
        </div>
      `;
    });
    
    html += '</div>';
    return html;
  }

  private generateServerRecommendations(recommendations: string[], criticalIssues: string[]): string {
    let html = '';
    
    if (recommendations.length > 0) {
      html += '<div class="recommendations"><h4>💡 Recommendations</h4><ul>';
      recommendations.forEach(rec => {
        html += `<li>${rec}</li>`;
      });
      html += '</ul></div>';
    }
    
    if (criticalIssues.length > 0) {
      html += '<div class="critical-issues"><h4>🚨 Critical Issues</h4><ul>';
      criticalIssues.forEach(issue => {
        html += `<li class="critical">${issue}</li>`;
      });
      html += '</ul></div>';
    }
    
    return html;
  }

  private generateCrossServerMetrics(report: PerformanceReport): string {
    return `
      <section class="cross-server-metrics">
        <h2>🔄 Cross-Server Analysis</h2>
        <div class="metrics-grid">
          <div class="metric-card">
            <h4>Memory Leak Test</h4>
            <p>Memory increase: ${report.crossServerMetrics.memoryLeakTest.memoryIncrease.toFixed(2)} MB</p>
            <p>Status: ${report.crossServerMetrics.memoryLeakTest.leakDetected ? '⚠️ Leak detected' : '✅ No leaks'}</p>
          </div>
          <div class="metric-card">
            <h4>Resource Contention</h4>
            <p>Isolated: ${report.crossServerMetrics.resourceContentionTest.isolatedPerformance.toFixed(2)}ms</p>
            <p>Concurrent: ${report.crossServerMetrics.resourceContentionTest.concurrentPerformance.toFixed(2)}ms</p>
            <p>Degradation: ${report.crossServerMetrics.resourceContentionTest.degradationPercentage.toFixed(1)}%</p>
          </div>
        </div>
      </section>
    `;
  }

  private generateRecommendations(report: PerformanceReport): string {
    const allRecommendations = Object.values(report.serverResults)
      .flatMap(r => r.recommendations);
    const allIssues = Object.values(report.serverResults)
      .flatMap(r => r.criticalIssues);
    
    return `
      <section class="overall-recommendations">
        <h2>📋 Overall Recommendations</h2>
        ${allRecommendations.length > 0 ? `
          <div class="recommendation-list">
            <h3>Performance Optimizations</h3>
            <ol>
              ${allRecommendations.map(rec => `<li>${rec}</li>`).join('')}
            </ol>
          </div>
        ` : ''}
        ${allIssues.length > 0 ? `
          <div class="issue-list">
            <h3>Critical Issues to Address</h3>
            <ol>
              ${allIssues.map(issue => `<li class="critical">${issue}</li>`).join('')}
            </ol>
          </div>
        ` : ''}
      </section>
    `;
  }

  private generateAppendices(report: PerformanceReport): string {
    return `
      <section class="appendices">
        <h2>📚 Appendices</h2>
        <div class="appendix">
          <h3>A. Performance Targets (PRD)</h3>
          <div class="targets-grid">
            ${Object.entries(PRD_TARGETS).map(([tool, target]) => `
              <div class="target-item">
                <strong>${tool}:</strong> ${target}ms
              </div>
            `).join('')}
          </div>
        </div>
        <div class="appendix">
          <h3>B. Test Environment</h3>
          <ul>
            <li>Platform: ${report.environment.platform} ${report.environment.arch}</li>
            <li>Node.js: ${report.environment.nodeVersion}</li>
            <li>Test Duration: ${(report.testDuration / 1000).toFixed(2)} seconds</li>
          </ul>
        </div>
      </section>
    `;
  }

  private getReportStyles(): string {
    return `
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        line-height: 1.6; 
        margin: 0; 
        padding: 0; 
        background: #f5f7fa;
      }
      .container { 
        max-width: 1200px; 
        margin: 0 auto; 
        padding: 20px;
        background: white;
        box-shadow: 0 0 20px rgba(0,0,0,0.1);
      }
      .report-header { 
        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); 
        color: white; 
        padding: 30px; 
        border-radius: 10px; 
        margin-bottom: 30px; 
      }
      .report-header h1 { 
        margin: 0 0 20px 0; 
        font-size: 2.5em; 
        font-weight: 300; 
      }
      .header-info { 
        display: flex; 
        gap: 30px; 
        flex-wrap: wrap; 
      }
      .summary-cards { 
        display: grid; 
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); 
        gap: 20px; 
        margin: 20px 0; 
      }
      .summary-card { 
        background: white; 
        padding: 30px; 
        border-radius: 10px; 
        text-align: center; 
        box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        border-left: 4px solid #ddd;
      }
      .summary-card.excellent { border-left-color: #10b981; }
      .summary-card.good { border-left-color: #f59e0b; }
      .summary-card.poor { border-left-color: #ef4444; }
      .card-value { 
        font-size: 3em; 
        font-weight: bold; 
        margin-bottom: 10px; 
      }
      .card-label { 
        color: #6b7280; 
        font-size: 0.9em; 
        text-transform: uppercase; 
        letter-spacing: 0.05em; 
      }
      .performance-table table { 
        width: 100%; 
        border-collapse: collapse; 
        margin: 20px 0; 
      }
      .performance-table th, .performance-table td { 
        padding: 12px; 
        text-align: left; 
        border-bottom: 1px solid #e5e7eb; 
      }
      .performance-table th { 
        background: #f9fafb; 
        font-weight: 600; 
      }
      .performance-table tr.failed { 
        background: #fef2f2; 
      }
      .performance-table tr.passed { 
        background: #f0fdf4; 
      }
      .server-section { 
        margin: 40px 0; 
        padding: 30px; 
        background: #fafbfc; 
        border-radius: 10px; 
      }
      .recommendations { 
        background: #eff6ff; 
        padding: 20px; 
        border-radius: 8px; 
        margin: 20px 0; 
        border-left: 4px solid #3b82f6; 
      }
      .critical-issues { 
        background: #fef2f2; 
        padding: 20px; 
        border-radius: 8px; 
        margin: 20px 0; 
        border-left: 4px solid #ef4444; 
      }
      .critical { 
        color: #dc2626; 
        font-weight: 500; 
      }
      .metrics-grid { 
        display: grid; 
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); 
        gap: 20px; 
        margin: 20px 0; 
      }
      .metric-card { 
        background: white; 
        padding: 25px; 
        border-radius: 10px; 
        box-shadow: 0 2px 4px rgba(0,0,0,0.1); 
      }
      .targets-grid { 
        display: grid; 
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); 
        gap: 10px; 
        margin: 20px 0; 
      }
      .target-item { 
        padding: 10px; 
        background: #f9fafb; 
        border-radius: 5px; 
      }
      h1, h2, h3, h4 { 
        color: #1f2937; 
      }
      h2 { 
        border-bottom: 2px solid #e5e7eb; 
        padding-bottom: 10px; 
      }
    `;
  }

  private getReportScripts(): string {
    return `
      // Add interactivity to the report
      document.addEventListener('DOMContentLoaded', function() {
        // Add click handlers for expandable sections
        const sections = document.querySelectorAll('.server-section h3');
        sections.forEach(section => {
          section.style.cursor = 'pointer';
          section.addEventListener('click', function() {
            const content = this.parentElement.querySelector('.performance-table');
            if (content) {
              content.style.display = content.style.display === 'none' ? 'block' : 'none';
            }
          });
        });
      });
    `;
  }
}