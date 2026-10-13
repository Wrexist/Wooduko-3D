import { num, t } from '../i18n';
import { Overlay } from './dialogs';
import { el, ICONS } from './dom';

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
      el('div', { class: 'k-progress' }, [
        el('span', { class: 'k-star', html: ICONS.star }),
        this.count,
        el('span', { class: 'k-bar-track', 'aria-hidden': 'true' }, [this.fill]),
      ]),
      this.grid,
      this.note,
    );
    for (let n = 1; n <= total; n++) {
      const b = el('button', { class: 'k-level', role: 'listitem' }, [el('b', {}, [String(n)])]);
      b.addEventListener('click', () => h.onPlay(n));
      this.grid.append(b);
    }
  }

  update(best: readonly number[]): void {
    const open = unlocked(best, this.total);
    let solved = 0;
    let earned = 0;
    [...this.grid.children].forEach((node, i) => {
      const n = i + 1;
      const b = node as HTMLButtonElement;
      const stars = best[n - 1] ?? 0;
      earned += stars;
      if (stars) solved++;
      const locked = n > open;
      b.className = `k-level${locked ? ' locked' : ''}${n === open && !stars ? ' current' : ''}${stars ? ' done' : ''}`;
      b.disabled = locked;
      b.setAttribute(
        'aria-label',
        locked
          ? t('journey.locked', { n })
          : `${t('journey.level', { n })}, ${t('journey.stars', { n: stars })}`,
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

  constructor(h: { onBack(): void; onRestart(): void }) {
    const back = el('button', { class: 'btn', 'aria-label': t('workshop.back'), html: BACK });
    const restart = el('button', { class: 'btn', 'aria-label': t('workshop.restart'), html: ICONS.restart });
    back.addEventListener('click', h.onBack);
    restart.addEventListener('click', h.onRestart);
    this.node = el('div', { class: 'k-bar', hidden: '' }, [
      back,
      el('div', { class: 'k-info' }, [this.title, this.moves, this.par]),
      restart,
    ]);
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

  constructor(h: { onUndo?(): void; onHint(): void }, hintNote: string) {
    this.undo = el('button', { class: 'ghost-btn k-tool' }, [el('span', { html: UNDO }), t('workshop.undo')]);
    this.hint = el('button', { class: 'ghost-btn k-tool' }, [el('span', { html: BULB }), t('workshop.hint')]);
    this.hint.setAttribute('aria-description', hintNote);
    const onUndo = h.onUndo;
    if (onUndo) this.undo.addEventListener('click', () => onUndo());
    else this.undo.hidden = true;
    this.hint.addEventListener('click', h.onHint);
    this.node = el('div', { class: 'k-tools', hidden: '' }, [this.undo, this.hint]);
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
}

/** Solved card: stars that pop in, a row of stats, Next level, and Try again / Levels side by side. */
export class WinCard extends Overlay {
  private readonly stars = el('div', { class: 'k-win-stars' });
  private readonly stats = el('dl', { class: 'k-stats' });
  private readonly note = el('p', { class: 'k-note' });
  private readonly next = el('button', { class: 'cta' }, [t('workshop.next')]);

  constructor(h: { onNext(): void; onReplay(): void; onLevels(): void }) {
    super('workshop-win dialog-layer', 'kWinTitle');
    this.card.classList.add('k-win');
    const replay = el('button', { class: 'ghost-btn' }, [t('workshop.replay')]);
    const levels = el('button', { class: 'ghost-btn' }, [t('workshop.levels')]);
    this.next.addEventListener('click', h.onNext);
    replay.addEventListener('click', h.onReplay);
    levels.addEventListener('click', h.onLevels);
    this.card.append(
      this.stars,
      el('h2', { id: 'kWinTitle' }, [t('workshop.solved')]),
      this.stats,
      this.note,
      el('div', { class: 'k-actions' }, [this.next, el('div', { class: 'pair' }, [replay, levels])]),
    );
  }

  present(stars: number, stats: readonly WinStat[], hasNext: boolean, note = ''): void {
    this.stars.replaceChildren();
    for (let i = 0; i < 3; i++)
      this.stars.append(el('i', { class: i < stars ? 'on' : '', html: ICONS.star, style: `--i:${i}` }));
    this.stars.setAttribute('role', 'img');
    this.stars.setAttribute('aria-label', t('journey.stars', { n: stars }));
    this.stats.replaceChildren(
      ...stats.map((s) => el('div', {}, [el('dt', {}, [s.label]), el('dd', {}, [s.value])])),
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
      ]);
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
