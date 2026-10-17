// Workshop → Chess: pure rules and the computer opponent (no Three.js / DOM).
// 0x88 board: square = row * 16 + col, row 0 is Black's back rank (top of the screen), row 7 White's.
// Pieces: sign = side (+1 White = you, −1 Black = the computer), |v| = type.
// Moves are ints: from | to << 7 | promo << 14 | flags << 17.

export const PAWN = 1;
export const KNIGHT = 2;
export const BISHOP = 3;
export const ROOK = 4;
export const QUEEN = 5;
export const KING = 6;

export const F_CAPTURE = 1;
export const F_DOUBLE = 2;
export const F_EP = 4;
export const F_CASTLE = 8;

export type Side = 1 | -1;

export const mFrom = (m: number): number => m & 127;
export const mTo = (m: number): number => (m >> 7) & 127;
export const mPromo = (m: number): number => (m >> 14) & 7;
export const mFlags = (m: number): number => (m >> 17) & 15;
const enc = (from: number, to: number, promo: number, flags: number): number =>
  from | (to << 7) | (promo << 14) | (flags << 17);

/** 0x88 square ↔ 0..63 (row * 8 + col). */
export const to64 = (s: number): number => (s >> 4) * 8 + (s & 7);
export const from64 = (i: number): number => (i >> 3) * 16 + (i & 7);
const onBoard = (s: number): boolean => (s & 0x88) === 0;

const KNIGHT_D = [-33, -31, -18, -14, 14, 18, 31, 33];
const KING_D = [-17, -16, -15, -1, 1, 15, 16, 17];
const BISHOP_D = [-17, -15, 15, 17];
const ROOK_D = [-16, -1, 1, 16];

// ---------- Zobrist keys (two 32-bit halves) ----------
let seed = 0x9e3779b9;
const rnd32 = (): number => {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed | 0;
};
const Z_PIECE_LO = new Int32Array(13 * 128);
const Z_PIECE_HI = new Int32Array(13 * 128);
for (let i = 0; i < Z_PIECE_LO.length; i++) {
  Z_PIECE_LO[i] = rnd32();
  Z_PIECE_HI[i] = rnd32();
}
const Z_CASTLE_LO = Int32Array.from({ length: 16 }, rnd32);
const Z_CASTLE_HI = Int32Array.from({ length: 16 }, rnd32);
const Z_EP_LO = Int32Array.from({ length: 8 }, rnd32);
const Z_EP_HI = Int32Array.from({ length: 8 }, rnd32);
const Z_SIDE_LO = rnd32();
const Z_SIDE_HI = rnd32();
const zi = (v: number, s: number): number => (v + 6) * 128 + s;

/** Castling rights kept after a move touches a square (rook or king squares clear their right). */
const CASTLE_MASK = new Int8Array(128).fill(15);
CASTLE_MASK[0x00] = 15 & ~8; // a8
CASTLE_MASK[0x07] = 15 & ~4; // h8
CASTLE_MASK[0x04] = 15 & ~12; // e8
CASTLE_MASK[0x70] = 15 & ~2; // a1
CASTLE_MASK[0x77] = 15 & ~1; // h1
CASTLE_MASK[0x74] = 15 & ~3; // e1

interface Undo {
  readonly m: number;
  readonly cap: number;
  readonly castle: number;
  readonly ep: number;
  readonly half: number;
  readonly lo: number;
  readonly hi: number;
}

export class Pos {
  readonly b = new Int8Array(128);
  side: Side = 1;
  /** Bits: 1 White short, 2 White long, 4 Black short, 8 Black long. */
  castle = 15;
  ep = -1;
  half = 0;
  /** King squares: [White, Black]. */
  readonly kings = [0x74, 0x04];
  lo = 0;
  hi = 0;
  readonly undo: Undo[] = [];
  /** Position hashes since the game began (for repetition), parallel lo / hi. */
  readonly histLo: number[] = [];
  readonly histHi: number[] = [];

  king(side: Side): number {
    return this.kings[side === 1 ? 0 : 1] ?? 0;
  }

  rehash(): void {
    let lo = 0;
    let hi = 0;
    for (let s = 0; s < 128; s++) {
      const v = this.b[s] ?? 0;
      if (!onBoard(s) || !v) continue;
      lo ^= Z_PIECE_LO[zi(v, s)] ?? 0;
      hi ^= Z_PIECE_HI[zi(v, s)] ?? 0;
    }
    lo ^= Z_CASTLE_LO[this.castle] ?? 0;
    hi ^= Z_CASTLE_HI[this.castle] ?? 0;
    if (this.ep >= 0) {
      lo ^= Z_EP_LO[this.ep & 7] ?? 0;
      hi ^= Z_EP_HI[this.ep & 7] ?? 0;
    }
    if (this.side === -1) {
      lo ^= Z_SIDE_LO;
      hi ^= Z_SIDE_HI;
    }
    this.lo = lo;
    this.hi = hi;
  }
}

