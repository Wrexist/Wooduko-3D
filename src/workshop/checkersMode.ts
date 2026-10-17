import { CHECKERS, HAPTICS } from '../config';
import {
  applyMove,
  CHECKERS_LEVELS,
  colOf,
  count,
  cStars,
  DRAW_PLIES,
  initialBoard,
  isProgress,
  legalMoves,
  opponentFor,
  rowOf,
  SIZE,
} from '../core/checkers';
import type { CMove } from '../core/checkers';
import { kRecord, parseKProgress } from '../core/klotski';
import type { KProgress } from '../core/klotski';
import type { Haptics } from '../platform/haptics';
import type { KeyValueStore } from '../platform/storage';
import { CheckersScene } from '../render/checkersScene';
import type { CStep } from '../render/checkersScene';
import type { Textures } from '../render/textures';
import { num, t } from '../i18n';
import { GameBar, GameTools, LevelPicker, WinCard } from '../ui/workshop';
import { answer } from './checkersAsk';
import type { CheckersAsk, CheckersReply } from './checkersAsk';

interface Sounds {
  pickup(): void;
  place(): void;
  nope(): void;
  tick(): void;
  returnPiece(): void;
  boardClear(): void;
  gameOver(): void;
  clear(units: number, streak: number): void;
}

/** Your turn, a hop on screen, the computer thinking, or the game over. */
type Phase = 'player' | 'moving' | 'thinking' | 'over';
type Outcome = 'won' | 'lost' | 'draw';

interface Snapshot {
  readonly board: number[];
  readonly quiet: number;
  readonly turns: number;
  readonly last: readonly number[];
}

interface Press {
  readonly pointerId: number;
  readonly s: number;
  readonly x: number;
  readonly y: number;
  /** Pressed on a disc it picked up (so moving the finger drags it). */
  readonly grab: boolean;
  dragging: boolean;
}

const START = 12;
const LEVELS = CHECKERS_LEVELS.length;
const uniq = (xs: readonly number[]): number[] => [...new Set(xs)];

/**
 * Workshop → Checkers against the computer. Owns its scene, UI and input; the computer thinks in
 * a worker (core/checkers.ts holds the rules). Tap a disc, then a dot, or drag it there.
 */
