import { num, t } from '../i18n';
import { Overlay } from './dialogs';
import { el, ICONS, rise } from './dom';

/**
 * While the Workshop hub or a level list is open the Home card hides behind it. A class on the
 * root (not `:has()`, which iOS 15.0-15.3 lacks) drives the CSS.
 */
function syncMenuClass(): void {
  const open = document.querySelector('.overlay.workshop-hub:not(.hidden), .overlay.workshop:not(.hidden)');
  document.documentElement.classList.toggle('workshop-menu', open !== null);
}

/** Overlay that keeps the root's `workshop-menu` class in step. */
class WorkshopOverlay extends Overlay {
  override show(): void {
    super.show();
    syncMenuClass();
  }

  override hide(): void {
    super.hide();
    syncMenuClass();
  }
}

/** One past the last solved level (levels unlock in order). */
const unlocked = (stars: readonly number[], total: number): number => {
  let n = 1;
  while (n <= total && (stars[n - 1] ?? 0) > 0) n++;
  return Math.min(n, total);
};

/** A Workshop game's levels: a header with total stars, then a grid of tiles (stars or a lock). */
export class LevelPicker extends WorkshopOverlay {
  private readonly grid = el('div', { class: 'k-grid', role: 'list' });
  private readonly note = el('p', { class: 'note' });
  private readonly count = el('span', { class: 'k-count' });
  private readonly fill = el('i');

  constructor(
    id: string,
    title: string,
    lead: string,
    private readonly total: number,
    h: { onPlay(n: number): void; onClose(): void },
    /** `titles`: a list with names (lessons) instead of numbered stones; `allOpen`: no locks; `head` / `foot`: extra controls. */
    private readonly opts: {
      titles?: readonly string[];
      allOpen?: boolean;
      head?: HTMLElement;
      foot?: HTMLElement;
    } = {},
  ) {
    super('workshop dialog-layer', `${id}Title`);
    this.card.classList.add('wide', 'workshop-card');
    const close = el('button', { class: 'btn close', 'aria-label': t('common.done'), html: '×' });
    close.addEventListener('click', h.onClose);
    this.node.addEventListener('pointerdown', (e) => {
      if (e.target === this.node) h.onClose();
    });
    this.card.append(
      el('div', { class: 'k-head' }, [
        el('div', {}, [el('h2', { id: `${id}Title` }, [title]), el('p', { class: 'k-lead' }, [lead])]),
        close,
      ]),
      ...(opts.head ? [opts.head] : []),
      el('div', { class: 'k-progress' }, [
        el('span', { class: 'k-star', html: ICONS.star }),
        this.count,
        el('span', { class: 'k-bar-track', 'aria-hidden': 'true' }, [this.fill]),
      ]),
      this.grid,
      this.note,
      ...(opts.foot ? [opts.foot] : []),
    );
    if (opts.titles) this.grid.classList.add('k-list');
    for (let n = 1; n <= total; n++) {
      const name = opts.titles?.[n - 1];
      const b = el('button', { class: 'k-level', role: 'listitem' }, [
        el('b', {}, [String(n)]),
        ...(name ? [el('span', { class: 'k-name' }, [name])] : []),
      ]);
      b.addEventListener('click', () => h.onPlay(n));
      this.grid.append(b);
    }
  }

