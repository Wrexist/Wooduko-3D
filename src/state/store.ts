import { createStore } from 'zustand/vanilla';
import { SAVE, TUTORIAL_KEY } from '../config';
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
  /** A scripted tutorial board is loaded: nothing is saved and best is untouched. */
  readonly tutorial: boolean;
  readonly tutorialDone: boolean;
  /** Last committed move. `moveSeq` increments every move so subscribers can react once. */
  readonly lastMove: MoveResult | null;
  readonly moveSeq: number;
  /** Increments whenever the whole board/tray is replaced (new game, continue, tutorial step). */
  readonly resetSeq: number;
}

export interface StoreActions {
  /** Start a fresh game (discarding any save) and enter play. */
  startNew(): void;
  /** Resume the saved game if there is one, else start fresh. */
  continueGame(): void;
  /** Load a scripted tutorial board and enter play without touching the save. */
  loadTutorial(game: GameState): void;
  /** Leave tutorial mode; remembers that it was completed or skipped. */
  finishTutorial(): void;
  /** Replace the current game with a given state (dev tools / scripted screenshots). */
  debugLoad(game: GameState): void;
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

export interface Persisted {
  best: number;
  settings: Settings;
  saved: GameState | null;
  tutorialDone: boolean;
}

/** Read best, settings and any saved game from storage. */
export async function loadPersisted(deps: StoreDeps): Promise<Persisted> {
  const { storage } = deps;
  const [bestRaw, settingsRaw, legacyMute, saveRaw, tutorialRaw] = await Promise.all([
    storage.get(SAVE.bestKey),
    storage.get(SAVE.settingsKey),
    storage.get(SAVE.legacyMuteKey),
    storage.get(SAVE.gameKey),
    storage.get(TUTORIAL_KEY),
  ]);
  const parsed = parseSave(saveRaw, deps.randomSeed());
  const saved = parsed ? normalizeLoaded(parsed) : null;
  const usable = saved && !saved.over ? saved : null;
  if (saveRaw && !usable) await storage.remove(SAVE.gameKey); // corrupt or finished: never show a broken board
  const best = parseBest(bestRaw);
  return {
    best: Math.max(best, usable?.score ?? 0),
    settings: parseSettings(settingsRaw, legacyMute),
    saved: usable,
    // anyone who already played the prototype has seen the game
    tutorialDone: tutorialRaw === '1' || best > 0 || usable !== null,
  };
}

export function createGameStore(deps: StoreDeps, initial: Persisted) {
  const { storage } = deps;
  const persist = (fn: () => Promise<void>): void => {
    fn().catch(() => undefined);
  };
  /** The real game (kept aside while a tutorial board is shown). */
  let realGame: GameState | null = initial.saved;

  const firstGame = initial.saved ?? newGame(deps.randomSeed());

  return createStore<StoreState & StoreActions>()((set, get) => {
    const show = (game: GameState, tutorial: boolean): void => {
      set((s) => ({
        phase: game.over ? 'over' : 'playing',
        game,
        fits: trayFits(game.board, game.tray),
        newBest: false,
        tutorial,
        lastMove: null,
        resetSeq: s.resetSeq + 1,
      }));
    };
    const enterGame = (game: GameState): void => {
      realGame = game;
      show(game, false);
      set({ hasSave: !game.over });
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
      tutorial: false,
      tutorialDone: initial.tutorialDone,
      lastMove: null,
      moveSeq: 0,
      resetSeq: 0,

      startNew: () => enterGame(newGame(deps.randomSeed())),

      continueGame: () => {
        if (get().hasSave && realGame && !realGame.over) enterGame(realGame);
        else enterGame(newGame(deps.randomSeed()));
      },

      loadTutorial: (game) => show(game, true),

      debugLoad: (game) => enterGame(game),

      finishTutorial: () => {
        // put the real game (or a fresh board) back behind the home card
        const game = realGame && !realGame.over ? realGame : newGame(deps.randomSeed());
        set((s) => ({
          tutorial: false,
          tutorialDone: true,
          phase: 'home',
          game,
          fits: trayFits(game.board, game.tray),
          lastMove: null,
          resetSeq: s.resetSeq + 1,
        }));
        persist(() => storage.set(TUTORIAL_KEY, '1'));
      },

      place: (slot, r0, c0) => {
        const s = get();
        if (s.phase !== 'playing') return null;
        const move = playMove(s.game, slot, r0, c0);
        if (!move) return null;
        const game = move.state;
        if (s.tutorial) {
          set({
            game,
            fits: trayFits(game.board, game.tray),
            lastMove: move,
            moveSeq: s.moveSeq + 1,
          });
          return move;
        }
        realGame = game;
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
        realGame = null;
        set({ best: 0, newBest: false, hasSave: false, phase: 'home' });
        persist(async () => {
          await storage.remove(SAVE.bestKey);
          await storage.remove(SAVE.gameKey);
        });
      },
    };
  });
}
