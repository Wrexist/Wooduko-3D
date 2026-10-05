import { describe, expect, it } from 'vitest';
import { emptyBoard } from '../src/core/board';
import { ORIENTATIONS } from '../src/core/shapes';
import { isGameOver, newGame, nextStreak, normalizeLoaded, playMove, trayFits } from '../src/core/rules';
import type { GameState, Piece, Tray } from '../src/core/types';
import { boardFrom, checkerboard, fullBoardExcept, SEED, shapeIndexOf } from './helpers';

const piece = (baseId: string, n = 0): Piece => ({ shapeIndex: shapeIndexOf(baseId, n), seed: SEED });
const horizontalI2 = (): Piece => {
  const shape = ORIENTATIONS.find((o) => o.baseId === 'i2' && o.w === 2);
  if (!shape) throw new Error('missing horizontal i2');
  return { shapeIndex: shape.index, seed: SEED };
};

function state(partial: Partial<GameState>): GameState {
  return {
    board: emptyBoard(),
    tray: [null, null, null],
    score: 0,
    streak: 0,
    rng: 1,
    over: false,
    ...partial,
  };
}

describe('streak', () => {
  it('increments on a clear and resets to 0 on a non-clear', () => {
    expect(nextStreak(0, 1)).toBe(1);
    expect(nextStreak(3, 2)).toBe(4);
    expect(nextStreak(5, 0)).toBe(0);
  });
});

describe('game over', () => {
  it('is over when no tray piece fits', () => {
    const board = fullBoardExcept([[0, 0]]);
    const tray: Tray = [piece('i2'), piece('o4'), null];
    expect(isGameOver(board, tray)).toBe(true);
  });

  it('is not over when any one piece fits', () => {
    const board = fullBoardExcept([[0, 0]]);
    expect(isGameOver(board, [piece('i2'), piece('mono'), piece('o4')])).toBe(false);
  });

  it('is not over with an empty tray (a deal is pending)', () => {
    expect(isGameOver(fullBoardExcept([]), [null, null, null])).toBe(false);
  });

  it('trayFits reports per slot', () => {
    const board = fullBoardExcept([[0, 0]]);
    expect(trayFits(board, [piece('mono'), null, piece('o4')])).toEqual([true, false, false]);
  });
});

describe('newGame', () => {
  it('starts empty with a full tray and is deterministic per seed', () => {
    const a = newGame(42);
    const b = newGame(42);
    expect(a.board.groups).toHaveLength(0);
    expect(a.tray.every((p) => p !== null)).toBe(true);
    expect(a).toEqual(b);
    expect(a.score).toBe(0);
    expect(a.over).toBe(false);
  });
});

