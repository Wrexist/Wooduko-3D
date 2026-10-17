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
import {
  addLessonCards,
  addMistake,
  buildSession,
  dayOf,
  drillOf,
  dueCount,
  emptyTrain,
  finishSession,
  fullFen,
  moveOf,
  parseTrain,
  rankOf,
  RANKS,
  rateSolve,
  recordResult,
  SESSION,
  themeOfCard,
  uciOf,
} from '../core/chessTrain';
import type { TrainState } from '../core/chessTrain';
import { floatText } from '../ui/floatText';
import { explainMove, nextMistake, openingOf, reviewGame, san, winChance } from '../core/chessReview';
import type { Idea, Review } from '../core/chessReview';
import { ReviewPanel } from '../ui/chessReviewPanel';
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
const TEACH_KEY = 'grain_chess_teach';
const VIEW_KEY = 'grain_chess_view';

/** One sentence for the idea behind a move. */
function ideaText(i: Idea): string {
  switch (i.kind) {
    case 'mateSoon':
      return t('idea.mateSoon', { n: i.n });
    case 'win':
    case 'threat':
      return t(`idea.${i.kind}`, { piece: t(`coach.p${i.piece}` as Key) });
    case 'save':
    case 'defend':
    case 'develop':
      return t(`idea.${i.kind}`, { piece: t(`coach.p${i.piece}` as Key) });
    default:
      return t(`idea.${i.kind}` as Key);
  }
}
const FLAME =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2c1 3.2-.6 5-2.2 6.8C8.3 10.4 7 12 7 14.5A5 5 0 0 0 12 20a5 5 0 0 0 5-5.4c-.1-1.9-1-3.3-2-4.4.1 1.5-.4 2.7-1.5 3.3.4-3.6-.7-8.6-1.5-11.5z"/></svg>';

/** A game in progress, saved on your turn so leaving never loses it. */
interface SavedGame {
  readonly n: number;
  readonly fen: string;
  readonly moves: readonly string[];
  readonly helps: number;
}

function parseSavedGame(raw: string | null): SavedGame | null {
  try {
    const o = raw ? (JSON.parse(raw) as Partial<SavedGame>) : null;
    if (!o || typeof o.n !== 'number' || typeof o.fen !== 'string' || !Array.isArray(o.moves)) return null;
    return { n: o.n, fen: o.fen, moves: o.moves.map(String), helps: Number(o.helps) || 0 };
  } catch {
    return null;
  }
}

/** Pieces of each type (index = type) per side: [White, Black]. */
function typeCounts(p: Pos): [number[], number[]] {
  const out: [number[], number[]] = [new Array<number>(7).fill(0), new Array<number>(7).fill(0)];
  for (let s = 0; s < 128; s++) {
    if (s & 0x88) continue;
    const v = p.b[s] ?? 0;
    const side = out[v > 0 ? 0 : 1];
    if (v) side[Math.abs(v)] = (side[Math.abs(v)] ?? 0) + 1;
  }
  return out;
}

/** The game review's state: positions scored so far, then the review and where you are in it. */
interface Reviewing {
  readonly evals: number[];
  readonly bests: number[];
  review: Review | null;
  ply: number;
}

