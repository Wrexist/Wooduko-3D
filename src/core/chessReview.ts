// Workshop → Chess: game review and opening names (pure; no Three.js / DOM).
import {
  F_CAPTURE,
  F_CASTLE,
  F_EP,
  inCheck,
  legalMoves,
  makeMove,
  MATE,
  mFlags,
  mFrom,
  mPromo,
  mTo,
  PAWN,
  unmakeMove,
} from './chess';
import type { Pos } from './chess';
import { gradeOf } from './chessSchool';
import type { Grade } from './chessSchool';

/** Centipawns as a winning chance for White, 0..100 (Lichess's curve, so numbers match players' feel). */
export function winChance(cp: number): number {
  if (cp > MATE - 200) return 100;
  if (cp < -MATE + 200) return 0;
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

/** One move's accuracy (0..100) from the mover's winning chance before and after it. */
export function moveAccuracy(before: number, after: number): number {
  const drop = Math.max(0, before - after);
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669));
}

/** A reviewed move: its grade, the better move, and the score after it (White's view). */
export interface MoveNote {
  readonly ply: number;
  readonly move: number;
  readonly best: number;
  readonly grade: Grade;
  /** White's view, centipawns, after the move. */
  readonly after: number;
  readonly accuracy: number;
}

export type GradeCounts = Record<Grade, number>;

export interface Review {
  readonly notes: readonly MoveNote[];
  /** Accuracy per side, 0..100 (White = you). */
  readonly white: number;
  readonly black: number;
  readonly whiteCounts: GradeCounts;
  readonly blackCounts: GradeCounts;
}

const emptyCounts = (): GradeCounts => ({ best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 });

/**
 * Review a game from the engine's look at every position: `evals[k]` is the score of position k
 * (after k moves) from the side to move's view, `bests[k]` its best move. `moves[k]` led from k to
 * k + 1; White moved first when `whiteFirst`.
 */
export function reviewGame(
  moves: readonly number[],
  evals: readonly number[],
  bests: readonly number[],
  whiteFirst = true,
): Review {
  const notes: MoveNote[] = [];
  const acc: [number[], number[]] = [[], []];
  const counts: [GradeCounts, GradeCounts] = [emptyCounts(), emptyCounts()];
  for (let k = 0; k < moves.length; k++) {
    const white = whiteFirst === (k % 2 === 0);
    const before = evals[k] ?? 0;
    // the next position is scored for the other side
    const after = -(evals[k + 1] ?? 0);
    // the deeper look after the move can find more than the first search did
    const bestScore = Math.max(before, after);
    const grade = moves[k] === bests[k] ? 'best' : gradeOf(bestScore, after);
    const toWhite = (s: number): number => (white ? s : -s);
    const wBefore = winChance(toWhite(bestScore));
    const wAfter = winChance(toWhite(after));
    const a = white ? moveAccuracy(wBefore, wAfter) : moveAccuracy(100 - wBefore, 100 - wAfter);
    acc[white ? 0 : 1].push(a);
    counts[white ? 0 : 1][grade]++;
    notes.push({
      ply: k,
      move: moves[k] ?? 0,
      best: bests[k] ?? 0,
      grade,
      after: toWhite(after),
      accuracy: a,
    });
  }
  const mean = (xs: number[]): number => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : 100);
  return {
    notes,
    white: Math.round(mean(acc[0])),
    black: Math.round(mean(acc[1])),
    whiteCounts: counts[0],
    blackCounts: counts[1],
  };
}

/** Plies to the next of your weak moves after `from` (−1 = none). */
export function nextMistake(r: Review, from: number, whiteFirst = true): number {
  for (const n of r.notes)
    if (
      n.ply > from &&
      whiteFirst === (n.ply % 2 === 0) &&
      (n.grade === 'mistake' || n.grade === 'blunder' || n.grade === 'inaccuracy')
    )
      return n.ply;
  return -1;
}

// ---------- opening names ----------

/**
 * Common openings by their moves from the start (long algebraic). The longest match names the
 * game (i18n `opening.<id>`). Kept to lines a club player meets.
 */
