// Workshop → Checkers: pure rules and the computer opponent (no Three.js / DOM).
// English draughts on 8×8: men move and jump diagonally forward, kings one square any diagonal.
// Jumps are compulsory and continue while the same piece can jump again; reaching the far row
// crowns the man and ends the move. A side with no legal move loses.

/** 1 = the player (bottom, moving up), −1 = the computer (top, moving down). */
export type Side = 1 | -1;
/** 64 squares, index r * 8 + c. 0 empty, ±1 man, ±2 king (sign = side). */
export type CBoard = readonly number[];

export interface CMove {
  readonly from: number;
  /** Squares landed on, in order (one for a step, one per jump). */
  readonly path: readonly number[];
  /** Squares of the pieces jumped, in order (empty for a step). */
  readonly caps: readonly number[];
  /** A man reaches the far row and becomes a king. */
  readonly crown: boolean;
}

export interface COpponent {
  /** Search depth in plies (captures are always searched to the end). */
  readonly depth: number;
  /** Chance of playing a random legal move instead of the best one. */
  readonly blunder: number;
  /** Random spread (centipawns) added to each root move, so weak opponents vary their play. */
  readonly noise: number;
}

export const SIZE = 8;
export const sq = (r: number, c: number): number => r * SIZE + c;
export const rowOf = (s: number): number => Math.floor(s / SIZE);
export const colOf = (s: number): number => s % SIZE;
export const isDark = (r: number, c: number): boolean => (r + c) % 2 === 1;

/** Opponents, weakest first (one per level). */
export const CHECKERS_LEVELS: readonly COpponent[] = [
  { depth: 1, blunder: 0.5, noise: 60 },
  { depth: 1, blunder: 0.35, noise: 50 },
  { depth: 2, blunder: 0.3, noise: 40 },
  { depth: 2, blunder: 0.2, noise: 30 },
  { depth: 3, blunder: 0.15, noise: 25 },
  { depth: 3, blunder: 0.1, noise: 20 },
  { depth: 4, blunder: 0.08, noise: 16 },
  { depth: 4, blunder: 0.05, noise: 12 },
  { depth: 5, blunder: 0.04, noise: 10 },
  { depth: 5, blunder: 0.02, noise: 8 },
  { depth: 6, blunder: 0.01, noise: 6 },
  { depth: 6, blunder: 0, noise: 4 },
  { depth: 7, blunder: 0, noise: 3 },
  { depth: 8, blunder: 0, noise: 2 },
  { depth: 9, blunder: 0, noise: 0 },
];

/** The opponent for level n (1-based). */
export const opponentFor = (n: number): COpponent =>
  CHECKERS_LEVELS[n - 1] ?? CHECKERS_LEVELS[CHECKERS_LEVELS.length - 1] ?? { depth: 4, blunder: 0, noise: 0 };

/** Plies without a capture or a man moving before the game is a draw (40 moves each). */
export const DRAW_PLIES = 80;

export function initialBoard(): number[] {
  const b = new Array<number>(SIZE * SIZE).fill(0);
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++) {
      if (!isDark(r, c)) continue;
      if (r < 3) b[sq(r, c)] = -1;
      else if (r > 4) b[sq(r, c)] = 1;
    }
  return b;
}

const sideOf = (v: number): number => Math.sign(v);
const KING_DIRS: readonly (readonly [number, number])[] = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
];
const dirsFor = (v: number): readonly (readonly [number, number])[] =>
  Math.abs(v) === 2 ? KING_DIRS : v > 0 ? KING_DIRS.slice(0, 2) : KING_DIRS.slice(2);
const crownRow = (side: number): number => (side > 0 ? 0 : SIZE - 1);
const inside = (r: number, c: number): boolean => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

function jumps(
  b: number[],
  from: number,
  v: number,
  cur: number,
  path: number[],
  caps: number[],
  out: CMove[],
): void {
  let more = false;
  const r = rowOf(cur);
  const c = colOf(cur);
  for (const [dr, dc] of dirsFor(v)) {
    const mr = r + dr;
    const mc = c + dc;
    const lr = r + 2 * dr;
    const lc = c + 2 * dc;
    if (!inside(lr, lc)) continue;
    const mid = sq(mr, mc);
    const land = sq(lr, lc);
    if (sideOf(b[mid] ?? 0) !== -sideOf(v) || caps.includes(mid) || b[land] !== 0) continue;
    more = true;
    const p = [...path, land];
    const k = [...caps, mid];
    // a man reaching the far row is crowned, and that ends the move
    if (Math.abs(v) === 1 && lr === crownRow(sideOf(v))) out.push({ from, path: p, caps: k, crown: true });
    else jumps(b, from, v, land, p, k, out);
  }
  if (!more && path.length > 0) out.push({ from, path, caps, crown: false });
}

