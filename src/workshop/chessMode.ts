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
  fromFen,
  inCheck,
  KNIGHT,
  legalMoves,
  makeMove,
  MATE,
  mFlags,
  mFrom,
  mPromo,
  mTo,
  newGame,
  QUEEN,
  START_FEN,
  status,
  to64,
  unmakeMove,
} from '../core/chess';
import type { ChessOpponent, Pos, Status } from '../core/chess';
import {
  collectPar,
  goalHint,
  lessonStars,
  LESSONS,
  passTurn,
  squareName,
  stepAllows,
  stepDone,
  threatened,
} from '../core/chessSchool';
import type { Lesson, Reason, Step } from '../core/chessSchool';
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
import type { ChessAsk, ChessQuestion, ChessReply } from './chessAsk';

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

const PROMOS = [QUEEN, 4, 3, KNIGHT] as const;
/** The lessons' opponent: full strength, quick. */
const TEACHER: ChessOpponent = { ms: 700, depth: 64, noise: 0, blunder: 0 };
const COACH_KEY = 'grain_chess_coach';

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

const pieceName = (type: number): string => t(`coach.p${type}` as Key);
const capitalise = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** One sentence for why a move was good or bad. */
function reasonText(r: Reason): string {
  switch (r.kind) {
    case 'allowsMate':
      return t('coach.r.allowsMate');
    case 'missedMate':
      return t('coach.r.missedMate');
    case 'hangs':
      return capitalise(t('coach.r.hangs', { piece: pieceName(r.piece), sq: squareName(r.square) }));
    case 'missedWin':
      return t('coach.r.missedWin', { piece: pieceName(r.piece), sq: squareName(r.square) });
    case 'foundWin':
      return t('coach.r.foundWin', { piece: pieceName(r.piece) });
    default:
      return t('coach.r.none');
  }
}

/**
 * Workshop → Chess. Two ways in: games against the computer (with a coach that explains your
 * mistakes and marks pieces in danger), and the Chess school (`school`), lessons from how the
 * pieces move to checkmate. The computer thinks in a worker; rules and engine live in core/.
 */
