import { getWindow, registerWindow } from '@svgdotjs/svg.js';
import { executeWireframeToSvg } from '../../src/tools/wireframeToSvg';
import { svgTransformTool } from '../../src/tools/svgTransform';

// tests/setup.ts registers a jsdom window for every test; production has none.
// These tests reproduce the production state by clearing it first.
// svg.js's types don't allow null, but null is its initial state when there is no global window
const clearWindow = () => (registerWindow as (win: unknown, doc: unknown) => void)(null, null);

describe('wireframe.to.svg keeps its DOM to itself', () => {
  const setupWindow = getWindow();
  afterEach(() => registerWindow(setupWindow, setupWindow.document));

  const wireframe = '+------+\n| Hi   |\n+------+\n[ OK ]';

  test('leaves no svg.js window behind', async () => {
    clearWindow();
    const svg = await executeWireframeToSvg({ wireframe_text: wireframe, width: 200, height: 100 } as never);
    expect(svg).toContain('<svg');
    expect(getWindow()).toBeNull();
  });

  test('restores the window that was registered before it ran', async () => {
    await executeWireframeToSvg({ wireframe_text: wireframe, width: 200, height: 100 } as never);
    expect(getWindow()).toBe(setupWindow);
  });

  test('svg.transform gives the same output before and after wireframe.to.svg', async () => {
    clearWindow();
    const args = {
      svg: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect id="r" x="10" y="10" width="20" height="20"/></svg>',
      transforms: [{ type: 'rotate', values: [45, 50] }]
    };
    const transformedSvg = async () => {
      const response = await svgTransformTool.invoke(args) as { content: { text: string }[] };
      const result = JSON.parse(response.content[0].text);
      delete result.metadata.transformedAt;
      return result;
    };
    const before = await transformedSvg();
    await executeWireframeToSvg({ wireframe_text: wireframe, width: 200, height: 100 } as never);
    expect(await transformedSvg()).toEqual(before);
  });
});