const FEN_PIECES: Record<string, number> = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING };
export const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export function fromFen(fen: string): Pos {
  const p = new Pos();
  const [board = '', side = 'w', castle = '-', ep = '-', half = '0'] = fen.trim().split(/\s+/);
  board.split('/').forEach((row, r) => {
    let c = 0;
    for (const ch of row) {
      if (ch >= '1' && ch <= '8') c += Number(ch);
      else {
        const t = FEN_PIECES[ch.toLowerCase()] ?? 0;
        const v = ch === ch.toLowerCase() ? -t : t;
        const s = r * 16 + c;
        p.b[s] = v;
        if (t === KING) p.kings[v > 0 ? 0 : 1] = s;
        c++;
      }
    }
  });
  p.side = side === 'b' ? -1 : 1;
  p.castle =
    (castle.includes('K') ? 1 : 0) |
    (castle.includes('Q') ? 2 : 0) |
    (castle.includes('k') ? 4 : 0) |
    (castle.includes('q') ? 8 : 0);
  p.ep = ep === '-' ? -1 : (8 - Number(ep[1])) * 16 + (ep.charCodeAt(0) - 97);
  p.half = Number(half) || 0;
  p.rehash();
  p.histLo.push(p.lo);
  p.histHi.push(p.hi);
  return p;
}

export const newGame = (): Pos => fromFen(START_FEN);

/** Is square `s` attacked by `by`? */
export function attacked(p: Pos, s: number, by: Side): boolean {
  const b = p.b;
  // pawns: a White pawn attacks up-left / up-right, so it sits below the square
  if (by === 1) {
    if (onBoard(s + 15) && b[s + 15] === PAWN) return true;
    if (onBoard(s + 17) && b[s + 17] === PAWN) return true;
  } else {
    if (onBoard(s - 15) && b[s - 15] === -PAWN) return true;
    if (onBoard(s - 17) && b[s - 17] === -PAWN) return true;
  }
  for (const d of KNIGHT_D) {
    const t = s + d;
    if (onBoard(t) && b[t] === by * KNIGHT) return true;
  }
  for (const d of KING_D) {
    const t = s + d;
    if (onBoard(t) && b[t] === by * KING) return true;
  }
  for (const d of BISHOP_D) {
    let t = s + d;
    while (onBoard(t)) {
      const v = b[t] ?? 0;
      if (v) {
        if (v === by * BISHOP || v === by * QUEEN) return true;
        break;
      }
      t += d;
    }
  }
  for (const d of ROOK_D) {
    let t = s + d;
    while (onBoard(t)) {
      const v = b[t] ?? 0;
      if (v) {
        if (v === by * ROOK || v === by * QUEEN) return true;
        break;
      }
      t += d;
    }
  }
  return false;
}

export const inCheck = (p: Pos, side: Side = p.side): boolean =>
  p.b[p.king(side)] === side * KING && attacked(p, p.king(side), -side as Side);

/** Pseudo-legal moves (may leave the king in check). `caps` = captures and queen promotions only. */
export function genMoves(p: Pos, out: number[], caps = false): number[] {
  const b = p.b;
  const side = p.side;
  for (let s = 0; s < 128; s++) {
    if (!onBoard(s)) {
      s += 7;
      continue;
    }
    const v = b[s] ?? 0;
    if (v * side <= 0) continue;
    const t = v * side;
    if (t === PAWN) {
      const dir = side === 1 ? -16 : 16;
      const last = side === 1 ? 0 : 7;
      const start = side === 1 ? 6 : 1;
      const one = s + dir;
      const promoting = one >> 4 === last;
      if (onBoard(one) && !b[one]) {
        if (promoting) {
          out.push(enc(s, one, QUEEN, 0));
          if (!caps) for (const pr of [KNIGHT, ROOK, BISHOP]) out.push(enc(s, one, pr, 0));
        } else if (!caps) {
          out.push(enc(s, one, 0, 0));
          const two = one + dir;
          if (s >> 4 === start && !b[two]) out.push(enc(s, two, 0, F_DOUBLE));
        }
      }
      for (const dc of [-1, 1]) {
        const to = one + dc;
        if (!onBoard(to)) continue;
        const w = b[to] ?? 0;
        if (w * side < 0) {
          if (promoting) {
            out.push(enc(s, to, QUEEN, F_CAPTURE));
            if (!caps) for (const pr of [KNIGHT, ROOK, BISHOP]) out.push(enc(s, to, pr, F_CAPTURE));
          } else out.push(enc(s, to, 0, F_CAPTURE));
        } else if (to === p.ep) out.push(enc(s, to, 0, F_CAPTURE | F_EP));
      }
    } else if (t === KNIGHT || t === KING) {
      for (const d of t === KNIGHT ? KNIGHT_D : KING_D) {
        const to = s + d;
        if (!onBoard(to)) continue;
        const w = b[to] ?? 0;
        if (w * side > 0) continue;
        if (w) out.push(enc(s, to, 0, F_CAPTURE));
        else if (!caps) out.push(enc(s, to, 0, 0));
      }
    } else {
      const dirs = t === BISHOP ? BISHOP_D : t === ROOK ? ROOK_D : KING_D;
      for (const d of dirs) {
        let to = s + d;
        while (onBoard(to)) {
          const w = b[to] ?? 0;
          if (w) {
            if (w * side < 0) out.push(enc(s, to, 0, F_CAPTURE));
            break;
          }
          if (!caps) out.push(enc(s, to, 0, 0));
          to += d;
        }
      }
    }
  }
  if (!caps) castles(p, out);
  return out;
}

