import { describe, expect, it } from 'vitest';
import { MODES, SAVE } from '../src/config';
import { dailyGoal, dailySeed, dateKey } from '../src/core/daily';
import { newGame } from '../src/core/rules';
import { serializeSave } from '../src/core/save';
import type { GameState } from '../src/core/types';
import { memoryStorage } from '../src/platform/storage';
import { createGameStore, loadPersisted } from '../src/state/store';
import { checkerboard, SEED, shapeIndexOf } from './helpers';

const flush = () => new Promise((r) => setTimeout(r, 0));
const DAY = new Date(2026, 9, 6, 12);
const TODAY = dateKey(DAY);

async function setup(initial: Record<string, string> = {}, at: Date = DAY) {
  const storage = memoryStorage(initial);
  let n = 100;
  const deps = { storage, randomSeed: () => n++ };
  let clock = at;
  const store = createGameStore(deps, await loadPersisted(deps, dateKey(at)), () => clock);
  return {
    storage,
    store,
    setNow: (d: Date) => {
      clock = d;
    },
  };
}

type Store = Awaited<ReturnType<typeof setup>>['store'];

function firstLegal(store: Store): boolean {
  const { game } = store.getState();
  for (let slot = 0; slot < 3; slot++) {
    if (!game.tray[slot]) continue;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) if (store.getState().place(slot, r, c)) return true;
  }
  return false;
}

/** Checkerboard with a single and a 2×2 in the tray: one legal move, then no room. */
const stuckSoon = (score = 40): GameState => ({
  board: checkerboard(),
  tray: [
    { shapeIndex: shapeIndexOf('mono'), seed: SEED },
    { shapeIndex: shapeIndexOf('o4'), seed: SEED },
    null,
  ],
  score,
  streak: 0,
  misses: 0,
  sinceSmall: 0,
  revives: 0,
  rng: 9,
  over: false,
});

