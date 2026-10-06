// A goal-aware playtest bot for Journey levels (skilled play + a pull toward crates and gems).
import { canPlace } from '../../src/core/board';
import { createRng, nextFloat } from '../../src/core/generator';
import { applyRunMove, cellKey, levelGame, runOutcome, startRun } from '../../src/core/journey';
import type { LevelRun, LevelSpec } from '../../src/core/journey';
import { playMove } from '../../src/core/rules';
import type { MoveResult } from '../../src/core/rules';
import { getShape } from '../../src/core/shapes';
import type { GameState } from '../../src/core/types';
import { skilled } from './bot';

export function pickMove(run: LevelRun, s: GameState, seed: number, noise: number): MoveResult | null {
  const rng = createRng(seed);
  const targets = new Set([...run.crates, ...run.gems]);
  const gems = new Set(run.gems);
  let best: MoveResult | null = null;
  let bestScore = -Infinity;
  s.tray.forEach((p, slot) => {
    const sh = p ? getShape(p.shapeIndex) : undefined;
    if (!sh) return;
    for (let r = 0; r + sh.h <= 9; r++)
      for (let c = 0; c + sh.w <= 9; c++) {
        if (!canPlace(s.board, sh.cells, r, c)) continue;
        const m = playMove(s, slot, r, c);
        if (!m) continue;
        let score = skilled.score(s, m, rng);
        score += m.clear.cells.filter(([rr, cc]) => targets.has(cellKey(rr, cc))).length * 60;
        score += m.cells.filter(([rr, cc]) => gems.has(cellKey(rr, cc))).length * 8;
        score += unitPull(m, targets);
        score += nextFloat(rng) * noise;
        if (score > bestScore) {
          bestScore = score;
          best = m;
        }
      }
  });
  return best;
}

/**
 * What a player aiming at goals does: fill the rows, columns and squares that hold targets, so
 * the next clear takes them. Rewards how full those units are after the move (squared).
 */
function unitPull(m: MoveResult, targets: ReadonlySet<number>): number {
  if (!targets.size) return 0;
  const g = m.state.board.grid;
  let pull = 0;
  for (let i = 0; i < 9; i++) {
    let rowT = 0;
    let rowF = 0;
    let colT = 0;
    let colF = 0;
    let boxT = 0;
    let boxF = 0;
    for (let k = 0; k < 9; k++) {
      if (targets.has(cellKey(i, k))) rowT++;
      if (g[i]?.[k]) rowF++;
      if (targets.has(cellKey(k, i))) colT++;
      if (g[k]?.[i]) colF++;
      const br = Math.floor(i / 3) * 3 + Math.floor(k / 3);
      const bc = (i % 3) * 3 + (k % 3);
      if (targets.has(cellKey(br, bc))) boxT++;
      if (g[br]?.[bc]) boxF++;
    }
    pull += rowT * (rowF / 9) ** 2 + colT * (colF / 9) ** 2 + boxT * (boxF / 9) ** 2;
  }
  return pull * 30;
}

export interface Attempt {
  readonly won: boolean;
  /** Moves used (when won). */
  readonly used: number;
  /** Score at the moment the goals were met (before the moves bonus). */
  readonly score: number;
}

/** Play until the goals are met or the board jams (no move limit unless `limit`). */
export function playLevel(spec: LevelSpec, seed: number, noise: number, limit = 120): Attempt {
  let s = levelGame(spec, seed);
  let run: LevelRun = { ...startRun(spec), movesLeft: limit };
  for (let i = 0; i < limit; i++) {
    const m = pickMove(run, s, seed * 31 + i, noise);
    if (!m) return { won: false, used: i, score: s.score };
    s = m.state;
    run = applyRunMove(run, m);
    const out = runOutcome(spec, run, s);
    if (out === 'won') return { won: true, used: i + 1, score: s.score };
    if (out !== 'playing') return { won: false, used: i + 1, score: s.score };
  }
  return { won: false, used: limit, score: s.score };
}