function castles(p: Pos, out: number[]): void {
  const b = p.b;
  const side = p.side;
  const k = side === 1 ? 0x74 : 0x04;
  const short = side === 1 ? 1 : 4;
  const long = side === 1 ? 2 : 8;
  const them = -side as Side;
  if (b[k] !== side * KING) return;
  if (p.castle & short && !b[k + 1] && !b[k + 2] && b[k + 3] === side * ROOK)
    if (!attacked(p, k, them) && !attacked(p, k + 1, them) && !attacked(p, k + 2, them))
      out.push(enc(k, k + 2, 0, F_CASTLE));
  if (p.castle & long && !b[k - 1] && !b[k - 2] && !b[k - 3] && b[k - 4] === side * ROOK)
    if (!attacked(p, k, them) && !attacked(p, k - 1, them) && !attacked(p, k - 2, them))
      out.push(enc(k, k - 2, 0, F_CASTLE));
}

const xorPiece = (p: Pos, v: number, s: number): void => {
  p.lo ^= Z_PIECE_LO[zi(v, s)] ?? 0;
  p.hi ^= Z_PIECE_HI[zi(v, s)] ?? 0;
};

export function makeMove(p: Pos, m: number): void {
  const b = p.b;
  const from = mFrom(m);
  const to = mTo(m);
  const flags = mFlags(m);
  const promo = mPromo(m);
  const side = p.side;
  const piece = b[from] ?? 0;
  // en passant takes the pawn beside the mover, one row behind the landing square
  const capSq = flags & F_EP ? to + (side === 1 ? 16 : -16) : to;
  const cap = b[capSq] ?? 0;
  p.undo.push({ m, cap, castle: p.castle, ep: p.ep, half: p.half, lo: p.lo, hi: p.hi });
  xorPiece(p, piece, from);
  if (cap) {
    xorPiece(p, cap, capSq);
    b[capSq] = 0;
  }
  const placed = promo ? side * promo : piece;
  b[from] = 0;
  b[to] = placed;
  xorPiece(p, placed, to);
  if (flags & F_CASTLE) {
    const rf = to > from ? from + 3 : from - 4;
    const rt = to > from ? from + 1 : from - 1;
    const rook = b[rf] ?? 0;
    b[rf] = 0;
    b[rt] = rook;
    xorPiece(p, rook, rf);
    xorPiece(p, rook, rt);
  }
  if (piece * side === KING) p.kings[side === 1 ? 0 : 1] = to;
  p.lo ^= Z_CASTLE_LO[p.castle] ?? 0;
  p.hi ^= Z_CASTLE_HI[p.castle] ?? 0;
  p.castle &= (CASTLE_MASK[from] ?? 15) & (CASTLE_MASK[to] ?? 15);
  p.lo ^= Z_CASTLE_LO[p.castle] ?? 0;
  p.hi ^= Z_CASTLE_HI[p.castle] ?? 0;
  if (p.ep >= 0) {
    p.lo ^= Z_EP_LO[p.ep & 7] ?? 0;
    p.hi ^= Z_EP_HI[p.ep & 7] ?? 0;
  }
  p.ep = flags & F_DOUBLE ? (from + to) >> 1 : -1;
  if (p.ep >= 0) {
    p.lo ^= Z_EP_LO[p.ep & 7] ?? 0;
    p.hi ^= Z_EP_HI[p.ep & 7] ?? 0;
  }
  p.half = piece * side === PAWN || cap ? 0 : p.half + 1;
  p.side = -side as Side;
  p.lo ^= Z_SIDE_LO;
  p.hi ^= Z_SIDE_HI;
  p.histLo.push(p.lo);
  p.histHi.push(p.hi);
}

export function unmakeMove(p: Pos): void {
  const u = p.undo.pop();
  if (!u) return;
  p.histLo.pop();
  p.histHi.pop();
  const b = p.b;
  const m = u.m;
  const from = mFrom(m);
  const to = mTo(m);
  const flags = mFlags(m);
  const side = -p.side as Side;
  p.side = side;
  const placed = b[to] ?? 0;
  const piece = mPromo(m) ? side * PAWN : placed;
  b[from] = piece;
  b[to] = 0;
  if (u.cap) b[flags & F_EP ? to + (side === 1 ? 16 : -16) : to] = u.cap;
  if (flags & F_CASTLE) {
    const rf = to > from ? from + 3 : from - 4;
    const rt = to > from ? from + 1 : from - 1;
    b[rf] = b[rt] ?? 0;
    b[rt] = 0;
  }
  if (piece * side === KING) p.kings[side === 1 ? 0 : 1] = from;
  p.castle = u.castle;
  p.ep = u.ep;
  p.half = u.half;
  p.lo = u.lo;
  p.hi = u.hi;
}

/** A pass (for null-move pruning in the search). */
function makeNull(p: Pos): void {
  p.undo.push({ m: 0, cap: 0, castle: p.castle, ep: p.ep, half: p.half, lo: p.lo, hi: p.hi });
  if (p.ep >= 0) {
    p.lo ^= Z_EP_LO[p.ep & 7] ?? 0;
    p.hi ^= Z_EP_HI[p.ep & 7] ?? 0;
  }
  p.ep = -1;
  p.side = -p.side as Side;
  p.lo ^= Z_SIDE_LO;
  p.hi ^= Z_SIDE_HI;
  p.histLo.push(p.lo);
  p.histHi.push(p.hi);
}

