import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { readTemplate } from '../util/fs.js';

const Input = z.object({ name: z.string() });

export const templatesTool: Tool = {
  name: 'templates.get',
  description: 'Return a template file content by name.',
  inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
  // The tool contract is a generator (index.ts reads one next()); this tool returns its single result
  // eslint-disable-next-line require-yield
  async *invoke(input: z.infer<typeof Input>) {
    const { name } = Input.parse(input);
    const content = await readTemplate(name);
    return { type: 'text', text: content };
  }
};
