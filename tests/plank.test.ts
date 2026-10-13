import { describe, expect, it } from 'vitest';
import {
  canPlace,
  isComplete,
  LEVEL_COUNT,
  makeLevel,
  parsePlankProgress,
  plankRecord,
  plankStars,
  rotate,
  rotateCw,
  sameShape,
  shapeId,
} from '../src/core/plank';
import type { Placed } from '../src/core/plank';
import { outlineLoops } from '../src/render/blockGeometry';

describe('plank rules', () => {
  it('rotates clockwise and back', () => {
    const l = [
      [0, 0],
      [1, 0],
      [1, 1],
    ] as const;
    expect(rotateCw(l)).toEqual([
      [0, 0],
      [0, 1],
      [1, 0],
    ]);
    expect(sameShape(rotate(l, 4), l)).toBe(true);
    expect(sameShape(rotate(rotate(l, 3), 1), l)).toBe(true);
    expect(shapeId(rotate(l, 1))).toBe(shapeId(l));
    expect(
      shapeId([
        [0, 0],
        [0, 1],
        [0, 2],
      ]),
    ).not.toBe(shapeId(l));
  });

  it('places inside the silhouette, never on another piece', () => {
    const level = makeLevel(1);
    const [a] = level.pieces;
    if (!a) throw new Error('no pieces');
    const cells = rotate(a.cells, a.solution.turns);
    expect(canPlace(level, [], cells, a.solution.r, a.solution.c)).toBe(true);
    const placed: Placed[] = [{ id: a.id, cells, r: a.solution.r, c: a.solution.c }];
    expect(canPlace(level, placed, cells, a.solution.r, a.solution.c)).toBe(false);
    expect(canPlace(level, placed, cells, a.solution.r, a.solution.c, a.id)).toBe(true);
    expect(canPlace(level, [], cells, -1, 0)).toBe(false);
  });

  it('scores stars by hints and keeps the best', () => {
    expect([0, 1, 2, 5].map(plankStars)).toEqual([3, 2, 1, 1]);
    let p = parsePlankProgress(null);
    p = plankRecord(p, 2, 2);
    p = plankRecord(p, 2, 1);
    expect(p.stars).toEqual([0, 2]);
    expect(parsePlankProgress(JSON.stringify(p))).toEqual(p);
    expect(parsePlankProgress('nope')).toEqual({ stars: [] });
  });
});

describe('plank levels', () => {
  it('every level is the same on every run, and its solution fills it exactly', () => {
    for (let n = 1; n <= LEVEL_COUNT; n++) {
      const level = makeLevel(n);
      expect(makeLevel(n)).toEqual(level);
      // one carved outline, no holes or corner pinches
      expect(outlineLoops(level.target)).toHaveLength(1);
      const placed: Placed[] = [];
      for (const p of level.pieces) {
        const cells = rotate(p.cells, p.solution.turns);
        expect(canPlace(level, placed, cells, p.solution.r, p.solution.c)).toBe(true);
        placed.push({ id: p.id, cells, r: p.solution.r, c: p.solution.c });
      }
      expect(isComplete(level, placed)).toBe(true);
    }
  });

  it('grows from a few pieces to many', () => {
    expect(makeLevel(1).pieces.length).toBeLessThanOrEqual(3);
    expect(makeLevel(LEVEL_COUNT).pieces.length).toBeGreaterThanOrEqual(6);
  });
});
