import { describe, expect, it } from 'vitest';
import { BOARD, JOURNEY } from '../src/config';
import {
  addMoves,
  applyRunMove,
  cellKey,
  designLevel,
  levelGame,
  levelSpec,
  movesBonus,
  newGoalKinds,
  parseJourney,
  recordWin,
  runOutcome,
  starsFor,
  startRun,
  totalStars,
  unlockedLevel,
} from '../src/core/journey';
import type { LevelSpec } from '../src/core/journey';
import { playMove, trayFits } from '../src/core/rules';
import { memoryStorage } from '../src/platform/storage';
import { createGameStore, loadPersisted } from '../src/state/store';
import { boardFrom, SEED, shapeIndexOf } from './helpers';

const N = BOARD.size;

describe('journey levels', () => {
  it('are deterministic, and every layout is fair: no full line of crates, no gem under a crate', () => {
    for (let n = 1; n <= JOURNEY.levels; n++) {
      const a = levelSpec(n);
      expect(levelSpec(n)).toEqual(a);
      expect(a.moves).toBeGreaterThan(0);
      expect(a.goals.length).toBeGreaterThan(0);
      const crates = new Set(a.crates.map(([r, c]) => cellKey(r, c)));
      for (let i = 0; i < N; i++) {
        expect(a.crates.filter(([r]) => r === i).length).toBeLessThan(N);
        expect(a.crates.filter(([, c]) => c === i).length).toBeLessThan(N);
      }
      for (const [r, c] of a.gems) expect(crates.has(cellKey(r, c))).toBe(false);
      expect(a.stars[1]).toBeGreaterThan(a.stars[0]);
    }
  });

  it('a level starts with its crates on the board and a tray that fits', () => {
    const spec = levelSpec(4);
    const g = levelGame(spec, 77);
    for (const [r, c] of spec.crates) expect(g.board.grid[r]?.[c]).not.toBe(0);
    expect(trayFits(g.board, g.tray).some(Boolean)).toBe(true);
    expect(g.over).toBe(false);
  });

  it('a clear takes the crates and gems in its cells and uses one move', () => {
    const spec: LevelSpec = {
      n: 1,
      moves: 5,
      goals: [
        { kind: 'crates', target: 1 },
        { kind: 'gems', target: 1 },
      ],
      crates: [[0, 2]],
      gems: [[0, 8]],
      stars: [100, 200],
    };
    const run = startRun(spec);
    const state = {
      board: boardFrom(['aabbbbbb.']),
      tray: [{ shapeIndex: shapeIndexOf('mono'), seed: SEED }, null, null],
      score: 0,
      streak: 0,
      misses: 0,
      sinceSmall: 0,
      revives: 0,
      rng: 5,
      over: false,
    };
    const m = playMove(state, 0, 0, 8);
    if (!m) throw new Error('move');
    const after = applyRunMove(run, m);
    expect(after.movesLeft).toBe(4);
    expect(after.lines).toBe(1);
    expect(after.crates).toEqual([]);
    expect(after.gems).toEqual([]);
    expect(runOutcome(spec, after, m.state)).toBe('won');
  });

  it('runs out of moves, and +5 moves puts the attempt back in play', () => {
    const spec = designLevel(1);
    let run = { ...startRun(spec), movesLeft: 0 };
    const g = levelGame(spec, 3);
    expect(runOutcome(spec, run, g)).toBe('outOfMoves');
    run = addMoves(run);
    expect(run.movesLeft).toBe(JOURNEY.extraMoves);
    expect(run.extras).toBe(1);
    expect(runOutcome(spec, run, g)).toBe('playing');
  });

  it('stars come from the score after the moves bonus', () => {
    const spec = levelSpec(10);
    expect(starsFor(spec, 0)).toBe(1);
    expect(starsFor(spec, spec.stars[0])).toBe(2);
    expect(starsFor(spec, spec.stars[1])).toBe(3);
    expect(movesBonus(4)).toBe(4 * JOURNEY.bonusPerMove);
  });

  it('each goal kind is introduced once, on the hand-made levels', () => {
    expect(newGoalKinds(1)).toEqual(['score']);
    expect(newGoalKinds(2)).toEqual(['lines']);
    expect(newGoalKinds(3)).toEqual(['gems']);
    expect(newGoalKinds(4)).toEqual(['crates']);
    for (let n = 5; n <= JOURNEY.levels; n++) expect(newGoalKinds(n)).toEqual([]);
  });

  it('progress unlocks the next level and keeps the best stars', () => {
    let p = parseJourney(null);
    expect(unlockedLevel(p)).toBe(1);
    p = recordWin(p, 1, 2);
    p = recordWin(p, 1, 1);
    expect(p.stars[0]).toBe(2);
    expect(unlockedLevel(p)).toBe(2);
    p = recordWin(p, 2, 3);
    expect(totalStars(p)).toBe(5);
    expect(parseJourney(JSON.stringify(p))).toEqual(p);
    expect(parseJourney('{"stars":[9,"x",2]}').stars).toEqual([0, 0, 2]);
    expect(parseJourney('nope').stars).toEqual([]);
  });
});

describe('journey in the store', () => {
  async function setup() {
    const storage = memoryStorage({});
    let n = 100;
    const deps = { storage, randomSeed: () => n++ };
    return { storage, store: createGameStore(deps, await loadPersisted(deps)) };
  }
  const anyMove = (store: Awaited<ReturnType<typeof setup>>['store']) => {
    const { game } = store.getState();
    for (let slot = 0; slot < 3; slot++)
      for (let r = 0; r < 9; r++)
        for (let c = 0; c < 9; c++) if (store.getState().place(slot, r, c)) return true;
    void game;
    return false;
  };

  it('plays a level: each move counts down, and running out ends the attempt', async () => {
    const { store } = await setup();
    store.getState().playLevel(2);
    const s0 = store.getState();
    expect(s0.mode).toBe('journey');
    expect(s0.run?.n).toBe(2);
    const moves = s0.run?.movesLeft ?? 0;
    expect(anyMove(store)).toBe(true);
    expect(store.getState().run?.movesLeft).toBe(moves - 1);
    // force the last move
    const run = store.getState().run;
    if (!run) throw new Error('run');
    store.setState({ run: { ...run, movesLeft: 1, lines: 0 } });
    expect(anyMove(store)).toBe(true);
    const s = store.getState();
    if (s.outcome === 'won') return; // the last move happened to win it
    expect(s.outcome).toBe('outOfMoves');
    expect(s.phase).toBe('over');
    expect(s.extraMoves()).toBe(true);
    expect(store.getState().phase).toBe('playing');
    expect(store.getState().run?.movesLeft).toBe(JOURNEY.extraMoves);
  });

  it('winning records stars, persists them and unlocks the next level', async () => {
    const { store, storage } = await setup();
    store.getState().playLevel(1);
    const run = store.getState().run;
    if (!run) throw new Error('run');
    // level 1 is a score goal: start the attempt with the target already met
    store.setState({ game: { ...store.getState().game, score: 10_000 } });
    expect(anyMove(store)).toBe(true);
    const s = store.getState();
    expect(s.outcome).toBe('won');
    expect(s.phase).toBe('over');
    expect(s.runStars).toBe(3);
    expect(s.runBonus).toBe(movesBonus(run.movesLeft - 1));
    expect(unlockedLevel(s.journey)).toBe(2);
    await new Promise((r) => setTimeout(r, 0));
    expect(parseJourney(storage.data.get(JOURNEY.progressKey) ?? null).stars[0]).toBe(3);
  });
});
