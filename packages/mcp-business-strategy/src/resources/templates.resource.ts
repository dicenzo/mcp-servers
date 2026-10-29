import { ReadResourceResult, Resource, TextResourceContents } from '@modelcontextprotocol/sdk/types.js';

/** Templates are Markdown, so a read always returns text contents (never a blob). */
type TemplateReadResult = ReadResourceResult & { contents: TextResourceContents[] };
import { listTemplates, readTemplate } from '../util/fs.js';

export const templatesResourceProvider = {
  async list(): Promise<Resource[]> {
    const names = await listTemplates();
    return names.map(name => ({
      uri: `templates://${name}`,
      name: `@templates:${name}`,
      description: `Template ${name} for the workflow.`,
      mimeType: 'text/markdown'
    }));
  },
  async read({ uri }: { uri: string }): Promise<TemplateReadResult> {
    const name = uri.replace('templates://', '');
    const text = await readTemplate(name);
    return { contents: [{ uri, mimeType: 'text/markdown', text }] };
  }
};

export default templatesResourceProvider;
