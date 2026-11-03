import { TemplateValidator } from '../../src/util/validation.js';
import { templateRenderTool } from '../../src/tools/templateRender.js';
import {
  Template,
  TemplateComponent,
  VariableDefinition,
  VariableType,
  ComponentType,
  TemplateErrorCode
} from '../../src/types/template.js';

const text = (content: string, extra: Partial<TemplateComponent> = {}): TemplateComponent => ({
  id: 'text-1',
  type: ComponentType.TEXT,
  position: { x: 0, y: 0, width: 200, height: 30 },
  content,
  ...extra
} as TemplateComponent);

const makeTemplate = (components: TemplateComponent[], variables: VariableDefinition[]): Template => ({
  id: 'refs-template',
  metadata: {
    name: 'References',
    version: '1.0.0',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },
  variables,
  components,
  layout: { width: 400, height: 300 }
});

const items: VariableDefinition = { name: 'items', type: VariableType.ARRAY, required: false, default: [] };
const on: VariableDefinition = { name: 'on', type: VariableType.BOOLEAN, required: false, default: false };
const title: VariableDefinition = { name: 'title', type: VariableType.STRING, required: false, default: 'T' };

const undefinedNames = (template: Template) =>
  TemplateValidator.validateTemplate(template).errors
    .filter(error => error.code === TemplateErrorCode.MISSING_VARIABLE)
    .map(error => error.variableName);

describe('variable references', () => {
  test('repeat loop variables are in scope for the repeated component', () => {
    const template = makeTemplate(
      [text('{{item.name}} #{{item_index}} {{#if item_first}}first{{/if}}{{#if item_last}}last{{/if}}', { repeat: 'item in items' })],
      [items]
    );
    expect(undefinedNames(template)).toEqual([]);
  });

  test('repeat loop variables are in scope for children of a repeated group', () => {
    const group = {
      id: 'group-1',
      type: ComponentType.GROUP,
      position: { x: 0, y: 0, width: 200, height: 100 },
      repeat: 'row in items',
      children: [text('{{row.label}} {{row_index}}', { id: 'child' })]
    } as TemplateComponent;
    expect(undefinedNames(makeTemplate([group], [items]))).toEqual([]);
  });

  test('repeat loop variables are not in scope for sibling components', () => {
    const template = makeTemplate(
      [text('{{item.name}}', { repeat: 'item in items' }), text('{{item.name}}', { id: 'text-2' })],
      [items]
    );
    expect(undefinedNames(template)).toEqual(['item']);
  });

  test('{{else}} and {{this}} are not variables', () => {
    const template = makeTemplate(
      [text('{{#if on}}yes{{else}}no{{/if}} {{#each items}}{{this}} {{@index}}{{/each}}')],
      [on, items]
    );
    expect(undefinedNames(template)).toEqual([]);
  });

  test('fields inside {{#each}} belong to the item, and ../ reaches the outer scope', () => {
    const template = makeTemplate(
      [text('{{#each items}}{{name}} {{../title}}{{/each}}')],
      [items, title]
    );
    expect(undefinedNames(template)).toEqual([]);

    const missingOuter = makeTemplate([text('{{#each items}}{{../nope}}{{/each}}')], [items]);
    expect(undefinedNames(missingOuter)).toEqual(['nope']);
  });

  test('helper names are not variables but their arguments are', () => {
    expect(undefinedNames(makeTemplate([text('{{uppercase title}}')], [title]))).toEqual([]);
    expect(undefinedNames(makeTemplate([text('{{uppercase nope}}')], [title]))).toEqual(['nope']);
  });

  test('undefined variables are still reported, including in triple-stash and block params', () => {
    expect(undefinedNames(makeTemplate([text('{{missing}} {{{raw}}}')], []))).toEqual(['missing', 'raw']);
    expect(undefinedNames(makeTemplate([text('{{#if gone}}x{{/if}}')], []))).toEqual(['gone']);
  });

  test('a repeat over an undeclared variable is reported', () => {
    expect(undefinedNames(makeTemplate([text('{{item}}', { repeat: 'item in missing' })], []))).toEqual(['missing']);
  });

  test('a repeat expression the engine cannot parse is reported', () => {
    const report = TemplateValidator.validateTemplate(makeTemplate([text('x', { repeat: 'items' })], [items]));
    expect(report.valid).toBe(false);
    expect(report.errors.map(error => error.message).join(' ')).toMatch(/repeat expression/i);
  });

  test('a template that validates can be rendered with default options', async () => {
    const template = makeTemplate(
      [text('{{item.name}}-{{item_index}} {{#if on}}y{{else}}n{{/if}}', { repeat: 'item in items' })],
      [items, on]
    );
    const response = await templateRenderTool.invoke({
      template,
      variables: { items: [{ name: 'A' }, { name: 'B' }], on: false },
      format: 'svg'
    });
    const result = JSON.parse((response as { content: { text: string }[] }).content[0].text);
    expect(result.error).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.rendered.content).toContain('A-0 n');
    expect(result.rendered.content).toContain('B-1 n');
  });
});
