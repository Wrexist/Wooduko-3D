// Workshop → Chess school: lessons and the coach's judgement (pure; no Three.js / DOM).
import {
  attacked,
  BISHOP,
  captured,
  F_CAPTURE,
  F_CASTLE,
  fromFen,
  genMoves,
  inCheck,
  KING,
  KNIGHT,
  legalMoves,
  makeMove,
  MATE,
  mFlags,
  mFrom,
  mPromo,
  mTo,
  PAWN,
  QUEEN,
  ROOK,
  unmakeMove,
} from './chess';
import type { Pos, Side } from './chess';

/**
 * What a lesson step asks for:
 * - `collect`: take every black piece (they never move); stars against the fewest moves.
 * - `promote`: walk a pawn to the last row.
 * - `check`: give check. `escape`: get out of check. `castle`: castle.
 * - `move`: play one of the listed moves (long algebraic, e.g. "e5d6").
 * - `best`: play the engine's best move each turn for `moves` turns (it answers); mates must be exact.
 * - `mate`: checkmate the computer's lone king; stars against `par` moves.
 */
export type Goal = 'collect' | 'promote' | 'check' | 'escape' | 'castle' | 'move' | 'best' | 'mate';

export interface Step {
  readonly fen: string;
  readonly goal: Goal;
  /** `best`: how many of your moves; `mate`: moves for three stars. */
  readonly moves?: number;
  /** `move`: the accepted moves. */
  readonly accept?: readonly string[];
}

export interface Lesson {
  /** i18n key stem: `school.<id>` (title) and `school.<id>.<step>` (instructions). */
  readonly id: string;
  readonly steps: readonly Step[];
}

const W = ' w - - 0 1';

