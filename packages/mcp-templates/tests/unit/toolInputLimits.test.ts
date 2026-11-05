import { templateCreateTool } from '../../src/tools/templateCreate.js';
import { templateValidateTool } from '../../src/tools/templateValidate.js';
import { templateExportTool } from '../../src/tools/templateExport.js';
import { ComponentType, ExportFormat } from '../../src/types/template.js';

type ToolResponse = { content: { text: string }[]; isError?: boolean };

const parse = (response: unknown) => JSON.parse((response as ToolResponse).content[0].text);

const definition = (width: number, height: number) => ({
  metadata: { name: 'Banner', version: '1.0.0' },
  variables: [],
  components: [{
    id: 'box',
    type: ComponentType.TEXT,
    position: { x: 0, y: 0, width: 10, height: 10 },
    content: 'Hi'
  }],
  layout: { width, height }
});

const timestamps = { createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' };

describe('layout dimensions are capped at 10000px everywhere', () => {
  test('template.create rejects a layout wider than 10000px', async () => {
    const response = await templateCreateTool.invoke({ template: definition(20000, 100) }) as ToolResponse;
    expect(response.isError).toBe(true);
    expect(parse(response).details.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'template.layout.width' })
    ]));
  });

  test('template.validate rejects a layout taller than 10000px', async () => {
    const template = { id: 'template_big', ...definition(100, 20000) };
    template.metadata = { ...template.metadata, ...timestamps };
    const response = await templateValidateTool.invoke({ template }) as ToolResponse;
    expect(response.isError).toBe(true);
  });

  test('both tools advertise the limit', () => {
    for (const tool of [templateCreateTool, templateValidateTool]) {
      const template = (tool.inputSchema.properties as Record<string, { properties: Record<string, { properties: Record<string, { maximum?: number }> }> }>).template;
      expect(template.properties.layout.properties.width.maximum).toBe(10000);
      expect(template.properties.layout.properties.height.maximum).toBe(10000);
    }
  });
});

describe('template.create validation errors', () => {
  test('zod issues are listed in details.errors with their paths', async () => {
    const response = await templateCreateTool.invoke({
      template: { ...definition(300, 100), layout: { width: 'wide', height: 100 } }
    }) as ToolResponse;
    expect(response.isError).toBe(true);

    const body = parse(response);
    expect(body.error).toBe('Invalid template.create input');
    expect(body.details.errors).toEqual(expect.arrayContaining([
      expect.objectContaining({ path: 'template.layout.width', message: expect.any(String) })
    ]));
    expect(body.suggestions).toEqual(expect.arrayContaining([expect.stringContaining('template.layout.width')]));
  });
});

describe('template.export quality', () => {
  const exportJpeg = (quality: number) => templateExportTool.invoke({
    template: { id: 'template_q', ...definition(40, 40), metadata: { ...definition(40, 40).metadata, ...timestamps } },
    variables: {},
    options: { format: ExportFormat.JPEG, quality }
  }) as Promise<ToolResponse>;

  test('quality 1 is used as given, not replaced with the default', async () => {
    const low = parse(await exportJpeg(1));
    const fallback = parse(await exportJpeg(80));
    expect(low.success).toBe(true);
    expect(low.metadata.options.quality).toBe(1);
    expect(low.export.size.bytes).toBeLessThan(fallback.export.size.bytes);
  });

  test.each([0, 50.5, 101])('quality %p is rejected, since the encoder takes whole numbers from 1 to 100', async quality => {
    const response = await exportJpeg(quality);
    expect(response.isError).toBe(true);
  });

  test('the advertised range is 1 to 100 whole numbers', () => {
    const options = (templateExportTool.inputSchema.properties as Record<string, { properties: Record<string, { type?: string; minimum?: number; maximum?: number }> }>).options;
    expect(options.properties.quality).toMatchObject({ type: 'integer', minimum: 1, maximum: 100 });
  });
});
