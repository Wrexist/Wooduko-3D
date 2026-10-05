import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, SAVE } from '../src/config';
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
