import { TemplateEngine, RENDER_LIMITS } from '../../src/engine/templateEngine.js';
import { templateRender } from '../../src/tools/templateRender.js';
import { templateExportTool } from '../../src/tools/templateExport.js';
import {
  templateLibraryAddTool,
  MAX_LIBRARIES,
  MAX_COMPONENTS_PER_LIBRARY
} from '../../src/tools/templateLibraryAdd.js';
import { TemplateExporter, MAX_OUTPUT_PIXELS } from '../../src/util/export.js';
import { checkPatternSafety, MAX_PATTERN_LENGTH, MAX_PATTERN_INPUT_LENGTH } from '../../src/util/validationRules.js';
import { TemplateValidator } from '../../src/util/validation.js';
import { PerformanceMonitor, MAX_METRICS_PER_OPERATION } from '../../src/util/performance.js';
import {
  Template,
  TemplateComponent,
  RenderedTemplate,
  VariableType,
  ComponentType,
  ExportFormat,
  ExportOptionsSchema
} from '../../src/types/template.js';

function makeTemplate(components: TemplateComponent[], overrides: Partial<Template> = {}): Template {
  return {
    id: 'security-test',
    metadata: {
      name: 'Security Test',
      version: '1.0.0',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    },
    variables: [],
    components,
    layout: { width: 400, height: 300 },
    ...overrides
  };
}

function textComponent(id: string, content: string, extra: Partial<TemplateComponent> = {}): TemplateComponent {
  return {
    id,
    type: ComponentType.TEXT,
    position: { x: 0, y: 0, width: 100, height: 20 },
    content,
    style: { fontSize: 12, fontFamily: 'Arial' },
    ...extra
  } as TemplateComponent;
}

function groupComponent(id: string, children: TemplateComponent[], extra: Partial<TemplateComponent> = {}): TemplateComponent {
  return {
    id,
    type: ComponentType.GROUP,
    position: { x: 0, y: 0, width: 100, height: 100 },
    children,
    ...extra
  } as TemplateComponent;
}

function parseToolResult(result: { content: unknown[] }): Record<string, unknown> {
  const first = result.content[0] as { text: string };
  return JSON.parse(first.text);
}

describe('Security: render output limits', () => {
  const items = Array.from({ length: 200 }, (_, i) => i);

  test('nested repeats are capped by total rendered component count', async () => {
    const engine = new TemplateEngine();
    const template = makeTemplate([
      groupComponent('outer', [
        groupComponent('middle', [
          textComponent('inner', 'x', { repeat: 'c in items' })
        ], { repeat: 'b in items' })
      ], { repeat: 'a in items' })
    ]);

    const start = Date.now();
    await expect(engine.renderTemplate(template, { items })).rejects.toThrow(/limit/i);
    expect(Date.now() - start).toBeLessThan(10000);
  });

  test('limits are enforced even when tool-level validation is disabled', async () => {
    const template = makeTemplate([
      groupComponent('outer', [
        groupComponent('middle', [
          textComponent('inner', 'x', { repeat: 'c in items' })
        ], { repeat: 'b in items' })
      ], { repeat: 'a in items' })
    ]);

    await expect(
      templateRender(template, { items }, { validateVariables: false })
    ).rejects.toThrow(/limit/i);
  });

  test('repeat arrays longer than the item cap are rejected', async () => {
    const engine = new TemplateEngine();
    const template = makeTemplate([textComponent('t', '{{item}}', { repeat: 'item in items' })]);
    const tooMany = Array.from({ length: RENDER_LIMITS.maxRepeatItems + 1 }, (_, i) => i);

    await expect(engine.renderTemplate(template, { items: tooMany })).rejects.toThrow(/limit/i);
  });

  test('group nesting deeper than the depth cap is rejected', async () => {
    const engine = new TemplateEngine();
    let component: TemplateComponent = textComponent('leaf', 'deep');
    for (let i = 0; i < RENDER_LIMITS.maxNestingDepth + 5; i++) {
      component = groupComponent(`g${i}`, [component]);
    }

    await expect(engine.renderTemplate(makeTemplate([component]), {})).rejects.toThrow(/depth/i);
  });

  test('nested Handlebars #each blowup is capped by output length', async () => {
    const engine = new TemplateEngine();
    const template = makeTemplate([
      textComponent(
        't',
        '{{#each @root.a}}{{#each @root.a}}{{#each @root.a}}xxxxxxxxxx{{/each}}{{/each}}{{/each}}'
      )
    ]);

    const start = Date.now();
    await expect(engine.renderTemplate(template, { a: items })).rejects.toThrow(/limit/i);
    expect(Date.now() - start).toBeLessThan(10000);
  });

  test('ordinary repeats still render', async () => {
    const engine = new TemplateEngine();
    const template = makeTemplate([textComponent('t', '{{item}}', { repeat: 'item in items' })]);
    const result = await engine.renderTemplate(template, { items: ['a', 'b', 'c'] });
    expect(result.content.metadata.componentCount).toBe(3);
  });
});

