import { HAPTICS, PLANK } from '../config';
import {
  canPlace,
  isComplete,
  LEVEL_COUNT as LEVEL_COUNT_PLANK,
  makeLevel,
  parsePlankProgress,
  plankRecord,
  plankStars,
  rotate,
  rotateCw,
  sameShape,
  shapeId,
} from '../core/plank';
import type { Cells, Placed, PlankLevel, PlankProgress } from '../core/plank';
import { num, t } from '../i18n';
import type { Haptics } from '../platform/haptics';
import type { KeyValueStore } from '../platform/storage';
import { PlankScene } from '../render/plankScene';
import type { PieceLook } from '../render/plankScene';
import type { Textures } from '../render/textures';
import { GameBar, GameTools, LevelPicker, WinCard } from '../ui/workshop';

interface Sounds {
  pickup(): void;
  place(): void;
  nope(): void;
  tick(): void;
  returnPiece(): void;
  boardClear(): void;
}

interface Held {
  readonly id: number;
  readonly pointerId: number;
  readonly touch: boolean;
  /** Where it sat on the board when picked up (put back there if the touch is cancelled). */
  readonly from: Placed | null;
  readonly sx: number;
  readonly sy: number;
  /** Grab point relative to the piece centre (world units), so it doesn't jump to the finger. */
  readonly gx: number;
  readonly gz: number;
  moved: boolean;
}

const sizeOf = (cells: Cells): { w: number; h: number } => ({
  w: Math.max(...cells.map((p) => p[1])) + 1,
  h: Math.max(...cells.map((p) => p[0])) + 1,
});

/**
 * Workshop → Plank fit. Owns its scene, UI and input; the Game renders its scene while `active`.
 * Rules and level generation live in core/plank.ts.
 */
export class PlankMode {
  readonly view: PlankScene;
  readonly picker: LevelPicker;
  readonly bar: GameBar;
  readonly tools: GameTools;
  readonly win: WinCard;
  active = false;
  private progress: PlankProgress = { stars: [] };
  private n = 1;
  private level: PlankLevel | null = null;
  /** Current orientation of every piece. */
  private cells = new Map<number, Cells>();
  /** Pieces on the board. */
  private placed: Placed[] = [];
  private hints = 0;
  /** Stars for the solve in progress (saved the moment the board is filled). */
  private solvedStars = 0;
  private held: Held | null = null;
  private readonly look = new Map<number, PieceLook>();
  /** Solved: seconds since the last piece landed (−1 = not solved). */
  private winT = -1;
  private width = 1;
  private height = 1;
  private safeBottom = 0;
  private time = 0;

