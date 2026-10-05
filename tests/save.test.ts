import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SAVE } from '../src/config';
import { newGame, playMove } from '../src/core/rules';
import { parseBest, parseSave, parseSettings, serializeSave, toSave } from '../src/core/save';
import type { GameState } from '../src/core/types';

function playedState(): GameState {
  let s = newGame(2024);
  // play the first legal move of each piece until a few groups exist
  for (let n = 0; n < 6; n++) {
    let moved = false;
    for (let slot = 0; slot < 3 && !moved; slot++) {
      for (let r = 0; r < 9 && !moved; r++) {
        for (let c = 0; c < 9 && !moved; c++) {
          const m = playMove(s, slot, r, c);
          if (m) {
            s = m.state;
            moved = true;
          }
        }
      }
    }
  }
  return s;
}

const valid = () => JSON.parse(serializeSave(playedState())) as Record<string, unknown>;
const parse = (v: unknown) => parseSave(JSON.stringify(v), 1);

describe('save round-trip', () => {
  it('restores the same board, tray, score, streak and rng', () => {
    const s = playedState();
    expect(s.board.groups.length).toBeGreaterThan(0);
    const back = parseSave(serializeSave(s), 1);
    expect(back).not.toBeNull();
    if (!back) return;
    expect(back.score).toBe(s.score);
    expect(back.streak).toBe(s.streak);
    expect(back.rng).toBe(s.rng);
    expect(back.tray).toEqual(s.tray);
    expect(back.board.grid.map((row) => row.map((v) => v > 0))).toEqual(
      s.board.grid.map((row) => row.map((v) => v > 0)),
    );
    expect(back.board.groups.map((g) => [g.cells, g.center, g.seed])).toEqual(
      s.board.groups.map((g) => [g.cells, g.center, g.seed]),
    );
  });

  it('writes the current version', () => {
    expect(toSave(newGame(1)).version).toBe(SAVE.version);
  });
});

describe('save validation', () => {
  it.each([
    ['null', null],
    ['empty string', ''],
    ['bad JSON', '{nope'],
  ])('rejects %s', (_, raw) => {
    expect(parseSave(raw, 1)).toBeNull();
  });

  it('rejects non-objects and unknown versions', () => {
    expect(parse([])).toBeNull();
    expect(parse(5)).toBeNull();
    expect(parse({ ...valid(), version: 99 })).toBeNull();
  });

  it('rejects out-of-bounds cells', () => {
    const v = valid();
    v.groups = [{ cells: [[9, 0]], center: [0, 0], seed: { a: 0, s: 1, jx: 0, jy: 0, t: 0.9 } }];
    expect(parse(v)).toBeNull();
  });

  it('rejects overlapping groups', () => {
    const v = valid();
    const g = { cells: [[0, 0]], center: [0, 0], seed: { a: 0, s: 1, jx: 0, jy: 0, t: 0.9 } };
    v.groups = [g, g];
    expect(parse(v)).toBeNull();
  });

  it('rejects unknown shape ids', () => {
    const v = valid();
    v.tray = [{ shapeIndex: 999, seed: { a: 0, s: 1, jx: 0, jy: 0, t: 0.9 } }, null, null];
    expect(parse(v)).toBeNull();
  });

  it('rejects bad numbers, seeds and tray sizes', () => {
    expect(parse({ ...valid(), score: -1 })).toBeNull();
    expect(parse({ ...valid(), score: 'lots' })).toBeNull();
    expect(parse({ ...valid(), streak: 1.5 })).toBeNull();
    expect(parse({ ...valid(), tray: [null, null] })).toBeNull();
    const v = valid();
    v.groups = [{ cells: [[0, 0]], center: [0, 0], seed: { a: 'x' } }];
    expect(parse(v)).toBeNull();
    const w = valid();
    w.groups = [{ cells: [], center: [0, 0], seed: { a: 0, s: 1, jx: 0, jy: 0, t: 0.9 } }];
    expect(parse(w)).toBeNull();
  });

  it('migrates a prototype (v0) save', () => {
    const seed = { a: 1, s: 1, jx: 0, jy: 0, t: 0.9 };
    const v0 = {
      score: 120,
      streak: 1,
      groups: [{ cells: [[4, 4]], center: [4.5, 4.5], seed }],
      tray: [{ shape: 0, seed }, null, null],
    };
    const s = parseSave(JSON.stringify(v0), 4242);
    expect(s).not.toBeNull();
    expect(s?.score).toBe(120);
    expect(s?.rng).toBe(4242);
    expect(s?.tray[0]).toEqual({ shapeIndex: 0, seed });
    expect(s?.board.grid[4]?.[4]).toBeGreaterThan(0);
  });
});

describe('best and settings', () => {
  it('parses best score defensively', () => {
    expect(parseBest(null)).toBe(0);
    expect(parseBest('abc')).toBe(0);
    expect(parseBest('-5')).toBe(0);
    expect(parseBest('1234')).toBe(1234);
  });

  it('falls back to defaults and honours the old mute key', () => {
    expect(parseSettings(null, null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(null, '1').sound).toBe(false);
    expect(parseSettings('{bad', null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings(JSON.stringify({ haptics: false, music: 'no' }), null)).toEqual({
      ...DEFAULT_SETTINGS,
      haptics: false,
    });
  });
});
