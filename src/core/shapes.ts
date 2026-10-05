import { BASE_SHAPES } from '../config';
import type { Cell, Shape, UvCenter } from './types';

/** Shift cells so the min row/col is 0, sorted row-major. */
export function normalize(cells: readonly Cell[]): Cell[] {
  const mr = Math.min(...cells.map((p) => p[0]));
  const mc = Math.min(...cells.map((p) => p[1]));
  return cells.map(([r, c]): Cell => [r - mr, c - mc]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

export function parsePattern(pattern: string): Cell[] {
  const cells: Cell[] = [];
  pattern.split('|').forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '#') cells.push([r, c]);
    });
  });
  return cells;
}

const keyOf = (cells: readonly Cell[]): string => cells.map((p) => `${p[0]},${p[1]}`).join(';');

/** All unique orientations (4 rotations × optional mirror) of a cell set, in a stable order. */
export function orientations(cells: readonly Cell[]): Cell[][] {
  const seen = new Set<string>();
  const list: Cell[][] = [];
  let cur: readonly Cell[] = cells;
  for (let m = 0; m < 2; m++) {
    for (let k = 0; k < 4; k++) {
      const n = normalize(cur);
      const key = keyOf(n);
      if (!seen.has(key)) {
        seen.add(key);
        list.push(n);
      }
      cur = cur.map(([r, c]): Cell => [c, -r]);
    }
    cur = cells.map(([r, c]): Cell => [r, -c]);
  }
  return list;
}

function buildOrientations(): Shape[] {
  const out: Shape[] = [];
  for (const base of BASE_SHAPES) {
    const list = orientations(parsePattern(base.pattern));
    for (const cells of list) {
      out.push({
        index: out.length,
        baseId: base.id,
        cells,
        h: Math.max(...cells.map((p) => p[0])) + 1,
        w: Math.max(...cells.map((p) => p[1])) + 1,
        weight: base.weight / list.length,
      });
    }
  }
  return out;
}

/** Every orientation of every base shape. Indices are stable and stored in saves. */
export const ORIENTATIONS: readonly Shape[] = buildOrientations();

export const TOTAL_WEIGHT = ORIENTATIONS.reduce((a, o) => a + o.weight, 0);

export function getShape(index: number): Shape | undefined {
  return Number.isInteger(index) ? ORIENTATIONS[index] : undefined;
}

/** UV centre of a shape in its own cell space: mean of cell centres. */
export function shapeCenter(shape: Shape): UvCenter {
  const n = shape.cells.length;
  return [
    shape.cells.reduce((a, p) => a + p[1], 0) / n + 0.5,
    shape.cells.reduce((a, p) => a + p[0], 0) / n + 0.5,
  ];
}
