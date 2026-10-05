import * as THREE from 'three';
import { Sound } from './audio/sound';
import { ADS, COLORS, FX, HAPTICS, LADDER, PROGRESS, RENDER, themeById, TRAY, WORLD } from './config';
import type { ThemeId } from './config';
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
import { nextReminder, reminderIndex, shouldAskReview, shouldOfferReminder } from './core/retention';
import { t } from './i18n';
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
import { el, replay } from './ui/dom';
import { floatText } from './ui/floatText';
import { Hud } from './ui/hud';
import { HomeMenu, PauseMenu, SettingsPanel } from './ui/menus';
import type { ToggleKey } from './ui/menus';
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
  private readonly pauseMenu: PauseMenu;
  private readonly settingsPanel: SettingsPanel;
  private readonly confirm = new ConfirmDialog();
  private readonly results: ResultsCard;
  private readonly tutorialUi: TutorialOverlay;
  private readonly awards: AwardsPanel;
  private readonly banner = new AchievementBanner(PROGRESS.bannerSeconds);
  /** Wood theme currently drawn into the textures. */
  private theme: ThemeId;

  private readonly mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  private steps: TutorialStep[] = [];
  private stepIndex = -1;
  /** Game-over sequence running: input is locked until the next reset. */
  private ending = false;
  /** The current game already passed the previous best (celebrate only once per game). */
  private bestCelebrated = false;
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
    this.fx = new Effects({
      scene,
      camera,
      tweens: this.tweens,
      tex: this.tex,
      sparkles: this.sparkles,
      chips: this.chips,
      blocks: this.world.blocks,
      reducedMotion: () => this.reduced,
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
    });
    this.home = new HomeMenu({
      onPlay: () => void this.onPlay(),
      onContinue: () => this.store.getState().continueGame(),
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
      onHome: () => this.store.getState().goHome(),
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
      onLifecycle({ background: () => this.onBackground(), foreground: () => this.sound.resume() }),
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
    if (s.removeAds !== prev.removeAds) this.syncStoreUi();
    if (s.phase !== prev.phase) this.onPhase(s);
    if (s.settings !== prev.settings) this.applySettings(s.settings);
    if (s.unlockSeq !== prev.unlockSeq && s.recentUnlocks.length) {
      const ids = s.recentUnlocks;
      for (const id of ids) void this.services.gameCenter.unlock(id);
      // next frame, once this move's HUD (combo pill) is updated: sit just under it
      requestAnimationFrame(() => {
        this.banner.node.style.top = `${this.hud.contentBottom + FX.bannerGap}px`;
        this.banner.push(ids);
        this.sound.achievement();
      });
    }
    if (
      this.awards.open &&
      (s.stats !== prev.stats || s.unlocked !== prev.unlocked || s.settings !== prev.settings)
    )
      this.refreshAwards();
    if (s.best !== prev.best) this.hud.setBest(s.best);
    if (s.hasSave !== prev.hasSave || s.best !== prev.best) this.home.update(s.best, s.hasSave);
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
    this.bestCelebrated = false;
    this.results.hide();
    this.fx.shake = 0;
    this.world.syncAll(s.game.board, s.game.tray, s.fits);
    if (deal) {
      this.world.dealIn(this.tweens);
      this.later(TRAY.dealSoundDelay, () => this.sound.deal());
    }
    this.hud.setScore(s.game.score, true);
    this.hud.combo.set(s.game.streak, s.game.misses > 0);
    this.comboGlow.set(s.game.streak, s.game.misses > 0, this.reduced);
  }

  private onPhase(s: StoreState): void {
    const p = s.phase;
    if (p === 'home') {
      this.home.update(s.best, s.hasSave);
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
    if (gameCenter.available()) void gameCenter.signIn();
    if (this.store.getState().meta.reminder === 'on') await this.scheduleReminder();
    await this.bootMonetization();
  }

  /**
   * Purchases first (Remove ads owners never see consent, tracking or ad prompts), then — from
   * the 2nd session on — consent → ATT → ads.
   */
  private async bootMonetization(): Promise<void> {
    const { purchases, ads } = this.money;
    if (purchases.available()) {
      if (await purchases.owned()) this.store.getState().setRemoveAds(true);
      this.price = await purchases.price();
      this.syncStoreUi();
    }
    const s = this.store.getState();
    if (!s.removeAds && s.meta.sessions >= ADS.initFromSession) {
      await ads.start();
      this.syncStoreUi();
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
    this.syncStoreUi();
    this.settingsPanel.show();
  }

  private async buyRemoveAds(): Promise<void> {
    this.sound.tick();
    if (await this.money.purchases.buy()) this.store.getState().setRemoveAds(true);
  }

  private async restorePurchases(): Promise<void> {
    const owned = await this.money.purchases.restore();
    if (owned) this.store.getState().setRemoveAds(true);
    this.settingsPanel.setNote(owned ? t('settings.restored') : t('settings.nothingToRestore'));
  }

  /** What the results card can offer: a free revive (Remove ads), one for a rewarded ad, or none. */
  private reviveOffer(): 'ad' | 'free' | null {
    const s = this.store.getState();
    if (s.tutorial || !canRevive(s.game)) return null;
    if (s.removeAds) return 'free';
    return this.money.ads.rewardedReady() ? 'ad' : null;
  }

  private async tryRevive(): Promise<void> {
    const offer = this.reviveOffer();
    if (!offer) return;
    if (offer === 'ad') {
      this.results.setReviveBusy(true);
      this.sound.suspend();
      const earned = await this.money.ads.showRewarded();
      this.sound.resume();
      this.results.setReviveBusy(false);
      if (!earned) return;
    }
    this.store.getState().revive();
  }

  /** Board rebuilt after a revive: show the cleared square as a sweep and celebrate a little. */
  private onRevived(): void {
    const s = this.store.getState();
    this.syncFromStore(true);
    const cleared = s.lastRevive;
    if (cleared) for (const u of cleared.list) this.fx.sweep(u, 0, LADDER.sparkScale[2]);
    this.sound.clear(1, 1, true);
    const a = this.world.toScreen(...FX.toastAnchor, this.width, this.height);
    this.toast.show(t('word.revive'), '', a.y, 3);
  }

  /** Between games only: maybe an interstitial (paced by core/revive.shouldShowInterstitial), then a new game. */
  private async newGameAfterAd(): Promise<void> {
    const s = this.store.getState();
    const show = shouldShowInterstitial({
      sessions: s.meta.sessions,
      gamesPlayed: s.stats.gamesPlayed,
      gamesSinceAd: s.meta.gamesSinceAd + (s.phase === 'over' ? 1 : 0),
      msSinceAd: Date.now() - s.meta.lastAdAt,
      removeAds: s.removeAds,
    });
    if (show && this.money.ads.interstitialReady()) {
      this.sound.suspend();
      await this.money.ads.showInterstitial();
      this.sound.resume();
      s.noteInterstitial();
    }
    this.store.getState().startNew();
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
      !this.awards.open
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
    if (!tutorial && !this.bestCelebrated && before.best > 0 && s.game.score > before.best && !s.game.over) {
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
    if (s.game.over) this.gameOver();
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

  private float(text: string, x: number, y: number, z: number, gold: boolean): void {
    const p = this.world.toScreen(x, y, z, this.width, this.height);
    floatText(this.floatLayer, text, p.x, p.y, gold);
  }

  /** Blocks fade to grey row by row, then the results card slides up. */
  private gameOver(): void {
    this.ending = true;
    this.drag.cancel();
    this.hud.combo.set(0);
    for (const [id, mesh] of this.world.groups) this.dimGroup(id, mesh);
    this.later(FX.overCardDelay, () => {
      const s = this.store.getState();
      this.sound.gameOver();
      this.results.setRevive(this.reviveOffer());
      this.results.present(s.game.score, s.best, s.newBest, this.tweens);
      void this.services.gameCenter.submitBest(s.best);
      // a new best is a high: the only moment we ever ask for a review
      if (
        this.services.review.available() &&
        shouldAskReview(s.meta, s.newBest, s.stats.gamesPlayed, new Date())
      ) {
        s.noteReviewAsked();
        this.later(FX.reviewDelay, () => void this.services.review.request());
      }
    });
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
    if (s.hasSave && s.game.score > 0) {
      const ok = await this.confirm.ask({
        title: t('confirm.newGame.title'),
        body: t('confirm.newGame.body'),
        confirm: t('confirm.newGame.ok'),
      });
      if (!ok) return;
    }
    await this.newGameAfterAd();
  }

  private onHome(): void {
    const s = this.store.getState();
    if (s.tutorial) {
      this.stepIndex = -1;
      this.drag.setAllowed(undefined);
      this.tutorialUi.hide();
      this.resize();
      s.finishTutorial();
      return;
    }
    s.goHome();
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
    this.store.getState().resetProgress();
  }

  private onSoundButton(): void {
    const s = this.store.getState();
    const on = !(s.settings.sound || s.settings.music);
    s.setSetting('sound', on);
    this.store.getState().setSetting('music', on);
    this.sound.tick();
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
    else if (this.settingsPanel.open) this.settingsPanel.hide();
    else if (this.awards.open) this.awards.hide();
    else if (s.phase === 'playing') s.pause();
    else if (s.phase === 'paused') s.resume();
  }

  private onBackground(): void {
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
    this.chips.update(fxDt);
    this.preview.update(dt, this.time);
    this.hud.update(dt);
    this.banner.update(dt);
    this.updateTutorialHand(dt);

    const shake = this.fx.updateShake(dt);
    const cb = this.world.camBase;
    const cam = this.world.camera;
    if (shake > 0) {
      cam.position.set(
        cb.x + (Math.random() - 0.5) * shake,
        cb.y + (Math.random() - 0.5) * shake * FX.shakeVertical,
        cb.z + (Math.random() - 0.5) * shake,
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
    this.sparkles.dispose();
    this.chips.dispose();
    this.comboGlow.dispose();
    this.fx.dispose();
    this.world.dispose();
    this.tex.dispose();
    this.renderer.dispose();
  }
}
