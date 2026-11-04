import { ConstraintSolver } from '../../src/util/constraintSolver.js';
import { autoLayoutTool } from '../../src/tools/autoLayout.js';
import { createGridTool } from '../../src/tools/createGrid.js';
import { measureTool } from '../../src/tools/measure.js';
import { LayoutConstraint, LayoutElement, Rectangle } from '../../src/types/layout.js';

const container: Rectangle = { x: 0, y: 0, width: 800, height: 600 };

describe('the constraint solver honours priority', () => {
  const box: LayoutElement = { id: 'box', type: 'div', bounds: { x: 0, y: 0, width: 100, height: 50 } };
  const pinX: LayoutConstraint = { type: 'position', element: 'box', property: 'x', value: 10, relation: 'equal', priority: 1000 };
  const centerX: LayoutConstraint = { type: 'alignment', element: 'box', property: 'center-x', value: 0, relation: 'equal', priority: 1 };

  test('a high-priority constraint wins over a later low-priority one', () => {
    expect(ConstraintSolver.solve([box], [pinX, centerX], container).get('box')!.x).toBe(10);
  });

  test('the result does not depend on the order constraints are listed in', () => {
    expect(ConstraintSolver.solve([box], [centerX, pinX], container).get('box')!.x).toBe(10);
    const centerWins = [{ ...pinX, priority: 1 }, { ...centerX, priority: 1000 }];
    expect(ConstraintSolver.solve([box], centerWins, container).get('box')!.x).toBe(350);
    expect(ConstraintSolver.solve([box], [...centerWins].reverse(), container).get('box')!.x).toBe(350);
  });

  test('equal priorities keep list order (the later one wins)', () => {
    const pin = { ...pinX, priority: 500 };
    const center = { ...centerX, priority: 500 };
    expect(ConstraintSolver.solve([box], [pin, center], container).get('box')!.x).toBe(350);
    expect(ConstraintSolver.solve([box], [center, pin], container).get('box')!.x).toBe(10);
  });
});

describe('layout.autoLayout positions are not overridden by its lower-priority spacing', () => {
  test('a column starts at the top and its elements do not overlap', async () => {
    const response = await autoLayoutTool.invoke({
      elements: [
        { id: 't1', type: 'text', content: { text: 'hello' } },
        { id: 't2', type: 'text', content: { text: 'world' } },
        { id: 'img', type: 'image', content: { src: 'a.png', title: 'x' } }
      ],
      bounds: container
    });
    const result = JSON.parse((response as { content: { text: string }[] }).content[0].text);
    const boxes = (result.elements as { bounds: Rectangle }[]).map(e => e.bounds).sort((a, b) => a.y - b.y);
    expect(boxes[0].y).toBe(0);
    for (let i = 1; i < boxes.length; i++) {
      expect(boxes[i].y).toBeGreaterThanOrEqual(boxes[i - 1].y + boxes[i - 1].height);
    }
  });
});

type Positioned = { id: string; bounds: Rectangle };
const parse = (response: unknown) => JSON.parse((response as { content: { text: string }[] }).content[0].text);
const createGrid = async (config: Record<string, unknown>, elements: Record<string, unknown>[], bounds: Rectangle) =>
  parse(await createGridTool.invoke({ config, elements, bounds }));
const positionsOf = (result: { layout: { computedGrid: { elementPositions: Positioned[] } } }) =>
  Object.fromEntries(result.layout.computedGrid.elementPositions.map(p => [p.id, p.bounds]));

describe('layout.createGrid returns element positions', () => {
  const bounds = { x: 10, y: 20, width: 300, height: 100 };
  const config = { columns: '100px 100px 100px', rows: '50px 50px' };

  test('explicit placements and auto-placed elements get absolute bounds', async () => {
    const result = await createGrid(config, [
      { id: 'a' }, { id: 'b' }, { id: 'c', gridColumn: '2 / 4', gridRow: '2' }, { id: 'd' }
    ], bounds);
    expect(result.success).toBe(true);
    expect(positionsOf(result)).toEqual({
      a: { x: 10, y: 20, width: 100, height: 50 },
      b: { x: 110, y: 20, width: 100, height: 50 },
      c: { x: 110, y: 70, width: 200, height: 50 },
      d: { x: 210, y: 20, width: 100, height: 50 }
    });
  });

  test('auto-placement skips occupied cells, honours span, and adds implicit rows from autoRows', async () => {
    // Sparse packing (the CSS default): the cursor only moves forward, so after
    // 'wide' wraps to row 2 the empty cell at the end of row 1 stays empty.
    const result = await createGrid({ ...config, autoRows: '30px' }, [
      { id: 'hero', gridColumnStart: 1, gridColumnEnd: 3 },
      { id: 'wide', gridColumn: 'span 2' },
      { id: 'x' }, { id: 'y' }, { id: 'z' }
    ], bounds);
    expect(positionsOf(result)).toEqual({
      hero: { x: 10, y: 20, width: 200, height: 50 },
      wide: { x: 10, y: 70, width: 200, height: 50 },
      x: { x: 210, y: 70, width: 100, height: 50 },
      y: { x: 10, y: 120, width: 100, height: 30 },
      z: { x: 110, y: 120, width: 100, height: 30 }
    });
  });

  test('autoFlow column fills columns first', async () => {
    const result = await createGrid({ ...config, autoFlow: 'column' }, [{ id: 'a' }, { id: 'b' }, { id: 'c' }], bounds);
    expect(positionsOf(result)).toMatchObject({
      a: { x: 10, y: 20 }, b: { x: 10, y: 70 }, c: { x: 110, y: 20 }
    });
  });

  test('a start line with no end spans one track', async () => {
    const result = await createGrid(config, [{ id: 'a', gridColumnStart: 3, gridRowStart: 2 }], bounds);
    expect(positionsOf(result).a).toEqual({ x: 210, y: 70, width: 100, height: 50 });
  });

  test('layout.measure measures the grid from those positions, not dummy boxes', async () => {
    const grid = await createGrid(config, [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }], bounds);
    const measured = parse(await measureTool.invoke({
      layout: grid.layout,
      elements: ['a', 'b', 'c', 'd'].map(id => ({ id, type: 'div' }))
    }));
    expect(measured.success).toBe(true);
    expect(measured.metrics.totalBounds).toEqual({ x: 10, y: 20, width: 300, height: 100 });
  });
});

