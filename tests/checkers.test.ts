import { describe, expect, it } from 'vitest';
import {
  applyMove,
  CHECKERS_LEVELS,
  chooseMove,
  count,
  cStars,
  DRAW_PLIES,
  hintMove,
  initialBoard,
  isProgress,
  legalMoves,
  opponentFor,
  sq,
} from '../src/core/checkers';
import type { CBoard, Side } from '../src/core/checkers';

/** First item, or a test failure. */
const first = <T>(xs: readonly T[]): T => {
  const x = xs[0];
  if (x === undefined) throw new Error('empty');
  return x;
};

const empty = (): number[] => new Array<number>(64).fill(0);

/** Seeded random, so games replay the same. */
const rng = (seed: number) => () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};

describe('checkers rules', () => {
  it('starts with 12 a side and 7 opening moves each', () => {
    const b = initialBoard();
    expect(count(b, 1)).toBe(12);
    expect(count(b, -1)).toBe(12);
    expect(legalMoves(b, 1)).toHaveLength(7);
    expect(legalMoves(b, -1)).toHaveLength(7);
  });

  it('men only step forward; kings step both ways', () => {
    const b = empty();
    b[sq(4, 3)] = 1;
    expect(
      legalMoves(b, 1)
        .map((m) => m.path[0])
        .sort(),
    ).toEqual([sq(3, 2), sq(3, 4)].sort());
    b[sq(4, 3)] = 2;
    expect(legalMoves(b, 1)).toHaveLength(4);
  });

  it('jumps are compulsory', () => {
    const b = empty();
    b[sq(5, 2)] = 1;
    b[sq(5, 6)] = 1;
    b[sq(4, 3)] = -1;
    const moves = legalMoves(b, 1);
    expect(moves).toHaveLength(1);
    expect(moves[0]).toMatchObject({ from: sq(5, 2), path: [sq(3, 4)], caps: [sq(4, 3)] });
  });

  it('a jump continues while it can, and captured pieces leave the board', () => {
    const b = empty();
    b[sq(7, 0)] = 1;
    b[sq(6, 1)] = -1;
    b[sq(4, 3)] = -1;
    const m = first(legalMoves(b, 1));
    expect(m.path).toEqual([sq(5, 2), sq(3, 4)]);
    const after = applyMove(b, m);
    expect(count(after, -1)).toBe(0);
    expect(after[sq(3, 4)]).toBe(1);
  });

  it('branching jumps give one move per route', () => {
    const b = empty();
    b[sq(6, 3)] = 1;
    b[sq(5, 2)] = -1;
    b[sq(5, 4)] = -1;
    expect(legalMoves(b, 1)).toHaveLength(2);
  });

  it('reaching the far row crowns and ends the move', () => {
    const b = empty();
    b[sq(2, 1)] = 1;
    b[sq(1, 2)] = -1;
    // after landing on row 0 the new king could jump on (−1 at 1,4), but crowning ends the move
    b[sq(1, 4)] = -1;
    const m = first(legalMoves(b, 1));
    expect(m).toMatchObject({ path: [sq(0, 3)], crown: true });
    expect(applyMove(b, m)[sq(0, 3)]).toBe(2);
  });

  it('a side with no move has none to play', () => {
    const b = empty();
    b[sq(0, 1)] = 1; // a man on the far row can never be stuck there in play, but has no forward move
    expect(legalMoves(b, 1)).toHaveLength(0);
  });

  it('captures and man moves reset the draw counter; king steps do not', () => {
    const b = empty();
    b[sq(4, 3)] = 2;
    expect(isProgress(b, first(legalMoves(b, 1)))).toBe(false);
    b[sq(4, 3)] = 1;
    expect(isProgress(b, first(legalMoves(b, 1)))).toBe(true);
  });

  it('stars: few losses without help is three, help caps at two', () => {
    expect(cStars(0, false)).toBe(3);
    expect(cStars(3, false)).toBe(3);
    expect(cStars(3, true)).toBe(2);
    expect(cStars(7, false)).toBe(2);
    expect(cStars(11, false)).toBe(1);
  });
});

describe('checkers opponent', () => {
  it('takes a free piece when it can', () => {
    const b = empty();
    b[sq(2, 3)] = -1;
    b[sq(3, 4)] = 1;
    b[sq(7, 0)] = 1;
    const m = hintMove(b, -1, 4);
    expect(m?.caps).toEqual([sq(3, 4)]);
  });

  /** Plays a full game; returns the winner (0 = draw). */
  const play = (a: number, z: number, seed: number): number => {
    const r = rng(seed);
    let b: CBoard = initialBoard();
    let side: Side = 1;
    let quiet = 0;
    for (let ply = 0; ply < 300; ply++) {
      const o = opponentFor((side === 1 ? a : z) + 1);
      const m = chooseMove(b, side, o, r);
      if (!m) return -side;
      quiet = isProgress(b, m) ? 0 : quiet + 1;
      b = applyMove(b, m);
      if (quiet >= DRAW_PLIES) return 0;
      side = -side as Side;
    }
    return 0;
  };

  it('a strong opponent beats the first one', () => {
    let wins = 0;
    for (let g = 0; g < 4; g++) if (play(8, 0, g + 1) === 1) wins++;
    expect(wins).toBeGreaterThanOrEqual(3);
  });

  it('the strongest search answers quickly from the opening', () => {
    const t0 = performance.now();
    chooseMove(initialBoard(), -1, opponentFor(CHECKERS_LEVELS.length), rng(3));
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
