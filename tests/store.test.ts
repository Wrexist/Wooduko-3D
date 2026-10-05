import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, PROGRESS, SAVE, TUTORIAL_KEY } from '../src/config';
import { tutorialSteps } from '../src/core/tutorial';
import { newGame } from '../src/core/rules';
import { serializeSave } from '../src/core/save';
import { memoryStorage } from '../src/platform/storage';
import { createGameStore, loadPersisted } from '../src/state/store';

const flush = () => new Promise((r) => setTimeout(r, 0));

async function setup(initial: Record<string, string> = {}) {
  const storage = memoryStorage(initial);
  let n = 100;
  const deps = { storage, randomSeed: () => n++ };
  const store = createGameStore(deps, await loadPersisted(deps));
  return { storage, store };
}

/** Find any legal move for the current tray. */
function firstLegal(store: Awaited<ReturnType<typeof setup>>['store']) {
  const { game } = store.getState();
  for (let slot = 0; slot < 3; slot++) {
    if (!game.tray[slot]) continue;
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) if (store.getState().place(slot, r, c)) return true;
  }
  return false;
}

describe('store', () => {
  it('boots on the home screen with defaults and no save', async () => {
    const { store } = await setup();
    const s = store.getState();
    expect(s.phase).toBe('home');
    expect(s.hasSave).toBe(false);
    expect(s.best).toBe(0);
    expect(s.settings).toEqual(DEFAULT_SETTINGS);
  });

  it('ignores placements outside play', async () => {
    const { store } = await setup();
    expect(store.getState().place(0, 0, 0)).toBeNull();
  });

  it('saves after a placement and updates best', async () => {
    const { store, storage } = await setup();
    store.getState().startNew();
    expect(firstLegal(store)).toBe(true);
    await flush();
    const s = store.getState();
    expect(s.moveSeq).toBe(1);
    expect(s.best).toBe(s.game.score);
    expect(storage.data.get(SAVE.bestKey)).toBe(String(s.game.score));
    expect(storage.data.get(SAVE.gameKey)).toBe(serializeSave(s.game));
  });

  it('resumes a valid save via Continue', async () => {
    const game = newGame(55);
    const { store } = await setup({ [SAVE.gameKey]: serializeSave(game), [SAVE.bestKey]: '300' });
    expect(store.getState().hasSave).toBe(true);
    expect(store.getState().best).toBe(300);
    store.getState().continueGame();
    expect(store.getState().phase).toBe('playing');
    expect(store.getState().game.tray).toEqual(game.tray);
  });

  it('drops a corrupted save and starts fresh', async () => {
    const { store, storage } = await setup({ [SAVE.gameKey]: '{"score":"nope"' });
    expect(store.getState().hasSave).toBe(false);
    expect(storage.data.has(SAVE.gameKey)).toBe(false);
    store.getState().continueGame();
    expect(store.getState().game.score).toBe(0);
  });

  it('pause/resume only switch between playing and paused', async () => {
    const { store } = await setup();
    store.getState().pause();
    expect(store.getState().phase).toBe('home');
    store.getState().startNew();
    store.getState().pause();
    expect(store.getState().phase).toBe('paused');
    expect(store.getState().place(0, 0, 0)).toBeNull();
    store.getState().resume();
    expect(store.getState().phase).toBe('playing');
  });

  it('persists settings and reset progress wipes best + save', async () => {
    const { store, storage } = await setup({ [SAVE.bestKey]: '999' });
    store.getState().setSetting('haptics', false);
    store.getState().startNew();
    store.getState().resetProgress();
    await flush();
    expect(JSON.parse(storage.data.get(SAVE.settingsKey) ?? '{}')).toMatchObject({ haptics: false });
    expect(store.getState().best).toBe(0);
    expect(store.getState().hasSave).toBe(false);
    expect(storage.data.has(SAVE.bestKey)).toBe(false);
    expect(storage.data.has(SAVE.gameKey)).toBe(false);
  });
});

