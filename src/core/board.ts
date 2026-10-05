import { BOARD } from '../config';
import type { BoardState, Cell, ClearResult, ClearUnit, Group, Shape, UvCenter, WoodSeed } from './types';

const N = BOARD.size;
const B = BOARD.box;

export function emptyBoard(): BoardState {
  return { grid: Array.from({ length: N }, () => Array<number>(N).fill(0)), groups: [], nextId: 1 };
}

export const inBounds = (r: number, c: number): boolean => r >= 0 && r < N && c >= 0 && c < N;

export const cellAt = (board: BoardState, r: number, c: number): number => board.grid[r]?.[c] ?? 0;

/** True if every cell of `cells` offset by (r0, c0) is inside the board and empty. */
export function canPlace(board: BoardState, cells: readonly Cell[], r0: number, c0: number): boolean {
  for (const [r, c] of cells) {
    const rr = r + r0;
    const cc = c + c0;
    if (!inBounds(rr, cc) || cellAt(board, rr, cc) !== 0) return false;
  }
  return true;
}

export function canFitAnywhere(board: BoardState, shape: Shape): boolean {
  for (let r = 0; r <= N - shape.h; r++) {
    for (let c = 0; c <= N - shape.w; c++) if (canPlace(board, shape.cells, r, c)) return true;
  }
  return false;
}

export const offsetCells = (cells: readonly Cell[], r0: number, c0: number): Cell[] =>
  cells.map(([r, c]): Cell => [r + r0, c + c0]);

function setCells(grid: number[][], cells: readonly Cell[], id: number): void {
  for (const [r, c] of cells) {
    const row = grid[r];
    if (row) row[c] = id;
  }
}

/** Place cells as a new group. Caller must have checked `canPlace`. */
export function place(
  board: BoardState,
  cells: readonly Cell[],
  center: UvCenter,
  seed: WoodSeed,
): { board: BoardState; group: Group } {
  const group: Group = { id: board.nextId, cells, center, seed };
  const grid = board.grid.map((row) => row.slice());
  setCells(grid, cells, group.id);
  return { board: { grid, groups: [...board.groups, group], nextId: board.nextId + 1 }, group };
}

function unitCells(kind: ClearUnit['kind'], i: number): Cell[] {
  const out: Cell[] = [];
  for (let k = 0; k < N; k++) {
    if (kind === 'row') out.push([i, k]);
    else if (kind === 'col') out.push([k, i]);
    else out.push([Math.floor(i / B) * B + Math.floor(k / B), (i % B) * B + (k % B)]);
  }
  return out;
}

/** Every full row, column and 3×3 box, found at once. */
export function findClears(occupied: (r: number, c: number) => boolean): ClearResult {
  const hit = new Set<number>();
  const list: ClearUnit[] = [];
  for (const kind of ['row', 'col', 'box'] as const) {
    for (let i = 0; i < N; i++) {
      const cells = unitCells(kind, i);
      if (cells.every(([r, c]) => occupied(r, c))) {
        list.push({ kind, index: i });
        for (const [r, c] of cells) hit.add(r * N + c);
      }
    }
  }
  const cells = [...hit].sort((a, b) => a - b).map((k): Cell => [Math.floor(k / N), k % N]);
  return { cells, units: list.length, list };
}

export const findBoardClears = (board: BoardState): ClearResult =>
  findClears((r, c) => cellAt(board, r, c) !== 0);

/** Clears that would happen if `cells` were placed at (r0, c0). Used for the drag preview. */
export function previewClears(
  board: BoardState,
  cells: readonly Cell[],
  r0: number,
  c0: number,
): ClearResult {
  const extra = new Set(cells.map(([r, c]) => (r + r0) * N + (c + c0)));
  return findClears((r, c) => cellAt(board, r, c) !== 0 || extra.has(r * N + c));
}

/** 4-connected components of a cell set. */
export function components(cells: readonly Cell[]): Cell[][] {
  const left = new Set(cells.map(([r, c]) => r * N + c));
  const out: Cell[][] = [];
  for (const [sr, sc] of cells) {
    const start = sr * N + sc;
    if (!left.has(start)) continue;
    left.delete(start);
    const comp: Cell[] = [];
    const stack = [start];
    for (let k = stack.pop(); k !== undefined; k = stack.pop()) {
      const r = Math.floor(k / N);
      const c = k % N;
      comp.push([r, c]);
      const near: Cell[] = [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ];
      for (const [a, b] of near) {
        const kk = a * N + b;
        if (inBounds(a, b) && left.has(kk)) {
          left.delete(kk);
          stack.push(kk);
        }
      }
    }
    out.push(comp);
  }
  return out;
}

export interface ClearApplied {
  readonly board: BoardState;
  /** Groups that lost cells, with the cells they lost. Their meshes must be removed. */
  readonly removed: readonly { readonly group: Group; readonly cells: readonly Cell[] }[];
  /** New groups from the leftover pieces; same seed and UV centre as their parent. */
  readonly created: readonly Group[];
}

/** Remove the cleared cells. Each touched group splits into its 4-connected leftovers. */
export function applyClear(board: BoardState, clear: ClearResult): ClearApplied {
  const cleared = new Set(clear.cells.map(([r, c]) => r * N + c));
  const removed: { group: Group; cells: Cell[] }[] = [];
  const created: Group[] = [];
  const groups: Group[] = [];
  const grid = board.grid.map((row) => row.slice());
  let nextId = board.nextId;
  for (const g of board.groups) {
    const lost = g.cells.filter(([r, c]) => cleared.has(r * N + c));
    if (!lost.length) {
      groups.push(g);
      continue;
    }
    removed.push({ group: g, cells: lost });
    setCells(grid, lost, 0);
    const rest = g.cells.filter(([r, c]) => !cleared.has(r * N + c));
    for (const comp of components(rest)) {
      const ng: Group = { id: nextId++, cells: comp, center: g.center, seed: g.seed };
      setCells(grid, comp, ng.id);
      groups.push(ng);
      created.push(ng);
    }
  }
  return { board: { grid, groups, nextId }, removed, created };
}

export const isBoardEmpty = (board: BoardState): boolean => board.groups.length === 0;

/** Empty cells that are the last gap of a row, column or 3×3 box ("almost there" hints). */
export function lastGaps(board: BoardState): Cell[] {
  const out = new Set<number>();
  for (const kind of ['row', 'col', 'box'] as const) {
    for (let i = 0; i < N; i++) {
      const empty = unitCells(kind, i).filter(([r, c]) => cellAt(board, r, c) === 0);
      const gap = empty[0];
      if (empty.length === 1 && gap) out.add(gap[0] * N + gap[1]);
    }
  }
  return [...out].sort((a, b) => a - b).map((k): Cell => [Math.floor(k / N), k % N]);
}
