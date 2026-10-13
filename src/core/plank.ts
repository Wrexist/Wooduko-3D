/**
 * Plank fit (Workshop), pure rules. No Three.js / DOM.
 * A carved silhouette must be filled exactly with the given wood pieces. Pieces can be rotated
 * (never mirrored). Levels are generated from a seed by tiling the silhouette, so every level has
 * at least one solution (the hint uses it).
 */
import type { Cell } from './types';

export type Cells = readonly Cell[];

export interface PlankPiece {
  readonly id: number;
  /** Cells as dealt to the tray (normalised: min row/col = 0). */
  readonly cells: Cells;
  /** One solution: the piece rotated `turns` times clockwise from `cells`, top-left at (r, c). */
  readonly solution: { readonly turns: number; readonly r: number; readonly c: number };
}

export interface PlankLevel {
  readonly n: number;
  /** Bounding grid of the silhouette. */
  readonly w: number;
  readonly h: number;
  /** Cells to fill. */
  readonly target: Cells;
  readonly pieces: readonly PlankPiece[];
}

/** A piece on the board: its current cells (after rotation) at top-left (r, c). */
export interface Placed {
  readonly id: number;
  readonly cells: Cells;
  readonly r: number;
  readonly c: number;
}

export const LEVEL_COUNT = 40;

// ---------- cell helpers ----------

const key = (r: number, c: number): string => `${r},${c}`;

export function normalize(cells: Cells): Cell[] {
  const r0 = Math.min(...cells.map((p) => p[0]));
  const c0 = Math.min(...cells.map((p) => p[1]));
  return cells.map((p): Cell => [p[0] - r0, p[1] - c0]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
}

/** Rotate 90° clockwise (then normalise). */
export const rotateCw = (cells: Cells): Cell[] => normalize(cells.map((p): Cell => [p[1], -p[0]]));

export function rotate(cells: Cells, turns: number): Cell[] {
  let out = normalize(cells);
  for (let i = 0; i < ((turns % 4) + 4) % 4; i++) out = rotateCw(out);
  return out;
}

export const sameShape = (a: Cells, b: Cells): boolean => {
  const na = normalize(a);
  const nb = normalize(b);
  return na.length === nb.length && na.every((p, i) => p[0] === nb[i]?.[0] && p[1] === nb[i]?.[1]);
};

const parse = (pattern: string): Cell[] => {
  const out: Cell[] = [];
  pattern.split('|').forEach((row, r) => [...row].forEach((ch, c) => ch === '#' && out.push([r, c])));
  return out;
};

// ---------- pieces and silhouettes ----------

/** Piece pool: [pattern, smallest level it appears in, weight]. */
const POOL: readonly [string, number, number][] = [
  ['##', 1, 0.6],
  ['###', 1, 1.2],
  ['##|#.', 1, 1.4],
  ['####', 1, 1.0],
  ['##|##', 1, 1.0],
  ['#..|###', 4, 1.4],
  ['###|.#.', 4, 1.2],
  ['##.|.##', 8, 1.0],
  ['#..|#..|###', 12, 0.9],
  ['##|##|#.', 12, 1.0],
  ['#.#|###', 18, 0.7],
  ['.#.|###|.#.', 24, 0.4],
  ['##.|.#.|.##', 24, 0.5],
  ['.##|##.|#..', 28, 0.6],
];

function rect(w: number, h: number): Cell[] {
  const out: Cell[] = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out.push([r, c]);
  return out;
}

const minus = (a: Cells, b: Cells): Cell[] => {
  const drop = new Set(b.map((p) => key(p[0], p[1])));
  return a.filter((p) => !drop.has(key(p[0], p[1])));
};

const block = (r0: number, c0: number, w: number, h: number): Cell[] =>
  rect(w, h).map((p): Cell => [p[0] + r0, p[1] + c0]);

/** Silhouette families (all simply connected, no cells touching only at a corner). */
function silhouette(n: number, rand: () => number): Cell[] {
  if (n <= 3) return rect(3, n === 1 ? 2 : 3);
  if (n <= 6) return n % 2 ? rect(4, 3) : rect(3, 4);
  const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)] as T;
  if (n <= 14) {
    return pick([
      () => rect(4, 4),
      () => minus(rect(4, 4), block(0, 3, 1, 1)),
      () => minus(rect(5, 3), block(0, 0, 1, 1)),
      () => minus(rect(4, 4), block(0, 2, 2, 1)),
      () => rect(5, 3),
    ])();
  }
  if (n <= 26) {
    return pick([
      () => rect(5, 4),
      () =>
        minus(rect(5, 5), [
          ...block(0, 0, 1, 1),
          ...block(0, 4, 1, 1),
          ...block(4, 0, 1, 1),
          ...block(4, 4, 1, 1),
        ]),
      () => minus(rect(5, 4), block(0, 2, 1, 1)),
      () => minus(rect(5, 5), block(0, 3, 2, 2)),
      () => minus(rect(6, 4), [...block(0, 0, 1, 1), ...block(3, 5, 1, 1)]),
      () => minus(rect(5, 5), [...block(0, 0, 2, 1), ...block(4, 3, 2, 1)]),
    ])();
  }
  return pick([
    () => rect(6, 5),
    () => rect(6, 6),
    () => minus(rect(6, 6), [...block(0, 0, 2, 2), ...block(4, 4, 2, 2)]),
    () =>
      minus(rect(6, 6), [
        ...block(0, 0, 1, 1),
        ...block(0, 5, 1, 1),
        ...block(5, 0, 1, 1),
        ...block(5, 5, 1, 1),
      ]),
    () => minus(rect(6, 5), block(0, 2, 2, 1)),
    () => minus(rect(7, 5), [...block(0, 0, 1, 2), ...block(3, 6, 1, 2)]),
  ])();
}