export const LESSONS: readonly Lesson[] = [
  {
    id: 'rook',
    steps: [
      { fen: `8/8/8/8/3p4/8/8/3R4${W}`, goal: 'collect' },
      { fen: `8/8/p4p2/8/8/8/5p2/R7${W}`, goal: 'collect' },
      { fen: `8/1p5p/8/8/8/1p2p3/8/7R${W}`, goal: 'collect' },
    ],
  },
  {
    id: 'bishop',
    steps: [
      { fen: `8/8/8/6p1/8/8/8/2B5${W}`, goal: 'collect' },
      { fen: `8/4p3/8/8/8/p7/8/2B5${W}`, goal: 'collect' },
      { fen: `8/3p4/8/1p6/8/7p/8/5B2${W}`, goal: 'collect' },
    ],
  },
  {
    id: 'queen',
    steps: [
      { fen: `8/8/8/8/8/8/3p4/3Q4${W}`, goal: 'collect' },
      { fen: `8/8/3p4/8/8/1p4p1/8/3Q4${W}`, goal: 'collect' },
      { fen: `8/1p4p1/8/8/4p3/8/1p6/7Q${W}`, goal: 'collect' },
    ],
  },
  {
    id: 'knight',
    steps: [
      { fen: `8/8/8/8/8/2p5/8/1N6${W}`, goal: 'collect' },
      { fen: `8/3p4/8/4p3/8/5p2/8/6N1${W}`, goal: 'collect' },
      { fen: `8/8/8/5p2/3p4/1p6/8/N7${W}`, goal: 'collect' },
    ],
  },
  {
    id: 'king',
    steps: [
      { fen: `8/8/8/8/8/8/3p4/4K3${W}`, goal: 'collect' },
      { fen: `8/8/8/8/5p2/3p4/8/4K3${W}`, goal: 'collect' },
    ],
  },
  {
    id: 'pawn',
    steps: [
      { fen: `8/8/8/8/8/5p2/4P3/8${W}`, goal: 'collect' },
      { fen: `8/8/8/4P3/8/8/8/8${W}`, goal: 'promote' },
      { fen: `8/8/8/3p4/8/8/4P3/8${W}`, goal: 'collect' },
    ],
  },
  {
    id: 'check',
    steps: [
      { fen: `4k3/8/8/8/8/8/8/R5K1${W}`, goal: 'check' },
      { fen: `4r1k1/8/8/8/8/8/3B1PPP/4K1N1${W}`, goal: 'escape' },
    ],
  },
  {
    id: 'mate1',
    steps: [
      { fen: `6k1/5ppp/8/8/8/8/8/R5K1${W}`, goal: 'best', moves: 1 },
      { fen: `7k/8/6K1/8/8/8/8/5Q2${W}`, goal: 'best', moves: 1 },
      { fen: `6rk/6pp/8/6N1/8/8/8/6K1${W}`, goal: 'best', moves: 1 },
      { fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4', goal: 'best', moves: 1 },
      { fen: `k7/7R/8/8/8/8/8/6RK${W}`, goal: 'best', moves: 1 },
    ],
  },
  {
    id: 'castle',
    steps: [
      { fen: 'r3k2r/pppq1ppp/2npbn2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 1', goal: 'castle' },
      { fen: 'r3k2r/ppp2ppp/2nqbn2/3pp3/3PP3/2N1BN2/PPPQ1PPP/R3K2R w KQkq - 0 1', goal: 'castle' },
    ],
  },
  {
    id: 'special',
    steps: [
      { fen: '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', goal: 'move', accept: ['e5d6'] },
      { fen: `3r2k1/4P3/8/8/8/8/8/6K1${W}`, goal: 'promote' },
    ],
  },
  {
    id: 'fork',
    steps: [
      { fen: `q3k3/8/8/3N4/8/8/PP6/4K3${W}`, goal: 'best', moves: 2 },
      { fen: `4k3/7r/8/8/4N3/8/PP6/4K3${W}`, goal: 'best', moves: 2 },
      { fen: `r5k1/8/8/8/8/1Q6/8/6K1${W}`, goal: 'best', moves: 2 },
    ],
  },
  {
    id: 'skewer',
    steps: [
      { fen: `7R/8/8/3k4/8/7K/8/3q4${W}`, goal: 'best', moves: 2 },
      { fen: `6q1/8/8/3k4/8/8/PP6/3B3K${W}`, goal: 'best', moves: 2 },
    ],
  },
  {
    id: 'mate2',
    steps: [
      { fen: `r5k1/5ppp/8/8/8/8/3R1PPP/3R2K1${W}`, goal: 'best', moves: 2 },
      { fen: `r5k1/5ppp/8/8/8/8/1Q3PPP/1R4K1${W}`, goal: 'best', moves: 2 },
    ],
  },
  {
    id: 'queenMate',
    steps: [{ fen: `4k3/8/8/8/8/8/8/3QK3${W}`, goal: 'mate', moves: 10 }],
  },
  {
    id: 'rookMate',
    steps: [{ fen: `4k3/8/8/8/8/8/8/R3K3${W}`, goal: 'mate', moves: 16 }],
  },
];

/** Long algebraic name of a move, e.g. "e2e4" (promotion letter dropped: any promotion counts). */
export const plainName = (m: number): string => {
  const sq = (s: number): string => String.fromCharCode(97 + (s & 7)) + String(8 - (s >> 4));
  return sq(mFrom(m)) + sq(mTo(m));
};

/** Pieces of `side` on the board (kings excluded). */
export function pieceCount(p: Pos, side: Side): number {
  let n = 0;
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) continue;
    const t = (p.b[s] ?? 0) * side;
    if (t > 0 && t !== KING) n++;
  }
  return n;
}

/** A Black side that never moves (collect / promote / check steps): White moves again. */
export function passTurn(p: Pos): void {
  p.side = 1;
  p.ep = -1;
  p.rehash();
}

/** Fewest moves to take every black piece in a `collect` step (breadth-first; Black never moves). */
export function collectPar(fen: string): number {
  const start = fromFen(fen);
  const key = (p: Pos): string => Array.from(p.b).join(',');
  const seen = new Set([key(start)]);
  let frontier = [start];
  for (let depth = 0; depth < 12; depth++) {
    const next: Pos[] = [];
    for (const p of frontier) {
      if (pieceCount(p, -1) === 0 && !hasBlackKing(p)) return depth;
      for (const m of legalMoves(p)) {
        makeMove(p, m);
        const q = fromFen(fenOf(p));
        unmakeMove(p);
        passTurn(q);
        const k = key(q);
        if (seen.has(k)) continue;
        seen.add(k);
        next.push(q);
      }
    }
    frontier = next;
  }
  return 12;
}