describe('Security: pattern validation rules (ReDoS)', () => {
  test('static check rejects nested quantifiers', () => {
    expect(checkPatternSafety('^(a+)+$')).toMatch(/nested quantifier/i);
    expect(checkPatternSafety('(\\d*)*x')).toMatch(/nested quantifier/i);
    expect(checkPatternSafety('(a|aa)+')).toMatch(/alternation/i);
  });

  test('static check rejects backreferences and lookarounds', () => {
    expect(checkPatternSafety('(a)\\1')).toMatch(/backreference/i);
    expect(checkPatternSafety('(?<x>a)\\k<x>')).toMatch(/backreference/i);
    expect(checkPatternSafety('a(?=b)')).toMatch(/lookaround/i);
  });

  test('static check rejects overly long patterns', () => {
    expect(checkPatternSafety('a'.repeat(MAX_PATTERN_LENGTH + 1))).toMatch(/too long/i);
  });

  test('static check accepts ordinary patterns', () => {
    expect(checkPatternSafety('^[A-Z]{3}-\\d{4}$')).toBeNull();
    expect(checkPatternSafety('^[a-z]+@[a-z]+\\.[a-z]+$')).toBeNull();
    expect(checkPatternSafety('^(foo|bar)$')).toBeNull();
  });

  test('catastrophic pattern from a caller fails fast instead of hanging', () => {
    const engine = new TemplateEngine();
    const start = Date.now();
    const errors = engine.validateVariables(
      { code: 'a'.repeat(40) + '!' },
      [{
        name: 'code',
        type: VariableType.STRING,
        required: true,
        validation: [{ type: 'pattern', value: '^(a+)+$' }]
      }]
    );
    expect(Date.now() - start).toBeLessThan(2000);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/unsafe/i);
  });

  test('polynomial backtracking that passes the static check is stopped by the time limit', () => {
    const engine = new TemplateEngine();
    const start = Date.now();
    const errors = engine.validateVariables(
      { code: '1'.repeat(MAX_PATTERN_INPUT_LENGTH) },
      [{
        name: 'code',
        type: VariableType.STRING,
        required: true,
        validation: [{ type: 'pattern', value: '\\d*\\d*\\d*x' }]
      }]
    );
    expect(Date.now() - start).toBeLessThan(5000);
    expect(errors).toHaveLength(1);
  });

  test('values longer than the pattern input cap are rejected', () => {
    const engine = new TemplateEngine();
    const errors = engine.validateVariables(
      { code: 'a'.repeat(MAX_PATTERN_INPUT_LENGTH + 1) },
      [{
        name: 'code',
        type: VariableType.STRING,
        required: true,
        validation: [{ type: 'pattern', value: '^a+$' }]
      }]
    );
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toMatch(/too long/i);
  });

  test('safe patterns still match and mismatch correctly', () => {
    const engine = new TemplateEngine();
    const defs = [{
      name: 'code',
      type: VariableType.STRING,
      required: true,
      validation: [{ type: 'pattern' as const, value: '^[A-Z]{3}$' }]
    }];
    expect(engine.validateVariables({ code: 'ABC' }, defs)).toHaveLength(0);
    expect(engine.validateVariables({ code: 'abc' }, defs)).toHaveLength(1);
  });

  test('TemplateValidator applies custom rules and flags unsafe patterns', () => {
    const template = makeTemplate([], {
      variables: [{
        name: 'code',
        type: VariableType.STRING,
        required: true,
        validation: [{ type: 'pattern', value: '^(a+)+$' }]
      }]
    });
    const report = TemplateValidator.validateTemplateWithVariables(template, { code: 'aaa' });
    expect(report.valid).toBe(false);
    expect(report.errors.some(e => /unsafe/i.test(e.message))).toBe(true);

    const maxTemplate = makeTemplate([], {
      variables: [{
        name: 'n',
        type: VariableType.NUMBER,
        required: true,
        validation: [{ type: 'max', value: 5 }]
      }]
    });
    expect(TemplateValidator.validateTemplateWithVariables(maxTemplate, { n: 10 }).valid).toBe(false);
  });
});

