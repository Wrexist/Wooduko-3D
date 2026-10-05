import * as THREE from 'three';
import { Sound } from './audio/sound';
import { COLORS, FX, HAPTICS, RENDER, TRAY, WORDS, WORLD } from './config';
import { getShape } from './core/shapes';
import type { MoveResult } from './core/rules';
import { tutorialSteps } from './core/tutorial';
import type { TutorialStep } from './core/tutorial';
import type { Settings } from './core/types';
import { Effects } from './fx/effects';
import { Chips, Sparkles } from './fx/particles';
import { Tweens } from './fx/tween';
import { DragController } from './input/drag';
import type { Haptics } from './platform/haptics';
import { onLifecycle } from './platform/lifecycle';
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
import { ConfirmDialog, ResultsCard } from './ui/dialogs';
import { el, replay } from './ui/dom';
import { floatText } from './ui/floatText';
import { Hud } from './ui/hud';
import { HomeMenu, PauseMenu, SettingsPanel } from './ui/menus';
import { Toast } from './ui/toast';
import { TutorialOverlay } from './ui/tutorial';

export interface GameDeps {
  readonly canvas: HTMLCanvasElement;
  readonly uiRoot: HTMLElement;
  readonly store: GameStore;
  readonly haptics: Haptics;
}

/** Wires the store (rules + state) to the scene, effects, audio, UI and input. */
export class Game {
  private readonly store: GameStore;
  private readonly haptics: Haptics;
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: Renderer;
  private readonly tex: Textures;
  readonly world: World;
  private readonly tweens = new Tweens();
  private readonly preview: Preview;
  private readonly sparkles: Sparkles;
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

