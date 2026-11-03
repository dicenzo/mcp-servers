import { isValidColor } from '../../src/util/color.js';
import { TemplateValidator } from '../../src/util/validation.js';
import { TemplateEngine } from '../../src/engine/templateEngine.js';
import { Template, VariableType, ComponentType } from '../../src/types/template.js';

const VALID = [
  '#fff', '#ffff', '#ffffff', '#ffffff80', '#1A2B3C',
  'rgb(255,0,0)', 'rgba(0,0,0,0.5)', 'rgb(0 0 0 / 50%)', 'rgb(100%, 0%, 0%)', 'rgba(0, 0, 0, .5)',
  'hsl(210, 50.5%, 40%)', 'hsla(0,100%,50%,0.3)', 'hsl(210 50% 40%)', 'hsl(120deg 100% 50% / 0.5)',
  'navy', 'teal', 'rebeccapurple', 'Transparent', 'currentColor', 'none'
];
const INVALID = ['', 'notacolor', '#ff', '#fffff', '#ggg', 'rgb(0,0)', 'url(x)', 'red;fill:blue', 'rgb(0,0,0', 'expression(alert(1))'];

const templateWithColor = (fill: string): Template => ({
  id: 'color-template',
  metadata: { name: 'Colour', version: '1.0.0', createdAt: '', updatedAt: '' },
  variables: [{ name: 'brand', type: VariableType.COLOR, required: false, default: fill }],
  components: [{
    id: 'shape',
    type: ComponentType.SHAPE,
    position: { x: 0, y: 0, width: 10, height: 10 },
    shape: 'rect',
    shapeData: {},
    style: { fill: '{{brand}}' }
  } as Template['components'][number]],
  layout: { width: 100, height: 100 }
});

describe('shared colour check', () => {
  test.each(VALID)('accepts %s', color => expect(isValidColor(color)).toBe(true));
  test.each(INVALID)('rejects %s', color => expect(isValidColor(color)).toBe(false));

  test('the validator accepts the colours the renderer accepts', () => {
    for (const color of ['rgba(0,0,0,0.5)', '#11223380', 'navy', 'hsl(210 50% 40%)']) {
      const report = TemplateValidator.validateTemplateWithVariables(templateWithColor(color), { brand: color });
      expect(report.errors).toEqual([]);
    }
  });

  test('the engine renders color variables it used to reject, and transparent no longer fails', async () => {
    const engine = new TemplateEngine();
    for (const color of ['rgba(0,0,0,0.5)', 'teal', 'transparent']) {
      const rendered = await engine.renderTemplate(templateWithColor(color), { brand: color });
      expect(rendered.content.svg).toContain(`fill="${color}"`);
    }
  });

  test('the renderer rejects names that are not colours', async () => {
    const engine = new TemplateEngine();
    const template = templateWithColor('#000');
    template.variables[0].type = VariableType.STRING;
    await expect(engine.renderTemplate(template, { brand: 'notacolor' })).rejects.toThrow(/Invalid color/);
  });
});
