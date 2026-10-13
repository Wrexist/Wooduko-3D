/**
 * Klotski (sliding blocks), pure rules. No Three.js / DOM.
 * A board of `w × h` cells holds rectangular pieces; one of them (the key piece) must reach the exit.
 * One move = sliding one piece in a straight line by any number of free cells.
 */

export interface KPiece {
  readonly id: number;
  /** Top-left cell. */
  readonly r: number;
  readonly c: number;
  /** Size in cells. */
  readonly w: number;
  readonly h: number;
  /** The piece that has to reach the exit. */
  readonly key: boolean;
}

export interface KLevel {
  readonly w: number;
  readonly h: number;
  readonly pieces: readonly KPiece[];
  /** Where the key piece's top-left must end up. */
  readonly exit: { readonly r: number; readonly c: number };
}

export type KDir = 'up' | 'down' | 'left' | 'right';
const DELTA: Record<KDir, readonly [number, number]> = {
  up: [-1, 0],
  down: [1, 0],
  left: [0, -1],
  right: [0, 1],
};
export const K_DIRS: readonly KDir[] = ['up', 'down', 'left', 'right'];

/**
 * Parse a level drawn in ASCII, one row per string. `.` = empty, `A` = the key piece, any other
 * letter = a piece (each letter one rectangle). The exit is where `A` sits in the solved position:
 * centred on the bottom edge (the classic Klotski exit), unless `exit` is given.
 */
export function parseLevel(rows: readonly string[], exit?: { r: number; c: number }): KLevel {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  const seen = new Map<string, { r0: number; c0: number; r1: number; c1: number; n: number }>();
  rows.forEach((row, r) => {
    if (row.length !== w) throw new Error(`row ${r} has ${row.length} cells, expected ${w}`);
    [...row].forEach((ch, c) => {
      if (ch === '.') return;
      const b = seen.get(ch);
      if (!b) seen.set(ch, { r0: r, c0: c, r1: r, c1: c, n: 1 });
      else {
        b.r0 = Math.min(b.r0, r);
        b.c0 = Math.min(b.c0, c);
        b.r1 = Math.max(b.r1, r);
        b.c1 = Math.max(b.c1, c);
        b.n++;
      }
    });
  });
  const pieces: KPiece[] = [];
  let id = 0;
  // key piece first, so its id is always 0
  for (const ch of ['A', ...[...seen.keys()].filter((k) => k !== 'A').sort()]) {
    const b = seen.get(ch);
    if (!b) continue;
    const pw = b.c1 - b.c0 + 1;
    const ph = b.r1 - b.r0 + 1;
    if (pw * ph !== b.n) throw new Error(`piece ${ch} is not a rectangle`);
    pieces.push({ id: id++, r: b.r0, c: b.c0, w: pw, h: ph, key: ch === 'A' });
  }
  const key = pieces[0];
  if (!key?.key) throw new Error('level has no key piece A');
  return { w, h, pieces, exit: exit ?? { r: h - key.h, c: Math.floor((w - key.w) / 2) } };
}

export const keyPiece = (pieces: readonly KPiece[]): KPiece => {
  const k = pieces.find((p) => p.key);
  if (!k) throw new Error('no key piece');
  return k;
};

export function isSolved(level: KLevel, pieces: readonly KPiece[]): boolean {
  const k = keyPiece(pieces);
  return k.r === level.exit.r && k.c === level.exit.c;
}

function occupancy(level: KLevel, pieces: readonly KPiece[], skip = -1): Int16Array {
  const g = new Int16Array(level.w * level.h).fill(-1);
  for (const p of pieces) {
    if (p.id === skip) continue;
    for (let r = p.r; r < p.r + p.h; r++) for (let c = p.c; c < p.c + p.w; c++) g[r * level.w + c] = p.id;
  }
  return g;
}

/** How many cells `piece` can slide in `dir` before hitting a wall or another piece. */
export function maxSlide(level: KLevel, pieces: readonly KPiece[], id: number, dir: KDir): number {
  const p = pieces.find((x) => x.id === id);
  if (!p) return 0;
  const g = occupancy(level, pieces, id);
  const [dr, dc] = DELTA[dir];
  let n = 0;
  for (;;) {
    const r0 = p.r + dr * (n + 1);
    const c0 = p.c + dc * (n + 1);
    if (r0 < 0 || c0 < 0 || r0 + p.h > level.h || c0 + p.w > level.w) return n;
    for (let r = r0; r < r0 + p.h; r++)
      for (let c = c0; c < c0 + p.w; c++) if (g[r * level.w + c] !== -1) return n;
    n++;
  }
}

/** Slide a piece `steps` cells (clamped to what is free). Returns the new pieces, or null if it can't move. */
export function slide(
  level: KLevel,
  pieces: readonly KPiece[],
  id: number,
  dir: KDir,
  steps: number,
): KPiece[] | null {
  const n = Math.min(Math.max(0, Math.floor(steps)), maxSlide(level, pieces, id, dir));
  if (n === 0) return null;
  const [dr, dc] = DELTA[dir];
  return pieces.map((p) => (p.id === id ? { ...p, r: p.r + dr * n, c: p.c + dc * n } : p));
}

/**
 * State key with identical pieces interchangeable: a cell grid of piece *shapes* (key piece marked).
 * Two positions that only swap two same-sized pieces are the same puzzle state.
 */
function stateKey(level: KLevel, pieces: readonly KPiece[]): string {
  const g = new Array<string>(level.w * level.h).fill('.');
  for (const p of pieces) {
    const tag = p.key ? 'K' : String.fromCharCode(97 + p.w * 4 + p.h);
    g[p.r * level.w + p.c] = tag;
    for (let r = p.r; r < p.r + p.h; r++)
      for (let c = p.c; c < p.c + p.w; c++) if (r !== p.r || c !== p.c) g[r * level.w + c] = '#';
  }
  return g.join('');
}

