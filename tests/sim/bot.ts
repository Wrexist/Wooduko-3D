// Playtest bots and statistics, built only on the pure core. Used by `npm run sim`.
import { BOARD } from '../../src/config';
import { canFitAnywhere, canPlace, cellAt } from '../../src/core/board';
import { createRng, isSmall, nextFloat } from '../../src/core/generator';
import type { Rng } from '../../src/core/generator';
import { newGame, playMove } from '../../src/core/rules';
import type { MoveResult, RuleSet } from '../../src/core/rules';
import { getShape } from '../../src/core/shapes';
import type { BoardState, GameState, Piece } from '../../src/core/types';

const N = BOARD.size;

export interface Bot {
  readonly name: string;
  /** Higher is better. `rng` adds per-bot noise. */
  score(before: GameState, move: MoveResult, rng: Rng): number;
}

/** Empty cells boxed in on all four sides: only a 1-cell piece can ever fill them. */
function holes(b: BoardState): number {
  let n = 0;
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      if (cellAt(b, r, c)) continue;
      const blocked = (rr: number, cc: number): boolean =>
        rr < 0 || rr >= N || cc < 0 || cc >= N || cellAt(b, rr, cc) !== 0;
      if (blocked(r - 1, c) && blocked(r + 1, c) && blocked(r, c - 1) && blocked(r, c + 1)) n++;
    }
  }
  return n;
}

/** Placed cells touching a wall or an existing block (tidy, compact play). */
function contact(before: BoardState, move: MoveResult): number {
  const mine = new Set(move.cells.map(([r, c]) => r * N + c));
  let n = 0;
  for (const [r, c] of move.cells) {
    for (const [rr, cc] of [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ] as const) {
      if (rr < 0 || rr >= N || cc < 0 || cc >= N) n++;
      else if (!mine.has(rr * N + cc) && cellAt(before, rr, cc)) n++;
    }
  }
  return n;
}

const unfit = (s: GameState): number =>
  s.tray.filter((p) => {
    const sh = p ? getShape(p.shapeIndex) : undefined;
    return sh !== undefined && !canFitAnywhere(s.board, sh);
  }).length;

/** Plans ahead a little: avoids holes and keeps the rest of the tray placeable. */
export const skilled: Bot = {
  name: 'skilled',
  score: (before, m, rng) =>
    m.clear.units * 40 +
    (m.boardClear ? 100 : 0) -
    holes(m.state.board) * 12 -
    unfit(m.state) * 60 +
    contact(before.board, m) * 1.5 +
    nextFloat(rng),
};

/** Likes clears and tidy placement, but doesn't look ahead and is a bit random. */
export const casual: Bot = {
  name: 'casual',
  score: (before, m, rng) => m.clear.units * 40 + contact(before.board, m) * 1.5 + nextFloat(rng) * 25,
};

export interface GameStats {
  moves: number;
  score: number;
  clears: number;
  /** Clears made at streak ≥ 2. */
  comboClears: number;
  maxStreak: number;
  trays: number;
  /** Dealt trays where no piece fitted (instant game over). */
  deadTrays: number;
  /** Dealt trays where at least one piece did not fit. */
  partlyStuckTrays: number;
  longestNoSmall: number;
  /** Big-piece share of dealt pieces by score bucket: [0–1k, 1k–3k, 3k+]. */
  bigDealt: [number, number, number];
  dealt: [number, number, number];
  capped: boolean;
}

export const MOVE_CAP = 2500;

