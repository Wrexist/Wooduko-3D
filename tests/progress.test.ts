import { describe, expect, it } from 'vitest';
import { THEMES } from '../src/config';
import {
  ACHIEVEMENTS,
  averageScore,
  emptyStats,
  newlyEarned,
  parseStats,
  parseUnlocked,
  statsAfterGame,
  statsAfterMove,
  themeUnlocked,
} from '../src/core/progress';
import { playMove } from '../src/core/rules';
import type { GameState, Piece } from '../src/core/types';
import { emptyBoard } from '../src/core/board';
import { boardFrom, SEED, shapeIndexOf } from './helpers';

const piece = (id: string): Piece => ({ shapeIndex: shapeIndexOf(id), seed: SEED });
const state = (p: Partial<GameState>): GameState => ({
  board: emptyBoard(),
  tray: [null, null, null],
  score: 0,
  streak: 0,
  misses: 0,
  sinceSmall: 0,
  rng: 1,
  over: false,
  ...p,
});

describe('stats', () => {
  it('counts pieces, lines, combos, board clears and biggest clear per move', () => {
    const m = playMove(
      state({ board: boardFrom(['aaaaaaaa.']), tray: [piece('mono'), piece('mono'), null], streak: 2 }),
      0,
      0,
      8,
    );
    if (!m) throw new Error('move');
    const s = statsAfterMove(emptyStats(), m);
    expect(s.piecesPlaced).toBe(1);
    expect(s.linesCleared).toBe(1);
    expect(s.bestCombo).toBe(3);
    expect(s.boardClears).toBe(1);
    expect(s.biggestClear).toBe(1);
    expect(s.bestScore).toBe(m.state.score);
  });

  it('averages finished games', () => {
    let s = statsAfterGame(emptyStats(), 100);
    s = statsAfterGame(s, 301);
    expect(s.gamesPlayed).toBe(2);
    expect(averageScore(s)).toBe(201);
    expect(averageScore(emptyStats())).toBe(0);
  });
});

describe('achievements', () => {
  it('has unique ids', () => {
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });

  it('awards each achievement once', () => {
    const s = { ...emptyStats(), linesCleared: 1, bestCombo: 3 };
    const first = newlyEarned({}, s, 0);
    expect(first).toEqual(['first-clear', 'combo-3']);
    expect(newlyEarned({ 'first-clear': 1, 'combo-3': 1 }, s, 0)).toEqual([]);
  });

  it('score awards use the current game or the lifetime best', () => {
    expect(newlyEarned({}, emptyStats(), 1200)).toContain('score-1k');
    expect(newlyEarned({}, { ...emptyStats(), bestScore: 5200 }, 0)).toEqual(['score-1k', 'score-5k']);
  });

  it('every theme unlock points at a real achievement, and maple is free', () => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const t of THEMES) if (t.unlock) expect(ids.has(t.unlock)).toBe(true);
    const maple = THEMES.find((t) => t.id === 'maple');
    expect(maple && themeUnlocked(maple, {})).toBe(true);
    const ebony = THEMES.find((t) => t.id === 'ebony');
    expect(ebony && themeUnlocked(ebony, {})).toBe(false);
    expect(ebony && themeUnlocked(ebony, { 'score-10k': 1 })).toBe(true);
  });
});

describe('progress persistence', () => {
  it('parses stats defensively', () => {
    expect(parseStats(null)).toEqual(emptyStats());
    expect(parseStats('{bad')).toEqual(emptyStats());
    expect(parseStats(JSON.stringify({ gamesPlayed: 3, linesCleared: -2, bestCombo: 'x' }))).toEqual({
      ...emptyStats(),
      gamesPlayed: 3,
    });
  });

  it('parses unlocked achievements, dropping unknown ids', () => {
    expect(parseUnlocked(JSON.stringify({ 'first-clear': 5, bogus: 1, 'combo-3': 'x' }))).toEqual({
      'first-clear': 5,
    });
    expect(parseUnlocked('nope')).toEqual({});
  });
});