function unmakeNull(p: Pos): void {
  const u = p.undo.pop();
  if (!u) return;
  p.histLo.pop();
  p.histHi.pop();
  p.side = -p.side as Side;
  p.ep = u.ep;
  p.lo = u.lo;
  p.hi = u.hi;
}

/** Legal moves for the side to move. */
export function legalMoves(p: Pos): number[] {
  const out: number[] = [];
  const side = p.side;
  // lesson boards may have no king at all: then nothing can be left in check
  if (p.b[p.king(side)] !== side * KING) return genMoves(p, out);
  for (const m of genMoves(p, [])) {
    makeMove(p, m);
    if (!inCheck(p, side)) out.push(m);
    unmakeMove(p);
  }
  return out;
}

export function perft(p: Pos, depth: number): number {
  if (depth === 0) return 1;
  let n = 0;
  const side = p.side;
  for (const m of genMoves(p, [])) {
    makeMove(p, m);
    if (!inCheck(p, side)) n += perft(p, depth - 1);
    unmakeMove(p);
  }
  return n;
}

/** How many times the current position has stood (same side to move, rights, ep). */
export function repetitions(p: Pos): number {
  let n = 0;
  const last = p.histLo.length - 1;
  // only positions since the last capture / pawn move can repeat, and only with the same side to move
  for (let i = last; i >= 0 && i >= last - p.half; i -= 2)
    if (p.histLo[i] === p.lo && p.histHi[i] === p.hi) n++;
  return n;
}

/** Neither side can ever mate (K v K, K + one minor v K, or bishops all on one colour). */
export function insufficient(p: Pos): boolean {
  let minors = 0;
  let bishopColours = 0;
  let knights = 0;
  for (let s = 0; s < 128; s++) {
    if (!onBoard(s)) continue;
    const t = Math.abs(p.b[s] ?? 0);
    if (!t || t === KING) continue;
    if (t === PAWN || t === ROOK || t === QUEEN) return false;
    minors++;
    if (t === KNIGHT) knights++;
    else bishopColours |= 1 << (((s >> 4) + (s & 7)) & 1);
  }
  if (minors <= 1) return true;
  return knights === 0 && bishopColours !== 3;
}

export type Status = 'play' | 'mate' | 'stalemate' | 'fifty' | 'repetition' | 'material';

export function status(p: Pos): Status {
  if (!legalMoves(p).length) return inCheck(p) ? 'mate' : 'stalemate';
  if (p.half >= 100) return 'fifty';
  if (repetitions(p) >= 3) return 'repetition';
  if (insufficient(p)) return 'material';
  return 'play';
}

// ---------- evaluation ----------

const VALUE = [0, 100, 320, 330, 500, 900, 0];

// piece-square tables from White's side, a8 first (index = row * 8 + col)
// prettier-ignore
const PST: readonly (readonly number[])[] = [
  [],
  [ 0,  0,  0,  0,  0,  0,  0,  0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30, 20, 10, 10,  5,  5, 10, 25, 25, 10,  5,  5,
    0,  0,  0, 20, 20,  0,  0,  0,  5, -5,-10,  0,  0,-10, -5,  5,  5, 10, 10,-20,-20, 10, 10,  5,  0,  0,  0,  0,  0,  0,  0,  0],
  [-50,-40,-30,-30,-30,-30,-40,-50,-40,-20,  0,  0,  0,  0,-20,-40,-30,  0, 10, 15, 15, 10,  0,-30,-30,  5, 15, 20, 20, 15,  5,-30,
   -30,  0, 15, 20, 20, 15,  0,-30,-30,  5, 10, 15, 15, 10,  5,-30,-40,-20,  0,  5,  5,  0,-20,-40,-50,-40,-30,-30,-30,-30,-40,-50],
  [-20,-10,-10,-10,-10,-10,-10,-20,-10,  0,  0,  0,  0,  0,  0,-10,-10,  0,  5, 10, 10,  5,  0,-10,-10,  5,  5, 10, 10,  5,  5,-10,
   -10,  0, 10, 10, 10, 10,  0,-10,-10, 10, 10, 10, 10, 10, 10,-10,-10,  5,  0,  0,  0,  0,  5,-10,-20,-10,-10,-10,-10,-10,-10,-20],
  [ 0,  0,  0,  0,  0,  0,  0,  0,  5, 10, 10, 10, 10, 10, 10,  5, -5,  0,  0,  0,  0,  0,  0, -5, -5,  0,  0,  0,  0,  0,  0, -5,
   -5,  0,  0,  0,  0,  0,  0, -5, -5,  0,  0,  0,  0,  0,  0, -5, -5,  0,  0,  0,  0,  0,  0, -5,  0,  0,  0,  5,  5,  0,  0,  0],
  [-20,-10,-10, -5, -5,-10,-10,-20,-10,  0,  0,  0,  0,  0,  0,-10,-10,  0,  5,  5,  5,  5,  0,-10, -5,  0,  5,  5,  5,  5,  0, -5,
     0,  0,  5,  5,  5,  5,  0, -5,-10,  5,  5,  5,  5,  5,  0,-10,-10,  0,  5,  0,  0,  0,  0,-10,-20,-10,-10, -5, -5,-10,-10,-20],
  [-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,-30,-40,-40,-50,-50,-40,-40,-30,
   -20,-30,-30,-40,-40,-30,-30,-20,-10,-20,-20,-20,-20,-20,-20,-10, 20, 20,  0,  0,  0,  0, 20, 20, 20, 30, 10,  0,  0, 10, 30, 20],
];
// prettier-ignore
const KING_END = [
  -50,-40,-30,-20,-20,-30,-40,-50,-30,-20,-10,  0,  0,-10,-20,-30,-30,-10, 20, 30, 30, 20,-10,-30,-30,-10, 30, 40, 40, 30,-10,-30,
  -30,-10, 30, 40, 40, 30,-10,-30,-30,-10, 20, 30, 30, 20,-10,-30,-30,-30,  0,  0,  0,  0,-30,-30,-50,-30,-30,-30,-30,-30,-30,-50,
];
/** Passed-pawn bonus by rows advanced (0 = still home). */
const PASSED = [0, 5, 10, 20, 35, 60, 100];

