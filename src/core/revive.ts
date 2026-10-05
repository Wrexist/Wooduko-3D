// Revive: a second chance after "No room left". Pure.
import { ADS, BOARD } from '../config';
import { applyClear } from './board';
import { createRng, dealTray } from './generator';
import type { ClearResult, Cell, GameState } from './types';

const N = BOARD.size;
const B = BOARD.box;

export const canRevive = (s: GameState): boolean => s.over && s.revives < ADS.maxRevives;

/** The 3×3 square with the most filled cells (first one wins ties). */
export function fullestBox(s: GameState): number {
  let best = 0;
  let most = -1;
  for (let i = 0; i < N; i++) {
    let n = 0;
    for (let k = 0; k < N; k++) {
      const r = Math.floor(i / B) * B + Math.floor(k / B);
      const c = (i % B) * B + (k % B);
      if (s.board.grid[r]?.[c]) n++;
    }
    if (n > most) {
      most = n;
      best = i;
    }
  }
  return best;
}

/**
 * Clear the fullest 3×3 square (blocks crossing it split like a normal clear) and deal a fresh
 * tray that fits. No points; the combo resets. Returns the cleared cells for the effects.
 */
export function revive(s: GameState): { state: GameState; cleared: ClearResult } {
  const box = fullestBox(s);
  const cells: Cell[] = [];
  for (let k = 0; k < N; k++) {
    const r = Math.floor(box / B) * B + Math.floor(k / B);
    const c = (box % B) * B + (k % B);
    if (s.board.grid[r]?.[c]) cells.push([r, c]);
  }
  const cleared: ClearResult = { cells, units: 0, list: [{ kind: 'box', index: box }] };
  const board = applyClear(s.board, cleared).board;
  const rng = createRng(s.rng);
  const deal = dealTray(board, rng, { score: s.score, sinceSmall: s.sinceSmall });
  return {
    state: {
      ...s,
      board,
      tray: deal.pieces,
      sinceSmall: deal.sinceSmall,
      streak: 0,
      misses: 0,
      revives: s.revives + 1,
      rng: rng.state,
      over: false,
    },
    cleared,
  };
}

export interface AdContext {
  readonly sessions: number;
  readonly gamesPlayed: number;
  readonly gamesSinceAd: number;
  readonly msSinceAd: number;
  readonly removeAds: boolean;
}

/** Interstitials: only between games, never early, never often, never for Remove ads owners. */
export const shouldShowInterstitial = (c: AdContext): boolean =>
  !c.removeAds &&
  c.sessions >= ADS.firstAdSession &&
  c.gamesPlayed >= ADS.firstAdGames &&
  c.gamesSinceAd >= ADS.everyGames &&
  c.msSinceAd >= ADS.minGapMs;
