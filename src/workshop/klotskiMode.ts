import { HAPTICS, KLOTSKI } from '../config';
import {
  isSolved,
  keyPiece,
  kRecord,
  kStars,
  maxSlide,
  positionKey,
  searchPath,
  parseKProgress,
  parseLevel,
  slide,
} from '../core/klotski';
import type { KDir, KLevel, KMove, KPiece, KProgress } from '../core/klotski';
import { KLOTSKI_LEVELS } from '../core/klotskiLevels';
import { easeInCubic, easeOutCubic } from '../fx/tween';
import type { Haptics } from '../platform/haptics';
import type { KeyValueStore } from '../platform/storage';
import { KlotskiScene } from '../render/klotskiScene';
import type { Textures } from '../render/textures';
import { num, t } from '../i18n';
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
  readonly col: number;
  readonly row: number;
  axis: 'x' | 'z' | null;
  offset: number;
  /** Free cells: [left, right, up, down]. */
  readonly room: readonly [number, number, number, number];
  lift: number;
  /** Already buzzed for pushing past the end of the free run (once per push). */
  bumped: boolean;
}

/** A piece easing onto its cell: `from` is its visual offset (cells) along `axis` at t = 0. */
interface Settle {
  readonly id: number;
  readonly axis: 'x' | 'z';
  readonly from: number;
  readonly dur: number;
  t: number;
}

const DIRS: readonly KDir[] = ['left', 'right', 'up', 'down'];
const axisOf = (d: KDir): 'x' | 'z' => (d === 'left' || d === 'right' ? 'x' : 'z');
const signOf = (d: KDir): number => (d === 'right' || d === 'down' ? 1 : -1);

/**
 * Workshop → Sliding blocks (Klotski). Owns its scene, UI and input; the Game renders its scene
 * while `active` and hides the block-puzzle UI. Rules live in core/klotski.ts.
 */