/** Static score from the side to move's view (centipawns). */
export function evaluate(p: Pos): number {
  const b = p.b;
  let mg = 0;
  let eg = 0;
  let phase = 0;
  // per side (index side * 8 + file): pawn count, and the highest / lowest row a pawn stands on
  const pawns = new Int8Array(16);
  const minRow = new Int8Array(16).fill(8);
  const maxRow = new Int8Array(16).fill(-1);
  let bishops0 = 0;
  let bishops1 = 0;
  for (let s = 0; s < 128; s++) {
    if (!onBoard(s)) {
      s += 7;
      continue;
    }
    const v = b[s] ?? 0;
    if (!v) continue;
    const t = Math.abs(v);
    const white = v > 0;
    const i = white ? to64(s) : (7 - (s >> 4)) * 8 + (s & 7);
    const sign = white ? 1 : -1;
    if (t === KING) {
      mg += sign * (PST[KING]?.[i] ?? 0);
      eg += sign * (KING_END[i] ?? 0);
      continue;
    }
    const val = (VALUE[t] ?? 0) + (PST[t]?.[i] ?? 0);
    mg += sign * val;
    eg += sign * val;
    if (t === KNIGHT || t === BISHOP) phase += 1;
    else if (t === ROOK) phase += 2;
    else if (t === QUEEN) phase += 4;
    if (t === BISHOP) {
      if (white) bishops0++;
      else bishops1++;
    }
    if (t === PAWN) {
      const i8 = (white ? 0 : 8) + (s & 7);
      const r = s >> 4;
      pawns[i8] = (pawns[i8] ?? 0) + 1;
      if (r < (minRow[i8] ?? 8)) minRow[i8] = r;
      if (r > (maxRow[i8] ?? -1)) maxRow[i8] = r;
    }
  }
  if (bishops0 >= 2) {
    mg += 30;
    eg += 40;
  }
  if (bishops1 >= 2) {
    mg -= 30;
    eg -= 40;
  }
  // pawn structure: doubled and isolated pawns cost, passed pawns grow toward promotion
  const at = (a: Int8Array, side: number, c: number, none: number): number =>
    c < 0 || c > 7 ? none : (a[side * 8 + c] ?? none);
  for (let k = 0; k < 2; k++) {
    const sign = k === 0 ? 1 : -1;
    for (let c = 0; c < 8; c++) {
      const n = at(pawns, k, c, 0);
      if (!n) continue;
      if (n > 1) {
        mg -= sign * 12 * (n - 1);
        eg -= sign * 20 * (n - 1);
      }
      if (!at(pawns, k, c - 1, 0) && !at(pawns, k, c + 1, 0)) {
        mg -= sign * 10 * n;
        eg -= sign * 15 * n;
      }
      // the most advanced pawn on the file is passed if no enemy pawn stands ahead on this or a next file
      let passed = true;
      if (k === 0) {
        const r = at(minRow, 0, c, 8);
        for (let dc = -1; dc <= 1; dc++) {
          const e = at(maxRow, 1, c + dc, -1);
          if (e >= 0 && e < r) passed = false;
        }
        if (passed) {
          mg += (PASSED[6 - r] ?? 0) / 2;
          eg += PASSED[6 - r] ?? 0;
        }
      } else {
        const r = at(maxRow, 1, c, -1);
        for (let dc = -1; dc <= 1; dc++) {
          const w = at(minRow, 0, c + dc, 8);
          if (w < 8 && w > r) passed = false;
        }
        if (passed) {
          mg -= (PASSED[r - 1] ?? 0) / 2;
          eg -= PASSED[r - 1] ?? 0;
        }
      }
    }
  }
  const ph = Math.min(phase, 24);
  const score = (mg * ph + eg * (24 - ph)) / 24;
  return Math.round(score) * p.side + 10; // a small bonus for having the move
}

// ---------- search ----------

export const MATE = 30000;
const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const EXACT = 1;
const LOWER = 2;
const UPPER = 3;