export function playGame(bot: Bot, seed: number, rules: RuleSet): GameStats {
  const rng = createRng(seed * 7919 + 13);
  let s = newGame(seed, rules);
  const st: GameStats = {
    moves: 0,
    score: 0,
    clears: 0,
    comboClears: 0,
    maxStreak: 0,
    trays: 0,
    deadTrays: 0,
    partlyStuckTrays: 0,
    longestNoSmall: 0,
    bigDealt: [0, 0, 0],
    dealt: [0, 0, 0],
    capped: false,
  };
  let noSmall = 0;
  const onDeal = (tray: readonly (Piece | null)[], board: BoardState, score: number): void => {
    st.trays++;
    const bucket = score < 1000 ? 0 : score < 3000 ? 1 : 2;
    let fitting = 0;
    for (const p of tray) {
      const sh = p ? getShape(p.shapeIndex) : undefined;
      if (!sh) continue;
      st.dealt[bucket]++;
      if (sh.cells.length >= rules.generator.bigCells) st.bigDealt[bucket]++;
      noSmall = isSmall(sh, rules.generator) ? 0 : noSmall + 1;
      st.longestNoSmall = Math.max(st.longestNoSmall, noSmall);
      if (canFitAnywhere(board, sh)) fitting++;
    }
    if (fitting === 0) st.deadTrays++;
    if (fitting < tray.length) st.partlyStuckTrays++;
  };
  onDeal(s.tray, s.board, 0);

  while (!s.over && st.moves < MOVE_CAP) {
    let best: MoveResult | null = null;
    let bestScore = -Infinity;
    s.tray.forEach((p, slot) => {
      const sh = p ? getShape(p.shapeIndex) : undefined;
      if (!sh) return;
      for (let r = 0; r <= N - sh.h; r++) {
        for (let c = 0; c <= N - sh.w; c++) {
          if (!canPlace(s.board, sh.cells, r, c)) continue;
          const m = playMove(s, slot, r, c, rules);
          if (!m) continue;
          const v = bot.score(s, m, rng);
          if (v > bestScore) {
            bestScore = v;
            best = m;
          }
        }
      }
    });
    const m = best as MoveResult | null;
    if (!m) break; // cannot happen: the state is not over, so something fits
    st.moves++;
    if (m.clear.units > 0) {
      st.clears++;
      if (m.streak >= 2) st.comboClears++;
      st.maxStreak = Math.max(st.maxStreak, m.streak);
    }
    s = m.state;
    if (m.dealt) onDeal(m.dealt, s.board, s.score);
  }
  st.capped = !s.over;
  st.score = s.score;
  return st;
}

export interface Summary {
  label: string;
  games: number;
  movesMedian: number;
  scoreMedian: number;
  scoreP90: number;
  clearsPerMove: number;
  comboShare: number;
  maxStreak: number;
  deadTrayRate: number;
  stuckTrayRate: number;
  longestNoSmall: number;
  bigShare: [number, number, number];
  capped: number;
}

const quantile = (xs: number[], q: number): number => {
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] ?? 0;
};

export function summarize(label: string, games: GameStats[]): Summary {
  const sum = (f: (g: GameStats) => number): number => games.reduce((a, g) => a + f(g), 0);
  const moves = sum((g) => g.moves);
  const clears = sum((g) => g.clears);
  const trays = sum((g) => g.trays);
  const share = (i: 0 | 1 | 2): number => {
    const d = sum((g) => g.dealt[i]);
    return d ? sum((g) => g.bigDealt[i]) / d : NaN;
  };
  return {
    label,
    games: games.length,
    movesMedian: quantile(
      games.map((g) => g.moves),
      0.5,
    ),
    scoreMedian: quantile(
      games.map((g) => g.score),
      0.5,
    ),
    scoreP90: quantile(
      games.map((g) => g.score),
      0.9,
    ),
    clearsPerMove: clears / moves,
    comboShare: clears ? sum((g) => g.comboClears) / clears : 0,
    maxStreak: Math.max(...games.map((g) => g.maxStreak)),
    deadTrayRate: sum((g) => g.deadTrays) / trays,
    stuckTrayRate: sum((g) => g.partlyStuckTrays) / trays,
    longestNoSmall: Math.max(...games.map((g) => g.longestNoSmall)),
    bigShare: [share(0), share(1), share(2)],
    capped: games.filter((g) => g.capped).length,
  };
}

const pct = (x: number): string => (Number.isNaN(x) ? '–' : `${(x * 100).toFixed(1)}%`);

export function table(rows: Summary[]): string {
  const head =
    '| config | games | median moves | median score | p90 score | clears/move | clears at combo ≥2 | best streak | dead trays | trays w/ unplaceable piece | longest no-small run | big pieces 0–1k / 1–3k / 3k+ | hit move cap |';
  const sep = `|${'---|'.repeat(13)}`;
  const body = rows.map(
    (r) =>
      `| ${r.label} | ${r.games} | ${r.movesMedian} | ${r.scoreMedian} | ${r.scoreP90} | ${r.clearsPerMove.toFixed(3)} | ${pct(r.comboShare)} | ${r.maxStreak} | ${pct(r.deadTrayRate)} | ${pct(r.stuckTrayRate)} | ${r.longestNoSmall} | ${r.bigShare.map(pct).join(' / ')} | ${r.capped} |`,
  );
  return [head, sep, ...body].join('\n');
}
