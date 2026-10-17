// Workshop → Chess school → Daily training (pure; no Three.js / DOM).
//
// How it teaches, and why:
// - Retrieval practice: every card is a position to solve, never a page to read.
// - Spaced repetition: each card has a memory model (FSRS-style stability and difficulty) and comes
//   back just before you would forget it; a miss brings it back tomorrow and again later today.
// - Interleaving: a session mixes themes (forks, mates, endgames, openings, your own mistakes) so you
//   learn to recognise which idea fits, not just how to play one.
// - Desirable difficulty: new puzzles are picked a little above your rating (about 70% solved),
//   and the rating moves with every first try.
// - Learning from your own games: the coach's mistakes and blunders become cards.
// - Encode, then test: a new opening line shows each move first, then asks for it on later days.
import {
  attacked,
  BISHOP,
  fromFen,
  KING,
  KNIGHT,
  legalMoves,
  mFrom,
  mPromo,
  mTo,
  PAWN,
  QUEEN,
  ROOK,
} from './chess';
import type { Pos } from './chess';
import { PUZZLES } from './chessPuzzles';

// ---------- positions ----------

/** Full FEN of a position (castling and en passant kept). */
export function fullFen(p: Pos): string {
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
  const c = p.castle;
  const castle = `${c & 1 ? 'K' : ''}${c & 2 ? 'Q' : ''}${c & 4 ? 'k' : ''}${c & 8 ? 'q' : ''}` || '-';
  const ep = p.ep >= 0 ? String.fromCharCode(97 + (p.ep & 7)) + String(8 - (p.ep >> 4)) : '-';
  return `${rows.join('/')} ${p.side === 1 ? 'w' : 'b'} ${castle} ${ep} ${p.half} 1`;
}

/** The same position with colours swapped and the board flipped (Black to move → White to move). */
export function mirrorFen(fen: string): string {
  const [board = '', side = 'w', castle = '-', ep = '-', half = '0'] = fen.split(' ');
  const swap = (s: string): string =>
    [...s].map((ch) => (ch === ch.toLowerCase() ? ch.toUpperCase() : ch.toLowerCase())).join('');
  const rows = board.split('/').reverse().map(swap).join('/');
  const c = castle === '-' ? '-' : [...'KQkq'].filter((k) => castle.includes(swap(k))).join('') || '-';
  const e = ep === '-' ? '-' : ep[0] + String(9 - Number(ep[1]));
  return `${rows} ${side === 'w' ? 'b' : 'w'} ${c} ${e} ${half} 1`;
}

const KNIGHT_D = [-33, -31, -18, -14, 14, 18, 31, 33];
const KING_D = [-17, -16, -15, -1, 1, 15, 16, 17];
const ROOK_D = [-16, -1, 1, 16];
const BISHOP_D = [-17, -15, 15, 17];

/** Squares (0x88) the piece on `s` attacks. */
export function attacksFrom(p: Pos, s: number): number[] {
  const v = p.b[s] ?? 0;
  const t = Math.abs(v);
  const out: number[] = [];
  const add = (to: number): void => {
    if (!(to & 0x88)) out.push(to);
  };
  if (t === PAWN) {
    const f = v > 0 ? -16 : 16;
    add(s + f - 1);
    add(s + f + 1);
  } else if (t === KNIGHT) KNIGHT_D.forEach((d) => add(s + d));
  else if (t === KING) KING_D.forEach((d) => add(s + d));
  else {
    const dirs = t === ROOK ? ROOK_D : t === BISHOP ? BISHOP_D : t === QUEEN ? [...ROOK_D, ...BISHOP_D] : [];
    for (const d of dirs)
      for (let to = s + d; !(to & 0x88); to += d) {
        out.push(to);
        if (p.b[to]) break;
      }
  }
  return out;
}

const sqName = (s: number): string => String.fromCharCode(97 + (s & 7)) + String(8 - (s >> 4));

/** A move name on the mirrored board (ranks flipped): e7e5 ↔ e2e4. */
export const mirrorUci = (u: string): string => {
  const f = (sq: string): string => sq.charAt(0) + String(9 - Number(sq.charAt(1)));
  return f(u.slice(0, 2)) + f(u.slice(2, 4)) + u.slice(4);
};

/** A position and its better move as a White-to-move card (Black's are mirrored). */
export function asWhite(fen: string, best: string): { fen: string; best: string } {
  return fen.split(' ')[1] === 'b' ? { fen: mirrorFen(fen), best: mirrorUci(best) } : { fen, best };
}