export interface ChessOpponent {
  /** Thinking time (ms); the search deepens until it runs out. */
  readonly ms: number;
  /** Deepest search (plies). */
  readonly depth: number;
  /** Random spread (centipawns) added to each move's score: weaker opponents vary and misjudge. */
  readonly noise: number;
  /** Chance of a careless move (picked from the moves that don't lose much). */
  readonly blunder: number;
}

/** Opponents, weakest first (one per level). */
export const CHESS_LEVELS: readonly ChessOpponent[] = [
  { ms: 150, depth: 1, noise: 260, blunder: 0.35 },
  { ms: 150, depth: 1, noise: 180, blunder: 0.25 },
  { ms: 200, depth: 2, noise: 140, blunder: 0.2 },
  { ms: 200, depth: 2, noise: 100, blunder: 0.15 },
  { ms: 300, depth: 3, noise: 80, blunder: 0.1 },
  { ms: 300, depth: 3, noise: 60, blunder: 0.07 },
  { ms: 400, depth: 4, noise: 45, blunder: 0.05 },
  { ms: 500, depth: 4, noise: 30, blunder: 0.03 },
  { ms: 600, depth: 5, noise: 20, blunder: 0.015 },
  { ms: 700, depth: 6, noise: 12, blunder: 0 },
  { ms: 900, depth: 7, noise: 8, blunder: 0 },
  { ms: 1100, depth: 8, noise: 5, blunder: 0 },
  { ms: 1400, depth: 10, noise: 3, blunder: 0 },
  { ms: 1800, depth: 12, noise: 0, blunder: 0 },
  { ms: 2400, depth: 64, noise: 0, blunder: 0 },
];

export const chessOpponent = (n: number): ChessOpponent =>
  CHESS_LEVELS[n - 1] ?? CHESS_LEVELS[CHESS_LEVELS.length - 1] ?? { ms: 500, depth: 4, noise: 0, blunder: 0 };

class Stop extends Error {}

/** Take back moves (and passes) until `depth` moves are left: a search stopped by the clock is mid-line. */
function unwind(p: Pos, depth: number): void {
  while (p.undo.length > depth) {
    const u = p.undo[p.undo.length - 1];
    if (u?.m === 0) unmakeNull(p);
    else unmakeMove(p);
  }
}

/** One engine instance (transposition table, killers, history) reused across moves. */
export class Engine {
  private readonly ttLo = new Int32Array(TT_SIZE);
  private readonly ttHi = new Int32Array(TT_SIZE);
  private readonly ttMove = new Int32Array(TT_SIZE);
  private readonly ttScore = new Int16Array(TT_SIZE);
  private readonly ttDepth = new Int8Array(TT_SIZE);
  private readonly ttFlag = new Int8Array(TT_SIZE);
  private readonly killers = new Int32Array(128 * 2);
  private readonly history = new Int32Array(2 * 128 * 128);
  private nodes = 0;
  private deadline = 0;
  private now: () => number = () => Date.now();
  /** Moves in the order they were searched last at the root (best first). */
  private rootOrder: number[] = [];

  /**
   * Best move for the side to move, deepening until `ms` runs out or `depth` is reached.
   * Returns the move and its score (centipawns, side to move's view).
   */
  think(
    p: Pos,
    ms: number,
    depth: number,
    now: () => number = () => Date.now(),
  ): { move: number; score: number; depth: number } {
    this.now = now;
    this.deadline = now() + ms;
    this.nodes = 0;
    this.killers.fill(0);
    for (let i = 0; i < this.history.length; i++) this.history[i] = (this.history[i] ?? 0) >> 3;
    const moves = legalMoves(p);
    if (!moves.length) return { move: 0, score: inCheck(p) ? -MATE : 0, depth: 0 };
    this.rootOrder = moves;
    let best = moves[0] ?? 0;
    let bestScore = 0;
    let reached = 0;
    const base = p.undo.length;
    for (let d = 1; d <= depth; d++) {
      try {
        const r = this.root(p, d, -MATE - 1, MATE + 1);
        best = r.move;
        bestScore = r.score;
        reached = d;
        // a forced mate is found: deeper won't change it
        if (Math.abs(r.score) > MATE - 100) break;
      } catch (e) {
        if (!(e instanceof Stop)) throw e;
        unwind(p, base);
        break;
      }
      if (this.now() >= this.deadline) break;
    }
    return { move: best, score: bestScore, depth: reached };
  }

  /** Every legal move's score at a fixed depth (for opponents that weigh moves with noise). */
  scoreAll(
    p: Pos,
    depth: number,
    ms: number,
    now: () => number = () => Date.now(),
  ): { move: number; score: number }[] {
    this.now = now;
    this.deadline = now() + ms * 4;
    const out: { move: number; score: number }[] = [];
    const base = p.undo.length;
    for (const m of legalMoves(p)) {
      makeMove(p, m);
      let score: number;
      try {
        score = -this.search(p, depth - 1, -MATE - 1, MATE + 1, 1, true);
      } catch (e) {
        if (!(e instanceof Stop)) throw e;
        unwind(p, base + 1);
        score = -evaluate(p);
      }
      unmakeMove(p);
      out.push({ move: m, score });
    }
    return out;
  }

