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

export async function readTemplate(name: string): Promise<string> {
  const p = path.join(TEMPLATES_DIR, `${name}.md`);
  return fs.readFile(p, 'utf8');
}