  constructor(
    private readonly d: {
      canvas: HTMLCanvasElement;
      tex: Textures;
      storage: KeyValueStore;
      sound: Sounds;
      haptics: Haptics;
      onActive(on: boolean): void;
      onPickerClose(): void;
    },
  ) {
    this.view = new PlankScene(d.tex);
    this.picker = new LevelPicker('plank', t('workshop.plank'), t('workshop.plankGoal'), LEVEL_COUNT_PLANK, {
      onPlay: (n) => this.start(n),
      onClose: () => {
        this.picker.hide();
        d.onPickerClose();
      },
    });
    this.bar = new GameBar({ onBack: () => this.leave(true), onRestart: () => this.start(this.n) });
    this.tools = new GameTools({ onHint: () => this.hint() }, t('workshop.plankHintNote'));
    this.win = new WinCard({
      onNext: () => this.start(Math.min(this.n + 1, LEVEL_COUNT_PLANK)),
      onReplay: () => this.start(this.n),
      onLevels: () => this.leave(true),
    });
    const c = d.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e, true));
    c.addEventListener('pointercancel', (e) => this.onUp(e, false));
    void d.storage.get(PLANK.storageKey).then((raw) => {
      this.progress = parsePlankProgress(raw);
      this.picker.update(this.progress.stars);
    });
  }

  get nodes(): HTMLElement[] {
    return [this.bar.node, this.tools.node, this.picker.node, this.win.node];
  }

  get starCount(): [number, number] {
    return [this.progress.stars.reduce((a, b) => a + b, 0), LEVEL_COUNT_PLANK * 3];
  }

  openPicker(): void {
    this.picker.update(this.progress.stars);
    this.picker.show();
  }

  start(n: number): void {
    this.n = n;
    const level = makeLevel(n);
    this.level = level;
    this.cells = new Map(level.pieces.map((p) => [p.id, p.cells]));
    this.placed = [];
    this.hints = 0;
    this.held = null;
    this.winT = -1;
    this.picker.hide();
    this.win.hide();
    this.view.load(level);
    this.look.clear();
    level.pieces.forEach((p, i) => {
      const s = this.view.slot(i);
      this.look.set(p.id, { x: s.x, z: s.z + 2, y: 0, s: PLANK.trayScale, turn: 0 });
    });
    this.bar.show(true);
    this.tools.show(true);
    this.refreshUi();
    if (!this.active) {
      this.active = true;
      this.d.onActive(true);
    }
    this.resize(this.width, this.height, this.safeBottom);
    this.d.sound.tick();
  }

  leave(toLevels: boolean): void {
    this.win.hide();
    this.bar.show(false);
    this.tools.show(false);
    this.held = null;
    if (this.active) {
      this.active = false;
      this.d.onActive(false);
    }
    if (toLevels) this.openPicker();
  }

  resize(width: number, height: number, safeBottom: number): void {
    this.width = width;
    this.height = height;
    this.safeBottom = safeBottom;
    this.view.resize(
      width,
      height,
      this.bar.bottom,
      Math.max(safeBottom, this.tools.height),
      this.tools.left,
    );
  }

  private refreshUi(): void {
    const total = this.level?.pieces.length ?? 0;
    this.bar.set(
      t('journey.level', { n: this.n }),
      t('workshop.placed', { n: num(this.placed.length), total: num(total) }),
      t('workshop.plankSmall'),
    );
    this.tools.set(false, this.hints > 0);
  }

  /** Where a piece should be right now: on the board, in its tray slot, or under the finger. */
  private target(id: number): PieceLook {
    const cells = this.cells.get(id) ?? [];
    const { w, h } = sizeOf(cells);
    const p = this.placed.find((q) => q.id === id);
    if (p) {
      const c = this.view.cellCentre(p.r, p.c, w, h);
      return { x: c.x, z: c.z, y: PlankScene.boardY + (this.winT >= 0 ? this.winHop() : 0), s: 1, turn: 0 };
    }
    const i = this.level?.pieces.findIndex((q) => q.id === id) ?? 0;
    const s = this.view.slot(i);
    // long pieces shrink to fit their slot, so neighbours never overlap (even after a turn)
    const scale = Math.min(PLANK.trayScale, PLANK.trayMaxSpan / Math.max(w, h));
    return { x: s.x, z: s.z, y: PlankScene.tableY, s: scale, turn: 0 };
  }

  /** A small celebratory hop of the whole board when it is filled. */
  private winHop(): number {
    const k = Math.min(1, this.winT / 0.5);
    return Math.sin(k * Math.PI) * 0.25;
  }

  update(dt: number): void {
    if (!this.active || !this.level) return;
    this.time += dt;
    const follow = 1 - Math.exp(-PLANK.followRate * dt);
    const settle = 1 - Math.exp(-PLANK.settleRate * dt);
    const turn = 1 - Math.exp(-PLANK.turnRate * dt);
    for (const p of this.level.pieces) {
      const look = this.look.get(p.id);
      if (!look) continue;
      if (this.held?.id === p.id) {
        // the held piece is moved by onMove; only its height, scale and turn ease here
        look.y += (PlankScene.topY + PLANK.lift - look.y) * follow;
        look.s += (1 - look.s) * follow;
      } else {
        const tg = this.target(p.id);
        const k = this.winT >= 0 ? 1 : settle;
        look.x += (tg.x - look.x) * k;
        look.z += (tg.z - look.z) * k;
        look.y += (tg.y - look.y) * (this.winT >= 0 ? 1 : settle);
        look.s += (tg.s - look.s) * settle;
      }
      look.turn -= look.turn * turn;
      this.view.draw(p.id, look);
    }
    if (this.winT >= 0) {
      if (this.winT === 0) this.tools.show(false);
      this.winT += dt;
      if (this.winT >= PLANK.winCardDelay && !this.win.open) this.finish();
    }
  }

  private busy(): boolean {
    return !this.active || !this.level || this.winT >= 0 || this.win.open;
  }

  private onDown(e: PointerEvent): void {
    if (this.held || this.busy()) return;
    const id = this.view.pick(e.clientX, e.clientY, this.width, this.height);
    if (id < 0) return;
    const at = this.view.toWorld(e.clientX, e.clientY, this.width, this.height, PlankScene.topY);
    const look = this.look.get(id);
    if (!at || !look) return;
    e.preventDefault();
    try {
      this.d.canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone
    }
    this.held = {
      id,
      pointerId: e.pointerId,
      touch: e.pointerType === 'touch',
      from: this.placed.find((p) => p.id === id) ?? null,
      sx: e.clientX,
      sy: e.clientY,
      gx: at.x - look.x,
      gz: at.z - look.z,
      moved: false,
    };
  }

  private onMove(e: PointerEvent): void {
    const h = this.held;
    if (!h || e.pointerId !== h.pointerId) return;
    if (!h.moved) {
      if (Math.hypot(e.clientX - h.sx, e.clientY - h.sy) < PLANK.tapPx) return;
      h.moved = true;
      // lifted out of the board: it no longer counts as placed
      this.placed = this.placed.filter((p) => p.id !== h.id);
      this.refreshUi();
      this.d.sound.pickup();
      this.d.haptics.pulse(HAPTICS.pickup);
    }
    const at = this.view.toWorld(e.clientX, e.clientY, this.width, this.height, PlankScene.topY);
    const look = this.look.get(h.id);
    if (!at || !look) return;
    // on touch the piece floats above the finger, and the grab offset shrinks as it grows to full size
    const k = look.s;
    look.x = at.x - h.gx * k;
    look.z = at.z - h.gz * k + (h.touch ? PLANK.touchOffsetZ : 0);
  }

  private onUp(e: PointerEvent, commit: boolean): void {
    const h = this.held;
    if (!h || e.pointerId !== h.pointerId || !this.level) return;
    this.held = null;
    if (!h.moved) {
      // a press without moving is a tap, however long it was held
      if (commit) this.tap(h.id);
      return;
    }
    if (!commit) {
      // the system took the touch (Control Centre, a call): put it back where it was
      if (h.from && canPlace(this.level, this.placed, h.from.cells, h.from.r, h.from.c, h.id)) {
        this.placed.push(h.from);
        this.refreshUi();
      }
      return;
    }
    const cells = this.cells.get(h.id) ?? [];
    const look = this.look.get(h.id);
    if (look) {
      const { w, h: ph } = sizeOf(cells);
      const { r, c } = this.view.nearestCell(look.x, look.z, w, ph);
      if (canPlace(this.level, this.placed, cells, r, c, h.id)) {
        this.placed.push({ id: h.id, cells, r, c });
        this.d.sound.place();
        this.d.haptics.pulse(HAPTICS.place);
        this.refreshUi();
        this.checkSolved();
        return;
      }
    }
    this.d.sound.returnPiece();
  }

  /** Tap: a loose piece turns a quarter clockwise; a placed piece goes back to the table. */
  private tap(id: number): void {
    if (this.placed.some((p) => p.id === id)) {
      this.placed = this.placed.filter((p) => p.id !== id);
      this.d.sound.returnPiece();
      this.refreshUi();
      return;
    }
    const cells = rotateCw(this.cells.get(id) ?? []);
    this.cells.set(id, cells);
    this.view.setCells(id, cells);
    const look = this.look.get(id);
    // the new geometry starts a quarter turn back and eases forward, so it reads as turning
    if (look) look.turn += Math.PI / 2;
    this.d.sound.tick();
    this.d.haptics.pulse(HAPTICS.snap);
  }

  private hint(): void {
    if (this.busy() || this.held || !this.level) return;
    const level = this.level;
    // solution slots (shape + place); a slot is done if any piece of that shape fills it exactly
    const slots = level.pieces.map((p) => ({
      cells: rotate(p.cells, p.solution.turns),
      r: p.solution.r,
      c: p.solution.c,
      shape: shapeId(p.cells),
    }));
    const fills = (q: Placed, slot: (typeof slots)[number]): boolean =>
      q.r === slot.r && q.c === slot.c && sameShape(q.cells, slot.cells);
    const done = (slot: (typeof slots)[number]): boolean => this.placed.some((q) => fills(q, slot));
    const slot = slots.find((x) => !done(x));
    if (!slot) return;
    // a piece of that shape not already filling a slot: a loose one first, else one placed elsewhere
    const free = level.pieces.filter(
      (p) =>
        shapeId(p.cells) === slot.shape &&
        !this.placed.some((q) => q.id === p.id && slots.some((x) => fills(q, x))),
    );
    const piece = free.find((p) => !this.placed.some((q) => q.id === p.id)) ?? free[0];
    if (!piece) return;
    const { cells, r, c } = slot;
    // anything in the way goes back to the table
    const want = new Set(cells.map((p) => `${p[0] + r},${p[1] + c}`));
    this.placed = this.placed.filter(
      (p) => p.id !== piece.id && !p.cells.some((q) => want.has(`${q[0] + p.r},${q[1] + p.c}`)),
    );
    this.cells.set(piece.id, cells);
    this.view.setCells(piece.id, cells);
    this.placed.push({ id: piece.id, cells, r, c });
    this.hints++;
    this.d.sound.place();
    this.d.haptics.pulse(HAPTICS.place);
    this.refreshUi();
    this.checkSolved();
  }

  private checkSolved(): void {
    if (!this.level || this.winT >= 0 || !isComplete(this.level, this.placed)) return;
    this.winT = 0;
    // save now, not when the card shows: leaving during the celebration must not lose the stars
    this.solvedStars = plankStars(this.hints);
    this.progress = plankRecord(this.progress, this.n, this.solvedStars);
    void this.d.storage.set(PLANK.storageKey, JSON.stringify(this.progress));
    this.d.sound.boardClear();
    this.d.haptics.pulse(HAPTICS.boardClear);
  }

  private finish(): void {
    this.win.present(
      this.solvedStars,
      [
        { label: t('workshop.statPieces'), value: num(this.level?.pieces.length ?? 0) },
        { label: t('workshop.statHints'), value: num(this.hints) },
      ],
      this.n < LEVEL_COUNT_PLANK,
    );
  }

  dispose(): void {
    this.view.dispose();
  }
}
