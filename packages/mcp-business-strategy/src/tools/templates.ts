import { ExecutableTool } from './types.js';
import { z } from 'zod';
import { readTemplate } from '../util/fs.js';

const MAX_NAME_LENGTH = 100;

const Input = z.object({ name: z.string().max(MAX_NAME_LENGTH, `Template name must be at most ${MAX_NAME_LENGTH} characters`) });

export const templatesTool: ExecutableTool = {
  name: 'templates.get',
  description: 'Return a template file content by name.',
  inputSchema: { type: 'object', properties: { name: { type: 'string', maxLength: MAX_NAME_LENGTH } }, required: ['name'] },
  // The tool contract is a generator (index.ts reads one next()); this tool returns its single result
  // eslint-disable-next-line require-yield
  async *invoke(input: z.infer<typeof Input>) {
    const { name } = Input.parse(input);
    const content = await readTemplate(name);
    return { type: 'text', text: content };
  }
};
