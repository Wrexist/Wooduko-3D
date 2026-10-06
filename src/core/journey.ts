// Journey: a map of levels with goals and a move limit (stars for score). Pure: no DOM, no Three.js.
import { BOARD, JOURNEY } from '../config';
import { emptyBoard, place } from './board';
import { hashSeed } from './daily';
import { createRng, dealTray, makeWoodSeed, nextFloat } from './generator';
import type { Rng } from './generator';
import type { MoveResult } from './rules';
import { LEVEL_TABLE } from './journeyTable';
import type { BoardState, Cell, GameState } from './types';

const N = BOARD.size;
export const cellKey = (r: number, c: number): number => r * N + c;
export const keyCell = (k: number): Cell => [Math.floor(k / N), k % N];

export type GoalKind = 'score' | 'lines' | 'gems' | 'crates';

export interface Goal {
  readonly kind: GoalKind;
  /** For gems and crates: how many there are on the board (all must go). */
  readonly target: number;
}

export interface LevelSpec {
  readonly n: number;
  readonly moves: number;
  readonly goals: readonly Goal[];
  /** Wooden crates already on the board: cleared like any block, each counts once. */
  readonly crates: readonly Cell[];
  /** Gems lying in empty cells: collected when a block covers the cell and that line clears. */
  readonly gems: readonly Cell[];
  /** Score (after the moves-left bonus) for the 2nd and 3rd star. Winning gives the 1st. */
  readonly stars: readonly [number, number];
}

/** One attempt at a level. */
export interface LevelRun {
  readonly n: number;
  readonly movesLeft: number;
  readonly lines: number;
  /** Board keys (r·9+c) of crates / gems still to go. */
  readonly crates: readonly number[];
  readonly gems: readonly number[];
  /** Extra-move packs bought this attempt. */
  readonly extras: number;
}

export type RunOutcome = 'playing' | 'won' | 'outOfMoves' | 'noRoom';

// ---------- level design ----------

type Pattern = (rng: Rng, size: number) => Cell[];

/** Mirror a set of cells left↔right so layouts look designed, not random. */
const mirror = (cells: Cell[]): Cell[] => {
  const out = new Map<number, Cell>();
  for (const [r, c] of cells) {
    out.set(cellKey(r, c), [r, c]);
    out.set(cellKey(r, N - 1 - c), [r, N - 1 - c]);
  }
  return [...out.values()];
};

const PATTERNS: readonly Pattern[] = [
  // a block in the middle
  (_r, s) => {
    const out: Cell[] = [];
    const h = Math.min(3, 1 + Math.floor(s / 3));
    for (let r = 4 - Math.floor(h / 2); r < 4 - Math.floor(h / 2) + h; r++)
      for (let c = 3; c < 6; c++) out.push([r, c]);
    return out;
  },
  // four corners
  (_r, s) => {
    const k = s > 6 ? 2 : 1;
    const out: Cell[] = [];
    for (const [r0, c0] of [
      [0, 0],
      [0, N - k],
      [N - k, 0],
      [N - k, N - k],
    ] as const)
      for (let r = 0; r < k; r++) for (let c = 0; c < k; c++) out.push([r0 + r, c0 + c]);
    return out;
  },
  // a diagonal pair of lines (an X)
  (_r, s) => {
    const out: Cell[] = [];
    const len = Math.min(N, 3 + s);
    const from = Math.floor((N - len) / 2);
    for (let i = from; i < from + len; i++) out.push([i, i]);
    return mirror(out);
  },
  // two bars across the board
  (rng, s) => {
    const row = 2 + Math.floor(nextFloat(rng) * 2);
    const len = Math.min(7, 2 + s);
    const out: Cell[] = [];
    for (let c = 0; c < len; c++) out.push([row, c], [N - 1 - row, N - 1 - c]);
    return out;
  },
  // scattered, mirrored
  (rng, s) => {
    const out: Cell[] = [];
    for (let i = 0; i < Math.ceil(s / 2) + 1; i++)
      out.push([Math.floor(nextFloat(rng) * N), Math.floor(nextFloat(rng) * 4)]);
    return mirror(out);
  },
];

/** No row, column or 3×3 square of crates may already be full (it would clear for free). */
function safeCrates(cells: Cell[]): Cell[] {
  const keys = new Set(cells.map(([r, c]) => cellKey(r, c)));
  const out: Cell[] = [];
  for (const [r, c] of cells) {
    const row = [...keys].filter((k) => Math.floor(k / N) === r).length;
    const col = [...keys].filter((k) => k % N === c).length;
    if (row >= N || col >= N) keys.delete(cellKey(r, c));
    else out.push([r, c]);
  }
  return out;
}

