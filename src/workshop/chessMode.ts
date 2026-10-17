import { CHECKERS, CHESS, HAPTICS } from '../config';
import {
  captured,
  CHESS_LEVELS,
  chessOpponent,
  chessStars,
  F_CAPTURE,
  F_CASTLE,
  F_EP,
  from64,
  inCheck,
  KNIGHT,
  legalMoves,
  makeMove,
  mFlags,
  mFrom,
  mPromo,
  mTo,
  newGame,
  QUEEN,
  status,
  to64,
  unmakeMove,
} from '../core/chess';
import type { Pos, Status } from '../core/chess';
import { kRecord, parseKProgress } from '../core/klotski';
import type { KProgress } from '../core/klotski';
import type { Haptics } from '../platform/haptics';
import type { KeyValueStore } from '../platform/storage';
import { glyphUrl } from '../render/chessGlyphs';
import { ChessScene } from '../render/chessScene';
import type { ChessAnim } from '../render/chessScene';
import type { Textures } from '../render/textures';
import { num, t } from '../i18n';
import type { Key } from '../i18n';
import { Overlay } from '../ui/dialogs';
import { el } from '../ui/dom';
import { GameBar, GameTools, LevelPicker, WinCard } from '../ui/workshop';
import { ChessBrain } from './chessAsk';
import type { ChessAsk, ChessReply } from './chessAsk';

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

/** Your turn, choosing a promotion, a move on screen, the computer thinking, or the game over. */
type Phase = 'player' | 'promo' | 'moving' | 'thinking' | 'over';

interface Press {
  readonly pointerId: number;
  readonly s: number;
  readonly x: number;
  readonly y: number;
  readonly grab: boolean;
  dragging: boolean;
}

const LEVELS = CHESS_LEVELS.length;
const PROMOS = [QUEEN, 4, 3, KNIGHT] as const;

/** "Promote to": four pieces in a row. */
class PromoPicker extends Overlay {
  private onPick: (type: number) => void = () => undefined;

  constructor() {
    super('chess-promo dialog-layer', 'promoTitle');
    const row = el('div', { class: 'promo-row' });
    for (const type of PROMOS) {
      const b = el('button', { class: 'promo-btn', 'aria-label': t(`chess.piece${type}` as Key) });
      b.append(el('img', { src: glyphUrl(type, '#3a1a08'), alt: '' }));
      b.addEventListener('click', () => this.onPick(type));
      row.append(b);
    }
    this.card.append(el('h2', { id: 'promoTitle' }, [t('chess.promote')]), row);
  }

  ask(onPick: (type: number) => void): void {
    this.onPick = (type) => {
      this.hide();
      onPick(type);
    };
    this.show();
  }
}

/**
 * Workshop → Chess against the computer. Owns its scene, UI and input; the computer thinks in a
 * worker (core/chess.ts holds the rules and the engine). Tap a piece, then a dot, or drag it.
 */