  private root(p: Pos, depth: number, alpha: number, beta: number): { move: number; score: number } {
    let best = this.rootOrder[0] ?? 0;
    let bestScore = -MATE - 1;
    const scored: { m: number; s: number }[] = [];
    let first = true;
    for (const m of this.rootOrder) {
      makeMove(p, m);
      let s: number;
      if (first) s = -this.search(p, depth - 1, -beta, -alpha, 1, true);
      else {
        s = -this.search(p, depth - 1, -alpha - 1, -alpha, 1, true);
        if (s > alpha && s < beta) s = -this.search(p, depth - 1, -beta, -alpha, 1, true);
      }
      unmakeMove(p);
      scored.push({ m, s });
      if (s > bestScore) {
        bestScore = s;
        best = m;
      }
      if (s > alpha) alpha = s;
      first = false;
    }
    // next iteration searches the best moves first
    scored.sort((a, b) => b.s - a.s);
    this.rootOrder = scored.map((x) => x.m);
    return { move: best, score: bestScore };
  }

  private tick(): void {
    if ((++this.nodes & 2047) === 0 && this.now() >= this.deadline) throw new Stop();
  }

  private search(
    p: Pos,
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    allowNull: boolean,
  ): number {
    this.tick();
    if (p.half >= 100 || insufficient(p)) return 0;
    if (repetitions(p) >= 2) return 0;
    const check = inCheck(p);
    if (check) depth++;
    if (depth <= 0) return this.quiesce(p, alpha, beta, ply);
    // mate distance pruning
    alpha = Math.max(alpha, -MATE + ply);
    beta = Math.min(beta, MATE - ply - 1);
    if (alpha >= beta) return alpha;

    const idx = p.lo & TT_MASK;
    let ttMove = 0;
    if (this.ttLo[idx] === p.lo && this.ttHi[idx] === p.hi) {
      ttMove = this.ttMove[idx] ?? 0;
      if ((this.ttDepth[idx] ?? 0) >= depth) {
        const s = fromTT(this.ttScore[idx] ?? 0, ply);
        const f = this.ttFlag[idx];
        if (f === EXACT) return s;
        if (f === LOWER && s >= beta) return s;
        if (f === UPPER && s <= alpha) return s;
      }
    }

    const pv = beta - alpha > 1;
    // null move: if passing still keeps us above beta, this line is good enough
    if (allowNull && !check && !pv && depth >= 3 && hasPieces(p, p.side) && evaluate(p) >= beta) {
      makeNull(p);
      const s = -this.search(p, depth - 3, -beta, -beta + 1, ply + 1, false);
      unmakeNull(p);
      if (s >= beta) return beta;
    }

    const moves = genMoves(p, []);
    const scores = this.order(p, moves, ttMove, ply);
    const side = p.side;
    const alpha0 = alpha;
    let best = -MATE - 1;
    let bestMove = 0;
    let legal = 0;
    for (let i = 0; i < moves.length; i++) {
      pick(moves, scores, i);
      const m = moves[i] ?? 0;
      makeMove(p, m);
      if (inCheck(p, side)) {
        unmakeMove(p);
        continue;
      }
      legal++;
      const quiet = !(mFlags(m) & F_CAPTURE) && !mPromo(m);
      let s: number;
      if (legal === 1) s = -this.search(p, depth - 1, -beta, -alpha, ply + 1, true);
      else {
        // late quiet moves get a shallower look first
        const reduce = depth >= 3 && legal > 3 && quiet && !check && !inCheck(p) ? (legal > 8 ? 2 : 1) : 0;
        s = -this.search(p, depth - 1 - reduce, -alpha - 1, -alpha, ply + 1, true);
        if (s > alpha && reduce) s = -this.search(p, depth - 1, -alpha - 1, -alpha, ply + 1, true);
        if (s > alpha && s < beta) s = -this.search(p, depth - 1, -beta, -alpha, ply + 1, true);
      }
      unmakeMove(p);
      if (s > best) {
        best = s;
        bestMove = m;
      }
      if (s > alpha) alpha = s;
      if (alpha >= beta) {
        if (quiet) {
          const k = Math.min(ply, 127) * 2;
          if (this.killers[k] !== m) {
            this.killers[k + 1] = this.killers[k] ?? 0;
            this.killers[k] = m;
          }
          const h = (side === 1 ? 0 : 1) * 16384 + mFrom(m) * 128 + mTo(m);
          this.history[h] = (this.history[h] ?? 0) + depth * depth;
        }
        break;
      }
    }
    if (!legal) return check ? -MATE + ply : 0;
    this.ttLo[idx] = p.lo;
    this.ttHi[idx] = p.hi;
    this.ttMove[idx] = bestMove;
    this.ttScore[idx] = toTT(best, ply);
    this.ttDepth[idx] = Math.min(depth, 127);
    this.ttFlag[idx] = best >= beta ? LOWER : best > alpha0 ? EXACT : UPPER;
    return best;
  }