function pickGems(rng: Rng, count: number, taken: ReadonlySet<number>): Cell[] {
  const out: Cell[] = [];
  const used = new Set(taken);
  for (let tries = 0; out.length < count && tries < 400; tries++) {
    // gems prefer the middle rows: easier to reach with a line
    const r = Math.floor(nextFloat(rng) * N);
    const c = Math.floor(nextFloat(rng) * N);
    const k = cellKey(r, c);
    if (used.has(k)) continue;
    used.add(k);
    out.push([r, c]);
  }
  return out;
}

/** The fixed tutorial-like start of the map; procedural after that. */
const HANDMADE: Record<number, (rng: Rng) => Omit<LevelSpec, 'n' | 'stars'>> = {
  1: () => ({ moves: 12, goals: [{ kind: 'score', target: 120 }], crates: [], gems: [] }),
  2: () => ({ moves: 12, goals: [{ kind: 'lines', target: 3 }], crates: [], gems: [] }),
  3: () => ({
    moves: 14,
    goals: [{ kind: 'gems', target: 3 }],
    crates: [],
    gems: [
      [4, 2],
      [4, 4],
      [4, 6],
    ],
  }),
  4: () => {
    const crates: Cell[] = [
      [3, 3],
      [3, 5],
      [5, 3],
      [5, 5],
    ];
    return { moves: 14, goals: [{ kind: 'crates', target: crates.length }], crates, gems: [] };
  },
  5: () => ({
    moves: 18,
    goals: [
      { kind: 'lines', target: 5 },
      { kind: 'score', target: 300 },
    ],
    crates: [],
    gems: [],
  }),
};

/**
 * A level's layout and goals before balancing. `variant` picks another layout for the same slot
 * (calibration moves on to the next variant when one is too hard to be fair).
 */
export function designLevel(n: number, variant = 0): LevelSpec {
  const rng = createRng(hashSeed(variant ? `grain-level-${n}-${variant}` : `grain-level-${n}`));
  const d = Math.min(1, (n - 1) / (JOURNEY.levels - 1)); // 0 … 1 difficulty
  const base = (variant === 0 ? HANDMADE[n]?.(rng) : undefined) ?? procedural(n, d, rng);
  const par = base.moves * JOURNEY.parPerMove;
  return { n, ...base, stars: [Math.round(par * 1.15), Math.round(par * 1.5)] };
}

/**
 * Level `n` (1-based). Deterministic: the same for every player. Moves and star scores come from
 * the bot-calibrated table (`npm run journey:calibrate` writes core/journeyTable.ts).
 */
export function levelSpec(n: number): LevelSpec {
  const t = LEVEL_TABLE[n - 1];
  const spec = designLevel(n, t?.[0] ?? 0);
  return t ? { ...spec, moves: t[1], stars: [t[2], t[3]] } : spec;
}

function procedural(n: number, d: number, rng: Rng): Omit<LevelSpec, 'n' | 'stars'> {
  const kind = n % 5;
  const size = 2 + Math.round(d * 6);
  const goals: Goal[] = [];
  let crates: Cell[] = [];
  let gems: Cell[] = [];
  if (kind === 1 || kind === 3) {
    const pattern = PATTERNS[Math.floor(nextFloat(rng) * PATTERNS.length)] ?? PATTERNS[0];
    crates = safeCrates(pattern ? pattern(rng, size) : []);
    goals.push({ kind: 'crates', target: crates.length });
  }
  if (kind === 2 || kind === 3 || kind === 4) {
    const count = 2 + Math.round(d * 3) - (kind === 3 ? 1 : 0);
    gems = pickGems(rng, count, new Set(crates.map(([r, c]) => cellKey(r, c))));
    goals.push({ kind: 'gems', target: gems.length });
  }
  if (kind === 0) goals.push({ kind: 'lines', target: 3 + Math.round(d * 7) });
  // score goals: what a fair player makes in 12 … 26 moves
  if (kind === 0 || kind === 4)
    goals.push({ kind: 'score', target: Math.round((JOURNEY.parPerMove * (12 + d * 14)) / 10) * 10 });
  // moves: generous early, tighter later (tuned with the playtest bot, see tests/sim)
  const need =
    crates.length * JOURNEY.movesPerCrate +
    gems.length * JOURNEY.movesPerGem +
    (goals.find((g) => g.kind === 'lines')?.target ?? 0) * JOURNEY.movesPerLine +
    (goals.find((g) => g.kind === 'score')?.target ?? 0) / JOURNEY.parPerMove;
  const slack = JOURNEY.slackStart - (JOURNEY.slackStart - JOURNEY.slackEnd) * d;
  const moves = Math.max(JOURNEY.minMoves, Math.min(JOURNEY.maxMoves, Math.round(need * slack)));
  return { moves, goals, crates, gems };
}

