import { templateLibraryAddTool } from '../../src/tools/templateLibraryAdd.js';
import { templateLibraryComposeTool } from '../../src/tools/templateLibraryCompose.js';
import { ComponentType } from '../../src/types/template.js';

const addComponent = async (name: string, library: string, options: Record<string, unknown> = {}) => {
  const response = await templateLibraryAddTool.invoke({
    component: {
      name,
      category: 'buttons',
      component: {
        id: `${name}-component`,
        type: ComponentType.TEXT,
        position: { x: 0, y: 0, width: 100, height: 40 },
        content: name
      }
    },
    library,
    options: { validate: false, ...options }
  });
  const result = JSON.parse((response.content[0] as { text: string }).text);
  if (!result.success) throw new Error(result.error);
  return result.component.id as string;
};

describe('component library lookup', () => {
  test('a component can be found by the id template.library.add returned', async () => {
    const id = await addComponent('Lookup Button', 'lookup-by-id');
    const resolved = await templateLibraryComposeTool.resolveComponents([id], false);
    expect(resolved.map(item => item.id)).toEqual([id]);
  });

  test('a component can still be found by its exact name', async () => {
    const id = await addComponent('Named Button', 'lookup-by-name');
    const resolved = await templateLibraryComposeTool.resolveComponents(['Named Button'], false);
    expect(resolved.map(item => item.id)).toEqual([id]);
  });

  test('a name is not matched by substring', async () => {
    await addComponent('Primary Button Large', 'lookup-substring');
    await expect(templateLibraryComposeTool.resolveComponents(['Primary Button'], false))
      .rejects.toThrow(/not found/);
  });

  test('dependencies listed by id are resolved', async () => {
    const dependencyId = await addComponent('Icon', 'lookup-deps');
    const response = await templateLibraryAddTool.invoke({
      component: {
        name: 'Icon Button',
        category: 'buttons',
        component: { id: 'icon-button', type: ComponentType.TEXT, position: { x: 0, y: 0, width: 10, height: 10 }, content: 'x' },
        dependencies: [dependencyId]
      },
      library: 'lookup-deps',
      options: { validate: false }
    });
    const id = JSON.parse((response.content[0] as { text: string }).text).component.id;
    const resolved = await templateLibraryComposeTool.resolveComponents([id], true);
    expect(resolved.map(item => item.id)).toEqual([id, dependencyId]);
  });

  test('overwriting a component keeps its id', async () => {
    const id = await addComponent('Overwritten', 'lookup-overwrite');
    const overwrittenId = await addComponent('Overwritten', 'lookup-overwrite', { overwrite: true });
    expect(overwrittenId).toBe(id);
  });
});
