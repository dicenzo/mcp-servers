import { promises as fs } from 'fs';
import path from 'path';
// Directory of Markdown templates (*.md). Defaults to ../templates relative to the working directory.
const TEMPLATES_DIR = process.env.TEMPLATES_DIR
  ? path.resolve(process.env.TEMPLATES_DIR)
  : path.resolve(process.cwd(), '..', 'templates');

export async function listTemplates(): Promise<string[]> {
  const files = await fs.readdir(TEMPLATES_DIR);
  return files.filter((f: string) => f.endsWith('.md')).map((f: string) => f.replace('.md',''));
}

// Template names are plain identifiers, so a caller can't walk out of TEMPLATES_DIR with "../".
const TEMPLATE_NAME = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export async function readTemplate(name: string): Promise<string> {
  if (!TEMPLATE_NAME.test(name)) {
    throw new Error('Invalid template name: use letters, numbers, "-" and "_" only');
  }
  const p = path.resolve(TEMPLATES_DIR, `${name}.md`);
  if (path.dirname(p) !== TEMPLATES_DIR) {
    throw new Error('Invalid template name');
  }
  return fs.readFile(p, 'utf8');
}