export interface KMove {
  readonly id: number;
  readonly dir: KDir;
  readonly steps: number;
}

/** Free cells for `p` in `dir` on an occupancy grid (its own cells count as free). */
function roomIn(level: KLevel, g: Int16Array, p: KPiece, dir: KDir): number {
  const [dr, dc] = DELTA[dir];
  let n = 0;
  for (;;) {
    const r0 = p.r + dr * (n + 1);
    const c0 = p.c + dc * (n + 1);
    if (r0 < 0 || c0 < 0 || r0 + p.h > level.h || c0 + p.w > level.w) return n;
    for (let r = r0; r < r0 + p.h; r++)
      for (let c = c0; c < c0 + p.w; c++) {
        const o = g[r * level.w + c];
        if (o !== -1 && o !== p.id) return n;
      }
    n++;
  }
}

/**
 * Breadth-first search over states (a move is one straight slide of any length).
 * Returns one shortest solution as a list of moves (empty when already solved), or null if
 * unsolvable or the search exceeds `limit` states. One occupancy grid per state keeps it fast
 * enough for a hint on a phone.
 */
export function searchPath(
  level: KLevel,
  pieces: readonly KPiece[] = level.pieces,
  limit = 400_000,
): KMove[] | null {
  if (isSolved(level, pieces)) return [];
  interface Node {
    readonly ps: readonly KPiece[];
    readonly parent: number;
    readonly move: KMove | null;
  }
  const nodes: Node[] = [{ ps: pieces, parent: -1, move: null }];
  const seen = new Set<string>([stateKey(level, pieces)]);
  const path = (i: number): KMove[] => {
    const out: KMove[] = [];
    for (let k = i; k > 0; k = (nodes[k] as Node).parent) out.push((nodes[k] as Node).move as KMove);
    return out.reverse();
  };
  for (let head = 0; head < nodes.length; head++) {
    const ps = (nodes[head] as Node).ps;
    const g = occupancy(level, ps);
    for (const p of ps) {
      for (const d of K_DIRS) {
        const max = roomIn(level, g, p, d);
        const [dr, dc] = DELTA[d];
        for (let n = 1; n <= max; n++) {
          const moved = ps.map((q) => (q.id === p.id ? { ...q, r: q.r + dr * n, c: q.c + dc * n } : q));
          const k = stateKey(level, moved);
          if (seen.has(k)) continue;
          nodes.push({ ps: moved, parent: head, move: { id: p.id, dir: d, steps: n } });
          if (isSolved(level, moved)) return path(nodes.length - 1);
          seen.add(k);
          if (seen.size > limit) return null;
        }
      }
    }
  }
  return null;
}

/** Fewest moves to solve, or −1 if unsolvable (or the search exceeds `limit` states). */
export function solve(level: KLevel, pieces: readonly KPiece[] = level.pieces, limit = 400_000): number {
  return searchPath(level, pieces, limit)?.length ?? -1;
}

/** The first move of a shortest solution from here (the hint), or null when solved / stuck. */
export const nextMove = (level: KLevel, pieces: readonly KPiece[]): KMove | null =>
  searchPath(level, pieces)?.[0] ?? null;

/** Where every piece is (order-independent): compare positions to reuse a hint plan. */
export const positionKey = (pieces: readonly KPiece[]): string =>
  pieces.map((p) => `${p.id}:${p.r},${p.c}`).join(' ');

/** Stars for a finished level: par or better = 3, within 1.5× par = 2, else 1. Using a hint caps it at 2. */
export function kStars(moves: number, par: number, hinted = false): number {
  if (moves <= par && !hinted) return 3;
  if (moves <= Math.ceil(par * 1.5)) return 2;
  return 1;
}

export interface KProgress {
  /** Best stars per level (index = level − 1). */
  readonly stars: readonly number[];
  /** Fewest moves per level (0 = not solved yet). */
  readonly best: readonly number[];
}

/** Highest level the player may open (1-based): one past the last solved. */
export const kUnlocked = (p: KProgress, total: number): number => {
  let n = 1;
  while (n <= total && (p.stars[n - 1] ?? 0) > 0) n++;
  return Math.min(n, total);
};

/** Keep the best stars, and the fewest moves unless `moves` is null (a solve with a hint). */
export function kRecord(p: KProgress, level: number, stars: number, moves: number | null): KProgress {
  const s = [...p.stars];
  const b = [...p.best];
  while (s.length < level) s.push(0);
  while (b.length < level) b.push(0);
  s[level - 1] = Math.max(s[level - 1] ?? 0, stars);
  const old = b[level - 1] ?? 0;
  if (moves !== null) b[level - 1] = old > 0 ? Math.min(old, moves) : moves;
  return { stars: s, best: b };
}

export function parseKProgress(raw: string | null): KProgress {
  try {
    const v: unknown = raw ? JSON.parse(raw) : null;
    const o = v as { stars?: unknown; best?: unknown } | null;
    const stars = Array.isArray(o?.stars) ? (o.stars as unknown[]) : [];
    const best = Array.isArray(o?.best) ? (o.best as unknown[]) : [];
    const int = (x: unknown, max: number): number =>
      Number.isInteger(x) && (x as number) >= 0 && (x as number) <= max ? (x as number) : 0;
    return { stars: stars.map((x) => int(x, 3)), best: best.map((x) => int(x, 100_000)) };
  } catch {
    return { stars: [], best: [] };
  }
}