export class ChessMode {
  readonly view: ChessScene;
  readonly picker: LevelPicker;
  readonly bar: GameBar;
  readonly tools: GameTools;
  readonly win: WinCard;
  private readonly promo = new PromoPicker();
  private readonly coachBtn = el('button', { class: 'k-switch', 'aria-pressed': 'true' });
  active = false;
  private progress: KProgress = { stars: [], best: [] };
  private n = 1;
  private pos: Pos = newGame();
  /** The position the moves start from (lessons start mid-game). */
  private startFen = START_FEN;
  /** Every move since `startFen` (the worker replays them). */
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
  /** Id of the move / hint question in flight (bumped to drop stale answers). */
  private askId = 0;
  /** Id of the review in flight, and the move count it was asked for. */
  private reviewId = 0;
  private reviewAt = -1;
  private worker: Worker | null = null;
  private brain: ChessBrain | null = null;
  private readonly pending = new Map<number, ChessAsk>();
  private nextId = 0;
  private result: Status = 'play';
  private resultT = -1;
  private solvedStars = 0;
  private coachOn = true;
  // ---------- school ----------
  private lesson: Lesson | null = null;
  private stepIdx = 0;
  private mistakes = 0;
  private stepMistakes = 0;
  private stepMoves = 0;
  private stepPar = 0;
  /** Seconds since the step was done (−1 = not yet): the next step follows after a beat. */
  private advanceT = -1;
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
    /** Lessons instead of games. */
    readonly school = false,
  ) {
    this.view = new ChessScene(d.tex);
    const count = school ? LESSONS.length : CHESS_LEVELS.length;
    this.picker = new LevelPicker(
      school ? 'school' : 'chess',
      school ? t('workshop.school') : t('workshop.chess'),
      school ? t('school.lead') : t('chess.goal'),
      count,
      {
        onPlay: (n) => this.start(n),
        onClose: () => {
          this.picker.hide();
          d.onPickerClose();
        },
      },
      school
        ? { titles: LESSONS.map((l) => t(`school.${l.id}` as Key)), allOpen: true }
        : { foot: this.coachBtn },
    );
    this.bar = new GameBar({
      onBack: () => this.leave(true),
      onRestart: () => (this.lesson ? this.loadStep(this.stepIdx) : this.start(this.n)),
    });
    this.tools = new GameTools(
      school ? { onHint: () => this.hint() } : { onUndo: () => this.undo(), onHint: () => this.hint() },
      school ? t('school.tryHint') : t('chess.helpNote'),
    );
    this.win = new WinCard({
      onNext: () => this.start(Math.min(this.n + 1, count)),
      onReplay: () => this.start(this.n),
      onLevels: () => this.leave(true),
    });
    this.coachBtn.addEventListener('click', () => {
      this.coachOn = !this.coachOn;
      this.syncCoachBtn();
      void d.storage.set(COACH_KEY, this.coachOn ? '1' : '0');
    });
    this.syncCoachBtn();
    const c = d.canvas;
    c.addEventListener('pointerdown', (e) => this.onDown(e));
    c.addEventListener('pointermove', (e) => this.onMove(e));
    c.addEventListener('pointerup', (e) => this.onUp(e, true));
    c.addEventListener('pointercancel', (e) => this.onUp(e, false));
    void d.storage.get(this.storageKey).then((raw) => {
      this.progress = parseKProgress(raw);
      this.picker.update(this.progress.stars);
    });
    if (!school)
      void d.storage.get(COACH_KEY).then((raw) => {
        this.coachOn = raw !== '0';
        this.syncCoachBtn();
      });
  }

  private get storageKey(): string {
    return this.school ? CHESS.schoolKey : CHESS.storageKey;
  }

  private get count(): number {
    return this.school ? LESSONS.length : CHESS_LEVELS.length;
  }

  private syncCoachBtn(): void {
    this.coachBtn.textContent = t(this.coachOn ? 'coach.on' : 'coach.off');
    this.coachBtn.setAttribute('aria-pressed', String(this.coachOn));
  }

  get nodes(): HTMLElement[] {
    return [this.bar.node, this.tools.node, this.picker.node, this.win.node, this.promo.node];
  }

  get starCount(): [number, number] {
    return [this.progress.stars.reduce((a, b) => a + b, 0), this.count * 3];
  }

  openPicker(): void {
    this.picker.update(this.progress.stars);
    this.picker.show();
  }

  start(n: number): void {
    if (n < 1 || n > this.count) return;
    this.n = n;
    this.helps = 0;
    this.mistakes = 0;
    this.picker.hide();
    this.win.hide();
    this.promo.hide();
    this.bar.show(true);
    this.tools.show(true);
    if (!this.active) {
      this.active = true;
      this.d.onActive(true);
    }
    if (this.school) {
      this.lesson = LESSONS[n - 1] ?? null;
      this.loadStep(0);
    } else {
      this.lesson = null;
      this.reset(START_FEN);
      this.bar.coach('');
      this.beginTurn();
    }
    this.resize(this.width, this.height, this.safeBottom);
    this.d.sound.tick();
  }

  /** A fresh board from `fen`. */
  private reset(fen: string): void {
    this.startFen = fen;
    this.pos = fromFen(fen);
    this.moves = [];
    this.last = [];
    this.resultT = -1;
    this.advanceT = -1;
    this.result = 'play';
    this.askId++;
    this.reviewAt = -1;
    this.promo.hide();
    this.tools.show(true);
    this.view.sync(this.board64());
  }

  leave(toLevels: boolean): void {
    this.askId++;
    this.reviewAt = -1;
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

  /** The coach's line changes the bar's height, so the board refits. */
  private say(
    text: string,
    tone: 'info' | 'good' | 'warn' | 'bad' = 'info',
    action?: { label: string; run(): void },
  ): void {
    this.bar.coach(text, tone, action);
    this.resize(this.width, this.height, this.safeBottom);
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
    if (this.advanceT >= 0) {
      this.advanceT += dt;
      if (this.advanceT >= CHESS.stepPause) {
        this.advanceT = -1;
        if (this.lesson && this.stepIdx + 1 < this.lesson.steps.length) this.loadStep(this.stepIdx + 1);
        else this.finishLesson();
      }
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
    const step = this.step;
    // lesson steps that ask for a kind of move: anything else bounces straight back
    if (step && !stepAllows(step, this.pos, first)) {
      if (dropped) this.view.place(this.sel, 0);
      this.wrong(
        step.goal === 'check'
          ? 'school.wrongCheck'
          : step.goal === 'castle'
            ? 'school.wrongCastle'
            : 'school.wrongMove',
      );
      return;
    }
    if (options.length > 1) {
      this.phase = 'promo';
      this.refresh();
      this.promo.ask((type) => this.play(options.find((x) => mPromo(x) === type) ?? first, dropped));
      return;
    }
    this.play(first, dropped);
  }

  private get step(): Step | null {
    return this.lesson?.steps[this.stepIdx] ?? null;
  }

  private play(m: number, dropped: boolean): void {
    const a = this.anim(m);
    this.phase = 'moving';
    this.sel = -1;
    this.hintTo = -1;
    this.liftNow = 0;
    if (!this.lesson) this.bar.coach('');
    this.refresh();
    const after = () => {
      const before = [...this.moves];
      makeMove(this.pos, m);
      this.moves.push(m);
      this.last = [a.from, a.to];
      this.landed(a);
      if (this.lesson) {
        this.afterLessonMove(m, before);
        return;
      }
      const s = status(this.pos);
      if (s !== 'play') {
        this.end(s);
        return;
      }
      if (this.coachOn) this.askReview(before, m);
      this.think(chessOpponent(this.n));
    };
    if (dropped) {
      this.view.drop(a);
      after();
    } else this.view.animate(a, after);
  }

  /** Hand the move to the computer. */
  private think(opp: ChessOpponent): void {
    this.phase = 'thinking';
    this.thinkT = 0;
    this.reply = undefined;
    this.askId = this.ask({ kind: 'move', fen: this.startFen, moves: [...this.moves], opp });
    this.refresh();
  }

  private playReply(): void {
    const m = this.reply;
    this.reply = undefined;
    if (m === undefined) return;
    if (!m || !legalMoves(this.pos).includes(m)) {
      // no answer (shouldn't happen: the game would be over) or a stale one: ask again
      this.think(this.lesson ? TEACHER : chessOpponent(this.n));
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
      if (this.lesson) {
        if (s !== 'play') this.failStep('school.wrongBest');
        else this.beginTurn();
        return;
      }
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
    this.reviewAt = -1;
    if (this.won) {
      this.solvedStars = chessStars(this.helps);
      this.save(this.solvedStars, this.helps ? null : this.yourMoves());
      this.d.sound.boardClear();
      this.d.haptics.pulse(HAPTICS.boardClear);
    } else {
      this.d.sound.gameOver();
      this.d.haptics.pulse(HAPTICS.nope);
    }
    this.refresh();
    this.resize(this.width, this.height, this.safeBottom);
  }

  /** Save now, not when the card shows: leaving before it must not lose the stars. */
  private save(stars: number, moves: number | null): void {
    this.progress = kRecord(this.progress, this.n, stars, moves);
    void this.d.storage.set(this.storageKey, JSON.stringify(this.progress));
  }

  private yourMoves(): number {
    return Math.ceil(this.moves.length / 2);
  }

  /** Checkmate with the computer to move = you won. */
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
        this.n < this.count,
        this.helps ? t('chess.helped') : '',
        t('chess.won'),
      );
      return;
    }
    const why: Record<Status, Key> = {
      play: 'chess.draw',
      mate: 'chess.lostNote',
      stalemate: 'chess.stalemate',
      repetition: 'chess.repetition',
      fifty: 'chess.fifty',
      material: 'chess.material',
    };
    this.win.present(
      0,
      stats,
      false,
      t(why[this.result]),
      this.result === 'mate' ? t('chess.lost') : t('chess.draw'),
    );
  }

  // ---------- the coach (games) ----------

  private askReview(before: number[], played: number): void {
    this.reviewAt = this.moves.length;
    this.reviewId = this.ask({ kind: 'review', fen: this.startFen, moves: before, played });
  }

  private onReview(r: ChessReply): void {
    const rv = r.review;
    // stale: the move was taken back, or the game moved on past your next move
    if (
      !rv ||
      this.reviewAt < 0 ||
      this.moves.length < this.reviewAt ||
      this.moves.length > this.reviewAt + 1
    )
      return;
    this.reviewAt = -1;
    if (this.lesson) return;
    if (rv.grade === 'mistake' || rv.grade === 'blunder') {
      const label = t(rv.grade === 'blunder' ? 'coach.blunder' : 'coach.mistake');
      this.say(`${label} ${reasonText(rv.reason)}`, rv.grade === 'blunder' ? 'bad' : 'warn', {
        label: t('coach.takeBack'),
        run: () => this.takeBack(rv.best),
      });
    } else if (rv.reason.kind === 'foundWin')
      this.say(`${t('coach.great')} ${reasonText(rv.reason)}`, 'good');
  }

  /** Undo your last move and light up the better one. */
  private takeBack(best: number): void {
    if (!this.canUndo()) return;
    this.undo();
    if (!best || !this.legal.includes(best)) return;
    this.sel = to64(mFrom(best));
    this.hintTo = to64(mTo(best));
    this.liftNow = 0;
    this.say(t('coach.show'), 'info');
    this.refresh();
  }

  // ---------- the school ----------

  private loadStep(i: number): void {
    const lesson = this.lesson;
    const step = lesson?.steps[i];
    if (!lesson || !step) return;
    this.stepIdx = i;
    this.stepMistakes = 0;
    this.stepMoves = 0;
    this.stepPar =
      step.goal === 'collect' ? collectPar(step.fen) : step.goal === 'mate' ? (step.moves ?? 0) : 0;
    this.reset(step.fen);
    // the lesson's idea on its first step, then what to do
    const intro = i === 0 ? `${t(`school.${lesson.id}.text` as Key)} ` : '';
    this.say(intro + this.goalText(lesson, step, i), 'info');
    this.beginTurn();
  }

  private goalText(lesson: Lesson, step: Step, i: number): string {
    if (lesson.id === 'special') return t(`school.special.${i + 1}` as Key);
    if (step.goal === 'best')
      return t(
        lesson.id === 'mate1'
          ? 'school.goal.mate1'
          : lesson.id === 'mate2'
            ? 'school.goal.mate2'
            : 'school.goal.win',
      );
    return t(`school.goal.${step.goal}` as Key);
  }

  private afterLessonMove(m: number, before: number[]): void {
    const step = this.step;
    if (!step) return;
    this.stepMoves++;
    switch (step.goal) {
      case 'best':
        // the engine judges the move; the computer answers if the line goes on
        this.phase = 'thinking';
        this.thinkT = 0;
        this.reply = undefined;
        this.reviewAt = this.moves.length;
        this.reviewId = this.ask({ kind: 'review', fen: this.startFen, moves: before, played: m });
        this.refresh();
        return;
      case 'mate': {
        const s = status(this.pos);
        if (s === 'mate') this.stepDoneNow();
        else if (s !== 'play') this.failStep('school.stalemate');
        else this.think(TEACHER);
        return;
      }
      default:
        if (stepDone(step, this.pos, m)) this.stepDoneNow();
        else {
          // Black never moves in these steps
          passTurn(this.pos);
          this.beginTurn();
        }
    }
  }

  /** The engine's verdict on a lesson move (goal `best`). */
  private onJudge(r: ChessReply): void {
    const rv = r.review;
    const step = this.step;
    if (!rv || !step || this.reviewAt !== this.moves.length) return;
    this.reviewAt = -1;
    // a mate must be just as fast as the best one; anything else within a third of a pawn
    const ok =
      rv.bestScore > MATE - 200 ? rv.playedScore >= rv.bestScore : rv.playedScore >= rv.bestScore - 60;
    if (!ok) {
      unmakeMove(this.pos);
      this.moves.pop();
      this.stepMoves--;
      this.last = [];
      this.view.sync(this.board64());
      this.beginTurn();
      this.wrong(rv.bestScore > MATE - 200 ? 'school.wrongMate' : 'school.wrongBest', rv.best);
      return;
    }
    if (status(this.pos) === 'mate' || this.stepMoves >= (step.moves ?? 1)) this.stepDoneNow();
    else this.think(TEACHER);
  }

  /** A wrong try: say why, and after two, show the way. */
  private wrong(key: Key, best = 0): void {
    this.mistakes++;
    this.stepMistakes++;
    this.d.sound.nope();
    this.d.haptics.pulse(HAPTICS.nope);
    if (this.phase !== 'player') this.beginTurn();
    if (this.stepMistakes >= 2) {
      const m = best || (this.step ? goalHint(this.step, this.pos) : 0);
      if (m) this.showMove(m);
      this.say(`${t(key)} ${t('school.tryHint')}`, 'warn');
    } else this.say(t(key), 'warn');
    this.refresh();
  }

  /** The step went wrong past saving (stalemate, the king escaped): try it again. */
  private failStep(key: Key): void {
    this.mistakes++;
    this.d.sound.nope();
    const i = this.stepIdx;
    this.loadStep(i);
    this.say(t(key), 'warn');
  }

  private stepDoneNow(): void {
    const extra = this.stepPar ? Math.max(0, this.stepMoves - this.stepPar) : 0;
    this.mistakes += Math.min(extra, 3);
    this.phase = 'over';
    this.sel = -1;
    this.advanceT = 0;
    this.say(t('school.good'), 'good');
    this.d.sound.boardClear();
    this.d.haptics.pulse(HAPTICS.clear);
    this.refresh();
  }

  private finishLesson(): void {
    const stars = lessonStars(this.mistakes);
    this.save(stars, null);
    this.tools.show(false);
    this.say('');
    this.win.present(
      stars,
      [
        { label: t('workshop.statMistakes'), value: num(this.mistakes) },
        { label: t('workshop.statHelp'), value: num(this.helps) },
      ],
      this.n < this.count,
      '',
      t('school.done'),
    );
  }

  private showMove(m: number): void {
    if (this.sel >= 0) this.view.place(this.sel, 0);
    this.sel = to64(mFrom(m));
    this.hintTo = to64(mTo(m));
    this.liftNow = 0;
  }

  // ---------- the computer (worker) ----------

  /** Ask the worker (or the main thread without one); returns the question's id. */
  private ask(q: ChessQuestion): number {
    const a: ChessAsk = { ...q, id: ++this.nextId };
    const w = this.ensureWorker();
    if (w) {
      this.pending.set(a.id, a);
      w.postMessage(a);
    } else this.askHere(a);
    return a.id;
  }

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
        const left = [...this.pending.values()];
        this.pending.clear();
        for (const a of left) this.askHere(a);
      };
    } catch {
      this.worker = null;
    }
    return this.worker;
  }

  private onReply(r: ChessReply): void {
    this.pending.delete(r.id);
    if (!this.active) return;
    if (r.id === this.reviewId) {
      if (this.lesson) this.onJudge(r);
      else this.onReview(r);
      return;
    }
    if (r.id !== this.askId) return;
    if (this.phase === 'thinking') {
      this.reply = r.move;
      return;
    }
    // a hint: pick up its piece and pulse the square it goes to
    if (this.phase !== 'player' || !r.move) return;
    this.showMove(r.move);
    this.refresh();
  }

  // ---------- tools ----------

  private canUndo(): boolean {
    return (
      !this.lesson &&
      this.moves.length > 0 &&
      (this.phase === 'player' || this.phase === 'thinking') &&
      !this.view.busy
    );
  }

  private undo(): void {
    if (!this.canUndo()) return;
    this.askId++; // drop a reply that's still on its way
    this.reviewAt = -1;
    // take back the computer's reply too, so it's your move again
    const back = this.phase === 'thinking' || this.moves.length === 1 ? 1 : 2;
    for (let i = 0; i < back; i++) {
      unmakeMove(this.pos);
      this.moves.pop();
    }
    this.helps++;
    const prev = this.pos.undo[this.pos.undo.length - 1];
    this.last = prev ? [to64(mFrom(prev.m)), to64(mTo(prev.m))] : [];
    this.bar.coach('');
    this.view.sync(this.board64());
    this.d.sound.returnPiece();
    this.beginTurn();
    this.resize(this.width, this.height, this.safeBottom);
  }

  private hint(): void {
    if (this.phase !== 'player' || this.view.busy) return;
    this.helps++;
    const step = this.step;
    if (step) {
      // lessons: a hint counts as a mistake, so three stars mean you found it yourself
      this.mistakes++;
      if (step.goal !== 'best' && step.goal !== 'mate') {
        this.showMove(goalHint(step, this.pos));
        this.refresh();
        return;
      }
    }
    this.askId = this.ask({ kind: 'hint', fen: this.startFen, moves: [...this.moves] });
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
      danger: mine && this.coachOn && !this.lesson ? threatened(this.pos, 1).map(to64) : [],
    });
    if (this.lesson) this.refreshLessonBar();
    else this.refreshGameBar(check >= 0);
    this.tools.set(this.canUndo(), this.helps > 0);
  }

  private refreshLessonBar(): void {
    const lesson = this.lesson;
    if (!lesson) return;
    const par = this.stepPar
      ? `${t('workshop.moves', { n: num(this.stepMoves) })} · ${t('school.par', { n: num(this.stepPar) })}`
      : '';
    this.bar.set(
      t(`school.${lesson.id}` as Key),
      t('school.step', { n: this.stepIdx + 1, total: lesson.steps.length }),
      par,
    );
  }

  private refreshGameBar(check: boolean): void {
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
          : check
            ? t('chess.check')
            : t('checkers.yourMove');
    const adv = captured(this.pos, 1) - captured(this.pos, -1);
    const name = t(`chess.opp${Math.min(5, Math.ceil(this.n / 3))}` as Key);
    this.bar.set(
      t('journey.level', { n: this.n }),
      big,
      adv ? t('chess.vs', { name, adv: `${adv > 0 ? '+' : '−'}${num(Math.abs(adv))}` }) : name,
    );
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
