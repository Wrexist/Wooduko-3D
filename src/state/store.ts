import { createStore } from 'zustand/vanilla';
import { MODES, PROGRESS, PURCHASES, RETENTION, SAVE, themeById, TUTORIAL_KEY } from '../config';
import type { Mode } from '../config';
import {
  dailyGoal,
  dailySeed,
  dateKey,
  emptyDaily,
  extendStreak,
  parseDaily,
  parseStreak,
} from '../core/daily';
import type { DailyRecord, Streak } from '../core/daily';
import { applyQuestEvent, parseQuestDay, questDayFor } from '../core/quests';
import type { QuestDay, QuestEvent } from '../core/quests';
import { canRevive, revive as reviveGame, zenRescue } from '../core/revive';
import type { ClearResult } from '../core/types';
import { parseMeta, recordSession, reviewAsked } from '../core/retention';
import { offerShown } from '../core/upsell';
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

/** Modes whose game survives closing the app. Blitz is one short sitting. */
export type SaveMode = Exclude<Mode, 'blitz'>;
const SAVE_MODES: readonly SaveMode[] = ['classic', 'zen', 'daily'];
const isSaveMode = (m: Mode): m is SaveMode => m !== 'blitz';

export interface StoreState {
  readonly phase: Phase;
  readonly mode: Mode;
  readonly game: GameState;
  /** Per tray slot: does the piece fit anywhere? Drives the grey tint. */
  readonly fits: readonly boolean[];
  /** Classic best score. */
  readonly best: number;
  /** True when this game set a new best for its mode (for "New best" on the results card). */
  readonly newBest: boolean;
  readonly settings: Settings;
  /** A resumable Classic save exists (enables Continue on the home screen). */
  readonly hasSave: boolean;
  /** Score of each mode's resumable game (null = none). */
  readonly saves: Readonly<Record<SaveMode, number | null>>;
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
  /** Increments on each revive or Zen rescue; `lastRevive` holds the cells it cleared. */
  readonly reviveSeq: number;
  readonly lastRevive: ClearResult | null;
  /** Zen: stuck, waiting for the view to play the rescue (`applyZenRescue`). */
  readonly zenStuck: boolean;
  /** Blitz: whole seconds left on the clock. */
  readonly timeLeft: number;
  readonly blitzBest: number;
  /** Local calendar day ('YYYY-MM-DD') the daily state below belongs to. */
  readonly today: string;
  readonly daily: DailyRecord;
  readonly dailyGoal: number;
  readonly dailyStreak: Streak;
  /** Increments when today's daily goal is reached (once per day). */
  readonly goalSeq: number;
  readonly quests: QuestDay;
  readonly questStreak: Streak;
  /** Increments when every quest of the day is done. */
  readonly questSeq: number;
}

export interface StoreActions {
  /** Open a mode from the home screen: resumes its save if it has one (Classic, Zen, today's Daily). */
  play(mode: Mode): void;
  /** Start a fresh game (current mode by default), discarding that mode's save, and enter play. */
  startNew(mode?: Mode): void;
  /** Resume the saved Classic game if there is one, else start fresh. */
  continueGame(): void;
  /** Load a scripted tutorial board and enter play without touching the save. */
  loadTutorial(game: GameState): void;
  /** Leave tutorial mode; remembers that it was completed or skipped. */
  finishTutorial(): void;
  /** Replace the current game with a given state (dev tools / scripted screenshots). */
  debugLoad(game: GameState, mode?: Mode): void;
  /** Commit a placement. Returns null (and changes nothing) if illegal. */
  place(slot: number, r0: number, c0: number): MoveResult | null;
  /** Zen: clear the fullest square so play goes on. */
  applyZenRescue(): void;
  /** Blitz: run the clock (seconds of play). Time's up ends the game. */
  tick(dt: number): void;
  pause(): void;
  resume(): void;
  goHome(): void;
  /** A new calendar day may have started: roll the daily challenge and quests over. */
  refreshDay(): void;
  setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void;
  setReminder(choice: ReminderChoice): void;
  /** The app came back after a long break: counts as a new session. */
  noteSession(): void;
  setRemoveAds(on: boolean): void;
  /** Second chance after game over (Classic, once per game). Returns false if not allowed. */
  revive(): boolean;
  /** An interstitial was shown: reset the pacing. */
  noteInterstitial(): void;
  /** The Remove-ads offer was shown (for its pacing). */
  noteOffer(): void;
  /** Remember that the review prompt was shown. */
  noteReviewAsked(): void;
  /** Wipe bests, saved games, stats, achievements, dailies and quests. Settings are kept (theme back to default). */
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
  /** Classic save. */
  saved: GameState | null;
  zenSaved: GameState | null;
  /** Today's daily-challenge game in progress. */
  dailySaved: GameState | null;
  tutorialDone: boolean;
  stats: Stats;
  unlocked: Unlocked;
  meta: Meta;
  removeAds: boolean;
  blitzBest: number;
  daily: DailyRecord;
  dailyStreak: Streak;
  quests: QuestDay | null;
  questStreak: Streak;
}