describe('store tutorial mode', () => {
  it('boots into tutorial-needed state on a fresh install only', async () => {
    expect((await setup()).store.getState().tutorialDone).toBe(false);
    expect((await setup({ [SAVE.bestKey]: '10' })).store.getState().tutorialDone).toBe(true);
  });

  it('tutorial moves never touch the save or best, and finishing restores the real game', async () => {
    const real = newGame(77);
    const { store, storage } = await setup({ [SAVE.gameKey]: serializeSave(real) });
    const before = storage.data.get(SAVE.gameKey);
    const step = tutorialSteps()[0];
    if (!step) throw new Error('no tutorial');
    store.getState().loadTutorial(step.game);
    expect(store.getState().tutorial).toBe(true);
    expect(store.getState().place(step.slot, ...step.target)).not.toBeNull();
    await flush();
    expect(store.getState().best).toBe(0);
    expect(storage.data.get(SAVE.gameKey)).toBe(before);
    store.getState().finishTutorial();
    await flush();
    const s = store.getState();
    expect(s.tutorial).toBe(false);
    expect(s.tutorialDone).toBe(true);
    expect(s.phase).toBe('home');
    expect(s.game.tray).toEqual(real.tray);
    expect(storage.data.get(TUTORIAL_KEY)).toBe('1');
  });
});

describe('store loading edge cases', () => {
  it('drops a save whose board is already game over (no piece fits)', async () => {
    const seed = { a: 0, s: 1, jx: 0, jy: 0, t: 0.9 };
    const groups = [];
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if ((r + c) % 2 === 1) groups.push({ cells: [[r, c]], center: [c, r], seed });
    const save = JSON.stringify({
      version: 1,
      score: 640,
      streak: 0,
      rng: 3,
      groups,
      tray: [{ shapeIndex: 13, seed }, null, null], // a 2×2 square cannot fit a checkerboard
    });
    const { store, storage } = await setup({ [SAVE.gameKey]: save, [SAVE.bestKey]: '100' });
    expect(store.getState().hasSave).toBe(false);
    expect(storage.data.has(SAVE.gameKey)).toBe(false);
    expect(store.getState().best).toBe(100);
  });

  it('a stored best lower than the saved score is lifted to the score', async () => {
    const game = { ...newGame(5), score: 900 };
    const { store } = await setup({ [SAVE.gameKey]: serializeSave(game), [SAVE.bestKey]: '10' });
    expect(store.getState().best).toBe(900);
  });
});

describe('store progression', () => {
  it('awards achievements from real moves and persists stats', async () => {
    const seed = { a: 0, s: 1, jx: 0, jy: 0, t: 0.9 };
    const groups = [{ cells: Array.from({ length: 8 }, (_, c) => [0, c]), center: [4, 0.5], seed }];
    const save = JSON.stringify({
      version: 2,
      score: 0,
      streak: 0,
      misses: 0,
      sinceSmall: 0,
      rng: 3,
      groups,
      tray: [
        { shapeIndex: 0, seed },
        { shapeIndex: 0, seed },
        { shapeIndex: 0, seed },
      ],
    });
    const { store, storage } = await setup({ [SAVE.gameKey]: save });
    store.getState().continueGame();
    store.getState().place(0, 0, 8);
    await flush();
    const s = store.getState();
    expect(s.stats.linesCleared).toBe(1);
    expect(s.unlocked['first-clear']).toBeDefined();
    expect(s.recentUnlocks).toContain('first-clear');
    expect(s.unlockSeq).toBe(1);
    expect(JSON.parse(storage.data.get(PROGRESS.statsKey) ?? '{}').linesCleared).toBe(1);
  });

  it('a restarted game with a score counts as played', async () => {
    const { store } = await setup();
    store.getState().startNew();
    firstLegal(store);
    store.getState().startNew();
    expect(store.getState().stats.gamesPlayed).toBe(1);
  });

  it('locked themes cannot be selected; unlocked ones can', async () => {
    const { store } = await setup({ [PROGRESS.achievementsKey]: JSON.stringify({ 'score-1k': 1 }) });
    store.getState().setSetting('theme', 'ebony');
    expect(store.getState().settings.theme).toBe('maple');
    store.getState().setSetting('theme', 'walnut');
    expect(store.getState().settings.theme).toBe('walnut');
  });

  it('back-fills score achievements for players who already have a best', async () => {
    const { store } = await setup({ [SAVE.bestKey]: '6000' });
    expect(store.getState().unlocked['score-5k']).toBeDefined();
    expect(store.getState().recentUnlocks).toEqual([]);
  });

  it('reset progress wipes stats, achievements and the theme', async () => {
    const { store, storage } = await setup({
      [PROGRESS.achievementsKey]: JSON.stringify({ 'score-1k': 1 }),
      [PROGRESS.statsKey]: JSON.stringify({ gamesPlayed: 4 }),
    });
    store.getState().setSetting('theme', 'walnut');
    store.getState().resetProgress();
    await flush();
    const s = store.getState();
    expect(s.stats.gamesPlayed).toBe(0);
    expect(s.unlocked).toEqual({});
    expect(s.settings.theme).toBe('maple');
    expect(storage.data.has(PROGRESS.statsKey)).toBe(false);
  });
});