  update(best: readonly number[]): void {
    const open = this.opts.allOpen ? this.total : unlocked(best, this.total);
    // the one to play next: the first unsolved (all open) or the newly unlocked one
    const next = this.opts.allOpen
      ? best.slice(0, this.total).findIndex((s) => !s) + 1 || (best.length < this.total ? best.length + 1 : 0)
      : open;
    let solved = 0;
    let earned = 0;
    [...this.grid.children].forEach((node, i) => {
      const n = i + 1;
      const b = node as HTMLButtonElement;
      const stars = best[n - 1] ?? 0;
      earned += stars;
      if (stars) solved++;
      const locked = n > open;
      b.className = `k-level${locked ? ' locked' : ''}${n === next && !stars ? ' current' : ''}${stars ? ' done' : ''}`;
      b.disabled = locked;
      b.setAttribute(
        'aria-label',
        locked
          ? t('journey.locked', { n })
          : `${this.opts.titles?.[n - 1] ?? t('journey.level', { n })}, ${t('journey.stars', { n: stars })}`,
      );
      b.querySelector('.pips, .lock')?.remove();
      if (locked) b.append(el('span', { class: 'lock', html: ICONS.lock, 'aria-hidden': 'true' }));
      else {
        const pips = el('span', { class: 'pips', 'aria-hidden': 'true' });
        for (let k = 0; k < 3; k++) pips.append(el('i', { class: k < stars ? 'on' : '', html: ICONS.star }));
        b.append(pips);
      }
    });
    const max = this.total * 3;
    this.count.textContent = `${num(earned)} / ${num(max)}`;
    this.count.setAttribute('aria-label', t('journey.stars', { n: earned }));
    this.fill.style.width = `${Math.round((earned / max) * 100)}%`;
    this.note.textContent = solved === this.total ? t('workshop.allDone') : '';
    this.note.hidden = solved !== this.total;
  }

  /** Open with the next level to play scrolled into view. */
  override show(): void {
    super.show();
    const cur =
      this.grid.querySelector<HTMLElement>('.k-level.current') ?? this.grid.querySelector('.k-level');
    cur?.scrollIntoView({ block: 'nearest' });
    cur?.focus({ preventScroll: true });
  }
}

/** Top bar in a Workshop level: back, title, a big counter and a small line, restart. */
export class GameBar {
  readonly node: HTMLDivElement;
  private readonly title = el('strong');
  private readonly moves = el('span', { class: 'k-moves', 'aria-live': 'polite' });
  private readonly par = el('small');
  /** A coach's line under the bar (lessons, move feedback), with an optional button. */
  private readonly note = el('p', { class: 'k-coach', 'aria-live': 'polite', hidden: '' });
  private readonly noteText = el('span');
  private readonly noteBtn = el('button', { class: 'k-coach-btn', hidden: '' });
  private noteAction: (() => void) | null = null;

  constructor(h: { onBack(): void; onRestart(): void }) {
    const back = el('button', { class: 'btn', 'aria-label': t('workshop.back'), html: BACK });
    const restart = el('button', { class: 'btn', 'aria-label': t('workshop.restart'), html: ICONS.restart });
    back.addEventListener('click', h.onBack);
    restart.addEventListener('click', h.onRestart);
    this.node = el('div', { class: 'k-bar', hidden: '' }, [
      back,
      el('div', { class: 'k-info' }, [this.title, this.moves, this.par]),
      restart,
      this.note,
    ]);
    this.note.append(this.noteText, this.noteBtn);
    this.noteBtn.addEventListener('click', () => this.noteAction?.());
  }

  /** Show (or with '' clear) the coach's line. `tone` colours its edge. */
  coach(
    text: string,
    tone: 'info' | 'good' | 'warn' | 'bad' = 'info',
    action?: { label: string; run(): void },
  ): void {
    this.note.hidden = !text;
    this.note.dataset.tone = tone;
    this.noteText.textContent = text;
    this.noteAction = action?.run ?? null;
    this.noteBtn.hidden = !action;
    this.noteBtn.textContent = action?.label ?? '';
  }

  get bottom(): number {
    return this.node.hidden ? 0 : this.node.getBoundingClientRect().bottom;
  }

  set(title: string, big: string, small: string): void {
    this.title.textContent = title;
    this.moves.textContent = big;
    this.par.textContent = small;
  }

  show(on: boolean): void {
    this.node.hidden = !on;
  }
}

/** Bottom tools in a Workshop level: Undo (optional) and Hint (hints cost stars). */
export class GameTools {
  readonly node: HTMLDivElement;
  private readonly undo: HTMLButtonElement;
  private readonly hint: HTMLButtonElement;
  private readonly teach = el(
    'button',
    { class: 'ghost-btn k-tool k-teach', 'aria-pressed': 'false', hidden: '' },
    [el('span', { html: CAP }), t('teach.tool')],
  );

