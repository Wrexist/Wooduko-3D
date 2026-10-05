import { describe, expect, it } from 'vitest';
import {
  applyClear,
  canFitAnywhere,
  canPlace,
  components,
  emptyBoard,
  findBoardClears,
  place,
  previewClears,
} from '../src/core/board';
import { ORIENTATIONS } from '../src/core/shapes';
import type { Cell } from '../src/core/types';
import { boardFrom, fullBoardExcept, grid, SEED, shapeIndexOf } from './helpers';

const shape = (baseId: string, n = 0) => {
  const s = ORIENTATIONS[shapeIndexOf(baseId, n)];
  if (!s) throw new Error('missing shape');
  return s;
};

describe('canPlace', () => {
  const sq = shape('o4').cells;

  it('accepts an empty spot, including the corners', () => {
    const b = emptyBoard();
    expect(canPlace(b, sq, 0, 0)).toBe(true);
    expect(canPlace(b, sq, 7, 7)).toBe(true);
  });

  it('rejects out of bounds on every side', () => {
    const b = emptyBoard();
    expect(canPlace(b, sq, -1, 0)).toBe(false);
    expect(canPlace(b, sq, 0, -1)).toBe(false);
    expect(canPlace(b, sq, 8, 0)).toBe(false);
    expect(canPlace(b, sq, 0, 8)).toBe(false);
  });

  it('rejects overlap with any occupied cell', () => {
    const b = boardFrom(['', '.a']);
    expect(canPlace(b, sq, 0, 0)).toBe(false);
    expect(canPlace(b, sq, 1, 1)).toBe(false);
    expect(canPlace(b, sq, 2, 2)).toBe(true);
  });
});

describe('canFitAnywhere', () => {
  it('finds the only hole', () => {
    const b = fullBoardExcept([[4, 4]]);
    expect(canFitAnywhere(b, shape('mono'))).toBe(true);
    expect(canFitAnywhere(b, shape('i2'))).toBe(false);
  });

  it('respects orientation', () => {
    const b = fullBoardExcept([
      [0, 0],
      [1, 0],
    ]);
    const vertical = ORIENTATIONS.find((o) => o.baseId === 'i2' && o.h === 2);
    const horizontal = ORIENTATIONS.find((o) => o.baseId === 'i2' && o.w === 2);
    expect(vertical && canFitAnywhere(b, vertical)).toBe(true);
    expect(horizontal && canFitAnywhere(b, horizontal)).toBe(false);
  });
});

describe('place', () => {
  it('writes the group id, appends the group, bumps nextId and leaves the input untouched', () => {
    const b0 = emptyBoard();
    const { board, group } = place(b0, [[2, 3]], [3.5, 2.5], SEED);
    expect(group.id).toBe(1);
    expect(board.grid[2]?.[3]).toBe(1);
    expect(board.nextId).toBe(2);
    expect(board.groups).toHaveLength(1);
    expect(b0.grid[2]?.[3]).toBe(0);
    expect(b0.groups).toHaveLength(0);
  });
});