describe('Security: raster export memory', () => {
  function rendered(svg: string, width = 100, height = 100): RenderedTemplate {
    return {
      id: 'r1',
      templateId: 't1',
      variables: {},
      content: {
        svg,
        html: '<div></div>',
        metadata: { width, height, renderTime: 1, componentCount: 0 }
      },
      generatedAt: new Date().toISOString()
    };
  }

  test('ExportOptionsSchema caps width and height', () => {
    expect(ExportOptionsSchema.safeParse({ format: 'png', width: 8193 }).success).toBe(false);
    expect(ExportOptionsSchema.safeParse({ format: 'png', height: 8193 }).success).toBe(false);
    expect(ExportOptionsSchema.safeParse({ format: 'png', width: 8192, height: 100 }).success).toBe(true);
  });

  test('output pixel area is capped before rasterizing', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"></svg>';
    const result = await TemplateExporter.exportTemplate(rendered(svg), {
      format: ExportFormat.JPEG,
      width: 3270,
      height: 3270,
      scale: 10
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/pixel/i);
    expect(3270 * 10 * 3270 * 10).toBeGreaterThan(MAX_OUTPUT_PIXELS);
  });

  test('oversized intrinsic SVG dimensions are refused by sharp input limit', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="8000" height="8000"></svg>';
    const result = await TemplateExporter.exportTemplate(rendered(svg), { format: ExportFormat.PNG });
    expect(result.success).toBe(false);
  });

  test('small raster exports still work', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="10" height="10" fill="#f00"/></svg>';
    const result = await TemplateExporter.exportTemplate(rendered(svg), { format: ExportFormat.PNG, scale: 2 });
    expect(result.success).toBe(true);
    expect(result.size.width).toBe(200);
  });

  test('export tool validates rendered-template input with a schema', async () => {
    const malformed = {
      id: 'r1',
      templateId: 't1',
      content: { svg: '<svg/>' },
      generatedAt: 'now'
    };
    const res = parseToolResult(await templateExportTool.invoke({
      template: malformed,
      options: { format: 'svg' }
    }));
    expect(res.success).toBe(false);
  });

  test('export tool rejects oversized rendered SVG content', async () => {
    const huge = rendered('<svg>' + 'x'.repeat(RENDER_LIMITS.maxOutputLength + 1) + '</svg>');
    const res = parseToolResult(await templateExportTool.invoke({
      template: huge,
      options: { format: 'svg' }
    }));
    expect(res.success).toBe(false);
  });
});

describe('Security: attribute and CSS injection', () => {
  function imageTemplate(source: string): Template {
    return makeTemplate([{
      id: 'img',
      type: ComponentType.IMAGE,
      position: { x: 0, y: 0, width: 10, height: 10 },
      source
    } as TemplateComponent], {
      variables: [{ name: 'logo', type: VariableType.IMAGE, required: false }]
    });
  }

  test('image source variable cannot break out of the attribute', async () => {
    const engine = new TemplateEngine();
    await expect(
      engine.renderTemplate(imageTemplate('{{logo}}'), { logo: 'x" onerror="alert(1)' })
    ).rejects.toThrow(/image source/i);
  });

  test('javascript: and protocol-relative image sources are rejected', async () => {
    const engine = new TemplateEngine();
    await expect(engine.renderTemplate(imageTemplate('{{logo}}'), { logo: 'javascript:alert(1)' }))
      .rejects.toThrow(/image source/i);
    await expect(engine.renderTemplate(imageTemplate('{{logo}}'), { logo: '//evil.example/x.png' }))
      .rejects.toThrow(/image source/i);
    await expect(engine.renderTemplate(imageTemplate('{{logo}}'), { logo: 'http://evil.example/x.png' }))
      .rejects.toThrow(/image source/i);
  });

  test('safe image sources render and are attribute-escaped', async () => {
    const engine = new TemplateEngine();
    const https = await engine.renderTemplate(imageTemplate('{{logo}}'), { logo: 'https://cdn.example/a.png?x=1&y=2' });
    expect(https.content.svg).toContain('href="https://cdn.example/a.png?x=1&amp;y=2"');
    expect(https.content.html).toContain('src="https://cdn.example/a.png?x=1&amp;y=2"');

    const data = await engine.renderTemplate(imageTemplate('{{logo}}'), { logo: 'data:image/png;base64,iVBORw0KGgo=' });
    expect(data.content.svg).toContain('href="data:image/png;base64,iVBORw0KGgo="');

    const relative = await engine.renderTemplate(imageTemplate('images/logo.png'), {});
    expect(relative.content.svg).toContain('href="images/logo.png"');
  });

  test('unset optional image variable renders no image instead of a raw placeholder', async () => {
    const engine = new TemplateEngine();
    const result = await engine.renderTemplate(imageTemplate('{{logo}}'), {});
    expect(result.content.svg).not.toContain('<image');
    expect(result.content.svg).not.toContain('{{logo}}');
  });

  test('layout background is validated', async () => {
    const engine = new TemplateEngine();
    const template = makeTemplate([], { layout: { width: 10, height: 10, background: 'red" onload="alert(1)' } });
    await expect(engine.renderTemplate(template, {})).rejects.toThrow(/color/i);

    const cssTemplate = makeTemplate([], { layout: { width: 10, height: 10, background: 'red; position: fixed' } });
    await expect(engine.renderTemplate(cssTemplate, {})).rejects.toThrow(/color/i);
  });

  test('style fill, stroke and fontFamily are validated', async () => {
    const engine = new TemplateEngine();
    const badFill = makeTemplate([textComponent('t', 'hi', {
      style: { fontSize: 12, fontFamily: 'Arial', fill: 'red;background:url(https://evil.example)' }
    } as Partial<TemplateComponent>)]);
    await expect(engine.renderTemplate(badFill, {})).rejects.toThrow(/color/i);

    const badFont = makeTemplate([textComponent('t', 'hi', {
      style: { fontSize: 12, fontFamily: 'Arial" onmouseover="alert(1)' }
    } as Partial<TemplateComponent>)]);
    await expect(engine.renderTemplate(badFont, {})).rejects.toThrow(/font/i);

    const badStroke = makeTemplate([{
      id: 's',
      type: ComponentType.SHAPE,
      position: { x: 0, y: 0, width: 10, height: 10 },
      shape: 'rect',
      shapeData: {},
      style: { stroke: '#000"/><script>alert(1)</script>' }
    } as TemplateComponent]);
    await expect(engine.renderTemplate(badStroke, {})).rejects.toThrow(/color/i);
  });

  test('ordinary colors and fonts are accepted', async () => {
    const engine = new TemplateEngine();
    const template = makeTemplate([
      textComponent('t', 'hi', {
        style: { fontSize: 12, fontFamily: "'Open Sans', sans-serif", fill: 'rgba(0, 0, 0, 0.5)' }
      } as Partial<TemplateComponent>),
      {
        id: 's',
        type: ComponentType.SHAPE,
        position: { x: 0, y: 0, width: 10, height: 10 },
        shape: 'circle',
        shapeData: {},
        style: { fill: 'transparent', stroke: 'hsl(120, 50%, 50%)', strokeWidth: 2 }
      } as TemplateComponent
    ], { layout: { width: 10, height: 10, background: 'white' } });

    const result = await engine.renderTemplate(template, {});
    expect(result.content.svg).toContain('font-family="&#39;Open Sans&#39;, sans-serif"');
    expect(result.content.svg).toContain('stroke="hsl(120, 50%, 50%)"');
    expect(result.content.svg).toContain('fill="white"');
  });
});

