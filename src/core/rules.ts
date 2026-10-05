import { COMBO, GENERATOR } from '../config';
import type { GeneratorConfig } from '../config';
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

/** Tunable rules, overridable by the playtest simulator. */
export interface RuleSet {
  readonly generator: GeneratorConfig;
  /** Misses a live streak survives (see `COMBO`). */
  readonly grace: number;
}

export const RULES: RuleSet = { generator: GENERATOR, grace: COMBO.grace };

/**
 * Combo rule: +1 for every placement that clears. A placement that clears nothing is a miss;
 * a live streak survives `grace` misses in a row and resets on the next one.
 */
export function nextCombo(
  streak: number,
  misses: number,
  units: number,
  grace: number = RULES.grace,
): { streak: number; misses: number } {
  if (units > 0) return { streak: streak + 1, misses: 0 };
  if (streak > 0 && misses < grace) return { streak, misses: misses + 1 };
  return { streak: 0, misses: 0 };
}

export function pieceFits(board: BoardState, piece: Piece | null): boolean {
  const shape = piece ? getShape(piece.shapeIndex) : undefined;
  return shape !== undefined && canFitAnywhere(board, shape);
}

/** Per slot: can this piece be placed anywhere? Empty slots report false. */
export const trayFits = (board: BoardState, tray: Tray): boolean[] => tray.map((p) => pieceFits(board, p));

/** Game over when the tray has pieces but none of them fits anywhere. */
export const isGameOver = (board: BoardState, tray: Tray): boolean =>
  tray.some((p) => p !== null) && !tray.some((p) => pieceFits(board, p));

export function newGame(rngState: number, rules: RuleSet = RULES): GameState {
  const rng = createRng(rngState);
  const board = emptyBoard();
  const deal = dealTray(board, rng, { score: 0, sinceSmall: 0 }, rules.generator);
  return {
    board,
    tray: deal.pieces,
    score: 0,
    streak: 0,
    misses: 0,
    sinceSmall: deal.sinceSmall,
    revives: 0,
    rng: rng.state,
    over: false,
  };
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
export function playMove(
  state: GameState,
  slot: number,
  r0: number,
  c0: number,
  rules: RuleSet = RULES,
): MoveResult | null {
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
  const combo = nextCombo(state.streak, state.misses, clear.units, rules.grace);
  const streak = combo.streak;
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
  const score = state.score + points;

  let tray: Tray = state.tray.map((p, i) => (i === slot ? null : p));
  let dealt: Piece[] | null = null;
  const rng = createRng(state.rng);
  let sinceSmall = state.sinceSmall;
  if (tray.every((p) => p === null)) {
    const deal = dealTray(board, rng, { score, sinceSmall }, rules.generator);
    dealt = deal.pieces;
    sinceSmall = deal.sinceSmall;
    tray = dealt;
  }
  const over = isGameOver(board, tray);

  return {
    state: {
      board,
      tray,
      score,
      streak: over ? 0 : streak,
      misses: over ? 0 : combo.misses,
      sinceSmall,
      revives: state.revives,
      rng: rng.state,
      over,
    },
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
  let { tray, rng, sinceSmall } = state;
  if (tray.length !== GENERATOR.traySize || tray.every((p) => p === null)) {
    const r = createRng(rng);
    const deal = dealTray(state.board, r, { score: state.score, sinceSmall });
    tray = deal.pieces;
    sinceSmall = deal.sinceSmall;
    rng = r.state;
  }
  return { ...state, tray, rng, sinceSmall, over: isGameOver(state.board, tray) };
}
