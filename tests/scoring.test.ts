import { describe, expect, it } from 'vitest';
import { boardClearBonus, clearPoints, placementPoints, rewardTier } from '../src/core/scoring';

describe('scoring', () => {
  it('gives 1 point per placed cell', () => {
    expect(placementPoints(1)).toBe(1);
    expect(placementPoints(5)).toBe(5);
  });

  // base = 18·u + 9·u·(u−1); points = round(base · (1 + 0.5·(streak−1)))
  it.each([
    [0, 1, 0],
    [1, 1, 18],
    [2, 1, 54],
    [3, 1, 108],
    [4, 1, 180],
    [1, 2, 27],
    [1, 3, 36],
    [2, 2, 81],
    [3, 3, 216],
    [4, 5, 540],
  ])('units %i at streak %i → %i', (units, streak, expected) => {
    expect(clearPoints(units, streak)).toBe(expected);
  });

  it('rounds fractional results', () => {
    // 1 unit, streak 2 → 18 · 1.5 = 27 (exact); 3 units at streak 2 → 108 · 1.5 = 162
    expect(clearPoints(3, 2)).toBe(162);
  });

  it('board clear is +150', () => {
    expect(boardClearBonus(true)).toBe(150);
    expect(boardClearBonus(false)).toBe(0);
  });
});

describe('reward ladder', () => {
  it('orders 1 line < 2 lines < combo ×3 < 4+ lines < board clear', () => {
    const ladder = [
      rewardTier(1, 1, false),
      rewardTier(2, 1, false),
      rewardTier(1, 3, false),
      rewardTier(4, 1, false),
      rewardTier(1, 1, true),
    ];
    expect(ladder).toEqual([1, 2, 3, 4, 5]);
    expect(rewardTier(1, 2, false)).toBe(2);
    expect(rewardTier(3, 1, false)).toBe(3);
  });
});