/** A training session: the cards in order, and how it's going. */
interface Session {
  readonly queue: string[];
  idx: number;
  /** Cards already tried once this session (later tries don't move the rating). */
  readonly seen: Set<string>;
  /** Per position in the queue: solved first time, missed, or not yet. */
  readonly marks: ('ok' | 'miss' | '')[];
  firsts: number;
  solved: number;
  combo: number;
  readonly startRating: number;
}

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
  private readonly viewBtn = el('button', { class: 'k-switch', 'aria-pressed': 'true' });
  /** Teach mode: the best move and why, every turn. Shared by both chess modes (one board view too). */
  private teachOn = false;
  private teachId = 0;
  private teachMove = 0;
  /** This game was played with teach mode on at some point (it caps the stars). */
  private teachUsed = false;
  private topView = true;
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
  /** The position the reviewed move was played from (your mistakes become training cards). */
  private reviewFen = '';
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
  // ---------- review, opening, resume ----------
  private readonly reviewPanel: ReviewPanel;
  private reviewing: Reviewing | null = null;
  private evalId = 0;
  private openingId = '';
  private startCounts: [number[], number[]] = [[], []];
  private readonly evalBar = el('div', { class: 'chess-eval', hidden: '', role: 'img' });
  private readonly evalFill = el('i');
  private readonly resumeBtn = el('button', { class: 'cta k-resume', hidden: '' });
  private saved: SavedGame | null = null;
  // ---------- daily training ----------
  private train: TrainState = emptyTrain();
  private session: Session | null = null;
  private cardStart = 0;
  private cardHinted = false;
  /** A new opening line: its moves glow (learn first, test from tomorrow). */
  private cardStudy = false;
  private readonly trainPanel = el('section', { class: 'train-panel', 'aria-labelledby': 'trainTitle' });
  private readonly trainRating = el('b', { class: 'train-rating' });
  private readonly trainRank = el('span', { class: 'train-rank' });
  private readonly trainStreak = el('span', { class: 'train-streak' });
  private readonly trainStreakN = el('b');
  private readonly trainMeter = el('i');
  private readonly trainNext = el('small', { class: 'train-next' });
  private readonly trainDue = el('p', { class: 'train-due' });
  private readonly trainGo = el('button', { class: 'cta train-go' }, [t('train.start')]);
  private readonly strip = el('div', { class: 'train-strip', 'aria-hidden': 'true', hidden: '' });
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
        ? {
            titles: LESSONS.map((l) => t(`school.${l.id}` as Key)),
            allOpen: true,
            head: this.buildTrainPanel(),
            foot: this.viewBtn,
          }
        : { foot: el('div', { class: 'k-switches' }, [this.coachBtn, this.viewBtn]), head: this.resumeBtn },
    );
    this.bar = new GameBar({
      onBack: () => this.leave(true),
      onRestart: () =>
        this.session ? this.loadCard() : this.lesson ? this.loadStep(this.stepIdx) : this.start(this.n),
    });
    this.tools = new GameTools(
      school
        ? { onHint: () => this.hint() }
        : { onUndo: () => this.undo(), onHint: () => this.hint(), onTeach: () => this.toggleTeach() },
      school ? t('school.tryHint') : t('chess.helpNote'),
    );
    this.win = new WinCard({
      onNext: () => this.start(Math.min(this.n + 1, count)),
      onReplay: () => (this.session ? void this.startTraining() : this.start(this.n)),
      onLevels: () => this.leave(true),
    });
    this.bar.node.append(this.strip, this.evalBar);
    this.evalBar.append(this.evalFill);
    this.evalBar.setAttribute('aria-label', t('chess.eval'));
    this.reviewPanel = new ReviewPanel({
      onFirst: () => this.showPly(0),
      onPrev: () => this.showPly((this.reviewing?.ply ?? 1) - 1),
      onNext: () => this.showPly((this.reviewing?.ply ?? 0) + 1),
      onMistake: () => {
        const r = this.reviewing?.review;
        if (r) this.showPly(nextMistake(r, (this.reviewing?.ply ?? 0) - 1) + 1);
      },
      onDone: () => this.leave(true),
    });
    this.resumeBtn.addEventListener('click', () => {
      if (this.saved) this.resume(this.saved);
    });
    this.coachBtn.addEventListener('click', () => {
      this.coachOn = !this.coachOn;
      this.syncCoachBtn();
      void d.storage.set(COACH_KEY, this.coachOn ? '1' : '0');
    });
    this.syncCoachBtn();
    this.viewBtn.addEventListener('click', () => {
      this.topView = !this.topView;
      this.syncViewBtn();
      void d.storage.set(VIEW_KEY, this.topView ? 'top' : 'tilted');
    });
    this.syncViewBtn();
    void d.storage.get(VIEW_KEY).then((raw) => {
      this.topView = raw !== 'tilted';
      this.syncViewBtn();
    });
    void d.storage.get(TEACH_KEY).then((raw) => {
      this.teachOn = raw === '1';
      this.tools.setTeach(this.teachOn);
    });
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

  private syncViewBtn(): void {
    this.viewBtn.textContent = t(this.topView ? 'view.top' : 'view.tilted');
    this.viewBtn.setAttribute('aria-pressed', String(this.topView));
    this.view.setTop(this.topView);
    if (this.active) this.resize(this.width, this.height, this.safeBottom);
  }

  // ---------- teach mode ----------

  private toggleTeach(): void {
    this.teachOn = !this.teachOn;
    this.tools.setTeach(this.teachOn);
    void this.d.storage.set(TEACH_KEY, this.teachOn ? '1' : '0');
    if (this.teachOn) this.askTeach();
    else {
      this.teachMove = 0;
      this.teachId = 0;
      this.bar.coach('');
      this.refresh();
      this.resize(this.width, this.height, this.safeBottom);
    }
  }

  /** On your turn in a game: ask for the best move, to show it with its idea. */
  private askTeach(): void {
    if (!this.teachOn || this.lesson || this.school || this.phase !== 'player' || this.reviewing) return;
    this.teachUsed = true;
    this.teachMove = 0;
    this.say(t('teach.thinking'), 'info');
    this.teachId = this.ask({ kind: 'eval', fen: this.startFen, moves: [...this.moves] });
  }

  private onTeach(r: ChessReply): void {
    if (!this.teachOn || this.phase !== 'player' || !r.move || !this.legal.includes(r.move)) return;
    this.teachMove = r.move;
    const idea = explainMove(this.pos, r.move, r.score ?? 0);
    this.say(
      `${t('teach.best', { move: san(this.pos, r.move, t('chess.letters')) })} ${ideaText(idea)}`,
      'good',
    );
    this.refresh();
  }

  get nodes(): HTMLElement[] {
    return [
      this.bar.node,
      this.tools.node,
      this.reviewPanel.node,
      this.picker.node,
      this.win.node,
      this.promo.node,
    ];
  }

  get starCount(): [number, number] {
    return [this.progress.stars.reduce((a, b) => a + b, 0), this.count * 3];
  }

  openPicker(): void {
    this.picker.update(this.progress.stars);
    this.picker.show();
    if (this.school) void this.loadTrain().then(() => this.refreshTrainPanel());
    else
      void this.d.storage.get(CHESS.gameKey).then((raw) => {
        this.saved = parseSavedGame(raw);
        this.resumeBtn.hidden = !this.saved;
        if (this.saved) this.resumeBtn.textContent = t('game.resume', { n: this.saved.n });
      });
  }

  start(n: number): void {
    if (n < 1 || n > this.count) return;
    this.session = null;
    this.strip.hidden = true;
    this.endReview();
    this.view.setTop(this.topView);
    this.teachUsed = false;
    this.teachMove = 0;
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
      this.clearSaved();
      this.beginTurn();
    }
    this.resize(this.width, this.height, this.safeBottom);
    this.d.sound.tick();
  }

  /** A fresh board from `fen`. */
  private reset(fen: string): void {
    this.startFen = fen;
    this.pos = fromFen(fen);
    this.startCounts = typeCounts(this.pos);
    this.openingId = '';
    this.view.arrows([]);
    this.showEval(null);
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
    this.session = null;
    this.strip.hidden = true;
    this.endReview();
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
      Math.max(safeBottom, this.tools.height, this.reviewPanel.height),
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
      if (this.advanceT >= (this.session ? CHESS.cardPause : CHESS.stepPause)) {
        this.advanceT = -1;
        if (this.session) this.nextCard();
        else if (this.lesson && this.stepIdx + 1 < this.lesson.steps.length) this.loadStep(this.stepIdx + 1);
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
    if (!this.lesson && !this.school) this.saveGame();
    this.updateOpening();
    this.teachMove = 0;
    if (this.teachOn) this.askTeach();
    this.refresh();
  }

  /** A square the selected piece can move to (taps prefer these over a piece standing in front). */
  private readonly isTarget = (s: number): boolean => this.selMoves().some((m) => to64(mTo(m)) === s);

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
            : step.goal === 'line'
              ? 'train.wrongLine'
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
    const fenBefore = this.lesson ? '' : fullFen(this.pos);
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
      if (this.coachOn) this.askReview(before, m, fenBefore);
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
        else {
          this.beginTurn();
          this.studyHint();
        }
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
    this.clearSaved();
    this.resultT = 0;
    this.sel = -1;
    this.tools.show(false);
    this.reviewAt = -1;
    if (this.won) {
      this.solvedStars = this.teachUsed ? 1 : chessStars(this.helps);
      this.save(this.solvedStars, this.helps || this.teachUsed ? null : this.yourMoves());
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
        this.teachUsed ? t('teach.helped') : this.helps ? t('chess.helped') : '',
        t('chess.won'),
        { extra: { label: t('review.open'), run: () => this.startReview() } },
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
      { extra: { label: t('review.open'), run: () => this.startReview() } },
    );
  }

  // ---------- game review ----------

  /** Score every position of the game in the worker (one after another), then step through it. */
  private startReview(): void {
    // the result card must not come back over the review
    this.resultT = -1;
    this.win.hide();
    this.bar.coach('');
    this.tools.show(false);
    this.reviewing = { evals: [], bests: [], review: null, ply: this.moves.length };
    this.reviewPanel.show(true);
    this.bar.set(t('review.title'), t('journey.level', { n: this.n }), '');
    this.resize(this.width, this.height, this.safeBottom);
    this.askEval(0);
  }

  private askEval(k: number): void {
    this.evalId = this.ask({ kind: 'eval', fen: this.startFen, moves: this.moves.slice(0, k) });
  }

  private onEval(r: ChessReply): void {
    const rv = this.reviewing;
    if (!rv || rv.review) return;
    rv.evals.push(r.score ?? 0);
    rv.bests.push(r.move);
    const k = rv.evals.length;
    this.reviewPanel.analysing(k / (this.moves.length + 1));
    if (k <= this.moves.length) {
      this.askEval(k);
      return;
    }
    rv.review = reviewGame(this.moves, rv.evals, rv.bests);
    this.reviewPanel.ready(rv.review);
    void this.saveReviewMistakes(rv.review);
    this.resize(this.width, this.height, this.safeBottom);
    // open on your first slip (or the end, for a clean game)
    const first = nextMistake(rv.review, -1);
    if (first < 0) this.say(t('review.noMistakes'), 'good');
    this.showPly(first >= 0 ? first + 1 : this.moves.length);
  }

  /** Show the position after `ply` moves, with that move's grade and the better move. */
  private showPly(ply: number): void {
    const rv = this.reviewing;
    const r = rv?.review;
    if (!rv || !r) return;
    const k = Math.max(0, Math.min(this.moves.length, ply));
    rv.ply = k;
    const p = fromFen(this.startFen);
    for (let i = 0; i < k - 1; i++) makeMove(p, this.moves[i] ?? 0);
    const note = k > 0 ? r.notes[k - 1] : undefined;
    const letters = t('chess.letters');
    let text: string;
    let tone: 'info' | 'good' | 'warn' | 'bad' = 'info';
    const arrows: { from: number; to: number; color: number }[] = [];
    if (note && k > 0) {
      const played = san(p, note.move, letters);
      const white = (k - 1) % 2 === 0;
      const no = Math.floor((k - 1) / 2) + 1;
      text = `${no}${white ? '.' : '…'} ${played}: ${t(`review.g.${note.grade}` as Key)}.`;
      const weak = note.grade === 'inaccuracy' || note.grade === 'mistake' || note.grade === 'blunder';
      if (weak && note.best) {
        text += ` ${t('review.better', { move: san(p, note.best, letters) })} ${ideaText(explainMove(p, note.best, rv.evals[k - 1] ?? 0))}`;
        arrows.push({ from: to64(mFrom(note.move)), to: to64(mTo(note.move)), color: CHESS.arrowBad });
        arrows.push({ from: to64(mFrom(note.best)), to: to64(mTo(note.best)), color: CHESS.arrowBest });
      }
      tone =
        note.grade === 'blunder'
          ? 'bad'
          : note.grade === 'mistake'
            ? 'warn'
            : note.grade === 'best'
              ? 'good'
              : 'info';
      makeMove(p, note.move);
    } else text = t('review.start');
    this.pos = p;
    this.last = note ? [to64(mFrom(note.move)), to64(mTo(note.move))] : [];
    this.view.sync(this.board64());
    this.view.arrows(arrows);
    // the start position is scored for White, who moves first
    this.showEval(note ? note.after : (rv.evals[0] ?? 0));
    this.reviewPanel.at(k, this.moves.length, nextMistake(r, k - 1) >= 0);
    this.say(text, tone);
    this.refresh();
    this.d.sound.tick();
  }

  private endReview(): void {
    if (!this.reviewing) return;
    this.reviewing = null;
    this.askId++;
    this.evalId = 0;
    this.reviewPanel.show(false);
    this.reviewPanel.node.hidden = true;
    this.view.arrows([]);
    this.showEval(null);
  }

  /** Your inaccuracies and worse become Daily training cards. */
  private async saveReviewMistakes(r: Review): Promise<void> {
    const weak = r.notes.filter(
      (n) => n.ply % 2 === 0 && (n.grade === 'mistake' || n.grade === 'blunder') && n.best,
    );
    if (!weak.length) return;
    await this.loadTrain();
    const today = this.today();
    for (const n of weak) {
      const p = fromFen(this.startFen);
      for (let i = 0; i < n.ply; i++) makeMove(p, this.moves[i] ?? 0);
      this.train = addMistake(this.train, fullFen(p), uciOf(n.best), today);
    }
    this.saveTrain();
  }

  /** The bar of who stands better (White's view, centipawns); null hides it. */
  private showEval(score: number | null): void {
    const show = score !== null && (this.coachOn || this.reviewing !== null) && !this.lesson;
    this.evalBar.hidden = !show;
    if (!show) return;
    const w = winChance(score);
    this.evalFill.style.width = `${w}%`;
    this.evalBar.classList.toggle('ahead', w >= 50);
  }

  // ---------- opening names, saved game ----------

  private updateOpening(): void {
    if (this.lesson || this.startFen !== START_FEN || this.moves.length > 24) return;
    const id = openingOf(this.moves.map(uciOf));
    if (id) this.openingId = id;
  }

  private saveGame(): void {
    const g: SavedGame = { n: this.n, fen: this.startFen, moves: this.moves.map(uciOf), helps: this.helps };
    void this.d.storage.set(CHESS.gameKey, JSON.stringify(g));
  }

  private clearSaved(): void {
    this.saved = null;
    this.resumeBtn.hidden = true;
    void this.d.storage.set(CHESS.gameKey, '');
  }

  /** Pick a saved game up where you left it. */
  private resume(g: SavedGame): void {
    this.start(g.n);
    this.reset(g.fen);
    for (const u of g.moves) {
      const m = moveOf(this.pos, u);
      if (!m) break;
      makeMove(this.pos, m);
      this.moves.push(m);
    }
    this.helps = g.helps;
    const lastMove = this.moves[this.moves.length - 1];
    this.last = lastMove ? [to64(mFrom(lastMove)), to64(mTo(lastMove))] : [];
    this.view.sync(this.board64());
    if (status(this.pos) !== 'play') this.end(status(this.pos));
    else if (this.pos.side === -1) this.think(chessOpponent(this.n));
    else this.beginTurn();
  }

  // ---------- the coach (games) ----------

  private askReview(before: number[], played: number, fen: string): void {
    this.reviewFen = fen;
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
    this.showEval(rv.playedScore);
    if (rv.grade === 'mistake' || rv.grade === 'blunder') {
      if (this.reviewFen && rv.best) void this.saveMistake(this.reviewFen, uciOf(rv.best));
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
      case 'puzzle': {
        const line = step.accept ?? [];
        const want = line[this.moves.length - 1] ?? '';
        const mate = status(this.pos) === 'mate';
        if (!mate && uciOf(m).slice(0, want.length) !== want) {
          // not the solution: back it goes, and after two tries the right move glows
          unmakeMove(this.pos);
          this.moves.pop();
          this.stepMoves--;
          this.last = [];
          this.view.sync(this.board64());
          this.beginTurn();
          this.wrong('school.wrongBest', moveOf(this.pos, want));
          return;
        }
        if (mate || this.moves.length >= line.length) {
          this.stepDoneNow();
          return;
        }
        this.phase = 'thinking';
        this.thinkT = 0;
        this.askId++;
        this.reply = moveOf(this.pos, line[this.moves.length] ?? '');
        this.refresh();
        return;
      }
      case 'line': {
        const line = step.accept ?? [];
        if (this.moves.length >= line.length) {
          this.stepDoneNow();
          return;
        }
        // the answer from the line, after a natural pause
        this.phase = 'thinking';
        this.thinkT = 0;
        this.askId++;
        this.reply = moveOf(this.pos, line[this.moves.length] ?? '');
        this.refresh();
        return;
      }
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
    if (this.session) {
      const missed = this.stepMistakes + 1;
      this.loadCard();
      this.stepMistakes = missed;
    } else this.loadStep(this.stepIdx);
    this.say(t(key), 'warn');
  }

  private stepDoneNow(): void {
    const extra = this.stepPar ? Math.max(0, this.stepMoves - this.stepPar) : 0;
    this.mistakes += Math.min(extra, 3);
    this.phase = 'over';
    this.sel = -1;
    this.advanceT = 0;
    if (this.session) {
      this.cardDone();
      this.refresh();
      return;
    }
    this.say(t('school.good'), 'good');
    this.d.sound.boardClear();
    this.d.haptics.pulse(HAPTICS.clear);
    this.refresh();
  }

  private finishLesson(): void {
    const stars = lessonStars(this.mistakes);
    this.save(stars, null);
    const lesson = this.lesson;
    if (lesson) void this.saveLessonCards(lesson);
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

  // ---------- daily training ----------

  private buildTrainPanel(): HTMLElement {
    const flame = el('span', { class: 'train-flame', html: FLAME });
    this.trainStreak.append(flame, this.trainStreakN);
    this.trainPanel.append(
      el('div', { class: 'train-head' }, [
        el('h3', { id: 'trainTitle' }, [t('train.title')]),
        this.trainStreak,
      ]),
      el('div', { class: 'train-score' }, [this.trainRating, this.trainRank]),
      el('span', { class: 'train-meter', 'aria-hidden': 'true' }, [this.trainMeter]),
      this.trainNext,
      this.trainDue,
      this.trainGo,
      el('p', { class: 'train-lead' }, [t('train.lead')]),
    );
    this.trainGo.addEventListener('click', () => void this.startTraining());
    return this.trainPanel;
  }

  private async loadTrain(): Promise<void> {
    this.train = parseTrain(await this.d.storage.get(CHESS.trainKey));
  }

  private saveTrain(): void {
    void this.d.storage.set(CHESS.trainKey, JSON.stringify(this.train));
  }

  private today(): number {
    return dayOf(Date.now());
  }

  private refreshTrainPanel(): void {
    const s = this.train;
    const today = this.today();
    const r = rankOf(s.rating);
    const lo = RANKS[r] ?? 0;
    const hi = RANKS[r + 1];
    this.trainRating.textContent = num(s.rating);
    this.trainRank.textContent = t(`train.rank.${r}` as Key);
    const streak = s.lastDay >= today - 1 ? s.streak : 0;
    this.trainStreakN.textContent = num(streak);
    this.trainStreak.classList.toggle('hot', streak > 0 && s.lastDay === today);
    this.trainStreak.setAttribute('aria-label', t('train.streak', { n: streak }));
    this.trainNext.textContent =
      hi !== undefined ? t('train.next', { rank: t(`train.rank.${r + 1}` as Key), n: num(hi) }) : '';
    const fill = hi !== undefined ? Math.min(1, Math.max(0, (s.rating - lo) / (hi - lo))) : 1;
    // grow the meter from empty each time the list opens
    this.trainMeter.style.width = '0%';
    requestAnimationFrame(() =>
      requestAnimationFrame(() => (this.trainMeter.style.width = `${fill * 100}%`)),
    );
    const due = dueCount(s, today);
    const fresh = buildSession(s, today).length - Math.min(due, SESSION.reviews);
    this.trainDue.textContent = t('train.due', { due: num(due), fresh: num(Math.max(0, fresh)) });
    this.trainGo.textContent = s.lastDay === today ? t('train.more') : t('train.start');
    this.trainGo.classList.toggle('glow', s.lastDay !== today);
  }

  private async startTraining(): Promise<void> {
    await this.loadTrain();
    const queue = buildSession(this.train, this.today());
    if (!queue.length) return;
    this.session = {
      queue,
      idx: 0,
      seen: new Set(),
      marks: queue.map(() => ''),
      firsts: 0,
      solved: 0,
      combo: 0,
      startRating: this.train.rating,
    };
    this.helps = 0;
    this.mistakes = 0;
    this.picker.hide();
    this.win.hide();
    this.promo.hide();
    this.bar.show(true);
    this.tools.show(true);
    this.strip.hidden = false;
    if (!this.active) {
      this.active = true;
      this.d.onActive(true);
    }
    this.loadCard();
    this.resize(this.width, this.height, this.safeBottom);
    this.d.sound.tick();
  }

  /** Set up the session's current card. */
  private loadCard(): void {
    const ses = this.session;
    const id = ses?.queue[ses.idx];
    const drill = id ? drillOf(id) : null;
    if (!ses || !id || !drill) {
      if (ses) this.nextCard();
      return;
    }
    this.stepIdx = 0;
    this.stepMistakes = 0;
    this.stepMoves = 0;
    this.stepPar = 0;
    this.cardHinted = false;
    this.cardStudy = false;
    this.cardStart = performance.now();
    let step: Step;
    let goal: string;
    if (drill.kind === 'opening') {
      step = { fen: START_FEN, goal: 'line', accept: drill.moves };
      this.lesson = { id: 'train', steps: [step] };
      this.cardStudy = !this.train.cards[id]?.reps;
      const name = t(`open.${drill.id}` as Key);
      goal = t(this.cardStudy ? 'train.goal.openNew' : 'train.goal.open', { name });
    } else if (drill.kind === 'lesson') {
      const lesson = LESSONS.find((l) => l.id === drill.lesson);
      const real = lesson?.steps[drill.step];
      if (!lesson || !real) {
        this.nextCard();
        return;
      }
      step = real;
      this.lesson = { id: lesson.id, steps: [real] };
      this.stepPar = real.goal === 'mate' ? (real.moves ?? 0) : 0;
      goal = this.goalText(lesson, real, drill.step);
    } else {
      const moves = Math.ceil(drill.line.length / 2);
      // Lichess puzzles follow their solution; your own mistakes are judged by the engine
      step =
        drill.rating === 0
          ? { fen: drill.fen, goal: 'best', moves }
          : { fen: drill.fen, goal: 'puzzle', accept: drill.line };
      this.lesson = { id: 'train', steps: [step] };
      const theme = themeOfCard(id);
      goal =
        drill.rating === 0
          ? t('train.goal.mistake')
          : theme.startsWith('mate')
            ? t('train.goal.mate', { n: theme.slice(4) })
            : moves > 1
              ? t('train.goal.line', { n: moves })
              : t('train.goal.win');
    }
    this.reset(step.fen);
    this.say(goal, 'info');
    this.beginTurn();
    this.studyHint();
    this.refreshStrip();
  }

  /** New opening lines: the next move glows. */
  private studyHint(): void {
    const step = this.step;
    if (!this.session || !this.cardStudy || step?.goal !== 'line' || this.phase !== 'player') return;
    const m = moveOf(this.pos, step.accept?.[this.moves.length] ?? '');
    if (!m) return;
    this.showMove(m);
    this.refresh();
  }

  /** The card is done: schedule it, move the rating, and celebrate (or bring it back soon). */
  private cardDone(): void {
    const ses = this.session;
    const id = ses?.queue[ses.idx];
    if (!ses || !id) return;
    const secs = (performance.now() - this.cardStart) / 1000;
    const yourMoves = Math.max(1, Math.ceil(this.moves.length / 2));
    const g = this.cardStudy ? 2 : rateSolve(this.stepMistakes, this.cardHinted, secs, yourMoves);
    const first = !ses.seen.has(id);
    ses.seen.add(id);
    const today = this.today();
    const before = this.train.rating;
    const res = recordResult(this.train, id, g, today, first);
    this.train = res.state;
    this.saveTrain();
    const ok = g > 1;
    if (first) {
      ses.firsts++;
      if (ok) ses.solved++;
      ses.marks[ses.idx] = ok ? 'ok' : 'miss';
    }
    const to = this.last[1] ?? 27;
    if (!ok) {
      ses.combo = 0;
      // missed: it comes back a few cards later (once)
      if (first) {
        const at = Math.min(ses.queue.length, ses.idx + 1 + SESSION.again);
        ses.queue.splice(at, 0, id);
        ses.marks.splice(at, 0, '');
      }
      this.say(t('train.again'), 'warn');
      this.d.sound.place();
      this.d.haptics.pulse(HAPTICS.place);
      this.view.celebrate(to, false);
      this.refreshStrip();
      return;
    }
    ses.combo++;
    const days = res.card.due - today;
    const theme = themeOfCard(id);
    const themeText =
      theme.startsWith('mate') ||
      [
        'fork',
        'pin',
        'skewer',
        'discovered',
        'deflection',
        'sacrifice',
        'hanging',
        'promotion',
        'endgame',
      ].includes(theme)
        ? t(`train.theme.${theme}` as Key)
        : '';
    const drill = drillOf(id);
    this.say(
      this.cardStudy && drill?.kind === 'opening'
        ? t('train.learned', { idea: t(`open.${drill.id}.idea` as Key) })
        : t('train.right', {
            theme: themeText,
            d: days === 1 ? t('train.day') : t('train.days', { n: days }),
          }),
      'good',
    );
    // the rewards: sparkles and a bounce, a rising chime that climbs with the run, numbers that float up
    const rankUp = rankOf(this.train.rating) > rankOf(before);
    this.view.celebrate(to, ses.combo >= 3 || rankUp);
    this.d.sound.clear(Math.min(4, ses.combo), ses.combo);
    this.d.haptics.pulse(ses.combo >= 3 ? HAPTICS.boardClear : HAPTICS.clear);
    const p = this.view.screenOf(to, this.width, this.height);
    const delta = this.train.rating - before;
    if (delta)
      floatText(document.body, `${delta > 0 ? '+' : '−'}${num(Math.abs(delta))}`, p.x, p.y - 10, true);
    if (ses.combo >= 2)
      window.setTimeout(
        () => floatText(document.body, t('train.combo', { n: ses.combo }), p.x, p.y - 56, false),
        260,
      );
    if (rankUp)
      window.setTimeout(
        () =>
          floatText(
            document.body,
            t('train.rankUp', { rank: t(`train.rank.${rankOf(this.train.rating)}` as Key) }),
            this.width / 2,
            this.height * 0.42,
            true,
          ),
        500,
      );
    this.refreshStrip();
  }

  private nextCard(): void {
    const ses = this.session;
    if (!ses) return;
    ses.idx++;
    if (ses.idx >= ses.queue.length) this.finishTraining();
    else this.loadCard();
  }

  private finishTraining(): void {
    const ses = this.session;
    if (!ses) return;
    const today = this.today();
    this.train = finishSession(this.train, today);
    this.saveTrain();
    this.phase = 'over';
    this.tools.show(false);
    this.say('');
    const acc = ses.firsts ? ses.solved / ses.firsts : 0;
    const stars = acc >= 0.9 ? 3 : acc >= 0.7 ? 2 : 1;
    const gain = this.train.rating - ses.startRating;
    const rankUp = rankOf(this.train.rating) > rankOf(ses.startRating);
    const tomorrow = Object.values(this.train.cards).filter((c) => c.due <= today + 1).length;
    this.d.sound.boardClear();
    this.d.haptics.pulse(HAPTICS.boardClear);
    this.view.celebrate(27, true);
    this.win.present(
      stars,
      [
        {
          label: t('train.statSolved'),
          value: `${num(ses.solved)}/${num(ses.firsts)}`,
          count: { from: 0, to: ses.solved, format: (n) => `${num(n)}/${num(ses.firsts)}` },
        },
        {
          label: t('train.statRating'),
          value: num(this.train.rating),
          count: { from: ses.startRating, to: this.train.rating, format: (n) => num(n) },
          gain: gain > 0,
        },
        { label: t('train.statStreak'), value: num(this.train.streak), gain: true },
      ],
      false,
      t('train.tomorrow', { n: num(tomorrow) }),
      rankUp
        ? t('train.rankUp', { rank: t(`train.rank.${rankOf(this.train.rating)}` as Key) })
        : t('train.done'),
      { replay: t('train.more'), party: rankUp || stars === 3 },
    );
  }

  /** The progress strip under the bar: one segment per card. */
  private refreshStrip(): void {
    const ses = this.session;
    if (!ses) return;
    if (this.strip.childElementCount !== ses.queue.length)
      this.strip.replaceChildren(...ses.queue.map(() => el('i')));
    [...this.strip.children].forEach((node, i) => {
      node.className = `${ses.marks[i] ?? ''}${i === ses.idx ? ' now' : ''}`;
    });
  }

  private async saveMistake(fen: string, best: string): Promise<void> {
    await this.loadTrain();
    this.train = addMistake(this.train, fen, best, this.today());
    this.saveTrain();
  }

  private async saveLessonCards(lesson: Lesson): Promise<void> {
    const ids = lesson.steps
      .map((st, i) => (st.goal === 'best' || st.goal === 'mate' ? `l:${lesson.id}.${i}` : ''))
      .filter(Boolean);
    if (!ids.length) return;
    await this.loadTrain();
    this.train = addLessonCards(this.train, ids, this.today());
    this.saveTrain();
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
    if (r.id === this.evalId) {
      this.onEval(r);
      return;
    }
    if (r.id === this.teachId) {
      this.onTeach(r);
      return;
    }
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
    if (this.session && !this.cardStudy) this.cardHinted = true;
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
    if (!this.reviewing)
      this.view.arrows(
        mine && this.sel >= 0 && this.hintTo >= 0
          ? [{ from: this.sel, to: this.hintTo, color: CHESS.arrowHint }]
          : mine && this.teachMove
            ? [{ from: to64(mFrom(this.teachMove)), to: to64(mTo(this.teachMove)), color: CHESS.arrowBest }]
            : [],
      );
    const now = typeCounts(this.pos);
    const lost = (side: 0 | 1): number[] => {
      const out: number[] = [];
      for (const type of [5, 4, 3, 2, 1])
        for (let i = 0; i < (this.startCounts[side][type] ?? 0) - (now[side][type] ?? 0); i++) out.push(type);
      return out;
    };
    this.view.captured(lost(1), lost(0));
    if (this.reviewing) return;
    if (this.lesson) this.refreshLessonBar();
    else this.refreshGameBar(check >= 0);
    this.tools.set(this.canUndo(), this.helps > 0);
  }

  private refreshLessonBar(): void {
    const lesson = this.lesson;
    if (!lesson) return;
    const ses = this.session;
    if (ses) {
      this.bar.set(
        t('train.title'),
        t('train.card', { n: Math.min(ses.idx + 1, ses.queue.length), total: ses.queue.length }),
        t('train.rating', { n: num(this.train.rating) }),
      );
      return;
    }
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
    const opp = t(`chess.opp${Math.min(5, Math.ceil(this.n / 3))}` as Key);
    const name = this.openingId ? `${opp} · ${t(`opening.${this.openingId}` as Key)}` : opp;
    this.bar.set(
      t('journey.level', { n: this.n }),
      big,
      adv ? t('chess.vs', { name, adv: `${adv > 0 ? '+' : '−'}${num(Math.abs(adv))}` }) : name,
    );
  }

  // ---------- input ----------

  private onDown(e: PointerEvent): void {
    if (!this.active || this.press || this.phase !== 'player' || this.view.busy || this.win.open) return;
    const s = this.view.squareAt(e.clientX, e.clientY, this.width, this.height, this.isTarget);
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
    const s = commit ? this.view.squareAt(e.clientX, e.clientY, this.width, this.height, this.isTarget) : -1;
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