  private quiesce(p: Pos, alpha: number, beta: number, ply: number): number {
    this.tick();
    const stand = evaluate(p);
    if (stand >= beta) return stand;
    if (stand > alpha) alpha = stand;
    if (ply > 60) return stand;
    const moves = genMoves(p, [], true);
    const scores = this.order(p, moves, 0, -1);
    const side = p.side;
    for (let i = 0; i < moves.length; i++) {
      pick(moves, scores, i);
      const m = moves[i] ?? 0;
      // delta pruning: even winning this piece can't lift the score to alpha
      const gain = VALUE[Math.abs(p.b[mTo(m)] ?? 0)] ?? 100;
      if (!mPromo(m) && stand + gain + 200 < alpha) continue;
      makeMove(p, m);
      if (inCheck(p, side)) {
        unmakeMove(p);
        continue;
      }
      const s = -this.quiesce(p, -beta, -alpha, ply + 1);
      unmakeMove(p);
      if (s >= beta) return s;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }

  /** Move ordering: hash move, captures (most valuable victim, least valuable attacker), killers, history. */
  private order(p: Pos, moves: number[], ttMove: number, ply: number): number[] {
    const k = ply >= 0 ? Math.min(ply, 127) * 2 : -1;
    const side = p.side === 1 ? 0 : 1;
    return moves.map((m) => {
      if (m === ttMove) return 1 << 30;
      const promo = mPromo(m);
      if (mFlags(m) & F_CAPTURE) {
        const victim = mFlags(m) & F_EP ? PAWN : Math.abs(p.b[mTo(m)] ?? 0);
        const attacker = Math.abs(p.b[mFrom(m)] ?? 0);
        return 1e8 + victim * 100 - attacker + (promo ? 1e7 : 0);
      }
      if (promo) return promo === QUEEN ? 9e7 : 0;
      if (k >= 0 && this.killers[k] === m) return 8e7;
      if (k >= 0 && this.killers[k + 1] === m) return 7e7;
      return this.history[side * 16384 + mFrom(m) * 128 + mTo(m)] ?? 0;
    });
  }
}

/** Selection step: bring the best remaining move to index i. */
function pick(moves: number[], scores: number[], i: number): void {
  let bi = i;
  for (let j = i + 1; j < moves.length; j++) if ((scores[j] ?? 0) > (scores[bi] ?? 0)) bi = j;
  if (bi === i) return;
  const m = moves[i] ?? 0;
  moves[i] = moves[bi] ?? 0;
  moves[bi] = m;
  const s = scores[i] ?? 0;
  scores[i] = scores[bi] ?? 0;
  scores[bi] = s;
}

const toTT = (s: number, ply: number): number => (s > MATE - 200 ? s + ply : s < -MATE + 200 ? s - ply : s);
const fromTT = (s: number, ply: number): number => (s > MATE - 200 ? s - ply : s < -MATE + 200 ? s + ply : s);

function hasPieces(p: Pos, side: Side): boolean {
  for (let s = 0; s < 128; s++) {
    if (!onBoard(s)) continue;
    const t = (p.b[s] ?? 0) * side;
    if (t > PAWN && t < KING) return true;
  }
  return false;
}

/**
 * The opponent's move. Strong levels deepen within their time; weaker ones score every move at a
 * shallow depth, add noise, and now and then play a careless (but not suicidal) move.
 */
export function chooseChessMove(
  engine: Engine,
  p: Pos,
  o: ChessOpponent,
  rand: () => number = Math.random,
  now: () => number = () => Date.now(),
): number {
  if (o.noise === 0) return engine.think(p, o.ms, o.depth, now).move;
  const scored = engine.scoreAll(p, o.depth, o.ms, now);
  if (!scored.length) return 0;
  scored.sort((a, b) => b.score - a.score);
  const top = scored[0]?.score ?? 0;
  if (scored.length > 1 && rand() < o.blunder) {
    // careless, not suicidal: anything that doesn't drop more than about a minor piece
    const ok = scored.filter((x) => x.score > top - 350 && x.score > -MATE + 200);
    const pickOne = ok[Math.floor(rand() * ok.length)];
    if (pickOne) return pickOne.move;
  }
  let best = scored[0]?.move ?? 0;
  let bestV = -Infinity;
  for (const x of scored) {
    // mates are never blurred by noise
    const v = Math.abs(x.score) > MATE - 200 ? x.score : x.score + (rand() - 0.5) * 2 * o.noise;
    if (v > bestV) {
      bestV = v;
      best = x.move;
    }
  }
  return best;
}

/** Long algebraic name of a move, e.g. "e2e4", "e7e8q". */
export function moveName(m: number): string {
  const sq = (s: number): string => String.fromCharCode(97 + (s & 7)) + String(8 - (s >> 4));
  const pr = mPromo(m);
  return sq(mFrom(m)) + sq(mTo(m)) + (pr ? (' nbrq'[pr - 1] ?? '') : '');
}

/** Material the side has captured so far (pawn = 1, knight/bishop = 3, rook = 5, queen = 9). */
export function captured(p: Pos, side: Side): number {
  const full = 8 + 2 * 3 + 2 * 3 + 2 * 5 + 9;
  let left = 0;
  for (let s = 0; s < 128; s++) {
    if (!onBoard(s)) continue;
    const t = (p.b[s] ?? 0) * -side;
    if (t > 0 && t < KING) left += [0, 1, 3, 3, 5, 9][t] ?? 0;
  }
  return Math.max(0, full - left);
}

/**
 * Stars for a win: 3 without help, 2 with up to three undos/hints, 1 with more.
 */
export function chessStars(helps: number): number {
  if (helps === 0) return 3;
  if (helps <= 3) return 2;
  return 1;
}