// Expected values below were checked against Chrome's grid layout for the same templates.
describe('grid gaps and track templates', () => {
  const wide = { x: 0, y: 0, width: 1000, height: 600 };
  type Track = { start: number; size: number };
  const tracksOf = (result: { layout: { computedGrid: { tracks: { columns: Track[]; rows: Track[] } } } }) =>
    result.layout.computedGrid.tracks;

  test('gap is taken off the free space before fr tracks are sized, and added between tracks', async () => {
    const result = await createGrid({ columns: '1fr 1fr 1fr', rows: '100px 100px', gap: '20px' },
      [{ id: 'a', gridColumn: '1 / 3' }, { id: 'b' }, { id: 'c' }], wide);
    expect(tracksOf(result).columns).toEqual([
      { start: 0, size: 320 }, { start: 340, size: 320 }, { start: 680, size: 320 }
    ]);
    expect(tracksOf(result).rows).toEqual([{ start: 0, size: 100 }, { start: 120, size: 100 }]);
    expect(positionsOf(result)).toEqual({
      a: { x: 0, y: 0, width: 660, height: 100 },
      b: { x: 680, y: 0, width: 320, height: 100 },
      c: { x: 0, y: 120, width: 320, height: 100 }
    });
  });

  test('a two-value gap is row then column, and rowGap/columnGap override it', async () => {
    const two = await createGrid({ columns: '100px 100px', rows: '50px 50px', gap: '10px 30px' }, [{ id: 'a' }], wide);
    expect(tracksOf(two).rows[1]).toEqual({ start: 60, size: 50 });
    expect(tracksOf(two).columns[1]).toEqual({ start: 130, size: 100 });
    const overridden = await createGrid({ columns: '100px 100px', rows: '50px 50px', gap: '10px', columnGap: '5px' }, [{ id: 'a' }], wide);
    expect(tracksOf(overridden).columns[1].start).toBe(105);
    expect(tracksOf(overridden).rows[1].start).toBe(60);
  });

  test('implicit rows are separated by the row gap', async () => {
    const result = await createGrid({ columns: '100px', rows: '50px', gap: '10px', autoRows: '40px' }, [{ id: 'a' }, { id: 'b' }], wide);
    expect(positionsOf(result).b).toEqual({ x: 0, y: 60, width: 100, height: 40 });
  });

  test.each([
    ['auto auto', [500, 500]],
    ['min-content max-content', [100, 100]],
    ['10em 20em', [160, 320]],
    ['10% 1fr', [100, 900]],
    ['[side] 200px [main] 1fr', [200, 800]],
    ['minmax(100px, 1fr) 200px', [800, 200]],
    ['repeat(2, 1fr 3fr)', [125, 375, 125, 375]]
  ])('the valid template %s is accepted and sized', async (columns, sizes) => {
    const result = await createGrid({ columns, rows: '100px' }, [{ id: 'a' }], wide);
    expect(result.success).toBe(true);
    expect(tracksOf(result).columns.map(t => t.size)).toEqual(sizes);
  });

  test('repeat(auto-fill / auto-fit, ...) repeats as many tracks as fit, counting gaps', async () => {
    const fill = await createGrid({ columns: 'repeat(auto-fill, 200px)', rows: '100px', gap: '20px' }, [{ id: 'a' }], wide);
    expect(tracksOf(fill).columns).toEqual([
      { start: 0, size: 200 }, { start: 220, size: 200 }, { start: 440, size: 200 }, { start: 660, size: 200 }
    ]);
    // Four items fill every track, so this matches Chrome. With fewer items Chrome
    // collapses the empty auto-fit tracks; the engine doesn't (see README).
    const items = ['a', 'b', 'c', 'd'].map(id => ({ id }));
    const fit = await createGrid({ columns: 'repeat(auto-fit, minmax(200px, 1fr))', rows: '100px', gap: '16px' }, items, wide);
    expect(tracksOf(fit).columns).toEqual([
      { start: 0, size: 238 }, { start: 254, size: 238 }, { start: 508, size: 238 }, { start: 762, size: 238 }
    ]);
  });

  test.each([
    ['expx', 'expx'],
    ['10vw', '10vw'],
    ['1fr; } body { display: none } .x {', ';'],
    ['minmax(1fr, 100px)', 'minmax(1fr, 100px)'],
    ['repeat(2)', 'repeat(2)']
  ])('the invalid template %s is rejected, naming %s', async (columns, token) => {
    const result = await createGrid({ columns, rows: '100px' }, [{ id: 'a' }], wide);
    expect(result.success).toBe(false);
    expect(JSON.stringify(result.details)).toContain(token);
  });

  test('an invalid gap is rejected', async () => {
    const result = await createGrid({ columns: '1fr', rows: '1fr', gap: '10px 20px 30px' }, [{ id: 'a' }], wide);
    expect(result.success).toBe(false);
  });
});