describe('Security: bounded in-memory state', () => {
  function libraryArgs(name: string, library: string) {
    return {
      component: {
        name,
        category: 'test',
        component: {
          id: `${name}-id`,
          type: 'text',
          position: { x: 0, y: 0, width: 10, height: 10 },
          content: 'x'
        }
      },
      library
    };
  }

  test('library.add rejects malformed input via schema, even with validate:false', async () => {
    const res = parseToolResult(await templateLibraryAddTool.invoke({
      component: { name: 'x', category: 'c', component: 'not-an-object' },
      options: { validate: false }
    }));
    expect(res.success).toBe(false);

    const badLibrary = parseToolResult(await templateLibraryAddTool.invoke({
      ...libraryArgs('ok', 'bad library name!'),
    }));
    expect(badLibrary.success).toBe(false);
  });

  test('components per library are capped', async () => {
    let lastResult: Record<string, unknown> = {};
    for (let i = 0; i <= MAX_COMPONENTS_PER_LIBRARY; i++) {
      lastResult = parseToolResult(await templateLibraryAddTool.invoke(libraryArgs(`c${i}`, 'cap-test')));
    }
    expect(lastResult.success).toBe(false);
    expect(String(lastResult.error)).toMatch(/limit/i);
  });

  test('number of libraries is capped', async () => {
    let lastResult: Record<string, unknown> = {};
    for (let i = 0; i <= MAX_LIBRARIES; i++) {
      lastResult = parseToolResult(await templateLibraryAddTool.invoke(libraryArgs('c', `lib-${i}`)));
      if (lastResult.success === false) break;
    }
    expect(lastResult.success).toBe(false);
    expect(String(lastResult.error)).toMatch(/limit/i);
  });

  test('performance metrics are bounded per operation', () => {
    const monitor = PerformanceMonitor.getInstance();
    monitor.reset();
    for (let i = 0; i < MAX_METRICS_PER_OPERATION + 50; i++) {
      monitor.startOperation(`op-${i}`, 'bounded.op');
      monitor.endOperation(`op-${i}`);
    }
    expect(monitor.getMetrics('bounded.op')).toHaveLength(MAX_METRICS_PER_OPERATION);
    monitor.reset();
  });
});
