import { SCORING } from '../config';

export const placementPoints = (cellCount: number): number => cellCount * SCORING.perCell;

/** Points for clearing `units` rows/cols/boxes at once, at the given (already incremented) streak. */
export function clearPoints(units: number, streak: number): number {
  if (units <= 0) return 0;
  const base = SCORING.unitLinear * units + SCORING.unitPair * units * (units - 1);
  return Math.round(base * (1 + SCORING.streakStep * (Math.max(1, streak) - 1)));
}

export const boardClearBonus = (boardEmpty: boolean): number => (boardEmpty ? SCORING.boardClear : 0);

/**
 * Reward ladder for feedback (not points): 1 line < 2 lines / combo ×2 < 3 lines / combo ×3+
 * < 4+ lines < board clear. Every effect scales from this one number.
 */
export function rewardTier(units: number, streak: number, boardClear: boolean): 1 | 2 | 3 | 4 | 5 {
  if (boardClear) return 5;
  if (units >= 4) return 4;
  if (units === 3 || streak >= 3) return 3;
  if (units === 2 || streak === 2) return 2;
  return 1;
}
