import * as THREE from 'three';
import { Sound } from './audio/sound';
import {
  ADS,
  COLORS,
  FX,
  HAPTICS,
  LADDER,
  CAMERA_VIEW_ORDER,
  JOURNEY,
  JOURNEY_FX,
  MODES,
  PROGRESS,
  UPSELL,
  RENDER,
  RETENTION,
  themeById,
  TRAY,
  WORLD,
} from './config';
import type { AchievementId } from './core/progress';
import type { CameraView, ThemeId } from './config';
import { streakAlive } from './core/daily';
import { lastGaps } from './core/board';
import { getShape } from './core/shapes';
import type { MoveResult } from './core/rules';
import { tutorialSteps } from './core/tutorial';
import type { TutorialStep } from './core/tutorial';
import type { Settings } from './core/types';
import { Effects } from './fx/effects';
import { ComboGlow } from './fx/comboGlow';
import { Chips, Sparkles } from './fx/particles';
import { rewardTier } from './core/scoring';
import { Tweens } from './fx/tween';
import { DragController } from './input/drag';
import type { Haptics } from './platform/haptics';
import { onLifecycle } from './platform/lifecycle';
import type { Services } from './platform/services';
import type { Monetization } from './platform/monetization';
import { canRevive, shouldShowInterstitial } from './core/revive';
import { shouldOfferRemoveAds } from './core/upsell';
import type { OfferTrigger } from './core/upsell';
import { RemoveAdsOffer } from './ui/offer';
import { GOAL_ICON, goalLabel, JourneyMap } from './ui/journey';
import { LevelDecor } from './render/levelDecor';
import { goalProgress, levelSpec, unlockedLevel } from './core/journey';
import { nextReminder, reminderIndex, shouldAskReview, shouldOfferReminder } from './core/retention';
import { num, t } from './i18n';
import type { Key } from './i18n';
import { Blocks } from './render/blocks';
import type { BlockMesh } from './render/blocks';
import { Preview } from './render/preview';
import { createRenderer } from './render/renderer';
import type { Renderer } from './render/renderer';
import { createTextures } from './render/textures';
import type { Textures } from './render/textures';
import { World } from './render/world';
import type { TrayPiece } from './render/world';
import type { GameStore, StoreState } from './state/store';
import { AchievementBanner, AwardsPanel } from './ui/awards';
import { ConfirmDialog, ResultsCard } from './ui/dialogs';
import type { ResultsInfo } from './ui/dialogs';
import { el, ICONS, replay } from './ui/dom';
import { floatText } from './ui/floatText';
import { Hud } from './ui/hud';
import { HomeMenu, PauseMenu, QuestsPanel, SettingsPanel } from './ui/menus';
import type { HomeView, ToggleKey } from './ui/menus';
import { Toast } from './ui/toast';
import { TutorialOverlay } from './ui/tutorial';

export interface GameDeps {
  readonly canvas: HTMLCanvasElement;
  readonly uiRoot: HTMLElement;
  readonly store: GameStore;
  readonly haptics: Haptics;
  readonly services: Services;
  readonly monetization: Monetization;
}

/** Best score shown for the current mode (Zen has none). */
const modeBest = (s: StoreState): number =>
  s.mode === 'classic' ? s.best : s.mode === 'blitz' ? s.blitzBest : s.mode === 'daily' ? s.daily.best : 0;

/** Wires the store (rules + state) to the scene, effects, audio, UI and input. */
export class Game {
  private readonly store: GameStore;
  private readonly haptics: Haptics;
  private readonly services: Services;
  private readonly money: Monetization;
  /** Localised Remove-ads price, once the store has answered. */
  private price: string | null = null;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: Renderer;
  private readonly tex: Textures;
  readonly world: World;
  private readonly tweens = new Tweens();
  private readonly preview: Preview;
  private readonly sparkles: Sparkles;
  private readonly comboGlow: ComboGlow;
  /** Hit-stop: seconds left in which effects stand still. */
  private freeze = 0;
  private readonly chips: Chips;
  private readonly fx: Effects;
  private readonly sound = new Sound();
  private readonly drag: DragController;

  private readonly hud: Hud;
  private readonly toast = new Toast();
  private readonly flashEl = el('div', { class: 'flash', 'aria-hidden': 'true' });
  private readonly floatLayer = el('div', { 'aria-hidden': 'true' });
  private readonly safeProbe = el('div', { 'aria-hidden': 'true' });
  private readonly home: HomeMenu;
  private readonly questsPanel = new QuestsPanel(() => this.questsPanel.hide());
  private readonly journeyMap = new JourneyMap({
    onPlay: (n) => {
      this.journeyMap.hide();
      this.store.getState().playLevel(n);
    },
    onClose: () => this.journeyMap.hide(),
  });
  private levelDecor!: LevelDecor;
  private readonly offer = new RemoveAdsOffer({
    onBuy: () => this.buyRemoveAds(),
    onRestore: async () => {
      const owned = await this.money.purchases.restore();
      if (owned) this.gotRemoveAds();
      return owned;
    },
  });
  /** Ads have been started this run (consent / ATT done): the offer makes sense now. */
  private adsStarted = false;
  /** An offer is being prepared or shown (one at a time). */
  private presenting = false;
  private readonly pauseMenu: PauseMenu;
  private readonly settingsPanel: SettingsPanel;
  private readonly confirm = new ConfirmDialog();
  private readonly results: ResultsCard;
  private readonly tutorialUi: TutorialOverlay;
  private readonly awards: AwardsPanel;
  private readonly banner = new AchievementBanner(PROGRESS.bannerSeconds);
  /** Camera angle currently applied (null before the first settings apply). */
  private cameraView: CameraView | null = null;
  /** Wood theme currently drawn into the textures. */
  private theme: ThemeId;