describe('findClears', () => {
  it('finds nothing on an empty board', () => {
    expect(findBoardClears(emptyBoard())).toEqual({ cells: [], units: 0, list: [] });
  });

  it('finds a full row', () => {
    const r = findBoardClears(boardFrom(['', '', '', 'aaaaaaaaa']));
    expect(r.units).toBe(1);
    expect(r.list).toEqual([{ kind: 'row', index: 3 }]);
    expect(r.cells).toHaveLength(9);
    expect(r.cells.every(([row]) => row === 3)).toBe(true);
  });

  it('finds a full column', () => {
    const rows = Array.from({ length: 9 }, () => '.....a');
    const r = findBoardClears(boardFrom(rows));
    expect(r.list).toEqual([{ kind: 'col', index: 5 }]);
    expect(r.cells.every(([, c]) => c === 5)).toBe(true);
  });

  it('finds a full 3×3 box with the right index', () => {
    const r = findBoardClears(boardFrom(['', '', '', '......aaa', '......aaa', '......aaa']));
    expect(r.list).toEqual([{ kind: 'box', index: 5 }]);
    expect(r.cells).toHaveLength(9);
  });

  it('does not clear an almost-full row', () => {
    expect(findBoardClears(boardFrom(['aaaaaaaa.'])).units).toBe(0);
  });

  it('combines row + column + box and dedupes the union', () => {
    const rows = ['aaabbbbbb', 'aaa......', 'aaa......', 'c', 'c', 'c', 'c', 'c', 'c'];
    const r = findBoardClears(boardFrom(rows));
    expect(r.units).toBe(3);
    expect(r.list).toEqual([
      { kind: 'row', index: 0 },
      { kind: 'col', index: 0 },
      { kind: 'box', index: 0 },
    ]);
    // row (9) + col (9) + box (9) − overlaps: row∩col 1, row∩box 3, col∩box 3, all three 1 → 9+9+9−3−3−1+1 = 21
    expect(r.cells).toHaveLength(21);
    const keys = r.cells.map(([a, b]) => a * 9 + b);
    expect([...keys].sort((x, y) => x - y)).toEqual(keys);
  });

  it('counts two rows as two units', () => {
    expect(findBoardClears(boardFrom(['aaaaaaaaa', 'bbbbbbbbb'])).units).toBe(2);
  });

  it('previewClears sees the clear a placement would cause without changing the board', () => {
    const b = boardFrom(['aaaaaaa..']);
    const r = previewClears(b, shape('i2', 0).w === 2 ? shape('i2', 0).cells : shape('i2', 1).cells, 0, 7);
    expect(r.list).toEqual([{ kind: 'row', index: 0 }]);
    expect(findBoardClears(b).units).toBe(0);
  });
});

describe('components', () => {
  it('splits into 4-connected parts (diagonals do not connect)', () => {
    const cells: Cell[] = [
      [0, 0],
      [0, 1],
      [1, 1],
      [2, 2],
      [3, 2],
      [5, 5],
    ];
    const parts = components(cells)
      .map((p) => p.length)
      .sort();
    expect(parts).toEqual([1, 2, 3]);
  });

  it('returns nothing for no cells', () => {
    expect(components([])).toEqual([]);
  });
});

describe('applyClear', () => {
  it('splits a group crossed by a cleared row, keeping seed and UV centre', () => {
    // A vertical i3 in column 0 rows 0..2, row 1 is otherwise full.
    let board = emptyBoard();
    const seed = { a: 2, s: 1.1, jx: 0.01, jy: -0.02, t: 0.9 };
    board = place(
      board,
      [
        [0, 0],
        [1, 0],
        [2, 0],
      ],
      [0.5, 1.5],
      seed,
    ).board;
    board = place(
      board,
      Array.from({ length: 8 }, (_, i): Cell => [1, i + 1]),
      [5, 1.5],
      SEED,
    ).board;
    const clear = findBoardClears(board);
    expect(clear.units).toBe(1);
    const res = applyClear(board, clear);

    expect(grid(res.board)[1]).toBe('.........');
    expect(res.removed.map((r) => r.group.id).sort()).toEqual([1, 2]);
    expect(res.created).toHaveLength(2);
    for (const g of res.created) {
      expect(g.cells).toHaveLength(1);
      expect(g.seed).toBe(seed);
      expect(g.center).toEqual([0.5, 1.5]);
    }
    expect(res.board.groups).toHaveLength(2);
    // grid ids match the new groups
    for (const g of res.board.groups) for (const [r, c] of g.cells) expect(res.board.grid[r]?.[c]).toBe(g.id);
  });

  it('removes a group entirely when all its cells clear', () => {
    const board = boardFrom(['aaaaaaaaa', 'b']);
    const res = applyClear(board, findBoardClears(board));
    expect(res.created).toHaveLength(0);
    expect(res.board.groups).toHaveLength(1);
    expect(grid(res.board)[0]).toBe('.........');
  });

  it('leaves untouched groups as they are', () => {
    const board = boardFrom(['aaaaaaaaa', '', '', '', 'z']);
    const z = board.groups.find((g) => g.cells[0]?.[0] === 4);
    const res = applyClear(board, findBoardClears(board));
    expect(res.board.groups).toContain(z);
  });
});
