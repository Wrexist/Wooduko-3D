import { GENERATOR } from '../config';
import {
  applyClear,
  canFitAnywhere,
  canPlace,
  emptyBoard,
  findBoardClears,
  offsetCells,
  place,
} from './board';
import type { ClearApplied } from './board';
import { createRng, dealTray } from './generator';
import { boardClearBonus, clearPoints, placementPoints } from './scoring';
import { getShape, shapeCenter } from './shapes';
import type { BoardState, Cell, ClearResult, GameState, Group, Piece, Tray } from './types';

/** Combo rule: +1 for each consecutive placement that clears, reset to 0 on one that clears nothing. */
export const nextStreak = (streak: number, units: number): number => (units > 0 ? streak + 1 : 0);

export function pieceFits(board: BoardState, piece: Piece | null): boolean {
  const shape = piece ? getShape(piece.shapeIndex) : undefined;
  return shape !== undefined && canFitAnywhere(board, shape);
}

/** Per slot: can this piece be placed anywhere? Empty slots report false. */
export const trayFits = (board: BoardState, tray: Tray): boolean[] => tray.map((p) => pieceFits(board, p));

/** Game over when the tray has pieces but none of them fits anywhere. */
export const isGameOver = (board: BoardState, tray: Tray): boolean =>
  tray.some((p) => p !== null) && !tray.some((p) => pieceFits(board, p));

export function newGame(rngState: number): GameState {
  const rng = createRng(rngState);
  const board = emptyBoard();
  const tray = dealTray(board, rng);
  return { board, tray, score: 0, streak: 0, rng: rng.state, over: false };
}

export interface MoveResult {
  readonly state: GameState;
  /** The group as placed, before any clear. */
  readonly placed: Group;
  readonly cells: readonly Cell[];
  readonly placementPoints: number;
  readonly clear: ClearResult;
  /** Present when something cleared. */
  readonly applied: ClearApplied | null;
  readonly clearPoints: number;
  /** Streak after this move (the state's streak is reset to 0 on game over). */
  readonly streak: number;
  readonly boardClear: boolean;
  readonly bonus: number;
  /** Total points this move (placement + clear + bonus). */
  readonly points: number;
  /** New tray when the last piece was used. */
  readonly dealt: readonly Piece[] | null;
}

/** Place tray piece `slot` with its top-left at (r0, c0). Returns null if the move is illegal. */
export function playMove(state: GameState, slot: number, r0: number, c0: number): MoveResult | null {
  if (state.over) return null;
  const piece = state.tray[slot];
  const shape = piece ? getShape(piece.shapeIndex) : undefined;
  if (!piece || !shape || !canPlace(state.board, shape.cells, r0, c0)) return null;

  const cells = offsetCells(shape.cells, r0, c0);
  const [cx, cy] = shapeCenter(shape);
  const placedRes = place(state.board, cells, [cx + c0, cy + r0], piece.seed);
  let board = placedRes.board;

  const pPoints = placementPoints(cells.length);
  const clear = findBoardClears(board);
  const streak = nextStreak(state.streak, clear.units);
  let applied: ClearApplied | null = null;
  let cPoints = 0;
  let boardClear = false;
  if (clear.units > 0) {
    applied = applyClear(board, clear);
    board = applied.board;
    cPoints = clearPoints(clear.units, streak);
    boardClear = board.groups.length === 0;
  }
  const bonus = boardClearBonus(boardClear);
  const points = pPoints + cPoints + bonus;

  let tray: Tray = state.tray.map((p, i) => (i === slot ? null : p));
  let dealt: Piece[] | null = null;
  const rng = createRng(state.rng);
  if (tray.every((p) => p === null)) {
    dealt = dealTray(board, rng);
    tray = dealt;
  }
  const over = isGameOver(board, tray);

  return {
    state: { board, tray, score: state.score + points, streak: over ? 0 : streak, rng: rng.state, over },
    placed: placedRes.group,
    cells,
    placementPoints: pPoints,
    clear,
    applied,
    clearPoints: cPoints,
    streak,
    boardClear,
    bonus,
    points,
    dealt,
  };
}

/** Make sure a loaded state has a usable tray and a correct `over` flag. */
export function normalizeLoaded(state: GameState): GameState {
  let { tray, rng } = state;
  if (tray.length !== GENERATOR.traySize || tray.every((p) => p === null)) {
    const r = createRng(rng);
    tray = dealTray(state.board, r);
    rng = r.state;
  }
  return { ...state, tray, rng, over: isGameOver(state.board, tray) };
}