  private readonly mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  private steps: TutorialStep[] = [];
  private stepIndex = -1;
  /** Game-over sequence running: input is locked until the next reset. */
  private ending = false;
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
    this.canvas = d.canvas;
    this.renderer = createRenderer(d.canvas);
    this.tex = createTextures(this.renderer.gl.capabilities.getMaxAnisotropy());
    this.world = new World(this.tex);
    const { scene, camera } = this.world;
    this.preview = new Preview(scene, this.tex);
    this.sparkles = new Sparkles(scene, this.tex);
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
      screenFlash: () => replay(this.flashEl, 'on'),
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
      onSettings: () => this.settingsPanel.show(),
    });
    this.pauseMenu = new PauseMenu({
      onResume: () => this.store.getState().resume(),
      onRestart: () => void this.onRestart(),
      onSettings: () => this.settingsPanel.show(),
      onHome: () => this.onHome(),
    });
    this.settingsPanel = new SettingsPanel({
      onToggle: (k) => this.toggleSetting(k),
      onReset: () => void this.onResetProgress(),
      onClose: () => this.settingsPanel.hide(),
    });
    this.results = new ResultsCard({
      onAgain: () => this.store.getState().startNew(),
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
      this.home.node,
      this.pauseMenu.node,
      this.results.node,
      this.settingsPanel.node,
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
    if (s.phase !== prev.phase) this.onPhase(s);
    if (s.settings !== prev.settings) this.applySettings(s.settings);
    if (s.best !== prev.best) this.hud.setBest(s.best);
    if (s.hasSave !== prev.hasSave || s.best !== prev.best) this.home.update(s.best, s.hasSave);
  }

  /** Rebuild the scene from the store (new game, continue, tutorial step). */
  private syncFromStore(deal: boolean): void {
    const s = this.store.getState();
    this.drag.cancel();
    this.tweens.finishAll();
    this.preview.hide();
    this.preview.disposeGhost();
    this.ending = false;
    this.results.hide();
    this.fx.shake = 0;
    this.world.syncAll(s.game.board, s.game.tray, s.fits);
    if (deal) {
      this.world.dealIn(this.tweens);
      this.tweens.after(TRAY.dealSoundDelay, () => this.sound.deal());
    }
    this.hud.setScore(s.game.score, true);
    this.hud.combo.set(s.game.streak);
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
  }

  private canInteract(): boolean {
    const s = this.store.getState();
    return s.phase === 'playing' && !this.ending && !this.confirm.open && !this.settingsPanel.open;
  }

  // =====================================================================================
  // moves
  // =====================================================================================

  private commit(tp: TrayPiece, r0: number, c0: number): void {
    const before = this.store.getState();
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
    if (!removedIds.has(move.placed.id)) this.fx.squash(this.world.addGroup(move.placed));
    this.sound.place();
    this.haptics.pulse(HAPTICS.place);
    this.fx.addShake(FX.placeShake);
    this.fx.landingRing(ox, oz, shape.w, shape.h);

    if (move.applied) this.celebrate(move, ox, oz);
    else this.float(`+${move.points}`, ox, WORLD.topY + FX.floatLift, oz, false);

    const s = this.store.getState();
    this.hud.setScore(s.game.score);
    this.hud.bump();
    this.hud.combo.set(s.game.streak);

    if (tutorial) {
      if (move.clear.units > 0) this.tweens.after(FX.overCardDelay, () => this.nextTutorialStep());
      return;
    }
    if (move.dealt) {
      move.dealt.forEach((p, i) => this.world.addTrayPiece(i, p));
      this.world.dealIn(this.tweens);
      this.tweens.after(TRAY.dealSoundDelay, () => this.sound.deal());
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
    move.clear.list.forEach((u, i) => this.fx.sweep(u, i * FX.sweepStagger));
    this.fx.shockRing(
      ox,
      oz,
      FX.shockBase + units * FX.shockPerUnit,
      COLORS.shock,
      FX.shockPeak + FX.shockPeakPerUnit * Math.min(units, 3),
    );
    this.fx.punch(FX.punchBase + FX.punchPerLevel * Math.min(units + streak - 1, FX.punchMaxLevel));
    this.fx.addShake(FX.clearShakeBase + FX.clearShakePerUnit * Math.min(units, FX.clearShakeMaxUnits));
    if (units >= FX.flashMinUnits || streak >= FX.flashMinStreak) this.fx.flash();
    this.sound.clear(units, streak);
    this.haptics.pulse(move.boardClear ? HAPTICS.boardClear : HAPTICS.clear);
    this.float(`+${move.points}`, ox, WORLD.topY + FX.floatLiftClear, oz, true);

    let word: string =
      units >= 4
        ? WORDS.unreal
        : units === 3
          ? WORDS.excellent
          : units === 2
            ? WORDS.great
            : streak >= 3
              ? WORDS.fire
              : streak === 2
                ? WORDS.combo
                : WORDS.nice;
    let tier = Math.min(4, Math.max(units, streak >= 3 ? 2 : 1));
    if (move.boardClear) {
      word = WORDS.boardClear;
      tier = 4;
      this.fx.boardClear();
      this.sound.boardClear();
    }
    const sub = streak >= 2 ? `Combo ×${streak}` : units >= 2 ? `${units} lines` : '';
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
    this.tweens.after(FX.overCardDelay, () => {
      const s = this.store.getState();
      this.sound.gameOver();
      this.results.present(s.game.score, s.best, s.newBest, this.tweens);
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
    this.tutorialUi.show(this.stepIndex, this.steps.length, step.text);
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
        title: 'Start over?',
        body: 'Your current board and score will be lost.',
        confirm: 'Restart',
      });
      if (!ok) return;
    }
    this.store.getState().startNew();
  }

  private async onPlay(): Promise<void> {
    const s = this.store.getState();
    if (s.hasSave && s.game.score > 0) {
      const ok = await this.confirm.ask({
        title: 'New game?',
        body: 'Your saved game will be replaced.',
        confirm: 'New game',
      });
      if (!ok) return;
    }
    this.store.getState().startNew();
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
      title: 'Reset progress?',
      body: 'This deletes your best score and saved game. Settings are kept.',
      confirm: 'Reset',
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

  private toggleSetting(key: keyof Settings): void {
    const s = this.store.getState();
    s.setSetting(key, !s.settings[key]);
    this.sound.tick();
  }

  private onKey(e: KeyboardEvent): void {
    if (e.key !== 'Escape') return;
    const s = this.store.getState();
    if (this.confirm.open) this.confirm.cancel();
    else if (this.settingsPanel.open) this.settingsPanel.hide();
    else if (s.phase === 'playing') s.pause();
    else if (s.phase === 'paused') s.resume();
  }

  private onBackground(): void {
    this.drag.cancel();
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
    const top = Math.max(this.hud.bottom, this.tutorialUi.open ? this.tutorialUi.bottom : 0);
    this.world.resize(this.width, this.height, top, safeBottom);
  }

  private frame(now: number): void {
    const raw = Math.max(0, (now - this.last) / 1000);
    const dt = Math.min(RENDER.maxDt, raw) * this.timeScale;
    this.last = now;
    this.time += dt;
    this.renderer.sample(raw);

    this.sparkles.update(dt);
    this.tweens.update(dt);
    this.drag.update(dt);
    this.chips.update(dt);
    this.preview.update(dt, this.time);
    this.hud.update(dt);
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
    const killFx = this.fx.warmup();
    this.sparkles.emit(0, WORLD.baseY - 2, 0, 1, 0, 0, 0);
    this.renderer.gl.compile(scene, camera);
    this.renderer.gl.render(scene, camera);
    killFx();
    this.chips.warmup(false);
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
    this.fx.dispose();
    this.world.dispose();
    this.tex.dispose();
    this.renderer.dispose();
  }
}