// ---------- playing a level ----------

/** Board with the level's crates in place and a first tray that fits. */
export function levelGame(spec: LevelSpec, rngState: number): GameState {
  const rng = createRng(rngState);
  let board: BoardState = emptyBoard();
  for (const [r, c] of spec.crates)
    board = place(board, [[r, c]], [c + 0.5, r + 0.5], makeWoodSeed(rng)).board;
  const deal = dealTray(board, rng, { score: 0, sinceSmall: 0 });
  return {
    board,
    tray: deal.pieces,
    score: 0,
    streak: 0,
    misses: 0,
    sinceSmall: deal.sinceSmall,
    revives: 0,
    rng: rng.state,
    over: false,
  };
}

export const startRun = (spec: LevelSpec): LevelRun => ({
  n: spec.n,
  movesLeft: spec.moves,
  lines: 0,
  crates: spec.crates.map(([r, c]) => cellKey(r, c)),
  gems: spec.gems.map(([r, c]) => cellKey(r, c)),
  extras: 0,
});

/** Fold one placement in: a move used, lines cleared, crates and gems taken by the clear. */
export function applyRunMove(run: LevelRun, move: MoveResult): LevelRun {
  const cleared = new Set(move.clear.cells.map(([r, c]) => cellKey(r, c)));
  return {
    ...run,
    movesLeft: Math.max(0, run.movesLeft - 1),
    lines: run.lines + move.clear.units,
    crates: run.crates.filter((k) => !cleared.has(k)),
    gems: run.gems.filter((k) => !cleared.has(k)),
  };
}

/** Gems a move just collected (for the fly-to-HUD effect). */
export const gemsTaken = (before: LevelRun, after: LevelRun): number[] =>
  before.gems.filter((k) => !after.gems.includes(k));

export interface GoalProgress {
  readonly kind: GoalKind;
  readonly current: number;
  readonly target: number;
  readonly done: boolean;
}

export function goalProgress(spec: LevelSpec, run: LevelRun, score: number): GoalProgress[] {
  return spec.goals.map((g) => {
    const current =
      g.kind === 'score'
        ? score
        : g.kind === 'lines'
          ? run.lines
          : g.kind === 'gems'
            ? g.target - run.gems.length
            : g.target - run.crates.length;
    return {
      kind: g.kind,
      current: Math.min(current, g.target),
      target: g.target,
      done: current >= g.target,
    };
  });
}

export function runOutcome(spec: LevelSpec, run: LevelRun, game: GameState): RunOutcome {
  if (goalProgress(spec, run, game.score).every((g) => g.done)) return 'won';
  if (run.movesLeft <= 0) return 'outOfMoves';
  if (game.over) return 'noRoom';
  return 'playing';
}

/** Moves left over when the level is won turn into points. */
export const movesBonus = (movesLeft: number): number => movesLeft * JOURNEY.bonusPerMove;

export const starsFor = (spec: LevelSpec, finalScore: number): 1 | 2 | 3 =>
  finalScore >= spec.stars[1] ? 3 : finalScore >= spec.stars[0] ? 2 : 1;

/** Buy more moves after running out (rewarded ad, or free with Remove ads). */
export const addMoves = (run: LevelRun): LevelRun => ({
  ...run,
  movesLeft: run.movesLeft + JOURNEY.extraMoves,
  extras: run.extras + 1,
});

// ---------- progress across the map ----------

export interface JourneyProgress {
  /** Best stars per level (index n−1); a level is unlocked when the previous one has ≥ 1 star. */
  readonly stars: readonly number[];
}

export const emptyJourney = (): JourneyProgress => ({ stars: [] });

/** Highest playable level. */
export const unlockedLevel = (p: JourneyProgress): number => {
  let n = 1;
  while (n <= JOURNEY.levels && (p.stars[n - 1] ?? 0) > 0) n++;
  return Math.min(n, JOURNEY.levels);
};

export const totalStars = (p: JourneyProgress): number => p.stars.reduce((a, b) => a + b, 0);

export function recordWin(p: JourneyProgress, n: number, stars: number): JourneyProgress {
  const next = p.stars.slice();
  while (next.length < n) next.push(0);
  next[n - 1] = Math.max(next[n - 1] ?? 0, stars);
  return { stars: next };
}

export function parseJourney(raw: string | null): JourneyProgress {
  if (!raw) return emptyJourney();
  try {
    const v = JSON.parse(raw) as { stars?: unknown };
    if (!Array.isArray(v.stars)) return emptyJourney();
    const stars = v.stars
      .slice(0, JOURNEY.levels)
      .map((s) => (typeof s === 'number' && Number.isInteger(s) && s >= 0 && s <= 3 ? s : 0));
    return { stars };
  } catch {
    return emptyJourney();
  }
}