const hasBlackKing = (p: Pos): boolean => p.b.includes(-KING);

/** A FEN for the board and side (enough to copy a position; no castling or en passant). */
export function fenOf(p: Pos): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let row = '';
    let empty = 0;
    for (let c = 0; c < 8; c++) {
      const v = p.b[r * 16 + c] ?? 0;
      if (!v) {
        empty++;
        continue;
      }
      if (empty) row += String(empty);
      empty = 0;
      const ch = ' pnbrqk'[Math.abs(v)] ?? '?';
      row += v > 0 ? ch.toUpperCase() : ch;
    }
    if (empty) row += String(empty);
    rows.push(row);
  }
  return `${rows.join('/')} ${p.side === 1 ? 'w' : 'b'} - - 0 1`;
}

/** Has the step's goal been met after White's move `m` (already played on `p`)? */
export function stepDone(step: Step, p: Pos, m: number): boolean {
  switch (step.goal) {
    case 'collect':
      return pieceCount(p, -1) === 0;
    case 'promote':
      return mPromo(m) !== 0;
    case 'check':
      return inCheck(p, -1);
    case 'escape':
      return true;
    case 'castle':
      return (mFlags(m) & F_CASTLE) !== 0;
    case 'move':
      return (step.accept ?? []).includes(plainName(m));
    default:
      return false;
  }
}

/** Would White's move `m` count toward the goal at all (wrong ones bounce back)? */
export function stepAllows(step: Step, p: Pos, m: number): boolean {
  switch (step.goal) {
    case 'check': {
      makeMove(p, m);
      const ok = inCheck(p, -1);
      unmakeMove(p);
      return ok;
    }
    case 'castle':
      return (mFlags(m) & F_CASTLE) !== 0;
    case 'move':
      return (step.accept ?? []).includes(plainName(m));
    default:
      return true;
  }
}

// ---------- the coach ----------

export type Grade = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

/** Why a move was weak (or strong), for one short sentence. */
export type Reason =
  | { readonly kind: 'none' }
  | { readonly kind: 'allowsMate' }
  | { readonly kind: 'hangs'; readonly piece: number; readonly square: number }
  | { readonly kind: 'missedMate' }
  | { readonly kind: 'missedWin'; readonly piece: number; readonly square: number }
  | { readonly kind: 'foundMate' }
  | { readonly kind: 'foundWin'; readonly piece: number };

export interface Review {
  readonly grade: Grade;
  /** Centipawns lost against the best move. */
  readonly loss: number;
  /** The engine's best move from the position before. */
  readonly best: number;
  readonly reason: Reason;
}

/** Grade a move from its score against the best score (both from the mover's view). */
export function gradeOf(bestScore: number, playedScore: number): Grade {
  if (bestScore > MATE - 200 && playedScore < bestScore - 0) {
    // a mate was there: missing it is at least a mistake (a slower mate is fine)
    if (playedScore > MATE - 200) return 'good';
    return playedScore > 300 ? 'mistake' : 'blunder';
  }
  const loss = Math.max(0, bestScore - playedScore);
  if (loss <= 15) return 'best';
  if (loss <= 60) return 'good';
  if (loss <= 140) return 'inaccuracy';
  if (loss <= 300) return 'mistake';
  return 'blunder';
}

/**
 * Why: after the move, can the opponent mate or win a piece (the engine's reply `reply`)? Or did
 * the best move mate / win something the played move didn't?
 */
