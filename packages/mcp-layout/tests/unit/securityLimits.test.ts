import { createGridTool } from '../../src/tools/createGrid.js';
import { createFlexTool } from '../../src/tools/createFlex.js';
import { addConstraintsTool } from '../../src/tools/addConstraints.js';
import { autoLayoutTool } from '../../src/tools/autoLayout.js';
import { responsiveTool } from '../../src/tools/responsive.js';
import { measureTool } from '../../src/tools/measure.js';
import { GridEngine } from '../../src/util/gridEngine.js';
import { FlexEngine } from '../../src/util/flexEngine.js';
import { LayoutValidator } from '../../src/util/validation.js';
import {
  BreakpointSchema,
  FlexConfigSchema,
  GridConfigSchema,
  GridConfig,
  LayoutConstraintSchema,
  LayoutElementSchema
} from '../../src/types/layout.js';

const bounds = { x: 0, y: 0, width: 800, height: 600 };

// Quadratic-backtracking payload for the old /^(\d*\.?\d+)(unit)$/ patterns
const REDOS_PAYLOAD = '1'.repeat(60000) + 'x';

async function invokeTool(tool: unknown, input: unknown): Promise<{ success: boolean; error?: string }> {
  const response = await (tool as { invoke: (args: unknown) => Promise<{ content: Array<{ text: string }> }> }).invoke(input);
  return JSON.parse(response.content[0].text);
}

function timed<T>(fn: () => T): { result: T; ms: number } {
  const start = performance.now();
  const result = fn();
  return { result, ms: performance.now() - start };
}

