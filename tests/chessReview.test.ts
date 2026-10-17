import { describe, expect, it } from 'vitest';
import { fromFen, legalMoves, makeMove, MATE, START_FEN } from '../src/core/chess';
import {
  moveAccuracy,
  nextMistake,
  OPENING_NAMES,
  openingIds,
  openingOf,
  reviewGame,
  san,
  winChance,
} from '../src/core/chessReview';
import { moveOf } from '../src/core/chessTrain';
import { dictionaries } from '../src/i18n';
import type { Key } from '../src/i18n';

const play = (fen: string, line: string): { p: ReturnType<typeof fromFen>; moves: number[] } => {
  const p = fromFen(fen);
  const moves: number[] = [];
  for (const u of line.split(' ').filter(Boolean)) {
    const m = moveOf(p, u);
    if (!m) throw new Error(`illegal ${u}`);
    moves.push(m);
    makeMove(p, m);
  }
  return { p, moves };
};

const sanOf = (fen: string, before: string, u: string, letters?: string): string => {
  const { p } = play(fen, before);
  return san(p, moveOf(p, u), letters);
};

describe('winning chance and accuracy', () => {
  it('is even at 0, symmetric, and certain at mate', () => {
    expect(winChance(0)).toBeCloseTo(50);
    expect(winChance(300) + winChance(-300)).toBeCloseTo(100);
    expect(winChance(MATE - 5)).toBe(100);
    expect(winChance(-MATE + 5)).toBe(0);
  });

  it('a move that keeps the chance is ~100%; a big drop is near 0', () => {
    expect(moveAccuracy(60, 60)).toBeGreaterThan(99);
    expect(moveAccuracy(60, 70)).toBeGreaterThan(99);
    expect(moveAccuracy(90, 10)).toBeLessThan(5);
  });
});

describe('reviewGame', () => {
  it('grades a blunder and finds it as your next mistake', () => {
    // White plays two good moves, then hangs the queen (scores from the side to move)
    const moves = [1, 2, 3, 4, 5, 6];
    const evals = [20, -20, 30, -30, 40, 900, -900];
    const bests = [1, 2, 3, 4, 99, 6];
    const r = reviewGame(moves, evals, bests);
    expect(r.notes[4]?.grade).toBe('blunder');
    expect(r.whiteCounts.blunder).toBe(1);
    expect(r.whiteCounts.best).toBe(2);
    expect(r.white).toBeLessThan(r.black);
    expect(nextMistake(r, -1)).toBe(4);
    expect(nextMistake(r, 4)).toBe(-1);
  });
});

describe('notation', () => {
  it('writes standard algebraic notation', () => {
    expect(sanOf(START_FEN, '', 'g1f3')).toBe('Nf3');
    expect(sanOf(START_FEN, '', 'e2e4')).toBe('e4');
    expect(sanOf(START_FEN, 'e2e4 d7d5', 'e4d5')).toBe('exd5');
    expect(sanOf(START_FEN, 'e2e4 e7e5 g1f3 b8c6 f1c4 g8f6', 'e1g1')).toBe('O-O');
    // two knights can reach d2: say which
    expect(sanOf('4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1', '', 'b1d2')).toBe('Nbd2');
    expect(sanOf('k7/4P3/8/8/8/8/8/4K3 w - - 0 1', '', 'e7e8q')).toBe('e8=Q+');
    expect(sanOf(START_FEN, 'f2f3 e7e5 g2g4', 'd8h4')).toBe('Qh4#');
    // Swedish letters
    expect(sanOf(START_FEN, '', 'g1f3', 'SLTDK')).toBe('Sf3');
  });

  it('every move of a game gets a name', () => {
    const { p } = play(START_FEN, 'e2e4 e7e5 g1f3 b8c6');
    for (const m of legalMoves(p)) expect(san(p, m).length).toBeGreaterThan(1);
  });
});

describe('opening names', () => {
  it('names the longest match', () => {
    expect(openingOf(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4'])).toBe('italian');
    expect(openingOf(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'g8f6', 'f3g5', 'd7d5'])).toBe('friedLiver');
    expect(openingOf(['e2e4', 'c7c5', 'c2c3'])).toBe('alapin');
    expect(openingOf(['h2h3'])).toBe('');
  });

  it('every line is legal and every name is in both languages', () => {
    for (const [line] of OPENING_NAMES) play(START_FEN, line);
    for (const id of openingIds())
      for (const d of Object.values(dictionaries)) expect(d[`opening.${id}` as Key], id).toBeTruthy();
  });
});