export const OPENING_NAMES: readonly (readonly [string, string])[] = [
  ['e2e4', 'kingPawn'],
  ['d2d4', 'queenPawn'],
  ['c2c4', 'english'],
  ['g1f3', 'reti'],
  ['e2e4 e7e5', 'openGame'],
  ['e2e4 e7e5 g1f3 b8c6', 'kingKnight'],
  ['e2e4 e7e5 g1f3 b8c6 f1c4', 'italian'],
  ['e2e4 e7e5 g1f3 b8c6 f1c4 f8c5', 'giuoco'],
  ['e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 b2b4', 'evans'],
  ['e2e4 e7e5 g1f3 b8c6 f1c4 g8f6', 'twoKnights'],
  ['e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 f3g5', 'friedLiver'],
  ['e2e4 e7e5 g1f3 b8c6 f1b5', 'ruyLopez'],
  ['e2e4 e7e5 g1f3 b8c6 f1b5 a7a6', 'ruyMorphy'],
  ['e2e4 e7e5 g1f3 b8c6 f1b5 g8f6', 'berlin'],
  ['e2e4 e7e5 g1f3 b8c6 d2d4', 'scotch'],
  ['e2e4 e7e5 g1f3 b8c6 b1c3 g8f6', 'fourKnights'],
  ['e2e4 e7e5 g1f3 g8f6', 'petrov'],
  ['e2e4 e7e5 g1f3 d7d6', 'philidor'],
  ['e2e4 e7e5 f2f4', 'kingsGambit'],
  ['e2e4 e7e5 b1c3', 'vienna'],
  ['e2e4 e7e5 d1h5', 'wayward'],
  ['e2e4 e7e5 f1c4', 'bishopsOpening'],
  ['e2e4 c7c5', 'sicilian'],
  ['e2e4 c7c5 c2c3', 'alapin'],
  ['e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 a7a6', 'najdorf'],
  ['e2e4 c7c5 g1f3 d7d6 d2d4 c5d4 f3d4 g8f6 b1c3 g7g6', 'dragon'],
  ['e2e4 c7c5 b1c3', 'closedSicilian'],
  ['e2e4 e7e6', 'french'],
  ['e2e4 e7e6 d2d4 d7d5 e4e5', 'frenchAdvance'],
  ['e2e4 e7e6 d2d4 d7d5 b1c3', 'frenchMain'],
  ['e2e4 c7c6', 'caroKann'],
  ['e2e4 c7c6 d2d4 d7d5 e4e5', 'caroAdvance'],
  ['e2e4 d7d5', 'scandi'],
  ['e2e4 d7d6', 'pirc'],
  ['e2e4 g7g6', 'modern'],
  ['e2e4 g8f6', 'alekhine'],
  ['e2e4 b8c6', 'nimzowitschDef'],
  ['d2d4 d7d5', 'closedGame'],
  ['d2d4 d7d5 c2c4', 'queensGambit'],
  ['d2d4 d7d5 c2c4 d5c4', 'qgAccepted'],
  ['d2d4 d7d5 c2c4 e7e6', 'qgDeclined'],
  ['d2d4 d7d5 c2c4 c7c6', 'slav'],
  ['d2d4 d7d5 c1f4', 'london'],
  ['d2d4 d7d5 g1f3 g8f6 c1f4', 'london'],
  ['d2d4 g8f6', 'indian'],
  ['d2d4 g8f6 c2c4 g7g6', 'kingsIndian'],
  ['d2d4 g8f6 c2c4 e7e6 b1c3 f8b4', 'nimzoIndian'],
  ['d2d4 g8f6 c2c4 e7e6 g1f3 b7b6', 'queensIndian'],
  ['d2d4 g8f6 c2c4 c7c5 d4d5 b7b5', 'benko'],
  ['d2d4 g8f6 c1f4', 'london'],
  ['d2d4 f7f5', 'dutch'],
  ['c2c4 e7e5', 'reversedSicilian'],
  ['f2f4', 'bird'],
  ['b2b3', 'larsen'],
];

/** The opening of a game so far (move names), or '' when it left the book or hasn't started. */
export function openingOf(names: readonly string[]): string {
  const line = names.join(' ');
  let best = '';
  let len = -1;
  for (const [moves, id] of OPENING_NAMES)
    if ((line === moves || line.startsWith(`${moves} `)) && moves.length > len) {
      best = id;
      len = moves.length;
    }
  return best;
}

/** Ids of every named opening (for the strings check). */
export const openingIds = (): string[] => [...new Set(OPENING_NAMES.map(([, id]) => id))];

// ---------- notation ----------

/** Standard algebraic notation of legal move `m` in `p` (e.g. "Nf3", "exd5", "O-O", "e8=Q+"). */
export function san(p: Pos, m: number, letters = 'NBRQK'): string {
  const from = mFrom(m);
  const to = mTo(m);
  const type = Math.abs(p.b[from] ?? 0);
  const flags = mFlags(m);
  const sq = (s: number): string => String.fromCharCode(97 + (s & 7)) + String(8 - (s >> 4));
  const letter = (t: number): string => letters[t - 2] ?? '';
  let out: string;
  if (flags & F_CASTLE) out = to > from ? 'O-O' : 'O-O-O';
  else if (type === PAWN) {
    const cap = (flags & (F_CAPTURE | F_EP)) !== 0;
    out = (cap ? `${sq(from)[0] ?? ''}x` : '') + sq(to);
    if (mPromo(m)) out += `=${letter(mPromo(m))}`;
  } else {
    const rivals = legalMoves(p).filter(
      (x) => x !== m && mTo(x) === to && Math.abs(p.b[mFrom(x)] ?? 0) === type,
    );
    let dis = '';
    if (rivals.length) {
      const sameFile = rivals.some((x) => (mFrom(x) & 7) === (from & 7));
      const sameRank = rivals.some((x) => mFrom(x) >> 4 === from >> 4);
      dis = !sameFile ? (sq(from)[0] ?? '') : !sameRank ? (sq(from)[1] ?? '') : sq(from);
    }
    out = letter(type) + dis + (flags & F_CAPTURE ? 'x' : '') + sq(to);
  }
  makeMove(p, m);
  const check = inCheck(p);
  const mate = check && legalMoves(p).length === 0;
  unmakeMove(p);
  return out + (mate ? '#' : check ? '+' : '');
}