  private readonly mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  private steps: TutorialStep[] = [];
  private stepIndex = -1;
  /** Game-over sequence running: input is locked until the next reset. */
  private ending = false;
  /** The current game already passed the previous best (celebrate only once per game). */
  private bestCelebrated = false;
  /** A full-screen ad is up: the results card ignores taps. */
  private adBusy = false;
  /** When the app last went to the background (ms), for session counting. */
  private backgroundAt = 0;
  /** Bumped on every board reset; delayed callbacks from an older board are dropped. */
  private gen = 0;
  /** True while a reset is finishing old tweens: a drop landing now belongs to the old board. */
  private resetting = false;
  private width = 1;
  private height = 1;
  private last = performance.now();
  private time = 0;
  /** Dev/test only: slow motion for screenshots. */
  timeScale = 1;
  private raf = 0;
  private readonly unsubs: (() => void)[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly dimColor = new THREE.Color(...COLORS.dim);

  constructor(d: GameDeps) {
    this.store = d.store;
    this.haptics = d.haptics;
    this.services = d.services;
    this.money = d.monetization;
    this.canvas = d.canvas;
    this.renderer = createRenderer(d.canvas);
    this.theme = d.store.getState().settings.theme;
    this.tex = createTextures(this.renderer.gl.capabilities.getMaxAnisotropy(), themeById(this.theme));
    this.world = new World(this.tex);
    const { scene, camera } = this.world;
    this.preview = new Preview(scene, this.tex);
    this.sparkles = new Sparkles(scene, this.tex);
    this.comboGlow = new ComboGlow(scene);
    this.chips = new Chips(scene, this.tex);
    this.levelDecor = new LevelDecor(scene, this.tweens, this.sparkles);
    this.fx = new Effects({
      scene,
      camera,
      tweens: this.tweens,
      tex: this.tex,
      sparkles: this.sparkles,
      chips: this.chips,
      blocks: this.world.blocks,
      reducedMotion: () => this.reduced,
      shakeOff: () => !this.store.getState().settings.shake,
      screenFlash: (tier) => {
        this.flashEl.dataset.tier = String(tier);
        replay(this.flashEl, 'on');
      },
    });

    // ---------- UI ----------
    this.hud = new Hud({
      onPause: () => this.onPause(),
      onRestart: () => void this.onRestart(),
      onSound: () => this.onSoundButton(),
      onCamera: () => this.cycleCamera(),
    });
    this.home = new HomeMenu({
      onPlay: () => void this.onPlay(),
      onContinue: () => this.store.getState().play('classic'),
      onDaily: () => this.store.getState().play('daily'),
      onZen: () => this.store.getState().play('zen'),
      onBlitz: () => this.store.getState().play('blitz'),
      onJourney: () => this.openJourney(),
      onQuests: () => {
        this.refreshHome(this.store.getState());
        this.questsPanel.show();
      },
      onSettings: () => this.showSettings(),
      onAwards: () => this.showAwards(),
      onReminder: (yes) => void this.answerReminder(yes),
    });
    this.pauseMenu = new PauseMenu({
      onResume: () => this.store.getState().resume(),
      onRestart: () => void this.onRestart(),
      onSettings: () => this.showSettings(),
      onHome: () => this.onHome(),
      onAwards: () => this.showAwards(),
    });
    this.awards = new AwardsPanel({
      onTheme: (id) => {
        this.store.getState().setSetting('theme', id);
        this.sound.tick();
      },
      onClose: () => this.awards.hide(),
      onLeaderboard: () => void this.services.gameCenter.showLeaderboard(),
    });
    this.settingsPanel = new SettingsPanel({
      onToggle: (k) => this.toggleSetting(k),
      onCamera: (v) => {
        this.store.getState().setSetting('camera', v);
        this.sound.tick();
      },
      onReminder: () => void this.answerReminder(this.store.getState().meta.reminder !== 'on'),
      onReset: () => void this.onResetProgress(),
      onBuy: () => void this.buyRemoveAds(),
      onRestore: () => void this.restorePurchases(),
      onPrivacy: () => void this.money.ads.showPrivacyOptions(),
      onClose: () => this.settingsPanel.hide(),
    });
    this.results = new ResultsCard({
      onAgain: () => void this.newGameAfterAd(),
      onRevive: () => void this.tryRevive(),
      onHome: () => {
        const journey = this.store.getState().mode === 'journey';
        this.store.getState().goHome();
        if (journey) this.openJourney();
      },
      onShare: () => void this.shareDaily(),
      onRemoveAds: () => void this.presentOffer(false),
    });
    this.tutorialUi = new TutorialOverlay(() => this.endTutorial());
    Object.assign(this.safeProbe.style, {
      position: 'fixed',
      visibility: 'hidden',
      paddingBottom: 'env(safe-area-inset-bottom, 0px)',
    });
    d.uiRoot.append(
      el('div', { class: 'vignette', 'aria-hidden': 'true' }),
      this.hud.node,
      this.tutorialUi.node,
      this.floatLayer,
      this.flashEl,
      this.toast.node,
      this.banner.node,
      this.home.node,
      this.pauseMenu.node,
      this.results.node,
      this.settingsPanel.node,
      this.awards.node,
      this.questsPanel.node,
      this.journeyMap.node,
      this.offer.node,
      this.confirm.node,
      this.safeProbe,
    );

    // ---------- input ----------
    this.drag = new DragController(this.canvas, this.world, this.preview, this.tweens, {
      canStart: () => this.canInteract(),
      board: () => this.store.getState().game.board,
      onPickup: () => {
        this.sound.pickup();
        this.haptics.pulse(HAPTICS.pickup);
      },
      onDropped: (tp, r0, c0) => this.commit(tp, r0, c0),
      onReturn: () => this.sound.returnPiece(),
      onSnap: () => this.haptics.pulse(HAPTICS.snap),
      onNope: () => {
        this.sound.nope();
        this.haptics.pulse(HAPTICS.nope);
      },
    });
    // first touch anywhere unlocks audio (iOS needs a gesture)
    const unlock = (): void => this.sound.unlock();
    window.addEventListener('pointerdown', unlock, { capture: true });
    window.addEventListener('keydown', unlock, { capture: true });
    const onKey = (e: KeyboardEvent): void => this.onKey(e);
    window.addEventListener('keydown', onKey);
    const onResize = (): void => this.resize();
    window.addEventListener('resize', onResize);
    window.visualViewport?.addEventListener('resize', onResize);
    this.unsubs.push(
      () => window.removeEventListener('pointerdown', unlock, { capture: true }),
      () => window.removeEventListener('keydown', unlock, { capture: true }),
      () => window.removeEventListener('keydown', onKey),
      () => window.removeEventListener('resize', onResize),
      () => window.visualViewport?.removeEventListener('resize', onResize),
      onLifecycle({ background: () => this.onBackground(), foreground: () => void this.onForeground() }),
    );
    const onMotion = (): void => this.applySettings(this.store.getState().settings);
    this.mql.addEventListener('change', onMotion);
    this.unsubs.push(() => this.mql.removeEventListener('change', onMotion));

    // ---------- store ----------
    this.unsubs.push(this.store.subscribe((s, prev) => this.onStore(s, prev)));
    const s = this.store.getState();
    this.applySettings(s.settings);
    this.hud.setBest(s.best);
    this.syncFromStore(false);
    this.resize();
    void document.fonts?.ready.then(() => this.resize());

    this.prewarm();

    this.syncReminderUi();
    void this.bootServices();
    if (!s.tutorialDone) this.startTutorial();
    else this.onPhase(s);

    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  // =====================================================================================
  // state → view
  // =====================================================================================

  private get reduced(): boolean {
    return this.store.getState().settings.reduceMotion || this.mql.matches;
  }

  private onStore(s: StoreState, prev: StoreState): void {
    if (s.resetSeq !== prev.resetSeq) this.syncFromStore(s.phase === 'playing');
    if (s.reviveSeq !== prev.reviveSeq) this.onRevived();
    // Blitz: the clock ran out (no move ended it)
    if (
      s.game.over &&
      !prev.game.over &&
      s.moveSeq === prev.moveSeq &&
      s.resetSeq === prev.resetSeq &&
      !s.tutorial
    )
      this.gameOver();
    if (s.timeLeft !== prev.timeLeft && s.mode === 'blitz' && s.phase === 'playing') {
      if (s.timeLeft > 0 && s.timeLeft <= MODES.blitzUrgent) {
        this.sound.clockTick(s.timeLeft);
        this.hud.kickChip();
      }
    }
    if (s.goalSeq !== prev.goalSeq) this.onGoal();
    if (s.questSeq !== prev.questSeq)
      this.showBanner(() =>
        this.banner.pushText(t('quests.complete'), t('quests.completeDetail', { n: s.questStreak.count })),
      );
    if (s.removeAds !== prev.removeAds) {
      this.syncStoreUi();
      if (s.removeAds) {
        this.results.setRemoveAds(false);
        this.results.setRevive(this.reviveOffer());
      }
    }
    if (s.phase !== prev.phase) this.onPhase(s);
    if (s.settings !== prev.settings) this.applySettings(s.settings);
    if (s.unlockSeq !== prev.unlockSeq && s.recentUnlocks.length) {
      const ids = s.recentUnlocks;
      for (const id of ids) void this.services.gameCenter.unlock(id);
      this.showBanner(() => this.banner.push(ids));
    }
    if (
      this.awards.open &&
      (s.stats !== prev.stats || s.unlocked !== prev.unlocked || s.settings !== prev.settings)
    )
      this.refreshAwards();
    if (
      s.best !== prev.best ||
      s.blitzBest !== prev.blitzBest ||
      s.daily !== prev.daily ||
      s.mode !== prev.mode
    )
      this.hud.setBest(modeBest(s));
    if (
      s.timeLeft !== prev.timeLeft ||
      s.mode !== prev.mode ||
      s.daily !== prev.daily ||
      s.dailyGoal !== prev.dailyGoal ||
      s.tutorial !== prev.tutorial
    )
      this.refreshHudInfo(s);
    if (
      s.best !== prev.best ||
      s.saves !== prev.saves ||
      s.daily !== prev.daily ||
      s.dailyStreak !== prev.dailyStreak ||
      s.quests !== prev.quests ||
      s.questStreak !== prev.questStreak ||
      s.blitzBest !== prev.blitzBest
    )
      this.refreshHome(s);
    if (s.meta !== prev.meta) this.syncReminderUi();
  }

  /** Rebuild the scene from the store (new game, continue, tutorial step). */
  private syncFromStore(deal: boolean): void {
    const s = this.store.getState();
    this.gen++;
    this.resetting = true;
    this.drag.cancel();
    this.tweens.finishAll();
    this.resetting = false;
    this.preview.hide();
    this.preview.disposeGhost();
    this.ending = false;
    // a game that already holds the record (continued / revived) has had its moment
    this.bestCelebrated = s.game.score > 0 && s.game.score >= s.best;
    this.results.hide();
    this.fx.shake = 0;
    // Journey decor first: crate stain is applied as the board's groups are built
    this.world.crates.clear();
    if (s.mode === 'journey' && s.run && !s.tutorial) {
      for (const k of s.run.crates) this.world.crates.add(k);
      this.levelDecor.setGems(s.run.gems);
      this.levelDecor.setCrates(s.run.crates);
    } else this.levelDecor.clear();
    this.world.syncAll(s.game.board, s.game.tray, s.fits);
    if (deal) {
      this.world.dealIn(this.tweens);
      this.later(TRAY.dealSoundDelay, () => this.sound.deal());
    }
    this.hud.setScore(s.game.score, true);
    this.hud.setBest(modeBest(s));
    this.refreshHudInfo(s);
    this.hud.combo.set(s.game.streak, s.game.misses > 0);
    this.comboGlow.set(s.game.streak, s.game.misses > 0, this.reduced);
  }

  /** Next frame, once this move's HUD (combo pill) is updated: the banner sits just under it. */
  private showBanner(push: () => void): void {
    requestAnimationFrame(() => {
      this.banner.node.style.top = `${this.hud.contentBottom + FX.bannerGap}px`;
      push();
      this.sound.achievement();
    });
  }

  /** Mode info in the HUD: Blitz clock, Daily goal, Zen label. */
  private refreshHudInfo(s: StoreState): void {
    this.hud.setGoals(s.mode === 'journey' && s.run && !s.tutorial ? this.goalPills(s) : null);
    if (s.mode === 'journey' && s.run && !s.tutorial) {
      const left = s.run.movesLeft;
      return this.hud.setInfo({
        best: false,
        chip: String(left),
        icon: ICONS.moves,
        urgent: left <= 3 && s.outcome === 'playing',
        label: t('journey.movesLeft', { n: left }),
      });
    }
    if (s.tutorial || s.mode === 'classic') return this.hud.setInfo({ best: true, chip: null });
    if (s.mode === 'zen') return this.hud.setInfo({ best: false, chip: t('mode.zen'), icon: ICONS.leaf });
    if (s.mode === 'blitz') {
      const clock = `${Math.floor(s.timeLeft / 60)}:${String(s.timeLeft % 60).padStart(2, '0')}`;
      return this.hud.setInfo({
        best: true,
        chip: clock,
        icon: ICONS.clock,
        urgent: s.timeLeft <= MODES.blitzUrgent,
        label: t('hud.time', { t: clock }),
      });
    }
    this.hud.setInfo({
      best: true,
      chip: t('hud.goal', { n: num(s.dailyGoal) }),
      icon: s.daily.done ? ICONS.check : ICONS.calendar,
      done: s.daily.done,
    });
  }

  /** Journey goal pills for the HUD. */
  private goalPills(s: StoreState): { icon: string; text: string; done: boolean; label: string }[] {
    if (!s.run) return [];
    const spec = levelSpec(s.run.n);
    return goalProgress(spec, s.run, s.game.score).map((g, i) => {
      const goal = spec.goals[i] ?? { kind: g.kind, target: g.target };
      const text = g.kind === 'score' ? `${num(g.current)}/${num(g.target)}` : `${g.current}/${g.target}`;
      return {
        icon: GOAL_ICON[g.kind],
        text,
        done: g.done,
        label: t('goal.progress', { label: goalLabel(goal), current: g.current, target: g.target }),
      };
    });
  }

  private openJourney(): void {
    this.journeyMap.update(this.store.getState().journey);
    this.journeyMap.openMap();
    this.sound.tick();
  }

  private homeView(s: StoreState): HomeView {
    return {
      best: s.best,
      hasSave: s.hasSave,
      daily: {
        goal: s.dailyGoal,
        done: s.daily.done,
        best: s.daily.best,
        streak: streakAlive(s.dailyStreak, s.today) ? s.dailyStreak.count : 0,
      },
      blitzBest: s.blitzBest,
      quests: s.quests.quests.map((q, i) => ({
        text: t((q.kind === 'triple' && q.target === 1 ? 'quest.tripleOnce' : `quest.${q.kind}`) as Key, {
          n: num(q.target),
        }),
        progress: s.quests.progress[i] ?? 0,
        target: q.target,
      })),
      questsDone: s.quests.done,
      questStreak: streakAlive(s.questStreak, s.today) ? s.questStreak.count : 0,
      journeyLevel: unlockedLevel(s.journey),
      journeyStars: s.journey.stars.reduce((a, b) => a + b, 0),
    };
  }

  private refreshHome(s: StoreState): void {
    const v = this.homeView(s);
    this.home.update(v);
    this.questsPanel.update(v);
  }

  /** Today's daily goal was just reached. */
  private onGoal(): void {
    this.later(FX.newBestDelay, () => {
      this.hud.kickChip();
      this.sound.newBest();
      this.haptics.pulse(HAPTICS.newBest);
      const s = this.store.getState();
      this.showBanner(() =>
        this.banner.pushText(t('daily.reached'), t('daily.streak', { n: s.dailyStreak.count })),
      );
    });
  }

  /** Share today's daily result: the system share sheet where there is one, else the clipboard. */
  private async shareDaily(): Promise<void> {
    const s = this.store.getState();
    const text = t('share.daily', {
      date: s.today,
      score: num(s.game.score),
      mark: s.daily.done ? '✅' : `/ ${num(s.dailyGoal)}`,
    });
    try {
      if (typeof navigator.share === 'function') {
        await navigator.share({ text });
        return;
      }
      await navigator.clipboard.writeText(text);
      this.results.setNote(t('results.copied'));
    } catch {
      // cancelled, or no clipboard: nothing to do
    }
  }

  private onPhase(s: StoreState): void {
    const p = s.phase;
    if (p === 'home') {
      this.refreshHome(s);
      if (this.offerDue('home'))
        window.setTimeout(() => {
          if (this.store.getState().phase === 'home' && !this.anyDialogOpen() && this.offerDue('home'))
            void this.presentOffer();
        }, UPSELL.homeDelayMs);
      this.home.show();
    } else this.home.hide();
    if (p === 'paused') {
      this.drag.cancel();
      this.pauseMenu.show();
    } else this.pauseMenu.hide();
    if (p !== 'over') this.results.hide();
    this.hud.setVisible(p === 'playing' || p === 'paused' || p === 'over');
    if (p === 'home' || p === 'paused') this.drag.cancel();
  }

  private applySettings(st: Settings): void {
    this.sound.setSfx(st.sound);
    this.sound.setMusic(st.music);
    this.haptics.setEnabled(st.haptics);
    this.hud.setSound(st.sound || st.music);
    this.settingsPanel.update(st);
    document.documentElement.classList.toggle('reduced', this.reduced);
    this.applyTheme(st.theme);
    if (st.camera !== this.cameraView) {
      // first apply (boot) jumps; later changes swing smoothly unless motion is reduced
      this.world.setView(st.camera, this.cameraView !== null && !this.reduced);
      this.cameraView = st.camera;
      this.drag.refresh();
    }
  }

  /** Redraw the wood for a theme (same textures, so nothing to rebuild) and match the page colour. */
  private applyTheme(id: ThemeId): void {
    const t = themeById(id);
    if (id !== this.theme) {
      this.tex.setTheme(t);
      this.theme = id;
    }
    this.world.setThemeColors(t.background, t.ridge);
    document.documentElement.style.setProperty('--bg', t.background);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t.background);
  }

  /** Launch-time native work: Game Center sign-in, re-schedule the reminder for tomorrow. */
  private async bootServices(): Promise<void> {
    const { gameCenter } = this.services;
    if (gameCenter.available()) void this.signInGameCenter();
    if (this.store.getState().meta.reminder === 'on') await this.scheduleReminder();
    await this.bootMonetization();
  }

  /**
   * Sign in, then re-send the best score and every unlocked achievement: anything earned while
   * signed out (or before sign-in finished) reaches Game Center now. Duplicates are ignored there.
   */
  private async signInGameCenter(): Promise<void> {
    const gc = this.services.gameCenter;
    if (!(await gc.signIn())) return;
    const s = this.store.getState();
    if (s.best > 0) await gc.submitBest(s.best);
    for (const id of Object.keys(s.unlocked) as AchievementId[]) await gc.unlock(id);
  }

  /** Purchases first (Remove ads owners never see consent, tracking or ad prompts), then ads. */
  private async bootMonetization(): Promise<void> {
    const { purchases } = this.money;
    if (purchases.available()) {
      if (await purchases.owned()) this.store.getState().setRemoveAds(true);
      this.price = await purchases.price();
      this.syncStoreUi();
    }
    await this.maybeStartAds();
  }

  /**
   * Consent → ATT → ads, never on a player's first visit: from the 2nd session (relaunch, or back
   * after a long break) or once their first game has finished — whichever comes first.
   */
  private async maybeStartAds(): Promise<void> {
    const s = this.store.getState();
    if (s.removeAds || s.tutorial) return;
    if (s.meta.sessions < ADS.initFromSession && s.stats.gamesPlayed < 1) return;
    await this.money.ads.start();
    const first = !this.adsStarted;
    this.adsStarted = true;
    this.syncStoreUi();
    // launch: the home screen is up and ads are now part of the game
    if (first && this.store.getState().phase === 'home' && !this.anyDialogOpen() && this.offerDue('home'))
      void this.presentOffer();
  }

  /** Would the Remove-ads offer be shown for this trigger right now? */
  private offerDue(trigger: OfferTrigger): boolean {
    const s = this.store.getState();
    return (
      this.adsStarted &&
      !s.tutorial &&
      shouldOfferRemoveAds({
        trigger,
        removeAds: s.removeAds,
        available: this.money.purchases.available(),
        gamesPlayed: s.stats.gamesPlayed,
        meta: s.meta,
        now: Date.now(),
      })
    );
  }

  /** Show the Remove-ads popup (counted for pacing). Resolves when bought or dismissed. */
  private async presentOffer(counted = true): Promise<void> {
    if (this.presenting || this.offer.open || this.store.getState().removeAds) return;
    this.presenting = true;
    try {
      this.drag.cancel();
      // the store may be slow or offline: never hold the game up for the price
      if (this.price === null && this.money.purchases.available()) {
        const timeout = new Promise<null>((res) => window.setTimeout(() => res(null), UPSELL.priceTimeoutMs));
        this.price = await Promise.race([this.money.purchases.price().catch(() => null), timeout]);
      }
      if (this.store.getState().removeAds) return;
      const shown = this.offer.ask(this.price);
      // the player asked for it (results link): doesn't use up the day's offers
      if (counted) this.store.getState().noteOffer();
      await shown;
    } finally {
      this.presenting = false;
    }
  }

  private syncStoreUi(): void {
    const s = this.store.getState();
    this.settingsPanel.setStore(
      this.money.purchases.available(),
      s.removeAds,
      this.price,
      this.money.ads.privacyOptionsRequired(),
    );
  }

  private showSettings(): void {
    this.settingsPanel.setNote('');
    // the store may have been unreachable at launch: try the price again
    if (this.price === null && this.money.purchases.available()) {
      void this.money.purchases.price().then((p) => {
        this.price = p;
        this.syncStoreUi();
      });
    }
    this.syncStoreUi();
    this.settingsPanel.show();
  }

  private async buyRemoveAds(): Promise<boolean> {
    this.sound.tick();
    const owned = await this.money.purchases.buy();
    if (owned) this.gotRemoveAds();
    return owned;
  }

  /** The player bought or restored Remove ads just now: thank them (launch-time ownership checks stay quiet). */
  private gotRemoveAds(): void {
    const had = this.store.getState().removeAds;
    this.store.getState().setRemoveAds(true);
    if (had) return;
    this.sound.newBest();
    this.showBanner(() => this.banner.pushText(t('offer.thanks'), t('offer.thanksDetail')));
  }

  private async restorePurchases(): Promise<void> {
    const owned = await this.money.purchases.restore();
    if (owned) this.gotRemoveAds();
    this.settingsPanel.setNote(owned ? t('settings.restored') : t('settings.nothingToRestore'));
  }

  /** What the results card can offer: a free revive (Remove ads), one for a rewarded ad, or none. */
  private reviveOffer(): 'ad' | 'free' | null {
    const s = this.store.getState();
    if (s.tutorial) return null;
    if (s.mode === 'journey') {
      const more = s.outcome === 'outOfMoves' && (s.run?.extras ?? 0) < JOURNEY.maxExtras;
      const room = s.outcome === 'noRoom' && canRevive(s.game);
      if (!more && !room) return null;
    } else if (s.mode !== 'classic' || !canRevive(s.game)) return null;
    if (s.removeAds) return 'free';
    return this.money.ads.rewardedReady() ? 'ad' : null;
  }

  private async tryRevive(): Promise<void> {
    const offer = this.reviveOffer();
    if (!offer || this.adBusy) return;
    if (offer === 'ad') {
      this.adBusy = true;
      this.results.setBusy(true);
      this.sound.suspend();
      const earned = await this.money.ads.showRewarded();
      this.sound.resume();
      this.results.setBusy(false);
      this.adBusy = false;
      if (!earned) {
        // skipped or failed: offer it again only if another ad is ready
        this.results.setRevive(this.reviveOffer());
        return;
      }
      if (this.offerDue('afterRewarded')) {
        this.results.setBusy(true);
        await this.presentOffer();
        this.results.setBusy(false);
      }
    }
    const st = this.store.getState();
    if (st.mode === 'journey' && st.outcome === 'outOfMoves') {
      if (st.extraMoves()) this.onMoreMoves();
      return;
    }
    st.revive();
  }

  /** +5 moves: the board comes back to life (blocks un-dim) and play goes on. */
  private onMoreMoves(): void {
    this.syncFromStore(false);
    const a = this.world.toScreen(...FX.toastAnchor, this.width, this.height);
    this.toast.show(t('journey.moreMovesFree'), '', a.y, 3);
    this.sound.newBest();
  }

  /** Board rebuilt after a revive: show the cleared square as a sweep and celebrate a little. */
  private onRevived(): void {
    const s = this.store.getState();
    this.syncFromStore(true);
    const cleared = s.lastRevive;
    if (cleared) for (const u of cleared.list) this.fx.sweep(u, 0, LADDER.sparkScale[2]);
    this.sound.clear(1, 1, true);
    const a = this.world.toScreen(...FX.toastAnchor, this.width, this.height);
    this.toast.show(s.mode === 'zen' ? t('word.zen') : t('word.revive'), '', a.y, 3);
  }

  /** Between games only: maybe an interstitial (paced by core/revive.shouldShowInterstitial), then a new game. */
  private async newGameAfterAd(): Promise<void> {
    if (this.adBusy) return;
    const s = this.store.getState();
    const show = shouldShowInterstitial({
      sessions: s.meta.sessions,
      gamesPlayed: s.stats.gamesPlayed,
      gamesSinceAd: s.meta.gamesSinceAd,
      msSinceAd: Date.now() - s.meta.lastAdAt,
      removeAds: s.removeAds,
    });
    let shown = false;
    if (show && this.money.ads.interstitialReady()) {
      this.adBusy = true;
      this.results.setBusy(true);
      this.sound.suspend();
      await this.money.ads.showInterstitial();
      this.sound.resume();
      this.results.setBusy(false);
      this.adBusy = false;
      shown = true;
    }
    // the ad just ended: the best moment to offer a way out of ads (before the next board)
    if (shown && this.offerDue('afterAd')) {
      this.results.setBusy(true);
      await this.presentOffer();
      this.results.setBusy(false);
    }
    const cur = this.store.getState();
    if (cur.mode === 'journey' && cur.run && cur.outcome === 'won') {
      if (cur.run.n >= JOURNEY.levels) {
        cur.goHome();
        this.openJourney();
      } else cur.playLevel(cur.run.n + 1);
    } else this.store.getState().startNew();
    // after startNew (which counts the game that just ended), so pacing restarts from zero
    if (shown) this.store.getState().noteInterstitial();
    await this.maybeStartAds();
  }

  private async scheduleReminder(): Promise<void> {
    const r = this.services.reminders;
    if (!r.available()) return;
    const at = nextReminder(this.store.getState().meta, new Date());
    const i = reminderIndex(at);
    const text = { title: t(`reminder.${i}.title` as Key), body: t(`reminder.${i}.body` as Key) };
    await r.cancel();
    await r.schedule(at, text.title, text.body);
  }

  private async answerReminder(yes: boolean): Promise<void> {
    const st = this.store.getState();
    if (!yes) {
      st.setReminder('off');
      await this.services.reminders.cancel();
      return;
    }
    const granted = await this.services.reminders.enable();
    st.setReminder(granted ? 'on' : 'off');
    if (granted) await this.scheduleReminder();
  }

  private syncReminderUi(): void {
    const m = this.store.getState().meta;
    const available = this.services.reminders.available();
    this.home.setOffer(available && shouldOfferReminder(m));
    this.settingsPanel.setReminder(available, m.reminder === 'on');
  }

  private showAwards(): void {
    this.refreshAwards();
    this.awards.show();
  }

  private refreshAwards(): void {
    const s = this.store.getState();
    this.awards.update(s.stats, s.best, s.unlocked, s.settings.theme, this.services.gameCenter.available());
  }

  private canInteract(): boolean {
    const s = this.store.getState();
    return (
      s.phase === 'playing' &&
      !this.ending &&
      !this.confirm.open &&
      !this.settingsPanel.open &&
      !this.awards.open &&
      !this.questsPanel.open &&
      !this.offer.open
    );
  }

  private anyDialogOpen(): boolean {
    return (
      this.confirm.open ||
      this.settingsPanel.open ||
      this.awards.open ||
      this.questsPanel.open ||
      this.offer.open
    );
  }

  // =====================================================================================
  // moves
  // =====================================================================================

  /** Run `fn` after `delay` seconds of game time, unless the board was reset meanwhile. */
  private later(delay: number, fn: () => void): void {
    const g = this.gen;
    this.tweens.after(delay, () => {
      if (g === this.gen) fn();
    });
  }

  private commit(tp: TrayPiece, r0: number, c0: number): void {
    // a drop that lands during a reset, or for a piece no longer in the tray, belongs to an old board
    if (this.resetting || this.world.tray[tp.slot] !== tp) return;
    const before = this.store.getState();
    if (before.game.tray[tp.slot] !== tp.piece) return;
    const move = before.place(tp.slot, r0, c0);
    if (!move) {
      // the state changed under us (should not happen): put the piece back
      tp.anim = false;
      this.world.slotPos(tp.slot, tp.pivot.position);
      tp.pivot.rotation.set(0, 0, 0);
      tp.pivot.scale.setScalar(TRAY.scale);
      return;
    }
    const tutorial = before.tutorial;
    const shape = tp.shape;
    this.world.removeTrayPiece(tp.slot);
    const drop = this.world.dropPoint(shape, r0, c0, this.tmp);
    const ox = drop.x;
    const oz = drop.z;

    const removedIds = new Set(move.applied?.removed.map((r) => r.group.id) ?? []);
    if (!removedIds.has(move.placed.id)) this.fx.squash(this.world.addGroup(move.placed), ox, oz);
    this.sound.place();
    this.haptics.pulse(HAPTICS.place);
    this.fx.addShake(FX.placeShake);
    this.fx.landingRing(ox, oz, shape.w, shape.h);

    if (move.applied) this.celebrate(move, ox, oz);
    else this.float(`+${move.points}`, ox, WORLD.topY + FX.floatLift, oz, false);

    const s = this.store.getState();
    this.hud.setScore(s.game.score);
    this.hud.bump();
    // passing a real previous best mid-game is its own moment
    const oldBest = modeBest(before);
    const crown = before.mode === 'classic' || before.mode === 'blitz';
    if (!tutorial && crown && !this.bestCelebrated && oldBest > 0 && s.game.score > oldBest && !s.game.over) {
      this.bestCelebrated = true;
      const p = this.world.toScreen(ox, WORLD.topY, oz, this.width, this.height);
      this.later(FX.newBestDelay, () => {
        this.hud.celebrateBest(p.x, p.y, this.reduced);
        this.sound.newBest();
        this.haptics.pulse(HAPTICS.newBest);
      });
    }
    this.hud.combo.set(s.game.streak, s.game.misses > 0);
    this.comboGlow.set(s.game.streak, s.game.misses > 0, this.reduced);

    if (tutorial) {
      if (move.clear.units > 0) this.later(FX.overCardDelay, () => this.nextTutorialStep());
      return;
    }
    if (move.dealt) {
      move.dealt.forEach((p, i) => this.world.addTrayPiece(i, p));
      this.world.dealIn(this.tweens);
      this.later(TRAY.dealSoundDelay, () => this.sound.deal());
    }
    this.world.setFits(s.fits);
    if (before.mode === 'journey' && before.run && s.run && !tutorial) {
      const gone = before.run.gems.filter((k) => !s.run?.gems.includes(k));
      if (gone.length) {
        this.levelDecor.collect(gone, JOURNEY_FX.gemDelay);
        this.later(JOURNEY_FX.gemDelay + JOURNEY_FX.gemFly, () => this.sound.gem());
        const gi = levelSpec(s.run.n).goals.findIndex((g) => g.kind === 'gems');
        if (gi >= 0) this.later(JOURNEY_FX.gemDelay + JOURNEY_FX.gemFly, () => this.hud.kickGoal(gi));
      }
      this.levelDecor.setCrates(s.run.crates);
      const ci = levelSpec(s.run.n).goals.findIndex((g) => g.kind === 'crates');
      if (ci >= 0 && s.run.crates.length < before.run.crates.length) this.hud.kickGoal(ci);
      this.refreshHudInfo(s);
    }
    if (s.zenStuck) this.zenStuck();
    else if (s.phase === 'over') this.gameOver();
  }

  /** Zen: no room left. Hold the board a moment, then the fullest square clears (store → onRevived). */
  private zenStuck(): void {
    this.ending = true;
    this.drag.cancel();
    this.later(FX.zenRescueDelay, () => this.store.getState().applyZenRescue());
  }

  /** Escalating clear feedback: pops, sweeps, ring, punch, shake, flash, words. */
  private celebrate(move: MoveResult, ox: number, oz: number): void {
    const applied = move.applied;
    if (!applied) return;
    const { units } = move.clear;
    const streak = move.streak;
    for (const { group, cells } of applied.removed) {
      this.world.removeGroup(group.id);
      for (const [r, c] of cells) this.fx.pop(r, c, group, ox, oz);
    }
    for (const g of applied.created) this.world.addGroup(g);
    this.preview.flashCells(move.clear.cells, this.tweens);
    const tier = rewardTier(units, streak, move.boardClear);
    this.freeze = LADDER.hitStop[tier - 1] ?? 0;
    const sparkScale = LADDER.sparkScale[tier - 1] ?? 1;
    move.clear.list.forEach((u, i) => this.fx.sweep(u, i * FX.sweepStagger, sparkScale));
    this.fx.shockRing(
      ox,
      oz,
      FX.shockBase + units * FX.shockPerUnit,
      COLORS.shock,
      FX.shockPeak + FX.shockPeakPerUnit * Math.min(units, 3),
    );
    this.fx.punch(FX.punchBase + FX.punchPerLevel * Math.min(units + streak - 1, FX.punchMaxLevel));
    this.fx.addShake(FX.clearShakeBase + FX.clearShakePerUnit * Math.min(units, FX.clearShakeMaxUnits));
    if (tier >= LADDER.flashFrom) this.fx.flash(tier);
    this.sound.clear(units, streak, tier >= LADDER.chordFrom);
    this.haptics.pulse(LADDER.haptics[tier - 1] ?? HAPTICS.clear);
    this.float(`+${move.points}`, ox, WORLD.topY + FX.floatLiftClear, oz, true);

    let word: string =
      units >= 4
        ? t('word.unreal')
        : units === 3
          ? t('word.excellent')
          : units === 2
            ? t('word.great')
            : streak >= 3
              ? t('word.fire')
              : streak === 2
                ? t('word.combo')
                : t('word.nice');

    if (move.boardClear) {
      word = t('word.boardClear');
      this.fx.boardClear();
      this.sound.boardClear();
    }
    const sub =
      streak >= 2 ? t('combo.pill', { n: streak }) : units >= 2 ? t('word.lines', { n: units }) : '';
    const a = this.world.toScreen(...FX.toastAnchor, this.width, this.height);
    this.toast.show(word, sub, a.y, tier);
  }

  private hintKey = '';

  /** "Almost there" hints: recomputed only when the board or the conditions change. */
  private updateHints(): void {
    const s = this.store.getState();
    const on = s.settings.hints && !s.tutorial && s.phase === 'playing' && !this.drag.dragging;
    const key = on ? `${s.moveSeq}:${s.resetSeq}:${s.reviveSeq}` : 'off';
    if (key === this.hintKey) return;
    this.hintKey = key;
    this.preview.setHints(on ? lastGaps(s.game.board) : []);
  }

  private float(text: string, x: number, y: number, z: number, gold: boolean): void {
    const p = this.world.toScreen(x, y, z, this.width, this.height);
    floatText(this.floatLayer, text, p.x, p.y, gold);
  }

  /** Blocks fade to grey row by row, then the results card slides up. */
  private gameOver(): void {
    this.ending = true;
    this.drag.cancel();
    this.hud.combo.set(0);
    const won = this.store.getState().outcome === 'won';
    if (won) this.celebrateLevel();
    else for (const [id, mesh] of this.world.groups) this.dimGroup(id, mesh);
    this.later(won ? FX.overCardDelay * 1.6 : FX.overCardDelay, () => {
      const s = this.store.getState();
      if (s.mode === 'blitz' && s.timeLeft <= 0) this.sound.timeUp();
      else if (!won) this.sound.gameOver();
      this.results.setRevive(this.reviveOffer(), this.reviveLabels(s));
      this.results.setRemoveAds(this.adsStarted && !s.removeAds && this.money.purchases.available());
      this.results.present(s.game.score, modeBest(s), s.newBest, this.tweens, this.resultsInfo(s));
      if (s.mode !== 'classic') return;
      void this.services.gameCenter.submitBest(s.best);
      // a new best is a high: the only moment we ever ask for a review
      if (
        this.services.review.available() &&
        shouldAskReview(s.meta, s.newBest, s.stats.gamesPlayed, new Date())
      ) {
        this.later(FX.reviewDelay, () => {
          // only if the player is still looking at the results (not tapped away / backgrounded)
          if (!this.results.open || document.visibilityState !== 'visible') return;
          this.store.getState().noteReviewAsked();
          void this.services.review.request();
        });
      }
    });
  }

  /** A won Journey level: sparkles across the board, a fanfare and the moves bonus. */
  private celebrateLevel(): void {
    const s = this.store.getState();
    this.sound.boardClear();
    this.later(0.25, () => this.sound.newBest());
    this.haptics.pulse(HAPTICS.newBest);
    if (!this.reduced)
      for (let i = 0; i < 14; i++)
        this.later(i * 0.06, () =>
          this.sparkles.emit(
            WORLD.x0 + 0.5 + Math.random() * 8,
            WORLD.topY + 0.2,
            WORLD.z0 + 0.5 + Math.random() * 8,
            1.6,
            0,
            0,
            0,
          ),
        );
    const a = this.world.toScreen(...FX.toastAnchor, this.width, this.height);
    const sub = s.runBonus > 0 ? t('journey.bonus', { n: num(s.runBonus) }) : '';
    this.toast.show(t('journey.won', { n: s.run?.n ?? 1 }), sub, a.y, 4);
    this.hud.setScore(s.game.score);
  }

  /** The second-chance button's wording for the current mode. */
  private reviveLabels(s: StoreState): { ad: string; free: string } | undefined {
    if (s.mode === 'journey' && s.outcome === 'outOfMoves')
      return { ad: t('journey.moreMoves'), free: t('journey.moreMovesFree') };
    return undefined;
  }

  private resultsInfo(s: StoreState): ResultsInfo | undefined {
    if (s.mode === 'journey' && s.run) {
      const n = s.run.n;
      if (s.outcome === 'won')
        return {
          title: t('journey.won', { n }),
          stars: s.runStars,
          line: s.runBonus > 0 ? t('journey.bonus', { n: num(s.runBonus) }) : undefined,
          good: true,
          againLabel: n < JOURNEY.levels ? t('journey.next') : t('journey.map'),
          homeLabel: t('journey.map'),
        } as ResultsInfo;
      const left = goalProgress(levelSpec(n), s.run, s.game.score)
        .map((g) => `${g.current}/${g.target}`)
        .join(' · ');
      return {
        title: s.outcome === 'outOfMoves' ? t('journey.outOfMoves') : t('journey.noRoom'),
        stars: 0,
        line: left,
        againLabel: t('journey.retry'),
        homeLabel: t('journey.map'),
      };
    }
    if (s.mode === 'blitz') return { title: s.timeLeft <= 0 ? t('results.timeUp') : t('results.title') };
    if (s.mode !== 'daily') return undefined;
    return {
      title: t('mode.daily'),
      line: s.daily.done
        ? t('results.goalReached')
        : s.daily.best > 0
          ? t('results.goalMissed', { n: num(s.dailyGoal), best: num(s.daily.best) })
          : t('daily.goal', { n: num(s.dailyGoal) }),
      good: s.daily.done,
      share: true,
    };
  }

  private dimGroup(id: number, mesh: BlockMesh): void {
    const g = this.store.getState().game.board.groups.find((x) => x.id === id);
    const row = g ? Math.min(...g.cells.map((c) => c[0])) : 0;
    const from = mesh.material.map((m) => m.color.clone());
    this.tweens.add({
      delay: FX.overRowDelay + row * FX.overRowDelay,
      dur: FX.overFadeDuration,
      update: (e) => {
        mesh.material.forEach((m, i) => {
          const f = from[i];
          if (f) m.color.copy(f).lerp(this.dimColor, e);
        });
      },
    });
  }

  // =====================================================================================
  // tutorial
  // =====================================================================================

  private startTutorial(): void {
    this.steps = tutorialSteps();
    this.stepIndex = 0;
    this.loadTutorialStep();
  }

  private loadTutorialStep(): void {
    const step = this.steps[this.stepIndex];
    if (!step) return this.endTutorial();
    const [tr, tc] = step.target;
    this.drag.setAllowed((r, c) => r === tr && c === tc);
    this.store.getState().loadTutorial(step.game);
    this.tutorialUi.show(this.stepIndex, this.steps.length, t(step.text));
    this.resize();
  }

  private nextTutorialStep(): void {
    if (!this.store.getState().tutorial) return;
    this.stepIndex++;
    if (this.stepIndex >= this.steps.length) this.endTutorial();
    else this.loadTutorialStep();
  }

  private endTutorial(): void {
    this.stepIndex = -1;
    this.drag.setAllowed(undefined);
    this.tutorialUi.hide();
    this.resize();
    const st = this.store.getState();
    st.finishTutorial();
    st.startNew();
  }

  private updateTutorialHand(dt: number): void {
    const step = this.steps[this.stepIndex];
    if (!step || !this.tutorialUi.open) return;
    const shape = getShape(step.game.tray[step.slot]?.shapeIndex ?? -1);
    if (!shape) return;
    const slot = this.world.slotPos(step.slot, this.tmp);
    const from = this.world.toScreen(slot.x, 0, slot.z, this.width, this.height);
    const drop = this.world.dropPoint(shape, step.target[0], step.target[1], this.tmp);
    const to = this.world.toScreen(drop.x, WORLD.topY, drop.z, this.width, this.height);
    this.tutorialUi.setPath(from, to);
    this.tutorialUi.setHand(!this.drag.dragging && this.store.getState().phase === 'playing');
    this.tutorialUi.update(dt, this.reduced);
  }

  // =====================================================================================
  // buttons
  // =====================================================================================

  private onPause(): void {
    this.sound.tick();
    this.store.getState().pause();
  }

  private async onRestart(): Promise<void> {
    const s = this.store.getState();
    if (s.tutorial) {
      if (s.phase === 'paused') s.resume();
      this.loadTutorialStep();
      return;
    }
    if (s.phase !== 'over' && s.game.score > 0) {
      this.drag.cancel();
      const ok = await this.confirm.ask({
        title: t('confirm.restart.title'),
        body: t('confirm.restart.body'),
        confirm: t('confirm.restart.ok'),
      });
      if (!ok) return;
    }
    this.store.getState().startNew();
  }

  private async onPlay(): Promise<void> {
    const s = this.store.getState();
    if ((s.saves.classic ?? 0) > 0) {
      const ok = await this.confirm.ask({
        title: t('confirm.newGame.title'),
        body: t('confirm.newGame.body'),
        confirm: t('confirm.newGame.ok'),
      });
      if (!ok) return;
    }
    // no interstitial here: ads only ever come between games, from the results card
    this.store.getState().startNew('classic');
  }

  private onHome(): void {
    const s = this.store.getState();
    if (s.tutorial) {
      this.teardownTutorial();
      s.finishTutorial();
      return;
    }
    s.goHome();
  }

  /** Remove the tutorial's overlay and drop restriction (store state is handled by the caller). */
  private teardownTutorial(): void {
    this.stepIndex = -1;
    this.drag.setAllowed(undefined);
    this.tutorialUi.hide();
    this.resize();
  }

  private async onResetProgress(): Promise<void> {
    const ok = await this.confirm.ask({
      title: t('confirm.reset.title'),
      body: t('confirm.reset.body'),
      confirm: t('confirm.reset.ok'),
      danger: true,
    });
    if (!ok) return;
    this.settingsPanel.hide();
    if (this.store.getState().tutorial) this.teardownTutorial();
    this.store.getState().resetProgress();
  }

  private onSoundButton(): void {
    const s = this.store.getState();
    const on = !(s.settings.sound || s.settings.music);
    s.setSetting('sound', on);
    this.store.getState().setSetting('music', on);
    this.sound.tick();
  }

  /** HUD camera button: next angle, with a smooth swing and a short label. */
  private cycleCamera(): void {
    const s = this.store.getState();
    const i = CAMERA_VIEW_ORDER.indexOf(s.settings.camera);
    const next = CAMERA_VIEW_ORDER[(i + 1) % CAMERA_VIEW_ORDER.length] ?? 'classic';
    s.setSetting('camera', next);
    this.sound.tick();
    this.haptics.pulse(HAPTICS.snap);
    const a = this.world.toScreen(...FX.toastAnchor, this.width, this.height);
    this.toast.show(t('camera.toast', { name: t(`camera.${next}` as Key) }), '', a.y, 1);
  }

  private toggleSetting(key: ToggleKey): void {
    const s = this.store.getState();
    s.setSetting(key, !s.settings[key]);
    this.sound.tick();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    const s = this.store.getState();
    if (this.confirm.open) this.confirm.cancel();
    else if (this.offer.open) this.offer.dismiss();
    else if (this.settingsPanel.open) this.settingsPanel.hide();
    else if (this.awards.open) this.awards.hide();
    else if (this.questsPanel.open) this.questsPanel.hide();
    else if (s.phase === 'playing') s.pause();
    else if (s.phase === 'paused') s.resume();
  }

  /**
   * Back from the background: resume audio; a long absence counts as a new session; the reminder
   * is pushed to tomorrow again (so it never fires on a day they played); ads may start now.
   */
  private async onForeground(): Promise<void> {
    this.sound.resume();
    this.store.getState().refreshDay();
    const away = Date.now() - this.backgroundAt;
    if (this.backgroundAt && away >= RETENTION.sessionGapMs) this.store.getState().noteSession();
    if (this.store.getState().meta.reminder === 'on') await this.scheduleReminder();
    await this.maybeStartAds();
  }

  private onBackground(): void {
    this.backgroundAt = Date.now();
    this.drag.cancel();
    // finish everything in flight now: a drop that is mid-air commits (and saves) before iOS
    // may kill the app, and nothing is left half-animated on return
    this.tweens.finishAll();
    this.store.getState().pause();
    this.sound.suspend();
  }

  // =====================================================================================
  // frame
  // =====================================================================================

  private resize(): void {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.renderer.resize(this.width, this.height);
    const safeBottom = Number.parseFloat(getComputedStyle(this.safeProbe).paddingBottom) || 0;
    const tip = this.tutorialUi.open ? this.tutorialUi.reserve : { top: 0, left: 0 };
    const top = Math.max(this.hud.bottom, tip.top);
    this.world.resize(this.width, this.height, top, safeBottom, tip.left);
    this.drag.refresh();
  }

  private frame(now: number): void {
    const raw = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(RENDER.maxDt, raw) * this.timeScale;
    this.last = now;
    this.time += dt;
    this.renderer.sample(raw);

    // hit-stop: effects hold still for a beat at the clear; input and camera keep running
    let fxDt = dt;
    if (this.freeze > 0) {
      this.freeze -= dt;
      fxDt = 0;
    }
    this.sparkles.update(fxDt);
    this.tweens.update(fxDt);
    this.comboGlow.update(dt, this.time);
    this.drag.update(dt);
    // Blitz clock: holds while a dropped piece is still in the air (that move counts) and in hit-stop
    if (!this.ending && !this.confirm.open && !this.drag.dropping && this.freeze <= 0)
      this.store.getState().tick(dt);
    this.chips.update(fxDt);
    this.levelDecor.update(this.time);
    this.updateHints();
    this.preview.update(dt, this.time);
    this.hud.update(dt);
    this.banner.update(dt);
    this.offer.update(raw);
    this.updateTutorialHand(dt);

    if (this.world.updateView(dt)) this.drag.refresh();
    const shake = this.fx.updateShake(dt);
    const cb = this.world.camBase;
    const cam = this.world.camera;
    if (shake > 0) {
      // a smooth wobble (two detuned sines), never per-frame random jumps: at 120 Hz those flicker
      const w = this.time * Math.PI * 2 * FX.shakeFreq;
      cam.position.set(
        cb.x + Math.sin(w) * 0.5 * shake,
        cb.y + Math.sin(w * 1.31 + 1.7) * 0.5 * shake * FX.shakeVertical,
        cb.z + Math.sin(w * 0.87 + 0.6) * 0.5 * shake,
      );
    } else cam.position.copy(cb);

    this.renderer.gl.render(this.world.scene, cam);
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  /** Compile every shader the first clear will need, so it never hitches. */
  private prewarm(): void {
    const { scene, camera } = this.world;
    const seed = { a: 0, s: 1, jx: 0, jy: 0, t: 0.9 };
    const pop = this.world.blocks.make([[0, 0]], [0.5, 0.5], seed);
    const top = pop.material[0];
    if (top) top.emissiveIntensity = 0.5;
    pop.position.set(0, WORLD.baseY - 2, 0);
    scene.add(pop);
    this.preview.makeGhost(pop.geometry, 1, 1);
    this.preview.warmup(true);
    this.chips.warmup(true);
    this.comboGlow.warmup(true);
    const killFx = this.fx.warmup();
    this.sparkles.emit(0, WORLD.baseY - 2, 0, 1, 0, 0, 0);
    this.renderer.gl.compile(scene, camera);
    this.renderer.gl.render(scene, camera);
    killFx();
    this.chips.warmup(false);
    this.comboGlow.warmup(false);
    this.preview.warmup(false);
    this.preview.disposeGhost();
    Blocks.dispose(pop);
  }

  /** Dev/test introspection. */
  get debug(): { info: THREE.WebGLInfo; tweens: number; clock: number } {
    return { info: this.renderer.gl.info, tweens: this.tweens.active, clock: this.time };
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.unsubs.forEach((u) => u());
    this.drag.dispose();
    this.sound.dispose();
    this.preview.dispose();
    this.levelDecor.dispose();
    this.sparkles.dispose();
    this.chips.dispose();
    this.comboGlow.dispose();
    this.fx.dispose();
    this.world.dispose();
    this.tex.dispose();
    this.renderer.dispose();
  }
}