describe('playMove', () => {
  it('rejects illegal moves', () => {
    const s = state({ tray: [piece('o4'), null, piece('mono')] });
    expect(playMove(s, 1, 0, 0)).toBeNull(); // empty slot
    expect(playMove(s, 0, 8, 8)).toBeNull(); // off board
    expect(playMove({ ...s, over: true }, 0, 0, 0)).toBeNull();
  });

  it('places, scores 1 per cell, resets streak, and empties the slot', () => {
    const s = state({ tray: [piece('o4'), piece('mono'), piece('mono')], streak: 2, score: 10 });
    const m = playMove(s, 0, 3, 3);
    expect(m).not.toBeNull();
    if (!m) return;
    expect(m.points).toBe(4);
    expect(m.state.score).toBe(14);
    expect(m.state.streak).toBe(0);
    expect(m.state.tray[0]).toBeNull();
    expect(m.dealt).toBeNull();
    expect(m.placed.center).toEqual([4, 4]); // shape centre (1,1) + offset (3,3)
    expect(m.state.board.grid[3]?.[3]).toBe(m.placed.id);
  });

  it('clears a row, scores it with the streak multiplier and splits groups', () => {
    const board = boardFrom(['aaaaaaa..', 'b']);
    const s = state({ board, tray: [horizontalI2(), piece('mono'), piece('mono')], streak: 1 });
    const m = playMove(s, 0, 0, 7);
    expect(m).not.toBeNull();
    if (!m) return;
    expect(m.clear.units).toBe(1);
    expect(m.state.streak).toBe(2);
    expect(m.placementPoints).toBe(2);
    expect(m.clearPoints).toBe(27); // 18 · 1.5
    expect(m.boardClear).toBe(false);
    expect(m.state.score).toBe(29);
    expect(m.state.board.grid[0]?.every((v) => v === 0)).toBe(true);
  });

  it('gives the +150 board-clear bonus when the board ends up empty', () => {
    const board = boardFrom(['aaaaaaaa.']);
    const s = state({ board, tray: [piece('mono'), piece('mono'), piece('mono')] });
    const m = playMove(s, 0, 0, 8);
    expect(m?.boardClear).toBe(true);
    expect(m?.bonus).toBe(150);
    expect(m?.points).toBe(1 + 18 + 150);
  });

  it('deals a new tray after the last piece and advances the rng', () => {
    const s = state({ tray: [null, piece('mono'), null], rng: 777 });
    const m = playMove(s, 1, 0, 0);
    expect(m?.dealt).toHaveLength(3);
    expect(m?.state.tray.every((p) => p !== null)).toBe(true);
    expect(m?.state.rng).not.toBe(777);
  });

  it('scores a row + column + box from one placement', () => {
    const board = boardFrom(['.aaaaaaaa', 'bbb', 'bbb', 'c', 'c', 'c', 'c', 'c', 'c']);
    const s = state({ board, tray: [piece('mono'), piece('o4'), null] });
    const m = playMove(s, 0, 0, 0);
    expect(m?.clear.units).toBe(3);
    expect(m?.clearPoints).toBe(108); // 18·3 + 9·3·2, streak 1
    expect(m?.boardClear).toBe(true);
    expect(m?.state.over).toBe(false);
  });

  it('flags game over and resets streak when the remaining pieces cannot fit', () => {
    // Checkerboard: no unit is ever full and no 2×2 hole exists.
    const board = checkerboard();
    const s = state({ board, tray: [piece('mono'), piece('o4'), null], streak: 3 });
    const m = playMove(s, 0, 0, 0);
    expect(m?.clear.units).toBe(0);
    expect(m?.state.over).toBe(true);
    expect(m?.state.streak).toBe(0);
  });
});

describe('normalizeLoaded', () => {
  it('deals a tray when a loaded state has none', () => {
    const s = normalizeLoaded(state({ rng: 5 }));
    expect(s.tray.every((p) => p !== null)).toBe(true);
  });

  it('recomputes game over for a loaded state', () => {
    const s = normalizeLoaded(state({ board: fullBoardExcept([[0, 0]]), tray: [piece('o4'), null, null] }));
    expect(s.over).toBe(true);
  });
});

describe('full game simulation', () => {
  it('keeps the board consistent over many random games until game over', () => {
    for (let seed = 1; seed <= 20; seed++) {
      let s = newGame(seed);
      let moves = 0;
      while (!s.over && moves < 2000) {
        const legal: [number, number, number][] = [];
        s.tray.forEach((p, slot) => {
          if (!p) return;
          for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) legal.push([slot, r, c]);
        });
        const pick = legal[(seed * 7919 + moves * 104729) % legal.length];
        const m = pick ? playMove(s, ...pick) : null;
        if (!m) {
          // try every move in order until one works
          const any = legal.map((l) => playMove(s, ...l)).find((x) => x !== null);
          expect(any).toBeDefined();
          if (!any) break;
          s = any.state;
        } else s = m.state;
        moves++;

        // grid ↔ groups agree, ids unique, no full unit left on the board
        const seen = new Set<number>();
        for (const g of s.board.groups) {
          expect(seen.has(g.id)).toBe(false);
          seen.add(g.id);
          for (const [r, c] of g.cells) expect(s.board.grid[r]?.[c]).toBe(g.id);
        }
        const filled = s.board.grid.flat().filter((v) => v !== 0).length;
        expect(filled).toBe(s.board.groups.reduce((a, g) => a + g.cells.length, 0));
        expect(s.board.grid.some((row) => row.every((v) => v !== 0))).toBe(false);
      }
      expect(s.over).toBe(true);
      expect(s.score).toBeGreaterThan(0);
    }
  });
});