export class CheckersMode {
  readonly view: CheckersScene;
  readonly picker: LevelPicker;
  readonly bar: GameBar;
  readonly tools: GameTools;
  readonly win: WinCard;
  active = false;
  private progress: KProgress = { stars: [], best: [] };
  private n = 1;
  private board: number[] = initialBoard();
  private history: Snapshot[] = [];
  private phase: Phase = 'over';
  /** Your legal moves this turn. */
  private legal: CMove[] = [];
  /** Selected disc (where it stands now), and the move in progress (origin + squares landed on). */
  private sel = -1;
  private origin = -1;
  private taken: number[] = [];
  /** The computer's last move (from, to), shown faintly. */
  private last: readonly number[] = [];
  private hintTo = -1;
  /** Plies since a capture or a man moved (draw at DRAW_PLIES). */
  private quiet = 0;
  /** Your moves this game. */
  private turns = 0;
  private helped = false;
  private press: Press | null = null;
  private liftNow = 0;
  private thinkT = 0;
  private reply: CMove | null | undefined;
  private askId = 0;
  private worker: Worker | null = null;
  /** The question the worker is on (asked again on the main thread if the worker dies). */
  private pending: CheckersAsk | null = null;
  private outcome: Outcome = 'won';
  private resultT = -1;
  private solvedStars = 0;
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
      onActive(on: boolean): void;
      onPickerClose(): void;
    },
  ) {
    this.view = new CheckersScene(d.tex);
    this.picker = new LevelPicker('checkers', t('workshop.checkers'), t('checkers.goal'), LEVELS, {
      onPlay: (n) => this.start(n),
      onClose: () => {
        this.picker.hide();
        d.onPickerClose();
      },
    });
    this.bar = new GameBar({ onBack: () => this.leave(true), onRestart: () => this.start(this.n) });
    this.tools = new GameTools(
      { onUndo: () => this.undo(), onHint: () => this.hint() },
      t('checkers.helpNote'),
    );
    this.win = new WinCard({
      onNext: () => this.start(Math.min(this.n + 1, LEVELS)),
      onReplay: () => this.start(this.n),
      onLevels: () => this.leave(true),
    });
    const c = d.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e, true));
    c.addEventListener('pointercancel', (e) => this.onUp(e, false));
    void d.storage.get(CHECKERS.storageKey).then((raw) => {
      this.progress = parseKProgress(raw);
      this.picker.update(this.progress.stars);
    });
  }

  get nodes(): HTMLElement[] {
    return [this.bar.node, this.tools.node, this.picker.node, this.win.node];
  }

  get starCount(): [number, number] {
    return [this.progress.stars.reduce((a, b) => a + b, 0), LEVELS * 3];
  }

  openPicker(): void {
    this.picker.update(this.progress.stars);
    this.picker.show();
  }

  start(n: number): void {
    if (n < 1 || n > LEVELS) return;
    this.n = n;
    this.board = initialBoard();
    this.history = [];
    this.quiet = 0;
    this.turns = 0;
    this.helped = false;
    this.last = [];
    this.resultT = -1;
    this.askId++;
    this.picker.hide();
    this.win.hide();
    this.view.sync(this.board);
    this.bar.show(true);
    this.tools.show(true);
    if (!this.active) {
      this.active = true;
      this.d.onActive(true);
    }
    this.beginTurn();
    this.resize(this.width, this.height, this.safeBottom);
    this.d.sound.tick();
  }

  leave(toLevels: boolean): void {
    this.askId++;
    this.win.hide();
    this.bar.show(false);
    this.tools.show(false);
    this.press = null;
    this.phase = 'over';
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

  update(dt: number): void {
    if (!this.active) return;
    this.view.update(dt);
    // the selected disc floats a little (unless it's under the finger)
    if (this.sel >= 0 && this.phase === 'player' && !this.press?.dragging) {
      this.liftNow += (CHECKERS.lift - this.liftNow) * Math.min(1, dt * CHECKERS.liftRate);
      this.view.place(this.sel, this.liftNow);
    }
    if (this.phase === 'thinking') {
      this.thinkT += dt;
      if (this.reply !== undefined && this.thinkT >= CHECKERS.thinkMin) this.playReply();
    }
    if (this.resultT >= 0) {
      this.resultT += dt;
      if (this.resultT >= CHECKERS.resultDelay && !this.win.open) this.showResult();
    }
  }

  // ---------- turns ----------

  private beginTurn(): void {
    this.legal = legalMoves(this.board, 1);
    this.sel = -1;
    this.origin = -1;
    this.taken = [];
    this.hintTo = -1;
    if (!this.legal.length) {
      this.end('lost');
      return;
    }
    this.phase = 'player';
    this.refresh();
  }

  /** Moves still possible for the jump in progress (all moves when none is). */
  private live(): CMove[] {
    if (this.origin < 0) return this.legal;
    return this.legal.filter((m) => m.from === this.origin && this.taken.every((s, i) => m.path[i] === s));
  }

  /** Squares the selected disc may go to next. */
  private targets(): number[] {
    if (this.sel < 0) return [];
    const k = this.taken.length;
    const moves = k ? this.live() : this.legal.filter((m) => m.from === this.sel);
    return uniq(moves.map((m) => m.path[k] ?? -1).filter((s) => s >= 0));
  }

  private forced(): boolean {
    return (this.legal[0]?.caps.length ?? 0) > 0;
  }

  /** One hop of your move (a step, or one jump of a chain). */
  private stepTo(to: number, dropped: boolean): void {
    const from = this.sel;
    if (this.origin < 0) this.origin = from;
    this.taken.push(to);
    const left = this.live();
    const done = left.find((m) => m.path.length === this.taken.length);
    const jump = Math.abs(rowOf(to) - rowOf(from)) === 2;
    const cap = jump ? ((rowOf(from) + rowOf(to)) / 2) * SIZE + (colOf(from) + colOf(to)) / 2 : -1;
    const step: CStep = { from, to, cap, crown: done?.crown ?? false };
    this.phase = 'moving';
    this.hintTo = -1;
    this.liftNow = 0;
    this.refresh();
    const after = () => {
      if (done) this.finishMove(done);
      else {
        // the chain goes on with the same disc
        this.sel = to;
        this.phase = 'player';
        this.d.haptics.pulse(HAPTICS.snap);
        this.refresh();
      }
    };
    if (dropped) {
      this.view.drop(step);
      this.landed(step);
      after();
    } else this.view.animate([step], (s) => this.landed(s), after);
  }

  private landed(s: CStep): void {
    if (s.cap >= 0) {
      this.d.sound.clear(1, 0);
      this.d.haptics.pulse(HAPTICS.clear);
    } else {
      this.d.sound.place();
      this.d.haptics.pulse(HAPTICS.place);
    }
  }

  private finishMove(m: CMove): void {
    this.history.push({ board: this.board, quiet: this.quiet, turns: this.turns, last: this.last });
    this.quiet = isProgress(this.board, m) ? 0 : this.quiet + 1;
    this.board = applyMove(this.board, m);
    this.turns++;
    this.sel = -1;
    this.origin = -1;
    this.taken = [];
    this.last = [];
    if (!legalMoves(this.board, -1).length) {
      this.end('won');
      return;
    }
    if (this.quiet >= DRAW_PLIES) {
      this.end('draw');
      return;
    }
    this.phase = 'thinking';
    this.thinkT = 0;
    this.reply = undefined;
    this.ask({ id: ++this.askId, kind: 'move', board: this.board, side: -1, opp: opponentFor(this.n) });
    this.refresh();
  }

  private playReply(): void {
    const m = this.reply;
    this.reply = undefined;
    if (!m) {
      this.end('won');
      return;
    }
    this.phase = 'moving';
    const steps: CStep[] = m.path.map((to, i) => ({
      from: i === 0 ? m.from : (m.path[i - 1] ?? m.from),
      to,
      cap: m.caps[i] ?? -1,
      crown: m.crown && i === m.path.length - 1,
    }));
    this.refresh();
    this.view.animate(
      steps,
      (s) => this.landed(s),
      () => {
        this.quiet = isProgress(this.board, m) ? 0 : this.quiet + 1;
        this.board = applyMove(this.board, m);
        this.last = [m.from, m.path[m.path.length - 1] ?? m.from];
        if (this.quiet >= DRAW_PLIES) this.end('draw');
        else this.beginTurn();
      },
    );
  }

  private end(o: Outcome): void {
    this.phase = 'over';
    this.outcome = o;
    this.resultT = 0;
    this.sel = -1;
    this.tools.show(false);
    this.refresh();
    if (o === 'won') {
      // save now, not when the card shows: leaving before it must not lose the stars
      this.solvedStars = cStars(START - count(this.board, 1), this.helped);
      this.progress = kRecord(this.progress, this.n, this.solvedStars, this.helped ? null : this.turns);
      void this.d.storage.set(CHECKERS.storageKey, JSON.stringify(this.progress));
      this.d.sound.boardClear();
      this.d.haptics.pulse(HAPTICS.boardClear);
    } else {
      this.d.sound.gameOver();
      this.d.haptics.pulse(HAPTICS.nope);
    }
    this.resize(this.width, this.height, this.safeBottom);
  }

  private showResult(): void {
    const left = count(this.board, 1);
    const taken = START - count(this.board, -1);
    const stats = [
      { label: t('workshop.statLeft'), value: num(left) },
      { label: t('workshop.statTaken'), value: num(taken) },
      { label: t('workshop.statMoves'), value: num(this.turns) },
    ];
    if (this.outcome === 'won')
      this.win.present(
        this.solvedStars,
        stats,
        this.n < LEVELS,
        this.helped ? t('checkers.helped') : '',
        t('checkers.won'),
      );
    else
      this.win.present(
        0,
        stats,
        false,
        this.outcome === 'draw' ? t('checkers.drawNote') : t('checkers.lostNote'),
        this.outcome === 'draw' ? t('checkers.draw') : t('checkers.lost'),
      );
  }

  // ---------- the computer (worker) ----------

  private ask(a: CheckersAsk): void {
    const w = this.ensureWorker();
    if (w) {
      this.pending = a;
      w.postMessage(a);
      return;
    }
    this.askHere(a);
  }

  /** No worker: think on the main thread, after this frame. */
  private askHere(a: CheckersAsk): void {
    window.setTimeout(() => this.onReply(answer(a)), 0);
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    try {
      this.worker = new Worker(new URL('./checkersWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<CheckersReply>) => this.onReply(e.data);
      this.worker.onerror = () => {
        this.worker?.terminate();
        this.worker = null;
        const a = this.pending;
        this.pending = null;
        if (a) this.askHere(a);
      };
    } catch {
      this.worker = null;
    }
    return this.worker;
  }

  private onReply(r: CheckersReply): void {
    if (r.id === this.pending?.id) this.pending = null;
    if (r.id !== this.askId || !this.active) return;
    if (this.phase === 'thinking') {
      this.reply = r.move;
      return;
    }
    // a hint: pick up its disc and pulse the square it goes to
    const m = r.move;
    if (this.phase !== 'player' || !m || this.origin >= 0) return;
    this.sel = m.from;
    this.hintTo = m.path[0] ?? -1;
    this.liftNow = 0;
    this.refresh();
  }

  // ---------- tools ----------

  private canUndo(): boolean {
    return (
      this.history.length > 0 && (this.phase === 'player' || this.phase === 'thinking') && !this.view.busy
    );
  }

  private undo(): void {
    if (!this.canUndo()) return;
    const prev = this.history.pop();
    if (!prev) return;
    this.askId++; // drop a reply that's still on its way
    this.board = prev.board;
    this.quiet = prev.quiet;
    this.turns = prev.turns;
    this.last = prev.last;
    this.helped = true;
    this.view.sync(this.board);
    this.d.sound.returnPiece();
    this.beginTurn();
  }

  private hint(): void {
    if (this.phase !== 'player' || this.view.busy) return;
    this.helped = true;
    if (this.origin >= 0) {
      // mid-chain the next jump is all that's left to choose
      this.hintTo = this.targets()[0] ?? -1;
      this.refresh();
      return;
    }
    this.ask({ id: ++this.askId, kind: 'hint', board: this.board, side: 1 });
    this.refresh();
  }

  // ---------- screen ----------

  private refresh(): void {
    const mine = this.phase === 'player';
    this.view.mark({
      dots: mine ? this.targets() : [],
      sel: mine ? this.sel : -1,
      must: mine && this.sel < 0 && this.forced() ? uniq(this.legal.map((m) => m.from)) : [],
      last: mine || this.phase === 'thinking' ? this.last : [],
      hint: mine ? this.hintTo : -1,
    });
    const big =
      this.phase === 'thinking'
        ? t('checkers.thinking')
        : this.phase === 'over'
          ? this.outcome === 'won'
            ? t('checkers.won')
            : this.outcome === 'draw'
              ? t('checkers.draw')
              : t('checkers.lost')
          : this.origin >= 0
            ? t('checkers.jumpAgain')
            : this.forced()
              ? t('checkers.mustJump')
              : t('checkers.yourMove');
    this.bar.set(
      t('journey.level', { n: this.n }),
      big,
      t('checkers.score', { a: num(count(this.board, 1)), b: num(count(this.board, -1)) }),
    );
    this.tools.set(this.canUndo(), this.helped);
  }

  // ---------- input ----------

  private onDown(e: PointerEvent): void {
    if (!this.active || this.press || this.phase !== 'player' || this.view.busy || this.win.open) return;
    const s = this.view.squareAt(e.clientX, e.clientY, this.width, this.height);
    if (s < 0) return;
    e.preventDefault();
    const v = this.board[s] ?? 0;
    const own = v > 0 && this.origin < 0;
    let grab = false;
    if (own && s !== this.sel) {
      if (this.legal.some((m) => m.from === s)) {
        if (this.sel >= 0) this.view.place(this.sel, 0);
        this.sel = s;
        this.hintTo = -1;
        this.liftNow = 0;
        grab = true;
        this.d.sound.pickup();
        this.d.haptics.pulse(HAPTICS.pickup);
        this.refresh();
      } else {
        // this disc can't move (another must jump, or it's blocked)
        this.d.sound.nope();
        this.d.haptics.pulse(HAPTICS.nope);
      }
    } else if (s === this.sel) grab = true;
    try {
      this.d.canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone
    }
    this.press = { pointerId: e.pointerId, s, x: e.clientX, y: e.clientY, grab, dragging: false };
  }

  private onMove(e: PointerEvent): void {
    const p = this.press;
    if (!p || e.pointerId !== p.pointerId || !p.grab || this.phase !== 'player') return;
    if (!p.dragging && Math.hypot(e.clientX - p.x, e.clientY - p.y) < CHECKERS.tapPx) return;
    p.dragging = true;
    const at = this.view.pointSquares(e.clientX, e.clientY, this.width, this.height);
    if (at) this.view.hover(this.sel, at.col, at.row, CHECKERS.lift * 1.6);
  }

  private onUp(e: PointerEvent, commit: boolean): void {
    const p = this.press;
    if (!p || e.pointerId !== p.pointerId) return;
    this.press = null;
    if (this.phase !== 'player') return;
    const s = commit ? this.view.squareAt(e.clientX, e.clientY, this.width, this.height) : -1;
    const ok = s >= 0 && this.targets().includes(s);
    if (p.dragging) {
      if (ok) this.stepTo(s, true);
      else {
        this.view.place(this.sel, this.liftNow);
        if (s >= 0 && s !== this.sel) this.d.sound.nope();
      }
      return;
    }
    // a tap: on a dot moves there; on empty board lets go of the disc
    if (ok && s === p.s) this.stepTo(s, false);
    else if (!p.grab && this.origin < 0 && this.sel >= 0 && (this.board[s] ?? 0) <= 0) {
      this.view.place(this.sel, 0);
      this.sel = -1;
      this.hintTo = -1;
      this.refresh();
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.view.dispose();
  }
}
