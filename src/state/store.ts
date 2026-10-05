import { createStore } from 'zustand/vanilla';
import { SAVE } from '../config';
import { newGame, normalizeLoaded, playMove, trayFits } from '../core/rules';
import type { MoveResult } from '../core/rules';
import { parseBest, parseSave, parseSettings, serializeSave } from '../core/save';
import type { GameState, Settings } from '../core/types';
import type { KeyValueStore } from '../platform/storage';

export type Phase = 'home' | 'playing' | 'paused' | 'over';

export interface StoreState {
  readonly phase: Phase;
  readonly game: GameState;
  /** Per tray slot: does the piece fit anywhere? Drives the grey tint. */
  readonly fits: readonly boolean[];
  readonly best: number;
  /** True when this game set a new best (for "New best" on the results card). */
  readonly newBest: boolean;
  readonly settings: Settings;
  /** A resumable save exists (enables Continue on the home screen). */
  readonly hasSave: boolean;
  /** Last committed move. `moveSeq` increments every move so subscribers can react once. */
  readonly lastMove: MoveResult | null;
  readonly moveSeq: number;
  /** Increments whenever the whole board/tray is replaced (new game, continue). */
  readonly resetSeq: number;
}

export interface StoreActions {
  /** Start a fresh game (discarding any save) and enter play. */
  startNew(): void;
  /** Resume the saved game if there is one, else start fresh. */
  continueGame(): void;
  /** Commit a placement. Returns null (and changes nothing) if illegal. */
  place(slot: number, r0: number, c0: number): MoveResult | null;
  pause(): void;
  resume(): void;
  goHome(): void;
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  /** Wipe best score and the saved game. Settings are kept. */
  resetProgress(): void;
}

export type GameStore = ReturnType<typeof createGameStore>;

export interface StoreDeps {
  readonly storage: KeyValueStore;
  /** Fresh 32-bit seed for a new game. */
  readonly randomSeed: () => number;
}

/** Read best, settings and any saved game from storage. */
export async function loadPersisted(deps: StoreDeps): Promise<{
  best: number;
  settings: Settings;
  saved: GameState | null;
}> {
  const { storage } = deps;
  const [bestRaw, settingsRaw, legacyMute, saveRaw] = await Promise.all([
    storage.get(SAVE.bestKey),
    storage.get(SAVE.settingsKey),
    storage.get(SAVE.legacyMuteKey),
    storage.get(SAVE.gameKey),
  ]);
  const parsed = parseSave(saveRaw, deps.randomSeed());
  const saved = parsed ? normalizeLoaded(parsed) : null;
  if (saveRaw && !saved) await storage.remove(SAVE.gameKey); // corrupt: never show a broken board
  return {
    best: parseBest(bestRaw),
    settings: parseSettings(settingsRaw, legacyMute),
    saved: saved && !saved.over ? saved : null,
  };
}

export function createGameStore(deps: StoreDeps, initial: Awaited<ReturnType<typeof loadPersisted>>) {
  const { storage } = deps;
  const persist = (fn: () => Promise<void>): void => {
    fn().catch(() => undefined);
  };

  const firstGame = initial.saved ?? newGame(deps.randomSeed());

  return createStore<StoreState & StoreActions>()((set, get) => {
    const enterGame = (game: GameState): void => {
      set((s) => ({
        phase: game.over ? 'over' : 'playing',
        game,
        fits: trayFits(game.board, game.tray),
        newBest: false,
        hasSave: !game.over,
        lastMove: null,
        resetSeq: s.resetSeq + 1,
      }));
      persist(() => storage.set(SAVE.gameKey, serializeSave(game)));
    };

    return {
      phase: 'home',
      game: firstGame,
      fits: trayFits(firstGame.board, firstGame.tray),
      best: initial.best,
      newBest: false,
      settings: initial.settings,
      hasSave: initial.saved !== null,
      lastMove: null,
      moveSeq: 0,
      resetSeq: 0,

      startNew: () => enterGame(newGame(deps.randomSeed())),

      continueGame: () => {
        const { game, hasSave } = get();
        if (hasSave && !game.over) enterGame(game);
        else enterGame(newGame(deps.randomSeed()));
      },

      place: (slot, r0, c0) => {
        const s = get();
        if (s.phase !== 'playing') return null;
        const move = playMove(s.game, slot, r0, c0);
        if (!move) return null;
        const game = move.state;
        const isBest = game.score > s.best;
        const best = isBest ? game.score : s.best;
        set({
          game,
          fits: trayFits(game.board, game.tray),
          best,
          newBest: s.newBest || isBest,
          phase: game.over ? 'over' : 'playing',
          hasSave: !game.over,
          lastMove: move,
          moveSeq: s.moveSeq + 1,
        });
        if (isBest) persist(() => storage.set(SAVE.bestKey, String(best)));
        persist(() =>
          game.over ? storage.remove(SAVE.gameKey) : storage.set(SAVE.gameKey, serializeSave(game)),
        );
        return move;
      },

      pause: () => {
        if (get().phase === 'playing') set({ phase: 'paused' });
      },
      resume: () => {
        if (get().phase === 'paused') set({ phase: 'playing' });
      },
      goHome: () => set({ phase: 'home' }),

      setSetting: (key, value) => {
        const settings = { ...get().settings, [key]: value };
        set({ settings });
        persist(() => storage.set(SAVE.settingsKey, JSON.stringify(settings)));
      },

      resetProgress: () => {
        set({ best: 0, newBest: false, hasSave: false, phase: 'home' });
        persist(async () => {
          await storage.remove(SAVE.bestKey);
          await storage.remove(SAVE.gameKey);
        });
      },
    };
  });
}