  constructor(h: { onUndo?(): void; onHint(): void; onTeach?(): void }, hintNote: string) {
    this.undo = el('button', { class: 'ghost-btn k-tool' }, [el('span', { html: UNDO }), t('workshop.undo')]);
    this.hint = el('button', { class: 'ghost-btn k-tool' }, [el('span', { html: BULB }), t('workshop.hint')]);
    this.hint.setAttribute('aria-description', hintNote);
    const onUndo = h.onUndo;
    if (onUndo) this.undo.addEventListener('click', () => onUndo());
    else this.undo.hidden = true;
    this.hint.addEventListener('click', h.onHint);
    const onTeach = h.onTeach;
    if (onTeach) {
      this.teach.hidden = false;
      this.teach.setAttribute('aria-description', t('teach.note'));
      this.teach.addEventListener('click', () => onTeach());
    }
    this.node = el('div', { class: `k-tools${onTeach ? ' three' : ''}`, hidden: '' }, [
      this.undo,
      this.hint,
      this.teach,
    ]);
  }

  /** Teach mode on or off (the button stays lit while on). */
  setTeach(on: boolean): void {
    this.teach.setAttribute('aria-pressed', String(on));
    this.teach.classList.toggle('on', on);
  }

  /** Short landscape screens dock the tools in a column on the left (see styles.css). */
  private get docked(): boolean {
    return this.node.classList.contains('side') || getComputedStyle(this.node).flexDirection === 'column';
  }

  /** Height (px) the tools take from the bottom of the screen (0 when docked at the side). */
  get height(): number {
    if (this.node.hidden || this.docked) return 0;
    return window.innerHeight - this.node.getBoundingClientRect().top;
  }

  /** Width (px) the tools take from the left edge when docked at the side. */
  get left(): number {
    if (this.node.hidden || !this.docked) return 0;
    return this.node.getBoundingClientRect().right;
  }

  set(canUndo: boolean, hinted: boolean): void {
    this.undo.disabled = !canUndo;
    this.hint.classList.toggle('used', hinted);
  }

  show(on: boolean): void {
    this.node.hidden = !on;
  }
}

export interface WinStat {
  readonly label: string;
  readonly value: string;
  /** Count the number up from `from` to `to` (shown with `format`); `gain` glows it. */
  readonly count?: { readonly from: number; readonly to: number; format(n: number): string };
  readonly gain?: boolean;
}

/** Seconds a counting stat takes. */
const COUNT_UP_S = 1.1;
const reducedMotion = (): boolean => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

/** Count a number up in `node` (time-based, eased; instant with reduced motion). */
export function countUp(node: HTMLElement, from: number, to: number, format: (n: number) => string): void {
  if (reducedMotion() || from === to) {
    node.textContent = format(to);
    return;
  }
  const t0 = performance.now();
  const tick = (now: number): void => {
    const k = Math.min(1, (now - t0) / 1000 / COUNT_UP_S);
    const e = 1 - Math.pow(1 - k, 3);
    node.textContent = format(Math.round(from + (to - from) * e));
    if (k < 1 && node.isConnected) requestAnimationFrame(tick);
  };
  node.textContent = format(from);
  requestAnimationFrame(tick);
}

/** Solved card: stars that pop in, a row of stats, Next level, and Try again / Levels side by side. */
export class WinCard extends Overlay {
  private readonly stars = el('div', { class: 'k-win-stars' });
  private readonly stats = el('dl', { class: 'k-stats' });
  private readonly note = el('p', { class: 'k-note' });
  private readonly next = el('button', { class: 'cta' }, [t('workshop.next')]);
  private readonly title = el('h2', { id: 'kWinTitle' }, [t('workshop.solved')]);
  private readonly replay = el('button', { class: 'ghost-btn' }, [t('workshop.replay')]);
  /** An optional extra action (Review game). */
  private readonly extra = el('button', { class: 'ghost-btn k-extra', hidden: '' });
  private extraRun: (() => void) | null = null;

  constructor(h: { onNext(): void; onReplay(): void; onLevels(): void }) {
    super('workshop-win dialog-layer', 'kWinTitle');
    this.card.classList.add('k-win');
    const replay = this.replay;
    const levels = el('button', { class: 'ghost-btn' }, [t('workshop.levels')]);
    this.next.addEventListener('click', h.onNext);
    replay.addEventListener('click', h.onReplay);
    levels.addEventListener('click', h.onLevels);
    this.extra.addEventListener('click', () => this.extraRun?.());
    this.card.append(
      this.stars,
      this.title,
      this.stats,
      this.note,
      el('div', { class: 'k-actions' }, [
        this.next,
        this.extra,
        el('div', { class: 'pair' }, [replay, levels]),
      ]),
    );
  }

