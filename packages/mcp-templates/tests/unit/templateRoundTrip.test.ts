import { templateCreateTool } from '../../src/tools/templateCreate.js';
import { templateLibraryAddTool } from '../../src/tools/templateLibraryAdd.js';
import { templateLibraryComposeTool } from '../../src/tools/templateLibraryCompose.js';
import { templateRenderTool } from '../../src/tools/templateRender.js';
import { templateExportTool } from '../../src/tools/templateExport.js';
import { ComponentType, VariableType } from '../../src/types/template.js';

const parse = (response: unknown) =>
  JSON.parse((response as { content: { text: string }[] }).content[0].text);

const render = async (template: unknown, variables: Record<string, unknown>) =>
  parse(await templateRenderTool.invoke({ template, variables, format: 'svg' }));

describe('templates returned by create and compose can be rendered', () => {
  test('template.create returns the full template, and render accepts it', async () => {
    const created = parse(await templateCreateTool.invoke({
      template: {
        metadata: { name: 'Card', version: '1.0.0' },
        variables: [{ name: 'title', type: VariableType.STRING, required: true }],
        components: [{
          id: 'title',
          type: ComponentType.TEXT,
          position: { x: 0, y: 20, width: 200, height: 30 },
          content: '{{title}}'
        }],
        layout: { width: 300, height: 100 }
      }
    }));
    expect(created.success).toBe(true);
    expect(created.template.id).toMatch(/^template_/);
    expect(created.template.components).toHaveLength(1);
    expect(created.summary).toMatchObject({ name: 'Card', componentCount: 1, variableCount: 1 });

    const rendered = await render(created.template, { title: 'Hello card' });
    expect(rendered.error).toBeUndefined();
    expect(rendered.rendered.content).toContain('Hello card');
  });

  test('template.library.compose returns the full template, and render accepts it', async () => {
    const added = parse(await templateLibraryAddTool.invoke({
      component: {
        name: 'Round Trip Label',
        category: 'labels',
        component: {
          id: 'label',
          type: ComponentType.TEXT,
          position: { x: 0, y: 20, width: 200, height: 30 },
          content: 'Composed label'
        }
      },
      library: 'round-trip',
      options: { validate: false }
    }));

    const composed = parse(await templateLibraryComposeTool.invoke({
      components: [added.component.id],
      layout: { width: 300, height: 100 },
      metadata: { name: 'Composed' }
    }));
    expect(composed.success).toBe(true);
    expect(composed.template.components).toHaveLength(1);
    expect(composed.summary).toMatchObject({ name: 'Composed', componentCount: 1 });

    const rendered = await render(composed.template, {});
    expect(rendered.error).toBeUndefined();
    expect(rendered.rendered.content).toContain('Composed label');
  });

  test('render and export reject a string id with a message that says what to pass', async () => {
    const rendered = await render('template_abc', {});
    expect(rendered.success).toBe(false);
    expect(rendered.error).toMatch(/template object/i);

    const exported = parse(await templateExportTool.invoke({ template: 'template_abc', options: { format: 'svg' } }));
    expect(exported.success).toBe(false);
    expect(exported.error).toMatch(/template object/i);
  });

  test('render and export no longer advertise string ids', () => {
    const renderTemplate = (templateRenderTool.inputSchema.properties as Record<string, { type?: string }>).template;
    const exportTemplate = (templateExportTool.inputSchema.properties as Record<string, { type?: string }>).template;
    expect(renderTemplate.type).toBe('object');
    expect(exportTemplate.type).toBe('object');
  });
});
