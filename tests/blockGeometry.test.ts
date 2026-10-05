import { describe, expect, it } from 'vitest';
import { insetLoop, outlineLoops } from '../src/render/blockGeometry';
import { ORIENTATIONS, parsePattern } from '../src/core/shapes';

describe('outlineLoops', () => {
  it('traces a single cell as one 4-corner loop', () => {
    const loops = outlineLoops([[0, 0]]);
    expect(loops).toHaveLength(1);
    expect(loops[0]).toHaveLength(4);
  });

  it('drops collinear points on straight runs', () => {
    expect(outlineLoops(parsePattern('#####'))[0]).toHaveLength(4);
    expect(outlineLoops(parsePattern('##|##'))[0]).toHaveLength(4);
  });

  it('counts corners for L, T and plus shapes', () => {
    expect(outlineLoops(parsePattern('#..|###'))[0]).toHaveLength(6);
    expect(outlineLoops(parsePattern('###|.#.'))[0]).toHaveLength(8);
    expect(outlineLoops(parsePattern('.#.|###|.#.'))[0]).toHaveLength(12);
    expect(outlineLoops(parsePattern('#.#|###'))[0]).toHaveLength(8);
  });

  it('gives one loop per disconnected part', () => {
    expect(
      outlineLoops([
        [0, 0],
        [2, 2],
      ]),
    ).toHaveLength(2);
  });

  it('traces every orientation of every shape as exactly one closed loop', () => {
    for (const o of ORIENTATIONS) expect(outlineLoops(o.cells)).toHaveLength(1);
  });
});

describe('insetLoop', () => {
  it('shrinks a unit square evenly on every side', () => {
    const [loop] = outlineLoops([[0, 0]]);
    if (!loop) throw new Error('no loop');
    const inset = insetLoop(loop, 0.1);
    const xs = inset.map((p) => p[0]);
    const ys = inset.map((p) => p[1]);
    expect(Math.min(...xs)).toBeCloseTo(0.1);
    expect(Math.max(...xs)).toBeCloseTo(0.9);
    expect(Math.min(...ys)).toBeCloseTo(0.1);
    expect(Math.max(...ys)).toBeCloseTo(0.9);
  });
});
