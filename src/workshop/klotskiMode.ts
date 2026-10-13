import { HAPTICS, KLOTSKI } from '../config';
import { isSolved, keyPiece, kRecord, kStars, maxSlide, parseKProgress, parseLevel, slide } from '../core/klotski';
import type { KDir, KLevel, KPiece, KProgress } from '../core/klotski';
import { KLOTSKI_LEVELS } from '../core/klotskiLevels';
import { easeInCubic, easeOutCubic } from '../fx/tween';
import type { Haptics } from '../platform/haptics';
import type { KeyValueStore } from '../platform/storage';
import { KlotskiScene } from '../render/klotskiScene';
import type { Textures } from '../render/textures';
import { KlotskiBar, KlotskiPicker, KlotskiWin } from '../ui/workshop';

interface Sounds {
  pickup(): void;
  place(): void;
  nope(): void;
  tick(): void;
  boardClear(): void;
}

interface Held {
  readonly id: number;
  readonly pointerId: number;
  readonly col: number;
  readonly row: number;
  axis: 'x' | 'z' | null;
  offset: number;
  /** Free cells: [left, right, up, down]. */
  readonly room: readonly [number, number, number, number];
  lift: number;
}

interface Settle {
  readonly id: number;
  readonly axis: 'x' | 'z';
  readonly from: number;
  t: number;
}

/**
 * Workshop → Sliding blocks (Klotski). Owns its scene, UI and input; the Game renders its scene
 * while `active` and hides the block-puzzle UI. Rules live in core/klotski.ts.
 */
export class KlotskiMode {
  readonly view: KlotskiScene;
  readonly picker: KlotskiPicker;
  readonly bar: KlotskiBar;
  readonly win: KlotskiWin;
  active = false;
  private progress: KProgress = { stars: [] };
  private n = 1;
  private level: KLevel | null = null;
  private pieces: KPiece[] = [];
  private moves = 0;
  private held: Held | null = null;
  private settle: Settle | null = null;
  /** Solved: seconds since the key piece started gliding out (−1 = not solved). */
  private winT = -1;
  private width = 1;
  private height = 1;
  private safeBottom = 0;