/** Long algebraic with the promotion letter ("e7e8q"). */
export const uciOf = (m: number): string =>
  sqName(mFrom(m)) + sqName(mTo(m)) + (mPromo(m) ? (' nbrq'[mPromo(m) - 1] ?? '') : '');

/** The legal move named `u` in `p` (0 if none). A missing promotion letter means a queen. */
export function moveOf(p: Pos, u: string): number {
  const want = u.length === 4 ? `${u}q` : u;
  const ms = legalMoves(p);
  return ms.find((m) => uciOf(m) === u || uciOf(m) === want) ?? 0;
}

export { attacked };

// ---------- the cards ----------

export type Theme =
  | 'mate1'
  | 'mate2'
  | 'mate3'
  | 'fork'
  | 'pin'
  | 'skewer'
  | 'discovered'
  | 'deflection'
  | 'sacrifice'
  | 'hanging'
  | 'promotion'
  | 'endgame'
  | 'tactic'
  | 'opening'
  | 'mistake'
  | 'lesson';

export interface Puzzle {
  readonly id: string;
  readonly fen: string;
  /** Your moves and the replies, alternating (long algebraic). */
  readonly line: readonly string[];
  readonly rating: number;
  readonly theme: Theme;
}

/** Short stable id from the position (so regenerating the set keeps your history). */
function hashId(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

export function parsePuzzle(raw: string): Puzzle | null {
  const [fen, line, rating, theme] = raw.split('|');
  if (!fen || !line || !rating || !theme) return null;
  return {
    id: `p${hashId(fen)}`,
    fen,
    line: line.split(' '),
    rating: Number(rating),
    theme: theme as Theme,
  };
}

let puzzleCache: Puzzle[] | null = null;
export function allPuzzles(): readonly Puzzle[] {
  puzzleCache ??= PUZZLES.map(parsePuzzle).filter((x): x is Puzzle => x !== null);
  return puzzleCache;
}

/** An opening line to learn as White: your moves and the answers, from the start. */
export interface Opening {
  readonly id: string;
  readonly moves: readonly string[];
}

/** A small, sound repertoire for White after 1.e4: one answer to each common reply. */
export const OPENINGS: readonly Opening[] = [
  { id: 'italian', moves: 'e2e4 e7e5 g1f3 b8c6 f1c4 f8c5 c2c3 g8f6 d2d3 d7d6 e1g1 e8g8 f1e1'.split(' ') },
  { id: 'twoKnights', moves: 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6 d2d3 f8e7 e1g1 e8g8 f1e1 d7d6 c2c3'.split(' ') },
  { id: 'philidor', moves: 'e2e4 e7e5 g1f3 d7d6 d2d4 e5d4 f3d4 g8f6 b1c3 f8e7 f1e2 e8g8 e1g1'.split(' ') },
  { id: 'petrov', moves: 'e2e4 e7e5 g1f3 g8f6 f3e5 d7d6 e5f3 f6e4 d2d4 d6d5 f1d3'.split(' ') },
  { id: 'sicilian', moves: 'e2e4 c7c5 c2c3 g8f6 e4e5 f6d5 d2d4 c5d4 g1f3 b8c6 c3d4'.split(' ') },
  { id: 'french', moves: 'e2e4 e7e6 d2d4 d7d5 e4e5 c7c5 c2c3 b8c6 g1f3 d8b6 a2a3'.split(' ') },
  { id: 'caroKann', moves: 'e2e4 c7c6 d2d4 d7d5 e4e5 c8f5 g1f3 e7e6 f1e2 c6c5 c1e3'.split(' ') },
  { id: 'scandi', moves: 'e2e4 d7d5 e4d5 d8d5 b1c3 d5a5 d2d4 g8f6 g1f3 c7c6 f1c4'.split(' ') },
  { id: 'pirc', moves: 'e2e4 d7d6 d2d4 g8f6 b1c3 g7g6 c1e3 f8g7 d1d2 e8g8 f2f3'.split(' ') },
];

export const OPENING_START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

/** Card ids: `p…` puzzle, `o:<id>` opening, `m:<fen>|<best>` your mistake, `l:<lesson>.<step>` lesson. */
export type CardKind = 'puzzle' | 'opening' | 'mistake' | 'lesson';
export const kindOf = (id: string): CardKind =>
  id.startsWith('o:')
    ? 'opening'
    : id.startsWith('m:')
      ? 'mistake'
      : id.startsWith('l:')
        ? 'lesson'
        : 'puzzle';

// ---------- memory model (FSRS-4.5 style) ----------

/** 1 = forgot (wrong or hinted), 2 = hard, 3 = good, 4 = easy (right, quickly). */
export type Rating = 1 | 2 | 3 | 4;

export interface Card {
  /** Day number it's due (days since 1970, local). */
  due: number;
  /** Days until recall drops to 90%. */
  stab: number;
  /** 1 (easy) .. 10 (hard). */
  diff: number;
  reps: number;
  lapses: number;
  /** Day it was last seen. */
  last: number;
}

const W = [0.4, 1.2, 3.2, 15.7, 7.2, 0.53, 1.06, 0.01, 1.5, 0.14, 1.0, 1.9, 0.11, 0.29, 2.27, 0.25, 2.9];
const w = (i: number): number => W[i] ?? 0;
/** Recall we aim for when a card comes back. */
export const RETENTION = 0.9;
const MAX_DAYS = 365;

const clampD = (d: number): number => Math.min(10, Math.max(1, d));

/** Chance of recall `t` days after the last review with stability `s`. */
export const recall = (t: number, s: number): number => Math.pow(1 + t / (9 * s), -1);

/** Days until recall falls to RETENTION (= stability at 90%). */
export const intervalFor = (s: number): number =>
  Math.min(MAX_DAYS, Math.max(1, Math.round(9 * s * (1 / RETENTION - 1))));

export function newCard(): Card {
  return { due: 0, stab: 0, diff: 0, reps: 0, lapses: 0, last: 0 };
}

/** The card after a review on day `today`. */
export function review(c: Card, g: Rating, today: number): Card {
  let stab: number;
  let diff: number;
  if (c.reps === 0) {
    stab = w(g - 1);
    diff = clampD(w(4) - (g - 3) * w(5));
  } else {
    const r = recall(Math.max(0, today - c.last), c.stab);
    diff = clampD(c.diff - w(6) * (g - 3));
    // pull difficulty gently back toward the default
    diff = clampD(w(7) * w(4) + (1 - w(7)) * diff);
    if (g === 1) {
      stab = w(11) * Math.pow(diff, -w(12)) * (Math.pow(c.stab + 1, w(13)) - 1) * Math.exp((1 - r) * w(14));
      stab = Math.min(stab, c.stab);
    } else {
      const hard = g === 2 ? w(15) : 1;
      const easy = g === 4 ? w(16) : 1;
      stab =
        c.stab *
        (1 +
          Math.exp(w(8)) *
            (11 - diff) *
            Math.pow(c.stab, -w(9)) *
            (Math.exp((1 - r) * w(10)) - 1) *
            hard *
            easy);
    }
  }
  stab = Math.max(0.1, stab);
  return {
    due: today + (g === 1 ? 1 : intervalFor(stab)),
    stab,
    diff,
    reps: c.reps + 1,
    lapses: c.lapses + (g === 1 && c.reps > 0 ? 1 : 0),
    last: today,
  };
}

/** How a solve maps to a memory rating. */
export function rateSolve(mistakes: number, hinted: boolean, seconds: number, moves: number): Rating {
  if (mistakes > 0 || hinted) return 1;
  const quick = 12 + 8 * (moves - 1);
  if (seconds <= quick) return 4;
  if (seconds > quick * 4) return 2;
  return 3;
}

// ---------- puzzle rating (Elo with a shrinking step) ----------

export const START_RATING = 800;

/** Expected score of a player rated `r` against a puzzle rated `pr`. */
export const expected = (r: number, pr: number): number => 1 / (1 + Math.pow(10, (pr - r) / 400));

/** New rating after a first try (`won` = solved with no mistakes or hints). */
export function rateAfter(r: number, pr: number, won: boolean, games: number): number {
  const k = Math.max(16, 48 - games);
  return Math.round(r + k * ((won ? 1 : 0) - expected(r, pr)));
}

/** Rating ladder names (i18n `train.rank.<i>`), each from this rating up. */
export const RANKS = [0, 800, 1100, 1400, 1700, 2000, 2300, 2500] as const;
export const rankOf = (r: number): number => {
  let i = 0;
  RANKS.forEach((min, k) => {
    if (r >= min) i = k;
  });
  return i;
};

// ---------- saved state ----------

export interface TrainState {
  v: 1;
  rating: number;
  /** First tries counted toward the rating. */
  games: number;
  cards: Record<string, Card>;
  /** Day of the last finished session, and how many days in a row. */
  lastDay: number;
  streak: number;
  /** Totals for the summary. */
  solved: number;
  tried: number;
}

export const emptyTrain = (): TrainState => ({
  v: 1,
  rating: START_RATING,
  games: 0,
  cards: {},
  lastDay: -1,
  streak: 0,
  solved: 0,
  tried: 0,
});

export function parseTrain(raw: string | null): TrainState {
  try {
    const o = raw ? (JSON.parse(raw) as Partial<TrainState>) : null;
    if (!o || o.v !== 1 || typeof o.cards !== 'object' || !o.cards) return emptyTrain();
    return { ...emptyTrain(), ...o, cards: { ...o.cards } };
  } catch {
    return emptyTrain();
  }
}

/** Local day number. */
export const dayOf = (ms: number, offsetMin = new Date(ms).getTimezoneOffset()): number =>
  Math.floor((ms - offsetMin * 60_000) / 86_400_000);

/** The streak after finishing a session on `today`. */
export function streakAfter(s: TrainState, today: number): number {
  if (s.lastDay === today) return s.streak;
  return s.lastDay === today - 1 ? s.streak + 1 : 1;
}

/** Most of your own mistakes kept as cards (oldest dropped). */
export const MAX_MISTAKES = 150;

/** Add a position you went wrong in (FEN with White to move, and the better move). */
export function addMistake(s: TrainState, fen: string, best: string, today: number): TrainState {
  const id = `m:${fen}|${best}`;
  if (s.cards[id]) return s;
  const cards = { ...s.cards, [id]: { ...newCard(), due: today } };
  const mine = Object.keys(cards).filter((k) => k.startsWith('m:'));
  if (mine.length <= MAX_MISTAKES) return { ...s, cards };
  mine.sort((a, b) => (cards[a]?.last ?? 0) - (cards[b]?.last ?? 0));
  const drop = new Set(mine.slice(0, mine.length - MAX_MISTAKES));
  return { ...s, cards: Object.fromEntries(Object.entries(cards).filter(([k]) => !drop.has(k))) };
}

/** Lesson steps worth reviewing become cards once the lesson is done (due tomorrow). */
export function addLessonCards(s: TrainState, ids: readonly string[], today: number): TrainState {
  const cards = { ...s.cards };
  for (const id of ids) cards[id] ??= { ...newCard(), due: today + 1 };
  return { ...s, cards };
}

// ---------- the session ----------

export const SESSION = {
  /** Reviews at most per session (most overdue first). */
  reviews: 14,
  /** New puzzles per session (more when nothing is due). */
  fresh: 5,
  freshIdle: 10,
  /** New opening lines per day (while there are any left). */
  openings: 1,
  /** New puzzles are picked this far around your rating. */
  below: 150,
  above: 250,
  /** A missed card comes back this many cards later in the same session. */
  again: 3,
} as const;

/** How many cards are due on `today` (and how many are new to learn). */
export function dueCount(s: TrainState, today: number): number {
  return Object.values(s.cards).filter((c) => c.due <= today).length;
}

/**
 * Today's cards: due reviews (most overdue for its stability first), new opening lines, and new
 * puzzles near your rating, interleaved so the same theme doesn't come twice in a row.
 */
export function buildSession(s: TrainState, today: number, rand: () => number = Math.random): string[] {
  const due = Object.entries(s.cards)
    .filter(([, c]) => c.due <= today)
    .map(([id, c]) => ({ id, r: c.stab > 0 ? recall(today - c.last, c.stab) : 0 }))
    .sort((a, b) => a.r - b.r)
    .slice(0, SESSION.reviews)
    .map((x) => x.id);
  const fresh: string[] = [];
  const openingsLeft = OPENINGS.filter((o) => !s.cards[`o:${o.id}`]);
  for (const o of openingsLeft.slice(0, SESSION.openings)) fresh.push(`o:${o.id}`);
  const want = due.length >= 6 ? SESSION.fresh : SESSION.freshIdle;
  const pool = allPuzzles().filter(
    (p) => !s.cards[p.id] && p.rating >= s.rating - SESSION.below && p.rating <= s.rating + SESSION.above,
  );
  // widen when the band runs dry
  const backup = allPuzzles().filter((p) => !s.cards[p.id]);
  const picked = pickSpread(pool.length >= want ? pool : backup, want, s.rating, rand);
  fresh.push(...picked.map((p) => p.id));
  return interleave([...due, ...fresh], rand);
}

/** `n` puzzles, one theme at a time round-robin, each nearest to a target a little above you. */
function pickSpread(pool: readonly Puzzle[], n: number, rating: number, rand: () => number): Puzzle[] {
  const byTheme = new Map<string, Puzzle[]>();
  for (const p of pool) byTheme.set(p.theme, [...(byTheme.get(p.theme) ?? []), p]);
  for (const list of byTheme.values()) {
    // shuffle, then prefer the ones closest to rating + 80 (about 70% expected)
    list.sort(() => rand() - 0.5);
    list.sort((a, b) => Math.abs(a.rating - rating - 80) - Math.abs(b.rating - rating - 80));
  }
  const themes = [...byTheme.keys()].sort(() => rand() - 0.5);
  const out: Puzzle[] = [];
  for (let round = 0; out.length < n && round < 50; round++)
    for (const th of themes) {
      const p = byTheme.get(th)?.[round];
      if (p && out.length < n) out.push(p);
    }
  return out;
}

/** The theme a card id belongs to (for interleaving and the summary). */
export function themeOfCard(id: string): string {
  const k = kindOf(id);
  if (k !== 'puzzle') return k;
  return allPuzzles().find((p) => p.id === id)?.theme ?? 'tactic';
}

/**
 * Shuffle, then deal so no two neighbours share a theme where possible: each pick is from the
 * theme with the most cards left that differs from the last one.
 */
export function interleave(ids: readonly string[], rand: () => number = Math.random): string[] {
  const left = [...ids].sort(() => rand() - 0.5).map((id) => ({ id, theme: themeOfCard(id) }));
  const out: string[] = [];
  let prev = '';
  while (left.length) {
    const count = new Map<string, number>();
    for (const x of left) count.set(x.theme, (count.get(x.theme) ?? 0) + 1);
    let pick = 0;
    let most = -1;
    left.forEach((x, i) => {
      const n = x.theme === prev ? -1 : (count.get(x.theme) ?? 0);
      if (n > most) {
        most = n;
        pick = i;
      }
    });
    const [x] = left.splice(pick, 1);
    if (!x) break;
    out.push(x.id);
    prev = x.theme;
  }
  return out;
}

/** What to set up for a card. */
export type Drill =
  | {
      readonly kind: 'puzzle';
      readonly fen: string;
      readonly line: readonly string[];
      readonly rating: number;
    }
  | { readonly kind: 'opening'; readonly id: string; readonly moves: readonly string[] }
  | { readonly kind: 'lesson'; readonly lesson: string; readonly step: number };

export function drillOf(id: string): Drill | null {
  const k = kindOf(id);
  if (k === 'opening') {
    const o = OPENINGS.find((x) => `o:${x.id}` === id);
    return o ? { kind: 'opening', id: o.id, moves: o.moves } : null;
  }
  if (k === 'mistake') {
    const [fen = '', best = ''] = id.slice(2).split('|');
    return fen && best ? { kind: 'puzzle', fen, line: [best], rating: 0 } : null;
  }
  if (k === 'lesson') {
    const [lesson = '', step = '0'] = id.slice(2).split('.');
    return { kind: 'lesson', lesson, step: Number(step) };
  }
  const p = allPuzzles().find((x) => x.id === id);
  return p ? { kind: 'puzzle', fen: p.fen, line: p.line, rating: p.rating } : null;
}

/** Record a card's result. `first`: the card's first try this session (counts toward the rating). */
export function recordResult(
  s: TrainState,
  id: string,
  g: Rating,
  today: number,
  first: boolean,
): { state: TrainState; delta: number; card: Card } {
  const prev = s.cards[id] ?? newCard();
  // a card already reviewed today (a retry after a miss) keeps today's schedule unless solved again
  const card =
    first || prev.last !== today ? review(prev, g, today) : { ...prev, due: g === 1 ? today + 1 : prev.due };
  let rating = s.rating;
  let games = s.games;
  const d = drillOf(id);
  if (first && d?.kind === 'puzzle' && d.rating > 0) {
    rating = rateAfter(s.rating, d.rating, g > 1, s.games);
    games++;
  }
  return {
    state: {
      ...s,
      rating,
      games,
      cards: { ...s.cards, [id]: card },
      tried: s.tried + (first ? 1 : 0),
      solved: s.solved + (first && g > 1 ? 1 : 0),
    },
    delta: rating - s.rating,
    card,
  };
}

/** Finish a session today. */
export const finishSession = (s: TrainState, today: number): TrainState => ({
  ...s,
  streak: streakAfter(s, today),
  lastDay: today,
});

/** Position of a FEN parsed (helper for callers that only import this module). */
export const posOf = (fen: string): Pos => fromFen(fen);
