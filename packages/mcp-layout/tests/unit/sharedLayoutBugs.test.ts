import { ConstraintSolver } from '../../src/util/constraintSolver.js';
import { autoLayoutTool } from '../../src/tools/autoLayout.js';
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