export class KlotskiMode {
  readonly view: KlotskiScene;
  readonly picker: LevelPicker;
  readonly bar: GameBar;
  readonly tools: GameTools;
  readonly win: WinCard;
  active = false;
  private progress: KProgress = { stars: [], best: [] };
  private n = 1;
  private level: KLevel | null = null;
  private pieces: KPiece[] = [];
  /** Earlier positions, for Undo. */
  private history: KPiece[][] = [];
  private moves = 0;
  private hinted = false;
  /** A shortest solution from the position `key` (computed in the background, reused by Hint). */
  private plan: { key: string; moves: KMove[] } | null = null;
  private planTimer = 0;
  /** Stars for the solve in progress (saved the moment the level is solved). */
  private solvedStars = 0;
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
      /** Back from the level list (to the Workshop hub). */
      onPickerClose(): void;
    },
  ) {
    this.view = new KlotskiScene(d.tex);
    this.picker = new LevelPicker(
      'klotski',
      t('workshop.klotski'),
      t('workshop.goal'),
      KLOTSKI_LEVELS.length,
      {
        onPlay: (n) => this.start(n),
        onClose: () => {
          this.picker.hide();
          d.onPickerClose();
        },
      },
    );
    this.bar = new GameBar({ onBack: () => this.leave(true), onRestart: () => this.start(this.n) });
    this.tools = new GameTools(
      { onUndo: () => this.undo(), onHint: () => this.hint() },
      t('workshop.hintNote'),
    );
    this.win = new WinCard({
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
      this.picker.update(this.progress.stars);
    });
  }

  get nodes(): HTMLElement[] {
    return [this.bar.node, this.tools.node, this.picker.node, this.win.node];
  }

  /** Stars earned / possible, for the Workshop hub. */
  get starCount(): [number, number] {
    return [this.progress.stars.reduce((a, b) => a + b, 0), KLOTSKI_LEVELS.length * 3];
  }

  openPicker(): void {
    this.picker.update(this.progress.stars);
    this.picker.show();
  }

  start(n: number): void {
    const spec = KLOTSKI_LEVELS[n - 1];
    if (!spec) return;
    this.n = n;
    this.level = parseLevel(spec.rows);
    this.pieces = [...this.level.pieces];
    this.history = [];
    this.moves = 0;
    this.hinted = false;
    this.held = null;
    this.settle = null;
    this.winT = -1;
    this.plan = null;
    // work out a solution after the level is on screen, so the first Hint is instant
    window.clearTimeout(this.planTimer);
    this.planTimer = window.setTimeout(() => this.ensurePlan(), KLOTSKI.planDelayMs);
    this.picker.hide();
    this.win.hide();
    this.view.load(this.level, this.pieces);
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

  /** Back to Home (optionally reopening the level list). */
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
    this.view.resize(width, height, this.bar.bottom, Math.max(safeBottom, this.tools.height), this.tools.left);
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
      s.t = Math.min(1, s.t + dt / s.dur);
      const off = s.from * (1 - easeOutCubic(s.t));
      const p = this.piece(s.id);
      if (p) this.view.place(p, s.axis === 'x' ? off : 0, s.axis === 'z' ? off : 0, KLOTSKI.lift * (1 - s.t));
      if (s.t >= 1) {
        this.settle = null;
        this.checkSolved();
      }
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

  private refreshUi(): void {
    const spec = KLOTSKI_LEVELS[this.n - 1];
    const best = this.progress.best[this.n - 1] ?? 0;
    const par = t('workshop.par', { n: num(spec?.par ?? 0) });
    this.bar.set(
      t('journey.level', { n: this.n }),
      t('workshop.moves', { n: num(this.moves) }),
      best > 0 ? `${par} · ${t('workshop.yourBest', { n: num(best) })}` : par,
    );
    this.tools.set(this.history.length > 0, this.hinted);
  }

  /** Commit a slide, then ease the piece the rest of the way from `fromOffset` (cells, visual). */
  private commit(id: number, dir: KDir, steps: number, fromOffset: number, dur: number): boolean {
    if (!this.level) return false;
    const moved = slide(this.level, this.pieces, id, dir, steps);
    if (!moved) return false;
    this.history.push(this.pieces);
    this.pieces = moved;
    this.moves++;
    this.d.sound.place();
    this.d.haptics.pulse(HAPTICS.place);
    this.settle = { id, axis: axisOf(dir), from: fromOffset - signOf(dir) * steps, dur, t: 0 };
    this.refreshUi();
    return true;
  }

  private checkSolved(): void {
    if (!this.level || this.winT >= 0 || !isSolved(this.level, this.pieces)) return;
    this.winT = 0;
    // save now, not when the card shows: leaving during the glide must not lose the stars
    const par = KLOTSKI_LEVELS[this.n - 1]?.par ?? this.moves;
    this.solvedStars = kStars(this.moves, par, this.hinted);
    // "your best" only counts solves without a hint
    this.progress = kRecord(this.progress, this.n, this.solvedStars, this.hinted ? null : this.moves);
    void this.d.storage.set(KLOTSKI.storageKey, JSON.stringify(this.progress));
    this.d.sound.boardClear();
    this.d.haptics.pulse(HAPTICS.boardClear);
  }

  /** The cached solution from here, or a fresh search (once per position). */
  private ensurePlan(): KMove[] | null {
    if (!this.active || !this.level || this.winT >= 0) return null;
    const key = positionKey(this.pieces);
    if (this.plan?.key !== key) {
      const moves = searchPath(this.level, this.pieces);
      this.plan = moves ? { key, moves } : null;
    }
    return this.plan?.moves ?? null;
  }

  private undo(): void {
    const prev = this.history.pop();
    if (!prev || this.busy() || this.held) {
      if (prev) this.history.push(prev);
      return;
    }
    // ease the piece that moved back from where it is now
    const moved = this.pieces.find((p, i) => {
      const q = prev[i];
      return q && (q.r !== p.r || q.c !== p.c);
    });
    const was = moved ? prev.find((q) => q.id === moved.id) : undefined;
    this.pieces = prev;
    this.moves = Math.max(0, this.moves - 1);
    if (moved && was) {
      const axis = moved.r !== was.r ? 'z' : 'x';
      const from = axis === 'z' ? moved.r - was.r : moved.c - was.c;
      this.settle = { id: moved.id, axis, from, dur: KLOTSKI.undoDuration, t: 0 };
    }
    this.d.sound.returnPiece();
    this.refreshUi();
  }

  private hint(): void {
    if (this.busy() || this.held || !this.level) return;
    const m = this.ensurePlan()?.[0];
    if (!m) return;
    this.hinted = true;
    if (!this.commit(m.id, m.dir, m.steps, 0, KLOTSKI.hintDuration)) return;
    // the rest of the plan is still shortest from the new position
    this.plan = this.plan ? { key: positionKey(this.pieces), moves: this.plan.moves.slice(1) } : null;
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
    const level = this.level;
    const room = DIRS.map((dir) => maxSlide(level, this.pieces, hit.id, dir)) as unknown as [
      number,
      number,
      number,
      number,
    ];
    this.held = {
      id: hit.id,
      pointerId: e.pointerId,
      col: hit.col,
      row: hit.row,
      axis: null,
      offset: 0,
      room,
      lift: 0,
      bumped: false,
    };
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
    const [l, r, u, d] = h.room;
    if (!h.axis) {
      if (Math.max(Math.abs(dx), Math.abs(dz)) < KLOTSKI.axisLock) return;
      const canX = l + r > 0;
      const canZ = u + d > 0;
      if (!canX && !canZ) {
        this.bump(h);
        return;
      }
      h.axis = Math.abs(dx) >= Math.abs(dz) ? (canX ? 'x' : 'z') : canZ ? 'z' : 'x';
    }
    const raw = h.axis === 'x' ? dx : dz;
    const lo = h.axis === 'x' ? -l : -u;
    const hi = h.axis === 'x' ? r : d;
    const next = Math.max(lo, Math.min(hi, raw));
    // pushing against a wall or a block: one soft bump per push
    if (raw > hi + KLOTSKI.bumpOver || raw < lo - KLOTSKI.bumpOver) this.bump(h);
    else if (raw <= hi && raw >= lo) h.bumped = false;
    if (Math.round(next) !== Math.round(h.offset)) this.d.haptics.pulse(HAPTICS.snap);
    h.offset = next;
  }

  private bump(h: Held): void {
    if (h.bumped) return;
    h.bumped = true;
    this.d.haptics.pulse(HAPTICS.nope);
  }

  private onUp(e: PointerEvent, commit: boolean): void {
    const h = this.held;
    if (!h || e.pointerId !== h.pointerId || !this.level) return;
    this.held = null;
    if (commit && !h.axis) {
      // a tap: slide all the way if the block can only go one way
      const open = DIRS.filter((_, i) => (h.room[i] ?? 0) > 0);
      const only = open.length === 1 ? open[0] : undefined;
      if (only) this.commit(h.id, only, h.room[DIRS.indexOf(only)] ?? 0, 0, KLOTSKI.tapDuration);
      else {
        this.d.sound.nope();
        this.settle = { id: h.id, axis: 'x', from: 0, dur: KLOTSKI.snapDuration, t: 0 };
      }
      return;
    }
    const steps = commit && h.axis ? Math.round(h.offset) : 0;
    const axis = h.axis ?? 'x';
    const dir: KDir = axis === 'x' ? (steps > 0 ? 'right' : 'left') : steps > 0 ? 'down' : 'up';
    if (steps === 0 || !this.commit(h.id, dir, Math.abs(steps), h.offset, KLOTSKI.snapDuration))
      this.settle = { id: h.id, axis, from: h.offset, dur: KLOTSKI.snapDuration, t: 0 };
  }

  private finish(): void {
    const par = KLOTSKI_LEVELS[this.n - 1]?.par ?? this.moves;
    const stars = this.solvedStars;
    const line = t('workshop.result', { n: num(this.moves), p: num(par) });
    this.win.present(
      stars,
      this.hinted ? `${line} · ${t('workshop.hinted')}` : line,
      this.n < KLOTSKI_LEVELS.length,
    );
  }

  dispose(): void {
    this.view.dispose();
  }
}
