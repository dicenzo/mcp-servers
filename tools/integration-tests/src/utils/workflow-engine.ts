/**
 * Workflow Execution Engine for Cross-Server Integration Tests
 * Orchestrates complex workflows spanning multiple MCP servers
 */

import { MCPMultiClient } from '../mcp/client.js';
import { 
  WorkflowStep, 
  WorkflowResult, 
  ToolExecutionResult,
  MCPServer 
} from '../types/index.js';

/**
 * Executes complex workflows across multiple MCP servers
 */
export class WorkflowEngine {
  private client: MCPMultiClient;

  constructor(client: MCPMultiClient) {
    this.client = client;
  }

  /**
   * Execute a complete workflow
   */
  async executeWorkflow(
    workflowId: string,
    steps: WorkflowStep[],
    options: {
      stopOnError?: boolean;
      captureMetrics?: boolean;
      timeout?: number;
    } = {}
  ): Promise<WorkflowResult> {
    const startTime = performance.now();
    const results = new Map<string, ToolExecutionResult>();
    const stopOnError = options.stopOnError !== false; // Default to true
    
    console.log(`[Workflow] Starting workflow ${workflowId} with ${steps.length} steps`);

    let peakMemoryUsage = 0;
    let successfulSteps = 0;
    let failedSteps = 0;

    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      console.log(`[Workflow] Executing step ${i + 1}/${steps.length}: ${step.id}`);

      try {
        const result = await this.executeStep(step, results, options);
        results.set(step.id, result);

        if (result.error) {
          failedSteps++;
          console.error(`[Workflow] Step ${step.id} failed:`, result.error);
          
          if (stopOnError && step.onError !== 'continue') {
            console.log(`[Workflow] Stopping workflow due to error in step ${step.id}`);
            break;
          }
        } else {
          successfulSteps++;
          console.log(`[Workflow] Step ${step.id} completed successfully in ${result.metrics.duration.toFixed(2)}ms`);
        }

        // Track peak memory usage
        if (result.metrics.memoryUsage) {
          const totalMemory = Object.values(result.metrics.memoryUsage).reduce((sum, val) => sum + val, 0);
          peakMemoryUsage = Math.max(peakMemoryUsage, totalMemory);
        }

        // Validate step result if validation function is provided
        if (step.validation && !result.error) {
          try {
            const isValid = await step.validation(result.result);
            if (!isValid) {
              const validationError = new Error(`Step ${step.id} failed validation`);
              results.set(step.id, { ...result, error: validationError });
              failedSteps++;
              successfulSteps--; // Correct the count
              
              if (stopOnError) {
                console.log(`[Workflow] Stopping workflow due to validation failure in step ${step.id}`);
                break;
              }
            }
          } catch (validationError) {
            console.error(`[Workflow] Validation error in step ${step.id}:`, validationError);
            const error = validationError instanceof Error ? validationError : new Error(String(validationError));
            results.set(step.id, { ...result, error });
            failedSteps++;
            successfulSteps--; // Correct the count
            
            if (stopOnError) {
              break;
            }
          }
        }

      } catch (error) {
        console.error(`[Workflow] Unexpected error in step ${step.id}:`, error);
        failedSteps++;
        
        const errorResult: ToolExecutionResult = {
          server: step.server,
          toolName: step.tool,
          input: step.input,
          error: error instanceof Error ? error : new Error(String(error)),
          metrics: {
            startTime: performance.now(),
            endTime: performance.now(),
            duration: 0
          }
        };
        
        results.set(step.id, errorResult);
        
        if (stopOnError) {
          break;
        }
      }
    }

    const endTime = performance.now();
    const totalDuration = endTime - startTime;
    
    const workflowResult: WorkflowResult = {
      id: workflowId,
      steps,
      results,
      success: failedSteps === 0,
      totalDuration,
      metrics: {
        totalSteps: steps.length,
        successfulSteps,
        failedSteps,
        averageStepDuration: results.size > 0 ? 
          Array.from(results.values()).reduce((sum, r) => sum + r.metrics.duration, 0) / results.size : 0,
        peakMemoryUsage
      }
    };

