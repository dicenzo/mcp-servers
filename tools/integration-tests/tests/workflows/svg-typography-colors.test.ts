/**
 * SVG with Typography and Colors Workflow Tests
 * Tests complex workflows that combine SVG creation, typography, and color management
 */

import { MCPServerManager, DEFAULT_SERVER_CONFIGS } from '../../src/mcp/server-manager.js';
import { MCPMultiClient } from '../../src/mcp/client.js';
import { WorkflowEngine, WorkflowTemplates } from '../../src/utils/workflow-engine.js';
import { MCPServer, WorkflowStep } from '../../src/types/index.js';

describe('SVG Typography and Colors Workflow', () => {
  let serverManager: MCPServerManager;
  let client: MCPMultiClient;
  let workflowEngine: WorkflowEngine;

  beforeAll(async () => {
    serverManager = new MCPServerManager(DEFAULT_SERVER_CONFIGS);
    const context = await serverManager.startAllServers();
    await serverManager.waitForAllServersReady(30000);
    client = new MCPMultiClient(context.servers);
    workflowEngine = new WorkflowEngine(client);
  });

  afterAll(async () => {
    await serverManager.stopAllServers();
  });

  describe('Complete SVG with Typography Workflow', () => {
    test('creates SVG with custom color palette and typography', async () => {
      const workflowSteps = WorkflowTemplates.createSVGWithTypographyAndColors();
      
      const result = await workflowEngine.executeWorkflow(
        'svg-typography-colors',
        workflowSteps,
        { 
          stopOnError: true,
          captureMetrics: true,
          timeout: 60000
        }
      );

      expect(result.success).toBe(true);
      expect(result.metrics.failedSteps).toBe(0);
      expect(result.metrics.successfulSteps).toBe(4);

      // Validate each step's output
      const paletteStep = result.results.get('generate_palette');
      expect(paletteStep?.error).toBeUndefined();
      expect(paletteStep?.result.colors).toHaveLength(5);
      expect(paletteStep?.result.colors[0]).toHaveProperty('hex');

      const fontStep = result.results.get('load_font');
      expect(fontStep?.error).toBeUndefined();
      expect(fontStep?.result.fontFamily).toBe('Inter');

      const svgStep = result.results.get('create_svg');
      expect(svgStep?.error).toBeUndefined();
      expect(svgStep?.result.svg).toContain('<text');
      expect(svgStep?.result.svg).toContain('Hello Integration Test');
      expect(svgStep?.result.svg).toContain(paletteStep?.result.colors[0].hex);

      const optimizeStep = result.results.get('optimize_svg');
      expect(optimizeStep?.error).toBeUndefined();
      expect(optimizeStep?.result.optimized).toBe(true);
      
      // Performance validation
      expect(result.totalDuration).toBeLessThan(10000); // 10 seconds max
      expect(result.metrics.averageStepDuration).toBeLessThan(2500); // 2.5 seconds per step
    });

    test('handles custom font loading and validation', async () => {
      const customWorkflow: WorkflowStep[] = [
        {
          id: 'load_custom_font',
          server: MCPServer.TYPE,
          tool: 'type.loadFont',
          input: {
            source: 'https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;700&display=swap',
            family: 'Roboto',
            weights: [300, 400, 700]
          }
        },
        {
          id: 'validate_font_loading',
          server: MCPServer.TYPE,
          tool: 'type.validateFont',
          input: {},
          inputMappings: {
            'fontFamily': 'load_custom_font.result.fontFamily'
          },
          validation: async (result: any) => {
            return result.isValid && result.weights.includes(400);
          }
        },
        {
          id: 'create_text_svg',
          server: MCPServer.SVG,
          tool: 'svg.create',
          input: {
            width: 300,
            height: 100,
            elements: [
              {
                type: 'text',
                x: 150,
                y: 30,
                content: 'Light Text',
                fontSize: 18,
                fontWeight: '300',
                textAnchor: 'middle',
                fill: '#333333'
              },
              {
                type: 'text',
                x: 150,
                y: 55,
                content: 'Regular Text',
                fontSize: 16,
                fontWeight: '400',
                textAnchor: 'middle',
                fill: '#555555'
              },
              {
                type: 'text',
                x: 150,
                y: 80,
                content: 'Bold Text',
                fontSize: 16,
                fontWeight: '700',
                textAnchor: 'middle',
                fill: '#777777'
              }
            ]
          },
          inputMappings: {
            'elements.0.fontFamily': 'load_custom_font.result.fontFamily',
            'elements.1.fontFamily': 'load_custom_font.result.fontFamily',
            'elements.2.fontFamily': 'load_custom_font.result.fontFamily'
          }
        }
      ];

      const result = await workflowEngine.executeWorkflow(
        'custom-font-workflow',
        customWorkflow
      );

      expect(result.success).toBe(true);
      
      const svgResult = result.results.get('create_text_svg');
      expect(svgResult?.result.svg).toContain('font-family="Roboto"');
      expect(svgResult?.result.svg).toContain('font-weight="300"');
      expect(svgResult?.result.svg).toContain('font-weight="400"');
      expect(svgResult?.result.svg).toContain('font-weight="700"');
    });
  });

  describe('Color Palette Integration', () => {
    test('generates accessible color combinations', async () => {
      const workflow: WorkflowStep[] = [
        {
          id: 'generate_base_palette',
          server: MCPServer.COLOR,
          tool: 'color.generatePalette',
          input: {
            baseColor: '#2c3e50',
            type: 'complementary',
            count: 4
          }
        },
        {
          id: 'check_accessibility',
          server: MCPServer.COLOR,
          tool: 'color.validateAccessibility',
          input: {
            textColor: '#ffffff',
            fontSize: 16,
            level: 'AA'
          },
          inputMappings: {
            'backgroundColor': 'generate_base_palette.result.colors.0.hex'
          }
        },
        {
          id: 'create_accessible_svg',
          server: MCPServer.SVG,
          tool: 'svg.create',
          input: {
            width: 400,
            height: 300,
            elements: [
              {
                type: 'rect',
                x: 0,
                y: 0,
                width: 400,
                height: 300
              },
              {
                type: 'text',
                x: 200,
                y: 150,
                content: 'Accessible Text',
                fontSize: 24,
                fontFamily: 'Arial',
                textAnchor: 'middle',
                dominantBaseline: 'central',
                fill: '#ffffff'
              }
            ]
          },
          inputMappings: {
            'elements.0.fill': 'generate_base_palette.result.colors.0.hex'
          }
        }
      ];

      const result = await workflowEngine.executeWorkflow(
        'accessible-color-workflow',
        workflow
      );

      expect(result.success).toBe(true);

      const accessibilityResult = result.results.get('check_accessibility');
      expect(accessibilityResult?.result.wcag.AA.normal).toBe(true);
      expect(accessibilityResult?.result.contrastRatio).toBeGreaterThanOrEqual(4.5);

      const svgResult = result.results.get('create_accessible_svg');
      expect(svgResult?.result.svg).toContain('fill="#ffffff"');
      expect(svgResult?.result.metadata.accessibility).toMatchObject({
        wcagCompliant: true,
        level: 'AA'
      });
    });

    test('creates harmonious color schemes for branding', async () => {
      const brandingWorkflow: WorkflowStep[] = [
        {
          id: 'create_primary_palette',
          server: MCPServer.COLOR,
          tool: 'color.generatePalette',
          input: {
            baseColor: '#e74c3c',
            type: 'triadic',
            count: 3
          }
        },
        {
          id: 'create_secondary_palette',
          server: MCPServer.COLOR,
          tool: 'color.generatePalette',
          input: {
            type: 'monochromatic',
            count: 5
          },
          inputMappings: {
            'baseColor': 'create_primary_palette.result.colors.1.hex'
          }
        },
        {
          id: 'validate_brand_colors',
          server: MCPServer.COLOR,
          tool: 'color.lintBrand',
          input: {
            brandColors: []
          },
          inputMappings: {
            'brandColors': 'create_primary_palette.result.colors'
          }
        },
        {
          id: 'create_brand_svg',
          server: MCPServer.SVG,
          tool: 'svg.create',
          input: {
            width: 500,
            height: 200,
            elements: [
              {
                type: 'rect',
                x: 0,
                y: 0,
                width: 166,
                height: 200
              },
              {
                type: 'rect',
                x: 167,
                y: 0,
                width: 166,
                height: 200
              },
              {
                type: 'rect',
                x: 334,
                y: 0,
                width: 166,
                height: 200
              }
            ]
          },
          inputMappings: {
            'elements.0.fill': 'create_primary_palette.result.colors.0.hex',
            'elements.1.fill': 'create_primary_palette.result.colors.1.hex',
            'elements.2.fill': 'create_primary_palette.result.colors.2.hex'
          }
        }
      ];

      const result = await workflowEngine.executeWorkflow(
        'brand-color-scheme',
        brandingWorkflow
      );

      expect(result.success).toBe(true);

      const brandValidation = result.results.get('validate_brand_colors');
      expect(brandValidation?.result.isValid).toBe(true);
      expect(brandValidation?.result.harmony.type).toBe('triadic');

      const svgResult = result.results.get('create_brand_svg');
      const primaryPalette = result.results.get('create_primary_palette');
      
      expect(svgResult?.result.svg).toContain(primaryPalette?.result.colors[0].hex);
      expect(svgResult?.result.svg).toContain(primaryPalette?.result.colors[1].hex);
      expect(svgResult?.result.svg).toContain(primaryPalette?.result.colors[2].hex);
    });
  });

  describe('Complex Typography Scenarios', () => {
    test('handles multilingual text with appropriate fonts', async () => {
      const multilingualWorkflow: WorkflowStep[] = [
        {
          id: 'load_latin_font',
          server: MCPServer.TYPE,
          tool: 'type.loadFont',
          input: {
            source: 'https://fonts.googleapis.com/css2?family=Inter:wght@400&display=swap',
            family: 'Inter'
          }
        },
        {
          id: 'load_fallback_font',
          server: MCPServer.TYPE,
          tool: 'type.loadFont',
          input: {
            source: 'system',
            family: 'Arial Unicode MS'
          }
        },
        {
          id: 'create_multilingual_svg',
          server: MCPServer.SVG,
          tool: 'svg.create',
          input: {
            width: 600,
            height: 300,
            elements: [
              {
                type: 'text',
                x: 50,
                y: 50,
                content: 'Hello World',
                fontSize: 20,
                fill: '#333333'
              },
              {
                type: 'text',
                x: 50,
                y: 80,
                content: 'Hola Mundo',
                fontSize: 20,
                fill: '#333333'
              },
              {
                type: 'text',
                x: 50,
                y: 110,
                content: 'Bonjour le Monde',
                fontSize: 20,
                fill: '#333333'
              },
              {
                type: 'text',
                x: 50,
                y: 140,
                content: 'こんにちは世界',
                fontSize: 20,
                fill: '#333333'
              }
            ]
          },
          inputMappings: {
            'elements.0.fontFamily': 'load_latin_font.result.fontFamily',
            'elements.1.fontFamily': 'load_latin_font.result.fontFamily',
            'elements.2.fontFamily': 'load_latin_font.result.fontFamily',
            'elements.3.fontFamily': 'load_fallback_font.result.fontFamily'
          }
        },
        {
          id: 'validate_text_rendering',
          server: MCPServer.TYPE,
          tool: 'type.validateText',
          input: {
            texts: [
              'Hello World',
              'Hola Mundo', 
              'Bonjour le Monde',
              'こんにちは世界'
            ]
          },
          inputMappings: {
            'fontFamily': 'load_latin_font.result.fontFamily'
          }
        }
      ];

      const result = await workflowEngine.executeWorkflow(
        'multilingual-typography',
        multilingualWorkflow
      );

      expect(result.success).toBe(true);

      const svgResult = result.results.get('create_multilingual_svg');
      expect(svgResult?.result.svg).toContain('Hello World');
      expect(svgResult?.result.svg).toContain('Hola Mundo');
      expect(svgResult?.result.svg).toContain('Bonjour le Monde');
      expect(svgResult?.result.svg).toContain('こんにちは世界');

      const textValidation = result.results.get('validate_text_rendering');
      expect(textValidation?.result.supported).toContain(true); // At least some texts should be supported
    });

    test('creates responsive typography with size variations', async () => {
      const responsiveTypography = [
        {
          id: 'calculate_typography_scale',
          server: MCPServer.TYPE,
          tool: 'type.calculateScale',
          input: {
            baseFontSize: 16,
            scale: 1.25,
            steps: 5
          }
        },
        {
          id: 'create_typography_sample',
          server: MCPServer.SVG,
          tool: 'svg.create',
          input: {
            width: 800,
            height: 400,
            elements: [] // Will be populated by input mapping
          },
          inputMappings: {
            'elements': 'calculate_typography_scale.result.elements'
          }
        }
      ];

      const result = await workflowEngine.executeWorkflow(
        'responsive-typography',
        responsiveTypography
      );

      expect(result.success).toBe(true);

      const scaleResult = result.results.get('calculate_typography_scale');
      expect(scaleResult?.result.sizes).toHaveLength(5);
      expect(scaleResult?.result.sizes[0]).toBe(16); // Base size

      const svgResult = result.results.get('create_typography_sample');
      expect(svgResult?.result.svg).toContain('font-size="16"');
      expect(svgResult?.result.svg).toContain('font-size="20"'); // 16 * 1.25
    });
  });

  describe('Performance and Resource Management', () => {
    test('handles large SVG creation with many elements efficiently', async () => {
      const largeWorkflow = [
        {
          id: 'generate_large_palette',
          server: MCPServer.COLOR,
          tool: 'color.generatePalette',
          input: {
            baseColor: '#3498db',
            type: 'complementary',
            count: 20
          }
        },
        {
          id: 'create_large_svg',
          server: MCPServer.SVG,
          tool: 'svg.create',
          input: {
            width: 1000,
            height: 800,
            elements: Array.from({ length: 100 }, (_, i) => ({
              type: 'circle',
              cx: (i % 10) * 100 + 50,
              cy: Math.floor(i / 10) * 80 + 50,
              r: 30,
              fill: `#${i.toString(16).padStart(6, '0')}`
            }))
          }
        },
        {
          id: 'optimize_large_svg',
          server: MCPServer.SVG,
          tool: 'svg.optimize',
          input: {
            options: {
              removeComments: true,
              removeEmptyContainers: true,
              mergePaths: true
            }
          },
          inputMappings: {
            'svg': 'create_large_svg.result.svg'
          }
        }
      ];

      const startTime = performance.now();
      const result = await workflowEngine.executeWorkflow(
        'large-svg-workflow',
        largeWorkflow
      );
      const totalTime = performance.now() - startTime;

      expect(result.success).toBe(true);
      expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds

      const svgResult = result.results.get('create_large_svg');
      expect(svgResult?.result.metadata.elementCount).toBe(100);

      const optimizeResult = result.results.get('optimize_large_svg');
      expect(optimizeResult?.result.optimized).toBe(true);
      expect(optimizeResult?.result.sizeBefore).toBeGreaterThan(optimizeResult?.result.sizeAfter);
    });
  });
});