export function reasonFor(
  before: Pos,
  played: number,
  best: number,
  bestScore: number,
  playedScore: number,
  reply: number,
): Reason {
  const grade = gradeOf(bestScore, playedScore);
  if (grade === 'best' || grade === 'good') {
    if (played === best && bestScore > MATE - 200) return { kind: 'foundMate' };
    if (played === best && mFlags(played) & F_CAPTURE && bestScore >= 250) {
      return { kind: 'foundWin', piece: Math.abs(before.b[mTo(played)] ?? 0) };
    }
    return { kind: 'none' };
  }
  if (playedScore < -MATE + 200) return { kind: 'allowsMate' };
  if (bestScore > MATE - 200) return { kind: 'missedMate' };
  // the opponent's best answer takes something
  if (reply && mFlags(reply) & F_CAPTURE) {
    makeMove(before, played);
    const piece = Math.abs(before.b[mTo(reply)] ?? 0);
    unmakeMove(before);
    if (piece > PAWN || bestScore - playedScore > 250)
      return { kind: 'hangs', piece: piece || PAWN, square: mTo(reply) };
  }
  if (mFlags(best) & F_CAPTURE) {
    const piece = Math.abs(before.b[mTo(best)] ?? 0);
    if (piece) return { kind: 'missedWin', piece, square: mTo(best) };
  }
  return { kind: 'none' };
}

const VALUE = [0, 1, 3, 3, 5, 9, 100];

/** Value of the cheapest piece of `by` attacking square `s` (0 = none). */
export function cheapestAttacker(p: Pos, s: number, by: Side): number {
  if (!attacked(p, s, by)) return 0;
  // try the attacker types from cheapest up: a pseudo-move capture from `by` onto s
  const saved = p.side;
  const target = p.b[s] ?? 0;
  p.side = by;
  // a capture needs something to capture: put a stand-in of the other side if empty
  if (!target) p.b[s] = -by * PAWN;
  let best = 0;
  for (const m of genMoves(p, [], true)) {
    if (mTo(m) !== s) continue;
    const v = VALUE[Math.abs(p.b[mFrom(m)] ?? 0)] ?? 0;
    if (!best || v < best) best = v;
  }
  p.b[s] = target;
  p.side = saved;
  return best;
}

/**
 * Your pieces in danger (0x88 squares): attacked and not defended, or attacked by something
 * cheaper. The king is left out (check has its own marker).
 */
export function threatened(p: Pos, side: Side): number[] {
  const out: number[] = [];
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) continue;
    const v = (p.b[s] ?? 0) * side;
    if (v <= 0 || v === KING) continue;
    const by = cheapestAttacker(p, s, -side as Side);
    if (!by) continue;
    const own = VALUE[v] ?? 0;
    if (by < own || !attacked(p, s, side)) out.push(s);
  }
  return out;
}

/** Material balance from White's view (pawns). */
export const balance = (p: Pos): number => captured(p, 1) - captured(p, -1);

export const PIECE_KEYS = ['', 'pawn', 'knight', 'bishop', 'rook', 'queen', 'king'] as const;

/** Square name like "e4" from a 0x88 square. */
export const squareName = (s: number): string => String.fromCharCode(97 + (s & 7)) + String(8 - (s >> 4));

export { BISHOP, KNIGHT, QUEEN, ROOK };

/**
 * A first move toward the step's goal (for Hint) when no engine is needed: the shortest way to
 * take everything / promote (Black never moves), or any move the step accepts.
 */
export function goalHint(step: Step, p: Pos): number {
  if (step.goal !== 'collect' && step.goal !== 'promote')
    return legalMoves(p).find((m) => stepAllows(step, p, m)) ?? legalMoves(p)[0] ?? 0;
  let frontier: { pos: Pos; first: number }[] = [{ pos: fromFen(fenOf(p)), first: 0 }];
  const seen = new Set([fenOf(p)]);
  for (let depth = 0; depth < 8 && frontier.length; depth++) {
    const next: { pos: Pos; first: number }[] = [];
    for (const { pos, first } of frontier)
      for (const m of legalMoves(pos)) {
        makeMove(pos, m);
        const done = stepDone(step, pos, m);
        const fen = fenOf(pos);
        unmakeMove(pos);
        const f = first || m;
        if (done) return f;
        if (seen.has(fen)) continue;
        seen.add(fen);
        const q = fromFen(fen);
        passTurn(q);
        next.push({ pos: q, first: f });
      }
    frontier = next;
  }
  return legalMoves(p)[0] ?? 0;
}

/** Stars for a lesson: 3 with no mistakes, 2 with up to two, 1 with more. */
export const lessonStars = (mistakes: number): number => (mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1);