  /** `title` replaces "Solved!" (a lost game); a lost game (0 stars) shows no star row. */
  present(
    stars: number,
    stats: readonly WinStat[],
    hasNext: boolean,
    note = '',
    title?: string,
    opts: { replay?: string; party?: boolean; extra?: { label: string; run(): void } } = {},
  ): void {
    this.title.textContent = title ?? t('workshop.solved');
    this.replay.textContent = opts.replay ?? t('workshop.replay');
    this.card.classList.toggle('party', opts.party === true);
    this.extra.hidden = !opts.extra;
    this.extra.textContent = opts.extra?.label ?? '';
    this.extraRun = opts.extra?.run ?? null;
    this.stars.hidden = stars === 0 && title !== undefined;
    this.stars.replaceChildren();
    for (let i = 0; i < 3; i++)
      this.stars.append(el('i', { class: i < stars ? 'on' : '', html: ICONS.star, style: `--i:${i}` }));
    this.stars.setAttribute('role', 'img');
    this.stars.setAttribute('aria-label', t('journey.stars', { n: stars }));
    this.stats.replaceChildren(
      ...stats.map((s) => {
        const dd = el('dd', { class: s.gain ? 'gain' : '' }, [s.value]);
        if (s.count) countUp(dd, s.count.from, s.count.to, s.count.format);
        return el('div', {}, [el('dt', {}, [s.label]), dd]);
      }),
    );
    this.note.textContent = note;
    this.note.hidden = !note;
    this.next.hidden = !hasNext;
    this.show();
  }
}

const UNDO =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg>';

const BULB =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>';

const CAP =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c0 1.5 3 3 6 3s6-1.5 6-3v-5"/><path d="M22 9v6"/></svg>';

const BACK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';

export interface HubGame {
  readonly id: string;
  readonly icon: string;
  readonly name: string;
  readonly desc: string;
  open(): void;
}

/** Workshop: one card per small wood game, with the stars earned in each. */
export class WorkshopHub extends WorkshopOverlay {
  private readonly counts = new Map<string, HTMLSpanElement>();
  private readonly buttons = new Map<string, { b: HTMLButtonElement; name: string; desc: string }>();

  constructor(games: readonly HubGame[], h: { onClose(): void }) {
    super('workshop-hub dialog-layer', 'hubTitle');
    this.card.classList.add('wide');
    const close = el('button', { class: 'btn close', 'aria-label': t('common.done'), html: '×' });
    close.addEventListener('click', h.onClose);
    this.node.addEventListener('pointerdown', (e) => {
      if (e.target === this.node) h.onClose();
    });
    const list = el('div', { class: 'hub-list' });
    for (const g of games) {
      const count = el('span', { class: 'hub-stars' });
      this.counts.set(g.id, count);
      const b = el('button', { class: 'hub-game' }, [
        el('span', { class: 'icon', html: g.icon }),
        el('span', { class: 'hub-text' }, [el('strong', {}, [g.name]), el('small', {}, [g.desc])]),
        count,
        el('span', { class: 'chev', html: ICONS.chevron }),
      ]);
      b.dataset.game = g.id;
      rise([b], list.children.length + 1);
      this.buttons.set(g.id, { b, name: g.name, desc: g.desc });
      b.addEventListener('click', () => g.open());
      list.append(b);
    }
    this.card.append(
      el('div', { class: 'journey-head' }, [el('h2', { id: 'hubTitle' }, [t('mode.workshop')]), close]),
      list,
    );
  }

  setStars(id: string, earned: number, total: number): void {
    const c = this.counts.get(id);
    if (!c) return;
    c.innerHTML = ICONS.star;
    c.append(`${num(earned)}/${num(total)}`);
    c.setAttribute('aria-hidden', 'true');
    const x = this.buttons.get(id);
    x?.b.setAttribute('aria-label', `${x.name}. ${x.desc}. ${t('journey.stars', { n: earned })}`);
  }
}