export class ChessMode {
  readonly view: ChessScene;
  readonly picker: LevelPicker;
  readonly bar: GameBar;
  readonly tools: GameTools;
  readonly win: WinCard;
  private readonly promo = new PromoPicker();
  active = false;
  private progress: KProgress = { stars: [], best: [] };
  private n = 1;
  private pos: Pos = newGame();
  /** Every move of the game so far (the worker replays them). */
  private moves: number[] = [];
  private phase: Phase = 'over';
  private legal: number[] = [];
  /** Selected piece's square (0..63), or −1. */
  private sel = -1;
  private hintTo = -1;
  /** The last move (from, to), lit faintly. */
  private last: number[] = [];
  private helps = 0;
  private press: Press | null = null;
  private liftNow = 0;
  private thinkT = 0;
  private reply: number | undefined;
  private askId = 0;
  private worker: Worker | null = null;
  private brain: ChessBrain | null = null;
  private pending: ChessAsk | null = null;
  private result: Status = 'play';
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
    this.view = new ChessScene(d.tex);
    this.picker = new LevelPicker('chess', t('workshop.chess'), t('chess.goal'), LEVELS, {
      onPlay: (n) => this.start(n),
      onClose: () => {
        this.picker.hide();
        d.onPickerClose();
      },
    });
    this.bar = new GameBar({ onBack: () => this.leave(true), onRestart: () => this.start(this.n) });
    this.tools = new GameTools({ onUndo: () => this.undo(), onHint: () => this.hint() }, t('chess.helpNote'));
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
    void d.storage.get(CHESS.storageKey).then((raw) => {
      this.progress = parseKProgress(raw);
      this.picker.update(this.progress.stars);
    });
  }

  get nodes(): HTMLElement[] {
    return [this.bar.node, this.tools.node, this.picker.node, this.win.node, this.promo.node];
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
    this.pos = newGame();
    this.moves = [];
    this.helps = 0;
    this.last = [];
    this.resultT = -1;
    this.result = 'play';
    this.askId++;
    this.picker.hide();
    this.win.hide();
    this.promo.hide();
    this.view.sync(this.board64());
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
    this.promo.hide();
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

  private board64(): number[] {
    const out = new Array<number>(64).fill(0);
    for (let i = 0; i < 64; i++) out[i] = this.pos.b[from64(i)] ?? 0;
    return out;
  }

  private beginTurn(): void {
    this.sel = -1;
    this.hintTo = -1;
    this.legal = legalMoves(this.pos);
    this.phase = 'player';
    this.refresh();
  }

  /** Legal moves of the selected piece. */
  private selMoves(): number[] {
    if (this.sel < 0) return [];
    const from = from64(this.sel);
    return this.legal.filter((m) => mFrom(m) === from);
  }

  private anim(m: number): ChessAnim {
    const from = mFrom(m);
    const to = mTo(m);
    const f = mFlags(m);
    const side = this.pos.side;
    const castle = (f & F_CASTLE) !== 0;
    const short = to > from;
    return {
      from: to64(from),
      to: to64(to),
      cap: f & F_EP ? to64(to + (side === 1 ? 16 : -16)) : f & F_CAPTURE ? to64(to) : -1,
      rookFrom: castle ? to64(short ? from + 3 : from - 4) : -1,
      rookTo: castle ? to64(short ? from + 1 : from - 1) : -1,
      promo: mPromo(m),
      hop: Math.abs(this.pos.b[from] ?? 0) === KNIGHT,
    };
  }

  /** Your move to square `to` (asks which piece when a pawn promotes). */
  private moveTo(to: number, dropped: boolean): void {
    const options = this.selMoves().filter((m) => to64(mTo(m)) === to);
    const first = options[0];
    if (first === undefined) return;
    if (options.length > 1) {
      this.phase = 'promo';
      this.refresh();
      this.promo.ask((type) => {
        const m = options.find((x) => mPromo(x) === type) ?? first;
        this.play(m, dropped);
      });
      return;
    }
    this.play(first, dropped);
  }

  private play(m: number, dropped: boolean): void {
    const a = this.anim(m);
    this.phase = 'moving';
    this.sel = -1;
    this.hintTo = -1;
    this.liftNow = 0;
    this.refresh();
    const after = () => {
      makeMove(this.pos, m);
      this.moves.push(m);
      this.last = [a.from, a.to];
      this.landed(a);
      const s = status(this.pos);
      if (s !== 'play') {
        this.end(s);
        return;
      }
      this.phase = 'thinking';
      this.thinkT = 0;
      this.reply = undefined;
      this.ask({ id: ++this.askId, kind: 'move', moves: [...this.moves], opp: chessOpponent(this.n) });
      this.refresh();
    };
    if (dropped) {
      this.view.drop(a);
      after();
    } else this.view.animate(a, after);
  }

  private playReply(): void {
    const m = this.reply;
    this.reply = undefined;
    if (m === undefined || !this.legal.length) return;
    // the reply was worked out for this exact position; check it anyway
    if (!legalMoves(this.pos).includes(m)) {
      this.ask({ id: ++this.askId, kind: 'move', moves: [...this.moves], opp: chessOpponent(this.n) });
      return;
    }
    const a = this.anim(m);
    this.phase = 'moving';
    this.refresh();
    this.view.animate(a, () => {
      makeMove(this.pos, m);
      this.moves.push(m);
      this.last = [a.from, a.to];
      this.landed(a);
      const s = status(this.pos);
      if (s !== 'play') this.end(s);
      else this.beginTurn();
    });
  }

  private landed(a: ChessAnim): void {
    if (inCheck(this.pos)) {
      this.d.sound.nope();
      this.d.haptics.pulse(HAPTICS.nope);
    } else if (a.cap >= 0) {
      this.d.sound.clear(1, 0);
      this.d.haptics.pulse(HAPTICS.clear);
    } else {
      this.d.sound.place();
      this.d.haptics.pulse(HAPTICS.place);
    }
  }

  private end(s: Status): void {
    this.result = s;
    this.phase = 'over';
    this.resultT = 0;
    this.sel = -1;
    this.tools.show(false);
    // checkmate with the computer to move = you won
    const won = s === 'mate' && this.pos.side === -1;
    if (won) {
      this.solvedStars = chessStars(this.helps);
      this.progress = kRecord(this.progress, this.n, this.solvedStars, this.helps ? null : this.yourMoves());
      void this.d.storage.set(CHESS.storageKey, JSON.stringify(this.progress));
      this.d.sound.boardClear();
      this.d.haptics.pulse(HAPTICS.boardClear);
    } else {
      this.d.sound.gameOver();
      this.d.haptics.pulse(HAPTICS.nope);
    }
    this.refresh();
    this.resize(this.width, this.height, this.safeBottom);
  }

  private yourMoves(): number {
    return Math.ceil(this.moves.length / 2);
  }

  private get won(): boolean {
    return this.result === 'mate' && this.pos.side === -1;
  }

  private showResult(): void {
    const stats = [
      { label: t('workshop.statMoves'), value: num(this.yourMoves()) },
      { label: t('workshop.statTaken'), value: num(captured(this.pos, 1)) },
      { label: t('workshop.statHelp'), value: num(this.helps) },
    ];
    if (this.won) {
      this.win.present(
        this.solvedStars,
        stats,
        this.n < LEVELS,
        this.helps ? t('chess.helped') : '',
        t('chess.won'),
      );
      return;
    }
    const draw = this.result !== 'mate';
    const why: Record<Status, Key> = {
      play: 'chess.draw',
      mate: 'chess.lostNote',
      stalemate: 'chess.stalemate',
      repetition: 'chess.repetition',
      fifty: 'chess.fifty',
      material: 'chess.material',
    };
    this.win.present(0, stats, false, t(why[this.result]), draw ? t('chess.draw') : t('chess.lost'));
  }

  // ---------- the computer (worker) ----------

  private ask(a: ChessAsk): void {
    const w = this.ensureWorker();
    if (w) {
      this.pending = a;
      w.postMessage(a);
    } else this.askHere(a);
  }

  /** No worker: think on the main thread, after this frame. */
  private askHere(a: ChessAsk): void {
    window.setTimeout(() => {
      this.brain ??= new ChessBrain();
      this.onReply(this.brain.answer(a));
    }, 0);
  }

  private ensureWorker(): Worker | null {
    if (this.worker) return this.worker;
    try {
      this.worker = new Worker(new URL('./chessWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = (e: MessageEvent<ChessReply>) => this.onReply(e.data);
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

  private onReply(r: ChessReply): void {
    if (r.id === this.pending?.id) this.pending = null;
    if (r.id !== this.askId || !this.active) return;
    if (this.phase === 'thinking') {
      this.reply = r.move;
      return;
    }
    // a hint: pick up its piece and pulse the square it goes to
    if (this.phase !== 'player' || !r.move) return;
    if (this.sel >= 0) this.view.place(this.sel, 0);
    this.sel = to64(mFrom(r.move));
    this.hintTo = to64(mTo(r.move));
    this.liftNow = 0;
    this.refresh();
  }

  // ---------- tools ----------

  private canUndo(): boolean {
    return this.moves.length > 0 && (this.phase === 'player' || this.phase === 'thinking') && !this.view.busy;
  }

  private undo(): void {
    if (!this.canUndo()) return;
    this.askId++; // drop a reply that's still on its way
    // take back the computer's reply too, so it's your move again
    const back = this.phase === 'thinking' || this.moves.length === 1 ? 1 : 2;
    for (let i = 0; i < back; i++) {
      unmakeMove(this.pos);
      this.moves.pop();
    }
    this.helps++;
    const prev = this.pos.undo[this.pos.undo.length - 1];
    this.last = prev ? [to64(mFrom(prev.m)), to64(mTo(prev.m))] : [];
    this.view.sync(this.board64());
    this.d.sound.returnPiece();
    this.beginTurn();
  }

  private hint(): void {
    if (this.phase !== 'player' || this.view.busy) return;
    this.helps++;
    this.ask({ id: ++this.askId, kind: 'hint', moves: [...this.moves] });
    this.refresh();
  }

  // ---------- screen ----------

  private refresh(): void {
    const mine = this.phase === 'player';
    const sel = this.selMoves();
    const targets = mine ? [...new Set(sel.map((m) => to64(mTo(m))))] : [];
    const takes = new Set(sel.filter((m) => mFlags(m) & F_CAPTURE).map((m) => to64(mTo(m))));
    const check = inCheck(this.pos) ? to64(this.pos.king(this.pos.side)) : -1;
    this.view.mark({
      dots: targets.filter((s) => !takes.has(s)),
      rings: targets.filter((s) => takes.has(s)),
      sel: mine ? this.sel : -1,
      last: this.last,
      check,
      hint: mine ? this.hintTo : -1,
    });
    const big =
      this.phase === 'thinking' || this.phase === 'moving'
        ? this.pos.side === -1
          ? t('checkers.thinking')
          : t('checkers.yourMove')
        : this.phase === 'over'
          ? this.won
            ? t('chess.won')
            : this.result === 'mate'
              ? t('chess.lost')
              : t('chess.draw')
          : check >= 0
            ? t('chess.check')
            : t('checkers.yourMove');
    const adv = captured(this.pos, 1) - captured(this.pos, -1);
    const name = t(`chess.opp${Math.min(5, Math.ceil(this.n / 3))}` as Key);
    this.bar.set(
      t('journey.level', { n: this.n }),
      big,
      adv ? t('chess.vs', { name, adv: `${adv > 0 ? '+' : '−'}${num(Math.abs(adv))}` }) : name,
    );
    this.tools.set(this.canUndo(), this.helps > 0);
  }

  // ---------- input ----------

  private onDown(e: PointerEvent): void {
    if (!this.active || this.press || this.phase !== 'player' || this.view.busy || this.win.open) return;
    const s = this.view.squareAt(e.clientX, e.clientY, this.width, this.height);
    if (s < 0) return;
    e.preventDefault();
    const v = this.pos.b[from64(s)] ?? 0;
    let grab = false;
    if (v > 0 && s !== this.sel) {
      if (this.legal.some((m) => to64(mFrom(m)) === s)) {
        if (this.sel >= 0) this.view.place(this.sel, 0);
        this.sel = s;
        this.hintTo = -1;
        this.liftNow = 0;
        grab = true;
        this.d.sound.pickup();
        this.d.haptics.pulse(HAPTICS.pickup);
        this.refresh();
      } else {
        // this piece has no legal move (pinned, blocked, or the king is in check)
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
    const ok = s >= 0 && this.selMoves().some((m) => to64(mTo(m)) === s);
    if (p.dragging) {
      if (ok) this.moveTo(s, true);
      else {
        this.view.place(this.sel, this.liftNow);
        if (s >= 0 && s !== this.sel) this.d.sound.nope();
      }
      return;
    }
    if (ok && s === p.s) this.moveTo(s, false);
    else if (!p.grab && this.sel >= 0 && (this.pos.b[from64(s)] ?? 0) <= 0) {
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
