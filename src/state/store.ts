import { createStore } from 'zustand/vanilla';
import { PROGRESS, PURCHASES, RETENTION, SAVE, themeById, TUTORIAL_KEY } from '../config';
import { canRevive, revive as reviveGame } from '../core/revive';
import type { ClearResult } from '../core/types';
import { parseMeta, recordSession, reviewAsked } from '../core/retention';
import type { Meta, ReminderChoice } from '../core/retention';
import {
  emptyStats,
  newlyEarned,
  parseStats,
  parseUnlocked,
  statsAfterGame,
  statsAfterMove,
  statsRevived,
  themeUnlocked,
} from '../core/progress';
import type { AchievementId, Stats, Unlocked } from '../core/progress';
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
  readonly stats: Stats;
  readonly unlocked: Unlocked;
  /** Achievements earned by the latest event; `unlockSeq` increments each time some are earned. */
  readonly recentUnlocks: readonly AchievementId[];
  readonly unlockSeq: number;
  /** Sessions, review prompt history, reminder choice, ad pacing. */
  readonly meta: Meta;
  /** Owns "Remove ads" (cached locally so it works offline). */
  readonly removeAds: boolean;
  /** Increments on each revive; `lastRevive` holds the cells it cleared. */
  readonly reviveSeq: number;
  readonly lastRevive: ClearResult | null;
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
  setReminder(choice: ReminderChoice): void;
  setRemoveAds(on: boolean): void;
  /** Second chance after game over (once per game). Returns false if not allowed. */
  revive(): boolean;
  /** An interstitial was shown: reset the pacing. */
  noteInterstitial(): void;
  /** Remember that the review prompt was shown. */
  noteReviewAsked(): void;
  /** Wipe best score, saved game, stats and achievements. Settings are kept (theme back to default). */
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
  stats: Stats;
  unlocked: Unlocked;
  meta: Meta;
  removeAds: boolean;
}

