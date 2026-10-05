import { SCORING } from '../config';

export const placementPoints = (cellCount: number): number => cellCount * SCORING.perCell;

/** Points for clearing `units` rows/cols/boxes at once, at the given (already incremented) streak. */
export function clearPoints(units: number, streak: number): number {
  if (units <= 0) return 0;
  const base = SCORING.unitLinear * units + SCORING.unitPair * units * (units - 1);
  return Math.round(base * (1 + SCORING.streakStep * (Math.max(1, streak) - 1)));
}

export const boardClearBonus = (boardEmpty: boolean): number => (boardEmpty ? SCORING.boardClear : 0);