// ---------- generation ----------

export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function orientations(cells: Cells): Cell[][] {
  const out: Cell[][] = [];
  let cur = normalize(cells);
  for (let i = 0; i < 4; i++) {
    if (!out.some((o) => sameShape(o, cur))) out.push(cur);
    cur = rotateCw(cur);
  }
  return out;
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  for (let i = xs.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [xs[i], xs[j]] = [xs[j] as T, xs[i] as T];
  }
  return xs;
}

/** Tile `target` with pool pieces (random, backtracking). Returns placed pieces or null. */
function tile(target: Cells, n: number, rand: () => number): Placed[] | null {
  const open = new Set(target.map((p) => key(p[0], p[1])));
  const order = normalize(target);
  const pool = POOL.filter(([, from]) => from <= n);
  // later levels lean on bigger pieces
  const bias = Math.min(1, n / LEVEL_COUNT);
  const placed: Placed[] = [];
  let budget = 40_000;
  const weighted = (): string[] => {
    const xs = pool.map(([p, , w]) => ({
      p,
      k: Math.pow(rand(), 1 / (w * (1 + bias * (parse(p).length - 3)))),
    }));
    return xs.sort((a, b) => b.k - a.k).map((x) => x.p);
  };
  const go = (): boolean => {
    if (--budget < 0) return false;
    const first = order.find((p) => open.has(key(p[0], p[1])));
    if (!first) return true;
    for (const pattern of weighted()) {
      for (const o of shuffle(orientations(parse(pattern)), rand)) {
        const a = o[0] as Cell;
        const r0 = first[0] - a[0];
        const c0 = first[1] - a[1];
        if (!o.every((p) => open.has(key(p[0] + r0, p[1] + c0)))) continue;
        for (const p of o) open.delete(key(p[0] + r0, p[1] + c0));
        placed.push({ id: placed.length, cells: o, r: r0, c: c0 });
        if (go()) return true;
        placed.pop();
        for (const p of o) open.add(key(p[0] + r0, p[1] + c0));
      }
    }
    return false;
  };
  return go() ? placed : null;
}

/** Level `n` (1-based), the same on every device. */
export function makeLevel(n: number): PlankLevel {
  for (let attempt = 0; ; attempt++) {
    const rand = rng(n * 7919 + attempt * 104_729 + 17);
    const target = normalize(silhouette(n, rand));
    const tiles = tile(target, n, rand);
    if (!tiles || tiles.length < 2) continue;
    // deal in a shuffled order, each piece turned at random (the first levels stay upright)
    const pieces = shuffle(tiles, rand).map((t, id): PlankPiece => {
      const turns = n <= 2 ? 0 : Math.floor(rand() * 4);
      return { id, cells: rotate(t.cells, -turns), solution: { turns, r: t.r, c: t.c } };
    });
    return {
      n,
      w: Math.max(...target.map((p) => p[1])) + 1,
      h: Math.max(...target.map((p) => p[0])) + 1,
      target,
      pieces,
    };
  }
}

// ---------- rules ----------

/** Can `cells` go at (r, c): inside the silhouette and on no other placed piece (except `ignore`). */
export function canPlace(
  level: PlankLevel,
  placed: readonly Placed[],
  cells: Cells,
  r: number,
  c: number,
  ignore = -1,
): boolean {
  const target = new Set(level.target.map((p) => key(p[0], p[1])));
  const used = new Set<string>();
  for (const p of placed) if (p.id !== ignore) for (const q of p.cells) used.add(key(q[0] + p.r, q[1] + p.c));
  return cells.every((p) => {
    const k = key(p[0] + r, p[1] + c);
    return target.has(k) && !used.has(k);
  });
}

export const isComplete = (level: PlankLevel, placed: readonly Placed[]): boolean =>
  placed.reduce((a, p) => a + p.cells.length, 0) === level.target.length;

/** Stars: no hints = 3, one hint = 2, more = 1. */
export const plankStars = (hints: number): number => (hints === 0 ? 3 : hints === 1 ? 2 : 1);

export interface PlankProgress {
  readonly stars: readonly number[];
}

export function plankRecord(p: PlankProgress, n: number, stars: number): PlankProgress {
  const s = [...p.stars];
  while (s.length < n) s.push(0);
  s[n - 1] = Math.max(s[n - 1] ?? 0, stars);
  return { stars: s };
}

export function parsePlankProgress(raw: string | null): PlankProgress {
  try {
    const v = (raw ? JSON.parse(raw) : null) as { stars?: unknown } | null;
    if (!Array.isArray(v?.stars)) return { stars: [] };
    return {
      stars: (v.stars as unknown[]).map((x) =>
        Number.isInteger(x) && (x as number) >= 0 && (x as number) <= 3 ? (x as number) : 0,
      ),
    };
  } catch {
    return { stars: [] };
  }
}