/** Load a saved game; corrupt or finished saves are removed (never show a broken board). */
async function loadGame(storage: KeyValueStore, key: string, raw: string | null, seed: number) {
  const parsed = parseSave(raw, seed);
  const game = parsed ? normalizeLoaded(parsed) : null;
  const usable = game && !game.over ? game : null;
  if (raw && !usable) await storage.remove(key);
  return usable;
}

/** Read bests, settings, saved games, dailies and quests from storage. */
export async function loadPersisted(deps: StoreDeps, today = dateKey(new Date())): Promise<Persisted> {
  const { storage } = deps;
  const keys = [
    SAVE.bestKey,
    SAVE.settingsKey,
    SAVE.legacyMuteKey,
    SAVE.gameKey,
    TUTORIAL_KEY,
    PROGRESS.statsKey,
    PROGRESS.achievementsKey,
    RETENTION.metaKey,
    PURCHASES.cacheKey,
    MODES.saveKeys.zen,
    MODES.saveKeys.daily,
    MODES.dailyKey,
    MODES.blitzBestKey,
    MODES.questsKey,
  ] as const;
  const [
    bestRaw,
    settingsRaw,
    legacyMute,
    saveRaw,
    tutorialRaw,
    statsRaw,
    unlockedRaw,
    metaRaw,
    noAdsRaw,
    zenRaw,
    dailySaveRaw,
    dailyRaw,
    blitzRaw,
    questsRaw,
  ] = await Promise.all(keys.map((k) => storage.get(k)));
  const usable = await loadGame(storage, SAVE.gameKey, saveRaw ?? null, deps.randomSeed());
  const zenSaved = await loadGame(storage, MODES.saveKeys.zen, zenRaw ?? null, deps.randomSeed());
  // the daily save is { date, game }: yesterday's unfinished challenge is gone
  let dailySaved: GameState | null = null;
  if (dailySaveRaw) {
    let inner: string | null = null;
    try {
      const v = JSON.parse(dailySaveRaw) as { date?: unknown; game?: unknown };
      if (v.date === today && typeof v.game === 'string') inner = v.game;
    } catch {
      inner = null;
    }
    dailySaved = inner ? await loadGame(storage, MODES.saveKeys.daily, inner, deps.randomSeed()) : null;
    if (!dailySaved) await storage.remove(MODES.saveKeys.daily);
  }
  const { record, streak } = parseDaily(dailyRaw ?? null, today);
  let questDay: QuestDay | null = null;
  let questStreak = parseStreak(null);
  if (questsRaw) {
    try {
      const v = JSON.parse(questsRaw) as { day?: unknown; streak?: unknown };
      questDay = parseQuestDay(JSON.stringify(v.day ?? null));
      questStreak = parseStreak(v.streak);
    } catch {
      questDay = null;
    }
  }
  const best = parseBest(bestRaw ?? null);
  return {
    best: Math.max(best, usable?.score ?? 0),
    settings: parseSettings(settingsRaw ?? null, legacyMute ?? null),
    saved: usable,
    zenSaved,
    dailySaved,
    // anyone who already played the prototype has seen the game
    tutorialDone: tutorialRaw === '1' || best > 0 || usable !== null,
    stats: parseStats(statsRaw ?? null),
    unlocked: parseUnlocked(unlockedRaw ?? null),
    meta: parseMeta(metaRaw ?? null),
    removeAds: noAdsRaw === '1',
    blitzBest: parseBest(blitzRaw ?? null),
    daily: record,
    dailyStreak: streak,
    quests: questDay,
    questStreak,
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
  /** Each resumable mode's game (kept aside while another mode or the tutorial is shown). */
  const saved: Record<SaveMode, GameState | null> = {
    classic: initial.saved,
    zen: initial.zenSaved,
    daily: initial.dailySaved,
  };
  /** The game being played (any mode), or null after a reset. */
  let current: GameState | null = initial.saved;
  /** Blitz clock in seconds (the state only holds whole seconds). */
  let clock = 0;
  /** Zen: the rescued state waiting for `applyZenRescue`. */
  let pendingRescue: { state: GameState; cleared: ClearResult } | null = null;
  /** Day of the daily challenge being played (a game started yesterday never counts for today). */
  let dailyDate = dateKey(now());

  const today0 = dateKey(now());
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
  const scoreOf = (g: GameState | null): number | null => (g && !g.over ? g.score : null);
  const savesView = (): Record<SaveMode, number | null> => ({
    classic: scoreOf(saved.classic),
    zen: scoreOf(saved.zen),
    daily: scoreOf(saved.daily),
  });

  return createStore<StoreState & StoreActions>()((set, get) => {
    const show = (game: GameState, tutorial: boolean): void => {
      set((s) => ({
        phase: game.over ? 'over' : 'playing',
        game,
        fits: trayFits(game.board, game.tray),
        newBest: false,
        tutorial,
        lastMove: null,
        zenStuck: false,
        resetSeq: s.resetSeq + 1,
      }));
    };
    const saveProgress = (stats: Stats, unlocked: Unlocked): void => {
      persist(async () => {
        await storage.set(PROGRESS.statsKey, JSON.stringify(stats));
        await storage.set(PROGRESS.achievementsKey, JSON.stringify(unlocked));
      });
    };
    const saveDaily = (record: DailyRecord, streak: Streak): void =>
      persist(() => storage.set(MODES.dailyKey, JSON.stringify({ record, streak })));
    const saveQuests = (day: QuestDay, streak: Streak): void =>
      persist(() =>
        storage.set(
          MODES.questsKey,
          JSON.stringify({ day: { date: day.date, progress: day.progress, done: day.done }, streak }),
        ),
      );
    /** Persist (or drop) a mode's game. */
    const storeGame = (mode: Mode, game: GameState | null): void => {
      if (!isSaveMode(mode)) return;
      saved[mode] = game && !game.over ? game : null;
      const key = MODES.saveKeys[mode];
      if (mode === 'daily' && dailyDate !== get().today) saved.daily = null;
      const g = saved[mode];
      if (!g) persist(() => storage.remove(key));
      else if (mode === 'daily')
        persist(() => storage.set(key, JSON.stringify({ date: get().today, game: serializeSave(g) })));
      else persist(() => storage.set(key, serializeSave(g)));
      set({ saves: savesView(), hasSave: saved.classic !== null });
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
    /**
     * Lifetime stats count every mode's moves; the best score is Classic's only. Zen never ends
     * and has no pressure, so it adds no finished games and no score.
     */
    const statsFor = (base: Stats, mode: Mode, move: MoveResult | null, finished: number | null): Stats => {
      let st = move ? statsAfterMove(base, move) : base;
      if (finished !== null && mode !== 'zen') st = statsAfterGame(st, finished);
      return mode === 'classic' ? st : { ...st, bestScore: base.bestScore };
    };
    /** Fold an event into today's quests; a fully done day extends the quest streak. Returns new stats. */
    const quest = (e: QuestEvent, stats: Stats): Stats => {
      const s = get();
      const { day, completed } = applyQuestEvent(questDayFor(s.quests, s.today), e);
      if (!completed) {
        if (day !== s.quests) {
          set({ quests: day });
          saveQuests(day, s.questStreak);
        }
        return stats;
      }
      const streak = extendStreak(s.questStreak, s.today);
      set({ quests: day, questStreak: streak, questSeq: s.questSeq + 1 });
      saveQuests(day, streak);
      return { ...stats, questStreak: Math.max(stats.questStreak, streak.count) };
    };
    /** Leaving a game that has a score (restart / new game) still counts as a game played. */
    const abandon = (g: GameState | null, mode: Mode): void => {
      const s = get();
      if (!g || s.tutorial) return;
      if (!g.over && g.score > 0 && mode !== 'zen') progress(statsFor(s.stats, mode, null, g.score), g.score);
      // ad pacing: a finished game was counted when it ended; an abandoned one counts now
      if (!g.over && g.score > 0) {
        const meta = { ...get().meta, gamesSinceAd: get().meta.gamesSinceAd + 1 };
        set({ meta });
        saveMeta(meta);
      }
    };
    const freshGame = (mode: Mode): GameState =>
      newGame(mode === 'daily' ? dailySeed(get().today) : deps.randomSeed());
    const enterGame = (mode: Mode, game: GameState): void => {
      current = game;
      pendingRescue = null;
      clock = mode === 'blitz' ? MODES.blitzSeconds : 0;
      if (mode === 'daily') dailyDate = get().today;
      set({ mode, timeLeft: Math.ceil(clock) });
      show(game, false);
      storeGame(mode, game);
    };
    /**
     * Roll daily state over to `today` if the calendar day changed. A Daily game on screen keeps
     * its day (goal, results, share) until the player leaves it; `force` = they are leaving.
     */
    const rollDay = (force = false): void => {
      const today = dateKey(now());
      const s = get();
      if (today === s.today) return;
      if (!force && s.mode === 'daily' && s.phase !== 'home') return;
      if (saved.daily) storeGame('daily', null);
      const daily = emptyDaily(today);
      set({ today, daily, dailyGoal: dailyGoal(today), quests: questDayFor(s.quests, today) });
    };
    /** A game ended (no room, or time's up). */
    const finish = (mode: Mode, game: GameState, stats: Stats): Stats => {
      storeGame(mode, null);
      const meta = { ...get().meta, gamesSinceAd: get().meta.gamesSinceAd + 1 };
      set({ meta });
      saveMeta(meta);
      return statsFor(stats, mode, null, game.score);
    };

    return {
      phase: 'home',
      mode: 'classic',
      game: firstGame,
      fits: trayFits(firstGame.board, firstGame.tray),
      best: initial.best,
      newBest: false,
      settings: initSettings,
      hasSave: initial.saved !== null,
      saves: savesView(),
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
      zenStuck: false,
      timeLeft: 0,
      blitzBest: initial.blitzBest,
      today: today0,
      daily: initial.daily.date === today0 ? initial.daily : emptyDaily(today0),
      dailyGoal: dailyGoal(today0),
      dailyStreak: initial.dailyStreak,
      goalSeq: 0,
      quests: questDayFor(initial.quests, today0),
      questStreak: initial.questStreak,
      questSeq: 0,

      setRemoveAds: (on) => {
        set({ removeAds: on });
        persist(() => (on ? storage.set(PURCHASES.cacheKey, '1') : storage.remove(PURCHASES.cacheKey)));
      },

      revive: () => {
        const s = get();
        if (s.tutorial || s.mode !== 'classic' || s.phase !== 'over' || !canRevive(s.game)) return false;
        const { state: game, cleared } = reviveGame(s.game);
        current = game;
        // the game didn't end after all: it is counted again when it really ends
        const stats = statsRevived(s.stats, s.game.score);
        set((x) => ({
          game,
          phase: 'playing',
          fits: trayFits(game.board, game.tray),
          stats,
          lastMove: null,
          lastRevive: cleared,
          reviveSeq: x.reviveSeq + 1,
        }));
        saveProgress(stats, get().unlocked);
        storeGame('classic', game);
        return true;
      },

      applyZenRescue: () => {
        const r = pendingRescue;
        const s = get();
        if (!r || s.mode !== 'zen' || !s.zenStuck || s.phase === 'home') return;
        pendingRescue = null;
        current = r.state;
        set((x) => ({
          game: r.state,
          fits: trayFits(r.state.board, r.state.tray),
          zenStuck: false,
          lastMove: null,
          lastRevive: r.cleared,
          reviveSeq: x.reviveSeq + 1,
        }));
      },

      tick: (dt) => {
        const s = get();
        if (s.mode !== 'blitz' || s.phase !== 'playing' || s.tutorial || s.game.over || dt <= 0) return;
        clock = Math.max(0, clock - dt);
        const timeLeft = Math.ceil(clock);
        if (clock > 0) {
          if (timeLeft !== s.timeLeft) set({ timeLeft });
          return;
        }
        // time's up
        const game: GameState = { ...s.game, over: true };
        current = game;
        set({ game, timeLeft: 0, phase: 'over', fits: trayFits(game.board, game.tray) });
        progress(finish('blitz', game, s.stats), game.score);
      },

      noteInterstitial: () => {
        const meta = { ...get().meta, gamesSinceAd: 0, lastAdAt: now().getTime() };
        set({ meta });
        saveMeta(meta);
      },

      noteOffer: () => {
        const meta = offerShown(get().meta, now().getTime());
        set({ meta });
        saveMeta(meta);
      },

      noteSession: () => {
        const meta = recordSession(get().meta, now());
        set({ meta });
        saveMeta(meta);
        rollDay();
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

      play: (mode) => {
        rollDay(true);
        const s = get();
        // leaving an unfinished Blitz run ends it
        if (s.mode === 'blitz' && current && !current.over) abandon(current, 'blitz');
        const resume = isSaveMode(mode) ? saved[mode] : null;
        if (resume && !resume.over) enterGame(mode, resume);
        else {
          // a finished game of this mode is still on the table: it counts for ad pacing now
          if (s.mode === mode && mode !== 'blitz') abandon(current, mode);
          enterGame(mode, freshGame(mode));
        }
      },

      startNew: (mode = get().mode) => {
        rollDay(true);
        const s = get();
        if (s.mode === 'blitz' && mode !== 'blitz' && current && !current.over) abandon(current, 'blitz');
        abandon(s.mode === mode ? current : isSaveMode(mode) ? saved[mode] : null, mode);
        enterGame(mode, freshGame(mode));
      },

      continueGame: () => get().play('classic'),

      loadTutorial: (game) => {
        set({ mode: 'classic' });
        show(game, true);
      },

      debugLoad: (game, mode = get().mode) => enterGame(mode, game),

      finishTutorial: () => {
        // put the Classic game (or a fresh board) back behind the home card
        const game = saved.classic ?? newGame(deps.randomSeed());
        current = saved.classic;
        set((s) => ({
          tutorial: false,
          tutorialDone: true,
          mode: 'classic',
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
        if (s.phase !== 'playing' || s.zenStuck) return null;
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
        const mode = s.mode;
        current = game;
        // Zen never ends: when stuck, the view plays a rescue (the save already holds the rescued board)
        const stuck = mode === 'zen' && game.over;
        if (stuck) {
          pendingRescue = zenRescue(game);
          current = pendingRescue.state;
        }
        const over = game.over && !stuck;
        const patch: { -readonly [K in keyof StoreState]?: StoreState[K] } = {
          game,
          fits: trayFits(game.board, game.tray),
          phase: over ? 'over' : 'playing',
          zenStuck: stuck,
          lastMove: move,
          moveSeq: s.moveSeq + 1,
        };
        let goalNow = false;
        if (mode === 'classic' && game.score > s.best) {
          Object.assign(patch, { best: game.score, newBest: true });
          persist(() => storage.set(SAVE.bestKey, String(game.score)));
        } else if (mode === 'blitz' && game.score > s.blitzBest) {
          Object.assign(patch, { blitzBest: game.score, newBest: true });
          persist(() => storage.set(MODES.blitzBestKey, String(game.score)));
        } else if (mode === 'daily' && dailyDate === s.today) {
          let daily = s.daily;
          let dailyStreak = s.dailyStreak;
          if (game.score > daily.best) {
            daily = { ...daily, best: game.score };
            // a new daily best only counts as "new best" once the day already had a score
            if (s.daily.best > 0) patch.newBest = true;
          }
          if (!daily.done && game.score >= s.dailyGoal) {
            goalNow = true;
            daily = { ...daily, done: true };
            dailyStreak = extendStreak(dailyStreak, s.today);
            Object.assign(patch, { dailyStreak, goalSeq: s.goalSeq + 1 });
          }
          if (daily !== s.daily) {
            patch.daily = daily;
            saveDaily(daily, dailyStreak);
          }
        }
        set(patch);
        storeGame(mode, stuck ? (pendingRescue?.state ?? null) : game);
        let stats = statsFor(s.stats, mode, move, null);
        stats = quest({ mode, move, gameScore: game.score, dailyDone: goalNow }, stats);
        if (over) stats = finish(mode, game, stats);
        progress(stats, mode === 'zen' ? 0 : game.score);
        return move;
      },

      pause: () => {
        if (get().phase === 'playing') set({ phase: 'paused' });
      },
      resume: () => {
        if (get().phase === 'paused') set({ phase: 'playing' });
      },
      goHome: () => {
        rollDay(true);
        set({ phase: 'home' });
      },
      refreshDay: () => rollDay(),

      setSetting: (key, value) => {
        if (key === 'theme' && !themeUnlocked(themeById(String(value)), get().unlocked)) return;
        const settings = { ...get().settings, [key]: value };
        set({ settings });
        persist(() => storage.set(SAVE.settingsKey, JSON.stringify(settings)));
      },

      resetProgress: () => {
        current = null;
        pendingRescue = null;
        for (const m of SAVE_MODES) saved[m] = null;
        const settings = { ...get().settings, theme: 'maple' as const };
        // also leaves tutorial mode, with a fresh board behind the home card
        const game = newGame(deps.randomSeed());
        const today = dateKey(now());
        set((x) => ({
          best: 0,
          blitzBest: 0,
          newBest: false,
          hasSave: false,
          saves: savesView(),
          mode: 'classic',
          phase: 'home',
          stats: emptyStats(),
          unlocked: {},
          settings,
          tutorial: false,
          zenStuck: false,
          game,
          fits: trayFits(game.board, game.tray),
          lastMove: null,
          resetSeq: x.resetSeq + 1,
          today,
          daily: emptyDaily(today),
          dailyGoal: dailyGoal(today),
          dailyStreak: parseStreak(null),
          quests: questDayFor(null, today),
          questStreak: parseStreak(null),
        }));
        persist(async () => {
          for (const key of [
            SAVE.bestKey,
            SAVE.gameKey,
            PROGRESS.statsKey,
            PROGRESS.achievementsKey,
            MODES.saveKeys.zen,
            MODES.saveKeys.daily,
            MODES.dailyKey,
            MODES.blitzBestKey,
            MODES.questsKey,
          ])
            await storage.remove(key);
          await storage.set(SAVE.settingsKey, JSON.stringify(settings));
        });
      },
    };
  });
}
