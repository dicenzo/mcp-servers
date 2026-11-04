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
