// Lifetime stats and achievements. Pure: no DOM, no Three.js, no storage.
import { QUESTS } from '../config';
import type { ThemeSpec } from '../config';
import type { MoveResult } from './rules';

export interface Stats {
  readonly gamesPlayed: number;
  /** Sum of final scores, for the average. */
  readonly totalScore: number;
  readonly bestScore: number;
  /** Rows + columns + boxes cleared. */
  readonly linesCleared: number;
  readonly bestCombo: number;
  readonly boardClears: number;
  /** Most units cleared by one placement. */
  readonly biggestClear: number;
  readonly piecesPlaced: number;
  /** Longest run of days with every daily quest completed. */
  readonly questStreak: number;
}

export const emptyStats = (): Stats => ({
  gamesPlayed: 0,
  totalScore: 0,
  bestScore: 0,
  linesCleared: 0,
  bestCombo: 0,
  boardClears: 0,
  biggestClear: 0,
  piecesPlaced: 0,
  questStreak: 0,
});

export const averageScore = (s: Stats): number =>
  s.gamesPlayed ? Math.round(s.totalScore / s.gamesPlayed) : 0;

/** Fold one placement into the lifetime stats. */
export function statsAfterMove(s: Stats, m: MoveResult): Stats {
  return {
    ...s,
    piecesPlaced: s.piecesPlaced + 1,
    linesCleared: s.linesCleared + m.clear.units,
    bestCombo: Math.max(s.bestCombo, m.streak),
    boardClears: s.boardClears + (m.boardClear ? 1 : 0),
    biggestClear: Math.max(s.biggestClear, m.clear.units),
    bestScore: Math.max(s.bestScore, m.state.score),
  };
}

/** A game ended (game over, or abandoned with a score). */
export function statsAfterGame(s: Stats, finalScore: number): Stats {
  return {
    ...s,
    gamesPlayed: s.gamesPlayed + 1,
    totalScore: s.totalScore + finalScore,
    bestScore: Math.max(s.bestScore, finalScore),
  };
}

export type AchievementId =
  | 'first-clear'
  | 'combo-3'
  | 'combo-5'
  | 'triple'
  | 'quad'
  | 'board-clear'
  | 'score-1k'
  | 'score-5k'
  | 'score-10k'
  | 'games-10'
  | 'lines-500'
  | 'quests-3'
  | 'quests-7';

export interface Achievement {
  readonly id: AchievementId;
  /** Title and description live in i18n as `ach.<id>` / `ach.<id>.desc`. */
  /** Earned given lifetime stats and the current game's score. */
  readonly earned: (s: Stats, gameScore: number) => boolean;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'first-clear',
    earned: (s) => s.linesCleared >= 1,
  },
  { id: 'combo-3', earned: (s) => s.bestCombo >= 3 },
  { id: 'combo-5', earned: (s) => s.bestCombo >= 5 },
  {
    id: 'triple',
    earned: (s) => s.biggestClear >= 3,
  },
  {
    id: 'quad',
    earned: (s) => s.biggestClear >= 4,
  },
  {
    id: 'board-clear',
    earned: (s) => s.boardClears >= 1,
  },
  {
    id: 'score-1k',
    earned: (s, g) => Math.max(g, s.bestScore) >= 1000,
  },
  {
    id: 'score-5k',
    earned: (s, g) => Math.max(g, s.bestScore) >= 5000,
  },
  {
    id: 'score-10k',
    earned: (s, g) => Math.max(g, s.bestScore) >= 10000,
  },
  { id: 'games-10', earned: (s) => s.gamesPlayed >= 10 },
  {
    id: 'lines-500',
    earned: (s) => s.linesCleared >= 500,
  },
  { id: 'quests-3', earned: (s) => s.questStreak >= QUESTS.oakDays },
  { id: 'quests-7', earned: (s) => s.questStreak >= QUESTS.mahoganyDays },
];

export type Unlocked = Readonly<Partial<Record<AchievementId, number>>>;

/** Achievements newly earned (not yet in `unlocked`), in list order. */
export function newlyEarned(unlocked: Unlocked, s: Stats, gameScore: number): AchievementId[] {
  return ACHIEVEMENTS.filter((a) => unlocked[a.id] === undefined && a.earned(s, gameScore)).map((a) => a.id);
}

export const themeUnlocked = (t: ThemeSpec, unlocked: Unlocked): boolean =>
  t.unlock === null || unlocked[t.unlock] !== undefined;

// ---------- persistence (input is untrusted JSON) ----------

export function parseStats(raw: string | null): Stats {
  const base = emptyStats();
  if (!raw) return base;
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return base;
    const o = v as Record<string, unknown>;
    const out: Record<string, number> = { ...base };
    for (const k of Object.keys(base)) {
      const x = o[k];
      if (typeof x === 'number' && Number.isInteger(x) && x >= 0) out[k] = x;
    }
    return out as unknown as Stats;
  } catch {
    return base;
  }
}

export function parseUnlocked(raw: string | null): Unlocked {
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    if (typeof v !== 'object' || v === null) return {};
    const out: Partial<Record<AchievementId, number>> = {};
    for (const a of ACHIEVEMENTS) {
      const t = (v as Record<string, unknown>)[a.id];
      if (typeof t === 'number' && Number.isFinite(t)) out[a.id] = t;
    }
    return out;
  } catch {
    return {};
  }
}

/** A finished game was revived: it isn't finished after all (it will be counted when it really ends). */
export function statsRevived(s: Stats, score: number): Stats {
  return {
    ...s,
    gamesPlayed: Math.max(0, s.gamesPlayed - 1),
    totalScore: Math.max(0, s.totalScore - score),
  };
}
