import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import mermaid from 'mermaid';
import { JSDOM } from 'jsdom';
import { SVG_LIMITS } from '../types/svg.js';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

const MermaidToSvgSchema = z.object({
  mermaid_code: z.string().max(SVG_LIMITS.MAX_TEXT_LENGTH).describe('Mermaid diagram code'),
  theme: z.enum(['default', 'forest', 'dark', 'neutral', 'base']).default('default').describe('Mermaid theme'),
  width: z.number().optional().describe('Optional width constraint'),
  height: z.number().optional().describe('Optional height constraint'),
  background: z.string().max(SVG_LIMITS.MAX_SHORT_STRING_LENGTH).default('transparent').describe('Background color'),
  config: z.object({
    flowchart: z.object({
      useMaxWidth: z.boolean().default(true),
      htmlLabels: z.boolean().default(false)
    }).optional(),
    sequence: z.object({
      useMaxWidth: z.boolean().default(true),
      wrap: z.boolean().default(false)
    }).optional(),
    journey: z.object({
      useMaxWidth: z.boolean().default(true)
    }).optional()
  }).optional().describe('Mermaid configuration options')
});

export const mermaidToSvgTool: ExecutableTool = {
  name: 'mermaid.to.svg',
  description: 'Convert Mermaid diagram code to SVG format with customizable themes and styling',
  inputSchema: {
    type: 'object',
    properties: {
      mermaid_code: {
        type: 'string',
        description: 'Mermaid diagram code'
      },
      theme: {
        type: 'string',
        enum: ['default', 'forest', 'dark', 'neutral', 'base'],
        default: 'default',
        description: 'Mermaid theme'
      },
      width: {
        type: 'number',
        description: 'Optional width constraint'
      },
      height: {
        type: 'number',
        description: 'Optional height constraint'
      },
      background: {
        type: 'string',
        default: 'transparent',
        description: 'Background color'
      },
      config: {
        type: 'object',
        properties: {
          flowchart: {
            type: 'object',
            properties: {
              useMaxWidth: { type: 'boolean', default: true },
              htmlLabels: { type: 'boolean', default: false }
            }
          },
          sequence: {
            type: 'object',
            properties: {
              useMaxWidth: { type: 'boolean', default: true },
              wrap: { type: 'boolean', default: false }
            }
          },
          journey: {
            type: 'object',
            properties: {
              useMaxWidth: { type: 'boolean', default: true }
            }
          }
        },
        description: 'Mermaid configuration options'
      }
    },
    required: ['mermaid_code']
  },
  invoke: async (args: unknown) => {
    const svg = await executeMermaidToSvg(args as z.input<typeof MermaidToSvgSchema>);
    return {
      content: [
        {
          type: 'text',
          text: svg
        }
      ]
    };
  }
};

/**
 * Accepts the tool's input shape (defaults optional) and validates it, so direct
 * callers get the same defaults and validation as the MCP `invoke` path.
 */
export async function executeMermaidToSvg(input: z.input<typeof MermaidToSvgSchema>): Promise<string> {
  const args = MermaidToSvgSchema.parse(input);
  // Set up DOM environment for Mermaid
  const dom = new JSDOM('<!DOCTYPE html><html><body><div id="mermaid-div"></div></body></html>');
  const window = dom.window as any;
  const document = window.document;

  // Make DOM available globally for Mermaid
  global.window = window;
  global.document = document;

  try {
    // Initialize Mermaid with configuration
    const config = {
      startOnLoad: false,
      theme: args.theme,
      themeVariables: {
        background: args.background
      },
      flowchart: {
        useMaxWidth: args.config?.flowchart?.useMaxWidth ?? true,
        htmlLabels: args.config?.flowchart?.htmlLabels ?? false
      },
      sequence: {
        useMaxWidth: args.config?.sequence?.useMaxWidth ?? true,
        wrap: args.config?.sequence?.wrap ?? false
      },
      journey: {
        useMaxWidth: args.config?.journey?.useMaxWidth ?? true
      }
    };

    mermaid.initialize(config);

    // Create container element
    const container = document.getElementById('mermaid-div');
    if (!container) {
      throw new Error('Could not find mermaid container');
    }

    // Render the diagram
    const { svg } = await mermaid.render('mermaid-svg', args.mermaid_code);
    
    // Apply width/height constraints if specified
    let finalSvg = svg;
    if (args.width || args.height) {
      finalSvg = finalSvg.replace(
        /<svg([^>]*)>/,
        (match, attrs) => {
          let newAttrs = attrs;
          if (args.width) {
            newAttrs = newAttrs.replace(/width="[^"]*"/, `width="${args.width}"`);
            if (!newAttrs.includes('width=')) {
              newAttrs += ` width="${args.width}"`;
            }
          }
          if (args.height) {
            newAttrs = newAttrs.replace(/height="[^"]*"/, `height="${args.height}"`);
            if (!newAttrs.includes('height=')) {
              newAttrs += ` height="${args.height}"`;
            }
          }
          return `<svg${newAttrs}>`;
        }
      );
    }

    return finalSvg;

  } catch (error) {
    throw new Error(`Mermaid rendering failed: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    // Clean up global references
    delete (global as any).window;
    delete (global as any).document;
  }
}

// Utility function to convert wireframes to Mermaid flowchart syntax
export function wireframeToMermaid(wireframeText: string): string {
  const lines = wireframeText.split('\n');
  let mermaidCode = 'flowchart TD\n';
  
  // Extract sections and components
  const sections: string[] = [];
  
  for (const line of lines) {
    // Look for section headers (### or ##)
    if (line.trim().startsWith('###')) {
      const sectionName = line.replace(/###\s*/, '').trim();
      if (sectionName) {
        sections.push(sectionName);
      }
    }
    
    // Look for component patterns [TEXT] or button patterns
    const buttonMatch = line.match(/\[([^\]]+)\]/g);
    if (buttonMatch) {
      buttonMatch.forEach(button => {
        const buttonText = button.slice(1, -1);
        mermaidCode += `  ${buttonText.replace(/\s+/g, '_')}["${buttonText}"]\n`;
      });
    }
  }
  
  // Add section nodes
  sections.forEach((section, index) => {
    const nodeId = section.replace(/\s+/g, '_');
    mermaidCode += `  ${nodeId}["${section}"]\n`;
    
    // Connect sections in sequence
    if (index > 0) {
      const prevNodeId = sections[index - 1].replace(/\s+/g, '_');
      mermaidCode += `  ${prevNodeId} --> ${nodeId}\n`;
    }
  });
  
  return mermaidCode;
}