/** Every legal move for `side` (only jumps when any jump exists). */
export function legalMoves(board: CBoard, side: Side): CMove[] {
  const b = [...board];
  const caps: CMove[] = [];
  for (let s = 0; s < b.length; s++) {
    const v = b[s] ?? 0;
    if (sideOf(v) !== side) continue;
    b[s] = 0; // the moving piece has left its square
    jumps(b, s, v, s, [], [], caps);
    b[s] = v;
  }
  if (caps.length) return caps;
  const steps: CMove[] = [];
  for (let s = 0; s < b.length; s++) {
    const v = b[s] ?? 0;
    if (sideOf(v) !== side) continue;
    for (const [dr, dc] of dirsFor(v)) {
      const r = rowOf(s) + dr;
      const c = colOf(s) + dc;
      if (!inside(r, c) || b[sq(r, c)] !== 0) continue;
      steps.push({ from: s, path: [sq(r, c)], caps: [], crown: Math.abs(v) === 1 && r === crownRow(side) });
    }
  }
  return steps;
}

export function applyMove(board: CBoard, m: CMove): number[] {
  const b = [...board];
  const v = b[m.from] ?? 0;
  b[m.from] = 0;
  for (const c of m.caps) b[c] = 0;
  const to = m.path[m.path.length - 1] ?? m.from;
  b[to] = m.crown ? sideOf(v) * 2 : v;
  return b;
}

export const count = (b: CBoard, side: Side): number => b.filter((v) => sideOf(v) === side).length;

/** Resets the draw counter: a capture or a man moving can't be undone by repetition. */
export const isProgress = (b: CBoard, m: CMove): boolean =>
  m.caps.length > 0 || Math.abs(b[m.from] ?? 0) === 1;

/** Static score for `side` (positive = good for `side`). */
export function evaluate(b: CBoard, side: Side): number {
  let score = 0;
  let mine = 0;
  let theirs = 0;
  for (let s = 0; s < b.length; s++) {
    const v = b[s] ?? 0;
    if (!v) continue;
    const r = rowOf(s);
    const c = colOf(s);
    const own = sideOf(v);
    let val: number;
    if (Math.abs(v) === 2) val = 175;
    else {
      // men grow in value as they advance; keeping the home row guards against enemy kings
      const adv = own > 0 ? SIZE - 1 - r : r;
      val = 100 + adv * 4 + (adv === 0 ? 8 : 0);
    }
    if (c >= 2 && c <= 5 && r >= 2 && r <= 5) val += 4;
    if (own === side) {
      score += val;
      mine++;
    } else {
      score -= val;
      theirs++;
    }
  }
  // when ahead, trade down: the same lead counts for more with fewer pieces left
  if (mine > theirs && theirs > 0) score += Math.round((mine - theirs) * (24 - theirs - mine) * 2);
  if (theirs > mine && mine > 0) score -= Math.round((theirs - mine) * (24 - theirs - mine) * 2);
  return score;
}

const WIN = 100_000;

interface Search {
  nodes: number;
  readonly limit: number;
}

function negamax(
  b: CBoard,
  side: Side,
  depth: number,
  alpha: number,
  beta: number,
  ply: number,
  s: Search,
): number {
  const moves = legalMoves(b, side);
  if (!moves.length) return -WIN + ply;
  // quiet position at the horizon (or out of budget): stop; forced captures are always followed
  const forced = (moves[0]?.caps.length ?? 0) > 0;
  if ((depth <= 0 && !forced) || ply > 40 || s.nodes > s.limit) return evaluate(b, side);
  s.nodes++;
  let best = -Infinity;
  for (const m of moves) {
    const v = -negamax(applyMove(b, m), -side as Side, depth - 1, -beta, -alpha, ply + 1, s);
    if (v > best) best = v;
    if (v > alpha) alpha = v;
    if (alpha >= beta) break;
  }
  return best;
}

/** Root scores for every legal move (higher = better for `side`). */
export function scoreMoves(b: CBoard, side: Side, depth: number, limit = 400_000): { m: CMove; v: number }[] {
  const s: Search = { nodes: 0, limit };
  return legalMoves(b, side).map((m) => ({
    m,
    v: -negamax(applyMove(b, m), -side as Side, depth - 1, -Infinity, Infinity, 1, s),
  }));
}

/** The opponent's choice: usually the best scored move, sometimes a random one (weaker levels). */
export function chooseMove(
  b: CBoard,
  side: Side,
  o: COpponent,
  rand: () => number = Math.random,
): CMove | null {
  const scored = scoreMoves(b, side, o.depth);
  if (!scored.length) return null;
  if (scored.length > 1 && rand() < o.blunder) return scored[Math.floor(rand() * scored.length)]?.m ?? null;
  let pick = scored[0];
  let top = -Infinity;
  for (const x of scored) {
    const v = x.v + rand() * o.noise;
    if (v > top) {
      top = v;
      pick = x;
    }
  }
  return pick?.m ?? null;
}

/** Best move for a hint: a fixed, fairly deep search with no randomness. */
export function hintMove(b: CBoard, side: Side, depth = 6): CMove | null {
  const scored = scoreMoves(b, side, depth);
  let pick: CMove | null = null;
  let top = -Infinity;
  for (const x of scored)
    if (x.v > top) {
      top = x.v;
      pick = x.m;
    }
  return pick;
}

/**
 * Stars for a win: 3 = lost at most 3 pieces without help, 2 = at most 7 (or any help),
 * 1 = any other win. Undo and hints both count as help.
 */
export function cStars(lost: number, helped: boolean): number {
  if (lost <= 3 && !helped) return 3;
  if (lost <= 7) return 2;
  return 1;
}