  constructor(
    private readonly d: {
      canvas: HTMLCanvasElement;
      tex: Textures;
      storage: KeyValueStore;
      sound: Sounds;
      haptics: Haptics;
      /** Entering / leaving a level: the Game hides or restores its own UI. */
      onActive(on: boolean): void;
    },
  ) {
    this.view = new KlotskiScene(d.tex);
    this.picker = new KlotskiPicker(KLOTSKI_LEVELS.length, {
      onPlay: (n) => this.start(n),
      onClose: () => this.picker.hide(),
    });
    this.bar = new KlotskiBar({ onBack: () => this.leave(true), onRestart: () => this.start(this.n) });
    this.win = new KlotskiWin({
      onNext: () => this.start(Math.min(this.n + 1, KLOTSKI_LEVELS.length)),
      onReplay: () => this.start(this.n),
      onLevels: () => this.leave(true),
    });
    const c = d.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e, true));
    c.addEventListener('pointercancel', (e) => this.onUp(e, false));
    void d.storage.get(KLOTSKI.storageKey).then((raw) => {
      this.progress = parseKProgress(raw);
      this.picker.update(this.progress);
    });
  }

  get nodes(): HTMLElement[] {
    return [this.bar.node, this.picker.node, this.win.node];
  }

  openPicker(): void {
    this.picker.update(this.progress);
    this.picker.show();
  }

  start(n: number): void {
    const spec = KLOTSKI_LEVELS[n - 1];
    if (!spec) return;
    this.n = n;
    this.level = parseLevel(spec.rows);
    this.pieces = [...this.level.pieces];
    this.moves = 0;
    this.held = null;
    this.settle = null;
    this.winT = -1;
    this.picker.hide();
    this.win.hide();
    this.view.load(this.level, this.pieces);
    this.bar.set(n, 0, spec.par);
    this.bar.show(true);
    if (!this.active) {
      this.active = true;
      this.d.onActive(true);
    }
    this.resize(this.width, this.height, this.safeBottom);
    this.d.sound.tick();
  }

  /** Back to Home (optionally reopening the level list). */
  leave(toLevels: boolean): void {
    this.win.hide();
    this.bar.show(false);
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
    this.view.resize(width, height, this.bar.bottom, safeBottom);
  }

  update(dt: number): void {
    if (!this.active || !this.level) return;
    const h = this.held;
    if (h) {
      h.lift += (KLOTSKI.lift - h.lift) * Math.min(1, dt * KLOTSKI.liftRate);
      const p = this.piece(h.id);
      if (p) this.view.place(p, h.axis === 'x' ? h.offset : 0, h.axis === 'z' ? h.offset : 0, h.lift);
    }
    const s = this.settle;
    if (s) {
      s.t = Math.min(1, s.t + dt / KLOTSKI.snapDuration);
      const off = s.from * (1 - easeOutCubic(s.t));
      const p = this.piece(s.id);
      if (p) this.view.place(p, s.axis === 'x' ? off : 0, s.axis === 'z' ? off : 0, KLOTSKI.lift * (1 - s.t));
      if (s.t >= 1) this.settle = null;
    }
    if (this.winT >= 0) {
      this.winT += dt;
      const k = Math.min(1, this.winT / KLOTSKI.winSlide);
      const key = keyPiece(this.pieces);
      // rises over the lip of the exit as it glides out onto the table
      this.view.place(key, 0, easeInCubic(k) * KLOTSKI.winTravel, Math.min(1, k * 2.5) * KLOTSKI.winRise);
      if (this.winT >= KLOTSKI.winSlide + KLOTSKI.winCardDelay && !this.win.open) this.finish();
    }
  }

  private piece(id: number): KPiece | undefined {
    return this.pieces.find((p) => p.id === id);
  }

  private busy(): boolean {
    return !this.active || !this.level || this.winT >= 0 || this.settle !== null || this.win.open;
  }

  private onDown(e: PointerEvent): void {
    if (this.held || this.busy() || !this.level) return;
    const hit = this.view.pick(e.clientX, e.clientY, this.width, this.height);
    if (hit.id < 0) return;
    e.preventDefault();
    try {
      this.d.canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone
    }
    const room = (['left', 'right', 'up', 'down'] as KDir[]).map((dir) =>
      maxSlide(this.level as KLevel, this.pieces, hit.id, dir),
    ) as unknown as [number, number, number, number];
    this.held = { id: hit.id, pointerId: e.pointerId, col: hit.col, row: hit.row, axis: null, offset: 0, room, lift: 0 };
    this.d.sound.pickup();
    this.d.haptics.pulse(HAPTICS.pickup);
  }

  private onMove(e: PointerEvent): void {
    const h = this.held;
    if (!h || e.pointerId !== h.pointerId) return;
    const cells = this.view.pointCells(e.clientX, e.clientY, this.width, this.height);
    if (!cells) return;
    const dx = cells.col - h.col;
    const dz = cells.row - h.row;
    if (!h.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) < KLOTSKI.axisLock) return;
      const [l, r, u, d] = h.room;
      const canX = l + r > 0;
      const canZ = u + d > 0;
      if (!canX && !canZ) return;
      h.axis = Math.abs(dx) >= Math.abs(dz) ? (canX ? 'x' : 'z') : canZ ? 'z' : 'x';
    }
    const [l, r, u, d] = h.room;
    const raw = h.axis === 'x' ? dx : dz;
    const next = h.axis === 'x' ? Math.max(-l, Math.min(r, raw)) : Math.max(-u, Math.min(d, raw));
    if (Math.round(next) !== Math.round(h.offset)) this.d.haptics.pulse(HAPTICS.snap);
    h.offset = next;
  }

  private onUp(e: PointerEvent, commit: boolean): void {
    const h = this.held;
    if (!h || e.pointerId !== h.pointerId || !this.level) return;
    this.held = null;
    const steps = commit && h.axis ? Math.round(h.offset) : 0;
    const axis = h.axis ?? 'x';
    const dir: KDir = axis === 'x' ? (steps > 0 ? 'right' : 'left') : steps > 0 ? 'down' : 'up';
    const moved = steps !== 0 ? slide(this.level, this.pieces, h.id, dir, Math.abs(steps)) : null;
    if (moved) {
      this.pieces = moved;
      this.moves++;
      this.d.sound.place();
      this.d.haptics.pulse(HAPTICS.place);
    }
    // ease the rest of the way onto the cell (from where the finger left it)
    this.settle = { id: h.id, axis, from: h.offset - (moved ? steps : 0), t: 0 };
    this.bar.set(this.n, this.moves, KLOTSKI_LEVELS[this.n - 1]?.par ?? 0);
    if (moved && isSolved(this.level, this.pieces)) {
      this.settle = null;
      this.winT = 0;
      this.d.sound.boardClear();
      this.d.haptics.pulse(HAPTICS.boardClear);
    }
  }

  private finish(): void {
    const par = KLOTSKI_LEVELS[this.n - 1]?.par ?? this.moves;
    const stars = kStars(this.moves, par);
    this.progress = kRecord(this.progress, this.n, stars);
    void this.d.storage.set(KLOTSKI.storageKey, JSON.stringify(this.progress));
    this.win.present(stars, this.moves, par, this.n < KLOTSKI_LEVELS.length);
  }

  dispose(): void {
    this.view.dispose();
  }
}
