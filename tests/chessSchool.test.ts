import { describe, expect, it } from 'vitest';
import { Engine, F_CASTLE, fromFen, inCheck, legalMoves, makeMove, MATE, mFlags, moveName, unmakeMove } from '../src/core/chess';
import {
  collectPar,
  gradeOf,
  LESSONS,
  plainName,
  reasonFor,
  stepAllows,
  threatened,
} from '../src/core/chessSchool';

const byName = (fen: string, name: string): number => {
  const m = legalMoves(fromFen(fen)).find((x) => moveName(x).startsWith(name));
  if (m === undefined) throw new Error(`no move ${name} in ${fen}`);
  return m;
};

describe('chess school lessons', () => {
  for (const lesson of LESSONS)
    lesson.steps.forEach((step, i) => {
      it(`${lesson.id} step ${i + 1} (${step.goal}) can be done`, () => {
        const p = fromFen(step.fen);
        const moves = legalMoves(p);
        expect(moves.length).toBeGreaterThan(0);
        switch (step.goal) {
          case 'collect': {
            const par = collectPar(step.fen);
            expect(par).toBeGreaterThan(0);
            expect(par).toBeLessThan(8);
            break;
          }
          case 'check':
          case 'castle':
          case 'move':
            expect(moves.some((m) => stepAllows(step, p, m))).toBe(true);
            if (step.goal === 'castle') expect(moves.some((m) => mFlags(m) & F_CASTLE)).toBe(true);
            if (step.goal === 'move') expect(moves.map(plainName)).toEqual(expect.arrayContaining([...(step.accept ?? [])]));
            break;
          case 'escape':
            expect(inCheck(p)).toBe(true);
            break;
          case 'best': {
            const r = new Engine().think(p, 3000, 64);
            if (lesson.id.startsWith('mate')) expect(r.score).toBe(MATE - (2 * (step.moves ?? 1) - 1));
            else expect(r.score).toBeGreaterThan(250);
            break;
          }
          case 'mate':
          case 'promote':
            break;
        }
      }, 20000);
    });
});

describe('coach', () => {
  it('grades by centipawns lost, and missing a mate', () => {
    expect(gradeOf(50, 45)).toBe('best');
    expect(gradeOf(50, 0)).toBe('good');
    expect(gradeOf(50, -50)).toBe('inaccuracy');
    expect(gradeOf(50, -200)).toBe('mistake');
    expect(gradeOf(50, -400)).toBe('blunder');
    expect(gradeOf(MATE - 1, 0)).toBe('blunder');
    expect(gradeOf(MATE - 1, MATE - 3)).toBe('good');
  });

  it('explains a hanging queen', () => {
    // White's queen steps onto a square the knight covers
    const fen = '4k3/8/2n5/8/8/8/8/3QK3 w - - 0 1';
    const p = fromFen(fen);
    const played = byName(fen, 'd1d4');
    const e = new Engine();
    const best = e.think(p, 300, 4);
    makeMove(p, played);
    const reply = e.think(p, 300, 4);
    unmakeMove(p);
    const r = reasonFor(p, played, best.move, best.score, -reply.score, reply.move);
    expect(r.kind).toBe('hangs');
  });

  it('marks pieces that are attacked and undefended', () => {
    const p = fromFen('4k3/8/2n5/8/3Q4/8/8/4K3 w - - 0 1');
    expect(threatened(p, 1)).toEqual([0x43]);
  });
});
