import { describe, expect, it } from 'vitest';
import { ADS } from '../src/config';
import { canFitAnywhere } from '../src/core/board';
import { canRevive, fullestBox, revive, shouldShowInterstitial } from '../src/core/revive';
import { getShape } from '../src/core/shapes';
import type { GameState } from '../src/core/types';
import { checkerboard, SEED } from './helpers';

const over = (): GameState => ({
  board: checkerboard(),
  tray: [{ shapeIndex: 13, seed: SEED }, null, null],
  score: 1200,
  streak: 3,
  misses: 1,
  sinceSmall: 2,
  revives: 0,
  rng: 99,
  over: true,
});

describe('revive', () => {
  it('only after game over, once per game', () => {
    expect(canRevive(over())).toBe(true);
    expect(canRevive({ ...over(), over: false })).toBe(false);
    expect(canRevive({ ...over(), revives: ADS.maxRevives })).toBe(false);
  });

  it('clears the fullest 3×3 square and deals a tray that fits', () => {
    const s = over();
    const box = fullestBox(s);
    const { state, cleared } = revive(s);
    expect(cleared.list).toEqual([{ kind: 'box', index: box }]);
    const r0 = Math.floor(box / 3) * 3;
    const c0 = (box % 3) * 3;
    for (let r = r0; r < r0 + 3; r++)
      for (let c = c0; c < c0 + 3; c++) expect(state.board.grid[r]?.[c]).toBe(0);
    expect(state.over).toBe(false);
    expect(state.revives).toBe(1);
    expect(state.score).toBe(1200);
    expect(state.streak).toBe(0);
    expect(state.misses).toBe(0);
    expect(
      state.tray.some((p) => {
        const sh = p ? getShape(p.shapeIndex) : undefined;
        return sh !== undefined && canFitAnywhere(state.board, sh);
      }),
    ).toBe(true);
  });
});

describe('interstitial policy', () => {
  const ok = { sessions: 5, gamesPlayed: 10, gamesSinceAd: 5, msSinceAd: 10 * 60_000, removeAds: false };
  it('shows only when every rule allows it', () => {
    expect(shouldShowInterstitial(ok)).toBe(true);
    expect(shouldShowInterstitial({ ...ok, removeAds: true })).toBe(false);
    expect(shouldShowInterstitial({ ...ok, sessions: ADS.firstAdSession - 1 })).toBe(false);
    expect(shouldShowInterstitial({ ...ok, gamesPlayed: ADS.firstAdGames - 1 })).toBe(false);
    expect(shouldShowInterstitial({ ...ok, gamesSinceAd: ADS.everyGames - 1 })).toBe(false);
    expect(shouldShowInterstitial({ ...ok, msSinceAd: ADS.minGapMs - 1 })).toBe(false);
  });
});