    console.log(`[Workflow] Workflow ${workflowId} completed: ${successfulSteps} successful, ${failedSteps} failed`);
    return workflowResult;
  }

  /**
   * Execute a single workflow step
   */
  private async executeStep(
    step: WorkflowStep,
    previousResults: Map<string, ToolExecutionResult>,
    options: { timeout?: number; captureMetrics?: boolean } = {}
  ): Promise<ToolExecutionResult> {
    let input = step.input;

    // Apply input mappings from previous results
    if (step.inputMappings && previousResults.size > 0) {
      input = this.applyInputMappings(step.input, step.inputMappings, previousResults);
    }

    const maxRetries = step.retries || 1;
    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await this.client.getClient(step.server).callTool(
          step.tool,
          input,
          {
            timeout: options.timeout || 30000,
            captureMetrics: options.captureMetrics !== false
          }
        );

        if (!result.error) {
          return result; // Success
        }

        lastError = result.error;
        
        if (attempt < maxRetries) {
          console.warn(`[Workflow] Step ${step.id} attempt ${attempt} failed, retrying: ${lastError.message}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
        }

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        
        if (attempt < maxRetries) {
          console.warn(`[Workflow] Step ${step.id} attempt ${attempt} failed, retrying: ${lastError.message}`);
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    // All retries failed
    return {
      server: step.server,
      toolName: step.tool,
      input,
      error: lastError!,
      metrics: {
        startTime: performance.now(),
        endTime: performance.now(),
        duration: 0
      }
    };
  }

  /**
   * Apply input mappings from previous results
   */
  private applyInputMappings(
    baseInput: any,
    mappings: Record<string, string>,
    previousResults: Map<string, ToolExecutionResult>
  ): any {
    const mappedInput = { ...baseInput };

    for (const [targetPath, sourcePath] of Object.entries(mappings)) {
      try {
        const value = this.extractValueByPath(sourcePath, previousResults);
        this.setValueByPath(mappedInput, targetPath, value);
      } catch (error) {
        console.warn(`[Workflow] Failed to map ${sourcePath} to ${targetPath}:`, error);
      }
    }

    return mappedInput;
  }

  /**
   * Extract value from previous results using dot notation path
   */
  private extractValueByPath(path: string, results: Map<string, ToolExecutionResult>): any {
    const parts = path.split('.');
    const stepId = parts[0];
    const propertyPath = parts.slice(1);

    const result = results.get(stepId);
    if (!result || result.error) {
      throw new Error(`Step ${stepId} not found or failed`);
    }

    let value = result.result;
    for (const prop of propertyPath) {
      if (value == null || typeof value !== 'object') {
        throw new Error(`Cannot access property ${prop} in path ${path}`);
      }
      value = value[prop];
    }

    return value;
  }

  /**
   * Set value in object using dot notation path
   */
  private setValueByPath(obj: any, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;

    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (current[part] == null || typeof current[part] !== 'object') {
        current[part] = {};
      }
      current = current[part];
    }

    current[parts[parts.length - 1]] = value;
  }

  /**
   * Create a workflow from a high-level description
   */
  static createWorkflow(description: {
    id: string;
    name: string;
    description: string;
    steps: Array<{
      id: string;
      server: MCPServer;
      tool: string;
      input: any;
      inputMappings?: Record<string, string>;
      validation?: (result: any) => boolean | Promise<boolean>;
      onError?: 'fail' | 'continue' | 'retry';
      retries?: number;
    }>;
  }): WorkflowStep[] {
    return description.steps.map(step => ({
      id: step.id,
      server: step.server,
      tool: step.tool,
      input: step.input,
      inputMappings: step.inputMappings,
      validation: step.validation,
      onError: step.onError || 'fail',
      retries: step.retries || 1
    }));
  }
}

/**
 * Pre-defined workflow templates for common integration test scenarios
 */
export class WorkflowTemplates {
  /**
   * SVG with custom typography and color palette workflow
   */
  static createSVGWithTypographyAndColors(): WorkflowStep[] {
    return [
      {
        id: 'generate_palette',
        server: MCPServer.COLOR,
        tool: 'color.generatePalette',
        input: {
          baseColor: '#3498db',
          type: 'complementary',
          count: 5
        }
      },
      {
        id: 'load_font',
        server: MCPServer.TYPE,
        tool: 'type.loadFont',
        input: {
          source: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap',
          family: 'Inter'
        }
      },
      {
        id: 'create_svg',
        server: MCPServer.SVG,
        tool: 'svg.create',
        input: {
          width: 400,
          height: 200,
          elements: [{
            type: 'text',
            x: 50,
            y: 100,
            content: 'Hello Integration Test',
            fontSize: 24,
            fontFamily: 'Inter'
          }]
        },
        inputMappings: {
          'elements.0.fill': 'generate_palette.result.colors.0.hex',
          'elements.0.fontFamily': 'load_font.result.fontFamily'
        }
      },
      {
        id: 'optimize_svg',
        server: MCPServer.SVG,
        tool: 'svg.optimize',
        input: {},
        inputMappings: {
          'svg': 'create_svg.result.svg'
        }
      }
    ];
  }

  /**
   * Image processing with color analysis workflow
   */
  static createImageProcessingWithColorAnalysis(): WorkflowStep[] {
    return [
      {
        id: 'load_image',
        server: MCPServer.IMAGE,
        tool: 'image.load',
        input: {
          source: 'https://via.placeholder.com/300x200/ff0000/ffffff'
        }
      },
      {
        id: 'extract_colors',
        server: MCPServer.COLOR,
        tool: 'color.extractPalette',
        input: {},
        inputMappings: {
          'image': 'load_image.result.data'
        }
      },
      {
        id: 'check_accessibility',
        server: MCPServer.COLOR,
        tool: 'color.validateAccessibility',
        input: {
          textColor: '#ffffff'
        },
        inputMappings: {
          'backgroundColor': 'extract_colors.result.dominant.hex'
        }
      },
      {
        id: 'resize_image',
        server: MCPServer.IMAGE,
        tool: 'image.resize',
        input: {
          width: 150,
          height: 100
        },
        inputMappings: {
          'image': 'load_image.result.data'
        }
      }
    ];
  }

  /**
   * Complete design system workflow
   */
  static createDesignSystemWorkflow(): WorkflowStep[] {
    return [
      {
        id: 'create_brand_colors',
        server: MCPServer.COLOR,
        tool: 'color.generatePalette',
        input: {
          baseColor: '#2c3e50',
          type: 'triadic',
          count: 8
        }
      },
      {
        id: 'setup_typography',
        server: MCPServer.TYPE,
        tool: 'type.loadFont',
        input: {
          source: 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap',
          family: 'Roboto'
        }
      },
      {
        id: 'create_logo_svg',
        server: MCPServer.SVG,
        tool: 'svg.create',
        input: {
          width: 200,
          height: 60,
          elements: [
            {
              type: 'rect',
              x: 0,
              y: 0,
              width: 200,
              height: 60,
              rx: 8
            },
            {
              type: 'text',
              x: 100,
              y: 35,
              content: 'BRAND',
              fontSize: 18,
              fontFamily: 'Roboto',
              fontWeight: '700',
              textAnchor: 'middle',
              dominantBaseline: 'central'
            }
          ]
        },
        inputMappings: {
          'elements.0.fill': 'create_brand_colors.result.colors.0.hex',
          'elements.1.fill': 'create_brand_colors.result.colors.1.hex'
        }
      },
      {
        id: 'validate_contrast',
        server: MCPServer.COLOR,
        tool: 'color.contrast',
        input: {},
        inputMappings: {
          'color1': 'create_brand_colors.result.colors.0.hex',
          'color2': 'create_brand_colors.result.colors.1.hex'
        }
      },
      {
        id: 'create_icon_set',
        server: MCPServer.SVG,
        tool: 'svg.create',
        input: {
          width: 24,
          height: 24,
          elements: [{
            type: 'circle',
            cx: 12,
            cy: 12,
            r: 10,
            stroke: '#000000',
            strokeWidth: 2,
            fill: 'none'
          }]
        },
        inputMappings: {
          'elements.0.stroke': 'create_brand_colors.result.colors.2.hex'
        }
      }
    ];
  }
}