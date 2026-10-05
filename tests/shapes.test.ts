import { describe, expect, it } from 'vitest';
import { BASE_SHAPES } from '../src/config';
import {
  getShape,
  normalize,
  ORIENTATIONS,
  orientations,
  parsePattern,
  shapeCenter,
  TOTAL_WEIGHT,
} from '../src/core/shapes';

const EXPECTED_COUNTS: Record<string, number> = {
  mono: 1,
  i2: 2,
  i3: 2,
  i4: 2,
  i5: 2,
  l3: 4,
  o4: 1,
  l4: 8,
  t4: 4,
  s4: 4,
  l5: 4,
  plus: 1,
  u5: 4,
};

describe('shapes', () => {
  it('parses patterns', () => {
    expect(parsePattern('#..|###')).toEqual([
      [0, 0],
      [1, 0],
      [1, 1],
      [1, 2],
    ]);
  });

  it('normalizes to min row/col 0, sorted', () => {
    expect(
      normalize([
        [3, 5],
        [2, 6],
      ]),
    ).toEqual([
      [0, 1],
      [1, 0],
    ]);
  });

  it.each(Object.entries(EXPECTED_COUNTS))('%s has %i unique orientations', (id, count) => {
    expect(ORIENTATIONS.filter((o) => o.baseId === id)).toHaveLength(count);
  });

  it('has 39 orientations in total, with stable indices', () => {
    expect(ORIENTATIONS).toHaveLength(39);
    ORIENTATIONS.forEach((o, i) => expect(o.index).toBe(i));
    expect(ORIENTATIONS[0]?.baseId).toBe('mono');
  });

  it('splits each base weight evenly over its orientations', () => {
    for (const base of BASE_SHAPES) {
      const list = ORIENTATIONS.filter((o) => o.baseId === base.id);
      const sum = list.reduce((a, o) => a + o.weight, 0);
      expect(sum).toBeCloseTo(base.weight, 10);
      list.forEach((o) => expect(o.weight).toBeCloseTo(base.weight / list.length, 10));
    }
    expect(TOTAL_WEIGHT).toBeCloseTo(
      BASE_SHAPES.reduce((a, b) => a + b.weight, 0),
      10,
    );
  });

  it('orientations are all distinct, normalized, and keep the cell count', () => {
    for (const base of BASE_SHAPES) {
      const cells = parsePattern(base.pattern);
      const list = orientations(cells);
      const keys = new Set(list.map((l) => JSON.stringify(l)));
      expect(keys.size).toBe(list.length);
      for (const l of list) {
        expect(l).toHaveLength(cells.length);
        expect(Math.min(...l.map((p) => p[0]))).toBe(0);
        expect(Math.min(...l.map((p) => p[1]))).toBe(0);
      }
    }
  });

  it('computes width/height', () => {
    const i5 = ORIENTATIONS.filter((o) => o.baseId === 'i5');
    expect(i5.map((o) => [o.w, o.h]).sort()).toEqual([
      [1, 5],
      [5, 1],
    ]);
  });

  it('shapeCenter is the mean of cell centres', () => {
    const o4 = ORIENTATIONS.find((o) => o.baseId === 'o4');
    expect(o4 && shapeCenter(o4)).toEqual([1, 1]);
  });

  it('getShape rejects unknown indices', () => {
    expect(getShape(-1)).toBeUndefined();
    expect(getShape(39)).toBeUndefined();
    expect(getShape(1.5)).toBeUndefined();
    expect(getShape(0)).toBeDefined();
  });
});
