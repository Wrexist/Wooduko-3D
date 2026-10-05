import { emptyBoard, place } from '../src/core/board';
import { ORIENTATIONS } from '../src/core/shapes';
import type { BoardState, Cell, WoodSeed } from '../src/core/types';

export const SEED: WoodSeed = { a: 1, s: 1, jx: 0, jy: 0, t: 0.9 };

/**
 * Build a board from 9 rows of text. Each distinct letter/digit becomes one group;
 * `.` is empty. Missing rows are empty.
 */
export function boardFrom(rows: readonly string[]): BoardState {
  const byChar = new Map<string, Cell[]>();
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '.' || ch === ' ') return;
      const list = byChar.get(ch) ?? [];
      list.push([r, c]);
      byChar.set(ch, list);
    });
  });
  let board = emptyBoard();
  for (const cells of byChar.values()) board = place(board, cells, [0, 0], SEED).board;
  return board;
}

/** Board with every cell filled as one group per cell, except the listed holes. */
export function fullBoardExcept(holes: readonly Cell[]): BoardState {
  const skip = new Set(holes.map(([r, c]) => r * 9 + c));
  let board = emptyBoard();
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) if (!skip.has(r * 9 + c)) board = place(board, [[r, c]], [0, 0], SEED).board;
  }
  return board;
}

export function shapeIndexOf(baseId: string, n = 0): number {
  const list = ORIENTATIONS.filter((o) => o.baseId === baseId);
  const s = list[n];
  if (!s) throw new Error(`no orientation ${n} of ${baseId}`);
  return s.index;
}

export const grid = (board: BoardState): string[] =>
  board.grid.map((row) => row.map((v) => (v ? '#' : '.')).join(''));

/** Cells with odd (r + c) filled, one group each: no full units, no two adjacent holes. */
export function checkerboard(): BoardState {
  let board = emptyBoard();
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) if ((r + c) % 2 === 1) board = place(board, [[r, c]], [0, 0], SEED).board;
  }
  return board;
}