describe('modes', () => {
  it('each mode keeps its own save: switching never loses the Classic game', async () => {
    const { store } = await setup();
    store.getState().play('classic');
    expect(firstLegal(store)).toBe(true);
    const classic = store.getState().game;
    store.getState().goHome();
    store.getState().play('zen');
    expect(store.getState().mode).toBe('zen');
    expect(store.getState().game).not.toBe(classic);
    expect(firstLegal(store)).toBe(true);
    const zen = store.getState().game;
    store.getState().goHome();
    store.getState().play('classic');
    expect(store.getState().game).toBe(classic);
    store.getState().goHome();
    store.getState().play('zen');
    expect(store.getState().game).toBe(zen);
    expect(store.getState().saves.classic).toBe(classic.score);
  });

  it('a new Classic game from home replaces only the Classic save', async () => {
    const { store } = await setup();
    store.getState().play('zen');
    expect(firstLegal(store)).toBe(true);
    const zen = store.getState().game;
    store.getState().goHome();
    store.getState().startNew('classic');
    expect(store.getState().mode).toBe('classic');
    store.getState().goHome();
    store.getState().play('zen');
    expect(store.getState().game).toBe(zen);
  });

  it('zen never ends: when stuck it clears the fullest square, and the save already holds that board', async () => {
    const { store, storage } = await setup();
    store.getState().debugLoad(stuckSoon(), 'zen');
    expect(store.getState().place(0, 0, 0)).not.toBeNull();
    const s = store.getState();
    expect(s.phase).toBe('playing');
    expect(s.zenStuck).toBe(true);
    expect(s.place(1, 0, 0)).toBeNull();
    await flush();
    const savedRaw = storage.data.get(MODES.saveKeys.zen);
    expect(savedRaw).toBeTruthy();
    const seq = s.reviveSeq;
    s.applyZenRescue();
    const after = store.getState();
    expect(after.zenStuck).toBe(false);
    expect(after.game.over).toBe(false);
    expect(after.reviveSeq).toBe(seq + 1);
    expect(serializeSave(after.game)).toBe(savedRaw);
    // zen adds no finished games and no score to the lifetime best
    expect(after.stats.gamesPlayed).toBe(0);
    expect(after.stats.bestScore).toBe(0);
    expect(after.best).toBe(0);
  });

  it('blitz: the clock runs only while playing, time up ends the game and records the blitz best', async () => {
    const { store, storage } = await setup();
    store.getState().play('blitz');
    expect(store.getState().timeLeft).toBe(MODES.blitzSeconds);
    expect(firstLegal(store)).toBe(true);
    store.getState().pause();
    store.getState().tick(1000);
    expect(store.getState().timeLeft).toBe(MODES.blitzSeconds);
    store.getState().resume();
    store.getState().tick(MODES.blitzSeconds - 0.5);
    expect(store.getState().timeLeft).toBe(1);
    expect(store.getState().phase).toBe('playing');
    store.getState().tick(1);
    const s = store.getState();
    expect(s.phase).toBe('over');
    expect(s.game.over).toBe(true);
    expect(s.blitzBest).toBe(s.game.score);
    expect(s.best).toBe(0);
    expect(s.stats.gamesPlayed).toBe(1);
    await flush();
    expect(storage.data.get(MODES.blitzBestKey)).toBe(String(s.game.score));
    expect(s.saves).toEqual({ classic: null, zen: null, daily: null });
  });

  it('revive is Classic only', async () => {
    const { store } = await setup();
    store.getState().debugLoad({ ...stuckSoon(), over: true }, 'blitz');
    expect(store.getState().revive()).toBe(false);
    store.getState().debugLoad({ ...stuckSoon(), over: true }, 'classic');
    expect(store.getState().revive()).toBe(true);
  });

  it('daily: same pieces for everyone today, resumable today, gone tomorrow', async () => {
    const a = await setup();
    const b = await setup();
    a.store.getState().play('daily');
    b.store.getState().play('daily');
    expect(a.store.getState().game.tray).toEqual(b.store.getState().game.tray);
    expect(a.store.getState().game.tray).toEqual(newGame(dailySeed(TODAY)).tray);
    expect(a.store.getState().dailyGoal).toBe(dailyGoal(TODAY));
    expect(firstLegal(a.store)).toBe(true);
    await flush();
    const raw = Object.fromEntries(a.storage.data);
    const sameDay = await setup(raw);
    expect(sameDay.store.getState().saves.daily).toBe(a.store.getState().game.score);
    const tomorrow = await setup(raw, new Date(2026, 9, 7, 9));
    expect(tomorrow.store.getState().saves.daily).toBeNull();
    expect(tomorrow.storage.data.has(MODES.saveKeys.daily)).toBe(false);
  });

  it('daily: reaching the goal marks the day, extends the streak and fires once', async () => {
    const { store, storage } = await setup();
    store.getState().play('daily');
    const goal = store.getState().dailyGoal;
    store.getState().debugLoad({ ...stuckSoon(goal - 1) }, 'daily');
    expect(store.getState().place(0, 0, 0)).not.toBeNull();
    const s = store.getState();
    expect(s.phase).toBe('over');
    expect(s.daily).toEqual({ date: TODAY, best: s.game.score, done: true });
    expect(s.dailyStreak).toEqual({ count: 1, last: TODAY });
    expect(s.goalSeq).toBe(1);
    await flush();
    expect(JSON.parse(storage.data.get(MODES.dailyKey) ?? '{}').record.done).toBe(true);
  });

  it('a new day rolls the daily challenge and quests over', async () => {
    const { store, setNow } = await setup();
    store.getState().play('daily');
    expect(firstLegal(store)).toBe(true);
    store.getState().goHome();
    setNow(new Date(2026, 9, 7, 8));
    store.getState().refreshDay();
    const s = store.getState();
    expect(s.today).toBe('2026-10-07');
    expect(s.quests.date).toBe('2026-10-07');
    expect(s.daily).toEqual({ date: '2026-10-07', best: 0, done: false });
    expect(s.saves.daily).toBeNull();
  });

  it('finishing all quests on three days in a row unlocks the Oak wood', async () => {
    let raw: Record<string, string> = {};
    for (const [i, day] of [6, 7, 8].entries()) {
      const at = new Date(2026, 9, day, 12);
      const first = await setup(raw, at);
      const s0 = first.store.getState();
      expect(s0.questStreak.count).toBe(i);
      expect(s0.quests.done).toBe(false);
      // every quest at its target but not yet counted: the next move completes the day
      const q = s0.quests;
      const ready = { date: q.date, progress: q.quests.map((x) => x.target), done: false };
      first.storage.data.set(MODES.questsKey, JSON.stringify({ day: ready, streak: s0.questStreak }));
      const { store, storage } = await setup(Object.fromEntries(first.storage.data), at);
      store.getState().play('classic');
      expect(firstLegal(store)).toBe(true);
      const s = store.getState();
      expect(s.quests.done).toBe(true);
      expect(s.questSeq).toBe(1);
      expect(s.questStreak).toEqual({ count: i + 1, last: dateKey(at) });
      // one more move the same day changes nothing
      expect(firstLegal(store)).toBe(true);
      expect(store.getState().questSeq).toBe(1);
      await flush();
      raw = Object.fromEntries(storage.data);
    }
    const { store } = await setup(raw, new Date(2026, 9, 8, 13));
    const s = store.getState();
    expect(s.stats.questStreak).toBe(3);
    expect(s.unlocked['quests-3']).toBeDefined();
    expect(s.unlocked['quests-7']).toBeUndefined();
    s.setSetting('theme', 'oak');
    expect(store.getState().settings.theme).toBe('oak');
    s.setSetting('theme', 'mahogany');
    expect(store.getState().settings.theme).toBe('oak');
  });

  it('reset progress clears every mode', async () => {
    const { store, storage } = await setup();
    store.getState().play('zen');
    expect(firstLegal(store)).toBe(true);
    store.getState().resetProgress();
    await flush();
    expect(store.getState().saves).toEqual({ classic: null, zen: null, daily: null });
    expect(storage.data.has(MODES.saveKeys.zen)).toBe(false);
    expect(storage.data.has(SAVE.gameKey)).toBe(false);
  });
});