/** Read best, settings and any saved game from storage. */
export async function loadPersisted(deps: StoreDeps): Promise<Persisted> {
  const { storage } = deps;
  const [bestRaw, settingsRaw, legacyMute, saveRaw, tutorialRaw, statsRaw, unlockedRaw, metaRaw, noAdsRaw] =
    await Promise.all([
      storage.get(SAVE.bestKey),
      storage.get(SAVE.settingsKey),
      storage.get(SAVE.legacyMuteKey),
      storage.get(SAVE.gameKey),
      storage.get(TUTORIAL_KEY),
      storage.get(PROGRESS.statsKey),
      storage.get(PROGRESS.achievementsKey),
      storage.get(RETENTION.metaKey),
      storage.get(PURCHASES.cacheKey),
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
    stats: parseStats(statsRaw),
    unlocked: parseUnlocked(unlockedRaw),
    meta: parseMeta(metaRaw),
    removeAds: noAdsRaw === '1',
  };
}

export function createGameStore(deps: StoreDeps, initial: Persisted, now: () => Date = () => new Date()) {
  const { storage } = deps;
  const persist = (fn: () => Promise<void>): void => {
    fn().catch(() => undefined);
  };
  const saveMeta = (m: Meta): void => persist(() => storage.set(RETENTION.metaKey, JSON.stringify(m)));
  // every store creation is one app launch
  const initMeta = recordSession(initial.meta, now());
  saveMeta(initMeta);
  /** The real game (kept aside while a tutorial board is shown). */
  let realGame: GameState | null = initial.saved;

  const firstGame = initial.saved ?? newGame(deps.randomSeed());
  // older players: seed the stats' best and back-fill achievements it already earns (silently)
  const initStats: Stats = { ...initial.stats, bestScore: Math.max(initial.stats.bestScore, initial.best) };
  const initUnlocked: Unlocked = { ...initial.unlocked };
  for (const id of newlyEarned(initial.unlocked, initStats, 0))
    (initUnlocked as Record<string, number>)[id] = Date.now();
  // a theme that is somehow locked (e.g. after a reset) falls back to the default
  const initSettings = themeUnlocked(themeById(initial.settings.theme), initUnlocked)
    ? initial.settings
    : { ...initial.settings, theme: 'maple' as const };

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
    const saveProgress = (stats: Stats, unlocked: Unlocked): void => {
      persist(async () => {
        await storage.set(PROGRESS.statsKey, JSON.stringify(stats));
        await storage.set(PROGRESS.achievementsKey, JSON.stringify(unlocked));
      });
    };
    /** Update stats and award anything newly earned. */
    const progress = (stats: Stats, gameScore: number): void => {
      const s = get();
      const fresh = newlyEarned(s.unlocked, stats, gameScore);
      const unlocked: Unlocked = fresh.length
        ? { ...s.unlocked, ...Object.fromEntries(fresh.map((id) => [id, Date.now()])) }
        : s.unlocked;
      set(fresh.length ? { stats, unlocked, recentUnlocks: fresh, unlockSeq: s.unlockSeq + 1 } : { stats });
      saveProgress(stats, unlocked);
    };
    /** Leaving a real game that has a score (restart / new game) still counts as a game played. */
    const abandonCurrent = (): void => {
      if (realGame && !realGame.over && realGame.score > 0)
        progress(statsAfterGame(get().stats, realGame.score), realGame.score);
      // ad pacing counts games that ended (finished or abandoned with a score)
      if (realGame && (realGame.over || realGame.score > 0)) {
        const meta = { ...get().meta, gamesSinceAd: get().meta.gamesSinceAd + 1 };
        set({ meta });
        saveMeta(meta);
      }
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
      settings: initSettings,
      hasSave: initial.saved !== null,
      tutorial: false,
      tutorialDone: initial.tutorialDone,
      lastMove: null,
      moveSeq: 0,
      resetSeq: 0,
      stats: initStats,
      unlocked: initUnlocked,
      recentUnlocks: [],
      unlockSeq: 0,
      meta: initMeta,
      removeAds: initial.removeAds,
      reviveSeq: 0,
      lastRevive: null,

      setRemoveAds: (on) => {
        set({ removeAds: on });
        persist(() => (on ? storage.set(PURCHASES.cacheKey, '1') : storage.remove(PURCHASES.cacheKey)));
      },

      revive: () => {
        const s = get();
        if (s.tutorial || s.phase !== 'over' || !canRevive(s.game)) return false;
        const { state: game, cleared } = reviveGame(s.game);
        realGame = game;
        // the game didn't end after all: it is counted again when it really ends
        const stats = statsRevived(s.stats, s.game.score);
        set((x) => ({
          game,
          phase: 'playing',
          hasSave: true,
          fits: trayFits(game.board, game.tray),
          stats,
          lastMove: null,
          lastRevive: cleared,
          reviveSeq: x.reviveSeq + 1,
        }));
        saveProgress(stats, get().unlocked);
        persist(() => storage.set(SAVE.gameKey, serializeSave(game)));
        return true;
      },

      noteInterstitial: () => {
        const meta = { ...get().meta, gamesSinceAd: 0, lastAdAt: now().getTime() };
        set({ meta });
        saveMeta(meta);
      },

      setReminder: (choice) => {
        const meta = { ...get().meta, reminder: choice };
        set({ meta });
        saveMeta(meta);
      },

      noteReviewAsked: () => {
        const meta = reviewAsked(get().meta, now());
        set({ meta });
        saveMeta(meta);
      },

      startNew: () => {
        abandonCurrent();
        enterGame(newGame(deps.randomSeed()));
      },

      continueGame: () => {
        if (get().hasSave && realGame && !realGame.over) enterGame(realGame);
        else {
          abandonCurrent();
          enterGame(newGame(deps.randomSeed()));
        }
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
        let stats = statsAfterMove(s.stats, move);
        if (game.over) stats = statsAfterGame(stats, game.score);
        progress(stats, game.score);
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
        if (key === 'theme' && !themeUnlocked(themeById(String(value)), get().unlocked)) return;
        const settings = { ...get().settings, [key]: value };
        set({ settings });
        persist(() => storage.set(SAVE.settingsKey, JSON.stringify(settings)));
      },

      resetProgress: () => {
        realGame = null;
        const settings = { ...get().settings, theme: 'maple' as const };
        set({
          best: 0,
          newBest: false,
          hasSave: false,
          phase: 'home',
          stats: emptyStats(),
          unlocked: {},
          settings,
        });
        persist(async () => {
          await storage.remove(SAVE.bestKey);
          await storage.remove(SAVE.gameKey);
          await storage.remove(PROGRESS.statsKey);
          await storage.remove(PROGRESS.achievementsKey);
          await storage.set(SAVE.settingsKey, JSON.stringify(settings));
        });
      },
    };
  });
}
