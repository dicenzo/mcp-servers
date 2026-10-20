import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';

interface ExecutableTool extends Tool {
  invoke: (args: unknown) => Promise<any>;
}

const FabricWireframeSchema = z.object({
  wireframe_text: z.string().describe('ASCII wireframe text to convert'),
  width: z.number().default(800).describe('Canvas width'),
  height: z.number().default(600).describe('Canvas height'),
  interactive_elements: z.array(z.object({
    type: z.enum(['button', 'input', 'dropdown', 'checkbox', 'radio']),
    x: z.number(),
    y: z.number(),
    width: z.number(),
    height: z.number(),
    label: z.string(),
    properties: z.record(z.any()).optional()
  })).optional().describe('Interactive elements to add'),
  export_format: z.enum(['svg', 'json', 'html']).default('svg').describe('Export format'),
  theme: z.object({
    background: z.string().default('#ffffff'),
    border: z.string().default('#333333'),
    text: z.string().default('#000000'),
    accent: z.string().default('#0066cc'),
    hover: z.string().default('#f0f0f0')
  }).optional().describe('Theme colors')
});

export const fabricWireframeTool: ExecutableTool = {
  name: 'fabric.wireframe',
  description: 'Create interactive wireframes using Fabric.js with clickable elements and hover states',
  inputSchema: {
    type: 'object',
    properties: {
      wireframe_text: {
        type: 'string',
        description: 'ASCII wireframe text to convert'
      },
      width: {
        type: 'number',
        default: 800,
        description: 'Canvas width'
      },
      height: {
        type: 'number',
        default: 600,
        description: 'Canvas height'
      },
      interactive_elements: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['button', 'input', 'dropdown', 'checkbox', 'radio']
            },
            x: { type: 'number' },
            y: { type: 'number' },
            width: { type: 'number' },
            height: { type: 'number' },
            label: { type: 'string' },
            properties: { type: 'object' }
          },
          required: ['type', 'x', 'y', 'width', 'height', 'label']
        },
        description: 'Interactive elements to add'
      },
      export_format: {
        type: 'string',
        enum: ['svg', 'json', 'html'],
        default: 'svg',
        description: 'Export format'
      },
      theme: {
        type: 'object',
        properties: {
          background: { type: 'string', default: '#ffffff' },
          border: { type: 'string', default: '#333333' },
          text: { type: 'string', default: '#000000' },
          accent: { type: 'string', default: '#0066cc' },
          hover: { type: 'string', default: '#f0f0f0' }
        },
        description: 'Theme colors'
      }
    },
    required: ['wireframe_text']
  },
  invoke: async (args: unknown) => {
    const validatedArgs = FabricWireframeSchema.parse(args);
    const result = await executeFabricWireframe(validatedArgs);
    return {
      content: [
        {
          type: 'text',
          text: result
        }
      ]
    };
  }
};

export async function executeFabricWireframe(args: z.infer<typeof FabricWireframeSchema>): Promise<string> {
  // Fabric.js functionality disabled due to Canvas build issues
  // Return a placeholder SVG for now
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${args.width}" height="${args.height}" viewBox="0 0 ${args.width} ${args.height}">
    <rect width="100%" height="100%" fill="#ffffff" stroke="#333333"/>
    <text x="50%" y="50%" text-anchor="middle" dy="0.35em" font-family="Arial, sans-serif" font-size="16" fill="#333333">
      Fabric.js Interactive Wireframes Coming Soon
    </text>
    <text x="50%" y="60%" text-anchor="middle" dy="0.35em" font-family="Arial, sans-serif" font-size="12" fill="#666666">
      (Canvas build issues need to be resolved)
    </text>
  </svg>`;
}