describe('Security limits', () => {
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe('grid repeat() expansion', () => {
    const gridInput = (columns: string): unknown => ({
      config: { columns, rows: 'auto', gap: '0' },
      elements: [{ id: 'a' }],
      bounds
    });

    it('rejects a huge repeat count without allocating it', async () => {
      const start = performance.now();
      const result = await invokeTool(createGridTool, gridInput('repeat(100000000, 1fr)'));
      const ms = performance.now() - start;

      expect(result.success).toBe(false);
      expect(result.error).toMatch(/repeat/i);
      expect(ms).toBeLessThan(1000);
    });

    it('rejects a repeat count just over the 1000 track limit', async () => {
      const result = await invokeTool(createGridTool, gridInput('repeat(1001, 1fr)'));
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/repeat/i);
    });

    it('accepts a repeat count at the 1000 track limit', async () => {
      const result = await invokeTool(createGridTool, gridInput('repeat(1000, 1fr)'));
      expect(result.success).toBe(true);
    });

    it('caps the total track count across several repeat() calls', async () => {
      const result = await invokeTool(createGridTool, gridInput('repeat(600, 1fr) repeat(600, 1fr)'));
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/track/i);
    });

    it('counts every track in a multi-track repeat pattern', async () => {
      const result = await invokeTool(createGridTool, gridInput('repeat(500, 1fr 1fr 1fr)'));
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/track/i);
    });

    it('rejects overlong grid template strings at the schema', () => {
      const columns = '1fr '.repeat(1000);
      expect(GridConfigSchema.safeParse({ columns, rows: 'auto' }).success).toBe(false);
      expect(GridConfigSchema.safeParse({ columns: 'auto', rows: columns }).success).toBe(false);
    });
  });

  describe('responsive breakpoint columns', () => {
    it('rejects huge breakpoint column counts at the schema', () => {
      expect(BreakpointSchema.safeParse({ name: 'x', minWidth: 0, columns: 100000000 }).success).toBe(false);
      expect(BreakpointSchema.safeParse({ name: 'x', minWidth: 0, columns: 1001 }).success).toBe(false);
      expect(BreakpointSchema.safeParse({ name: 'x', minWidth: 0, columns: 2.5 }).success).toBe(false);
      expect(BreakpointSchema.safeParse({ name: 'x', minWidth: 0, columns: 1000 }).success).toBe(true);
    });

    it('layout.responsive rejects a huge breakpoint column count', async () => {
      const start = performance.now();
      const result = await invokeTool(responsiveTool, {
        elements: [{ id: 'a' }],
        baseLayout: {
          type: 'grid',
          config: { columns: '1fr', rows: 'auto', gap: '0' },
          elements: [{ id: 'a' }],
          bounds
        },
        breakpoints: [{ name: 'huge', minWidth: 0, columns: 100000000 }]
      });
      expect(result.success).toBe(false);
      expect(performance.now() - start).toBeLessThan(1000);
    });

    it('layout.responsive rejects too many breakpoints', async () => {
      const breakpoints = Array.from({ length: 51 }, (_, i) => ({ name: `bp${i}`, minWidth: i * 10 }));
      const result = await invokeTool(responsiveTool, {
        elements: [{ id: 'a' }],
        baseLayout: {
          type: 'grid',
          config: { columns: '1fr', rows: 'auto', gap: '0' },
          elements: [{ id: 'a' }],
          bounds
        },
        breakpoints
      });
      expect(result.success).toBe(false);
    });
  });

  describe('CSS length regex backtracking', () => {
    it('validates a pathological gap in linear time', () => {
      const config = { columns: '1fr', rows: 'auto', gap: REDOS_PAYLOAD, autoFlow: 'row' } as GridConfig;
      const { result, ms } = timed(() => LayoutValidator.validateGridConfig(config));
      expect(result.some(e => /gap/i.test(e.message))).toBe(true);
      expect(ms).toBeLessThan(100);
    });

    it('parses a pathological flex gap in linear time', () => {
      const { ms } = timed(() =>
        (FlexEngine as unknown as { parseGap: (c: unknown) => unknown }).parseGap({ direction: 'row', gap: REDOS_PAYLOAD })
      );
      expect(ms).toBeLessThan(100);
    });

    it('parses a pathological grid track value in linear time', () => {
      const { result, ms } = timed(() =>
        (GridEngine as unknown as { parseSingleValue: (v: string) => { value: number; unit: string } })
          .parseSingleValue(REDOS_PAYLOAD)
      );
      expect(result.unit).toBe('px');
      expect(ms).toBeLessThan(100);
    });

    it('still accepts the same CSS lengths as before', () => {
      const valid = ['0', 'auto', '10px', '1.5rem', '.5em', '100%', '2fr', '3ch', '4ex', '50vh', '50vw'];
      valid.forEach(gap => {
        const errors = LayoutValidator.validateGridConfig({ columns: '1fr', rows: 'auto', gap, autoFlow: 'row' });
        expect(errors).toEqual([]);
      });

      const invalid = ['1.px', '1..5px', 'px', '-1px', '10pt'];
      invalid.forEach(gap => {
        const errors = LayoutValidator.validateGridConfig({ columns: '1fr', rows: 'auto', gap, autoFlow: 'row' });
        expect(errors.length).toBeGreaterThan(0);
      });

      const parse = (GridEngine as unknown as { parseSingleValue: (v: string) => { value: number; unit: string } })
        .parseSingleValue;
      expect(parse('.5fr')).toEqual({ value: 0.5, unit: 'fr' });
      expect(parse('12.25px')).toEqual({ value: 12.25, unit: 'px' });
      expect(parse('40')).toEqual({ value: 40, unit: 'px' });
    });

    it('rejects overlong gap strings at the schema', () => {
      const longGap = '1'.repeat(65);
      expect(GridConfigSchema.safeParse({ columns: '1fr', rows: 'auto', gap: longGap }).success).toBe(false);
      expect(GridConfigSchema.safeParse({ columns: '1fr', rows: 'auto', rowGap: longGap }).success).toBe(false);
      expect(GridConfigSchema.safeParse({ columns: '1fr', rows: 'auto', columnGap: longGap }).success).toBe(false);
      expect(FlexConfigSchema.safeParse({ gap: longGap }).success).toBe(false);
      expect(FlexConfigSchema.safeParse({ rowGap: longGap }).success).toBe(false);
      expect(FlexConfigSchema.safeParse({ columnGap: longGap }).success).toBe(false);
    });
  });

  describe('free string inputs', () => {
    const longString = 'a'.repeat(257);

    it('rejects overlong element ids and constraint fields', () => {
      expect(LayoutElementSchema.safeParse({ id: longString }).success).toBe(false);
      expect(LayoutConstraintSchema.safeParse({
        type: 'position', element: longString, property: 'x', value: 1
      }).success).toBe(false);
      expect(LayoutConstraintSchema.safeParse({
        type: 'position', element: 'a', property: longString, value: 1
      }).success).toBe(false);
      expect(LayoutConstraintSchema.safeParse({
        type: 'position', element: 'a', property: 'x', value: longString
      }).success).toBe(false);
      expect(BreakpointSchema.safeParse({ name: longString, minWidth: 0 }).success).toBe(false);
    });

    it('rejects oversized grid area matrices', () => {
      const areas = Array.from({ length: 101 }, () => ['a']);
      expect(GridConfigSchema.safeParse({ columns: '1fr', rows: 'auto', areas }).success).toBe(false);
    });
  });

  describe('element array counts', () => {
    const tooMany = 1001;
    const ids = (n: number): Array<{ id: string }> => Array.from({ length: n }, (_, i) => ({ id: `e${i}` }));

    it('layout.createGrid rejects more than 1000 elements', async () => {
      const result = await invokeTool(createGridTool, {
        config: { columns: '1fr', rows: 'auto', gap: '0' },
        elements: ids(tooMany),
        bounds
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/<=1000 items/);
    });

    it('layout.createFlex rejects more than 1000 elements', async () => {
      const result = await invokeTool(createFlexTool, { config: {}, elements: ids(tooMany), bounds });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/<=1000 items/);
    });

    it('layout.addConstraints rejects more than 1000 elements', async () => {
      const result = await invokeTool(addConstraintsTool, { elements: ids(tooMany), bounds });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/<=1000 items/);
    });

    it('layout.addConstraints rejects more than 5000 total constraints', async () => {
      const constraint = { type: 'position', element: 'e0', property: 'x', value: 1 };
      const elements = ids(60).map(el => ({ ...el, constraints: Array(100).fill(constraint) }));
      const result = await invokeTool(addConstraintsTool, { elements, bounds });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/at most 5000/);
    });

    it('layout.autoLayout rejects more than 1000 elements', async () => {
      const result = await invokeTool(autoLayoutTool, { elements: ids(tooMany), bounds });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/<=1000 items/);
    });

    it('layout.measure rejects more than 1000 elements', async () => {
      const result = await invokeTool(measureTool, {
        layout: { type: 'grid', config: { columns: '1fr', rows: 'auto', gap: '0' }, elements: [{ id: 'a' }], bounds },
        elements: ids(tooMany)
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/<=1000 items/);
    });

    it('layout.measure rejects a nested layout with more than 1000 elements', async () => {
      const result = await invokeTool(measureTool, {
        layout: { type: 'grid', config: { columns: '1fr', rows: 'auto', gap: '0' }, elements: ids(tooMany), bounds },
        elements: [{ id: 'a' }]
      });
      expect(result.success).toBe(false);
    });

    it('layout.responsive rejects more than 1000 elements', async () => {
      const result = await invokeTool(responsiveTool, {
        elements: ids(tooMany),
        baseLayout: { type: 'grid', config: { columns: '1fr', rows: 'auto', gap: '0' }, elements: [{ id: 'a' }], bounds }
      });
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/<=1000 items/);
    });
  });
});
