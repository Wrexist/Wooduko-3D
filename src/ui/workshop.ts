import { num, t } from '../i18n';
import { Overlay } from './dialogs';
import { el, ICONS } from './dom';

const starsRow = (n: number): HTMLSpanElement => {
  const row = el('span', { class: 'stars', 'aria-hidden': 'true' });
  for (let i = 0; i < 3; i++) row.append(el('i', { class: i < n ? 'on' : '', html: ICONS.star }));
  return row;
};

/** One past the last solved level (levels unlock in order). */
const unlocked = (stars: readonly number[], total: number): number => {
  let n = 1;
  while (n <= total && (stars[n - 1] ?? 0) > 0) n++;
  return Math.min(n, total);
};

/** A Workshop game's levels: a grid, best stars under each, later ones locked. */
export class LevelPicker extends Overlay {
  private readonly grid = el('div', { class: 'k-grid' });
  private readonly note = el('p', { class: 'note' });

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
      el('div', { class: 'journey-head' }, [el('h2', { id: `${id}Title` }, [title]), close]),
      el('p', { class: 'lead' }, [lead]),
      this.grid,
      this.note,
    );
    for (let n = 1; n <= total; n++) {
      const b = el('button', { class: 'stone' }, [el('b', {}, [String(n)])]);
      b.addEventListener('click', () => h.onPlay(n));
      this.grid.append(b);
    }
  }

  update(best: readonly number[]): void {
    const open = unlocked(best, this.total);
    let solved = 0;
    [...this.grid.children].forEach((node, i) => {
      const n = i + 1;
      const b = node as HTMLButtonElement;
      const stars = best[n - 1] ?? 0;
      if (stars) solved++;
      const locked = n > open;
      b.className = `stone${locked ? ' locked' : ''}${n === open && !stars ? ' current' : ''}${stars ? ' done' : ''}`;
      b.disabled = locked;
      b.setAttribute(
        'aria-label',
        locked
          ? t('journey.locked', { n })
          : `${t('journey.level', { n })}, ${t('journey.stars', { n: stars })}`,
      );
      b.querySelector('.stars')?.remove();
      if (!locked) b.append(starsRow(stars));
    });
    this.note.textContent = solved === this.total ? t('workshop.allDone') : '';
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

  /** Height (px) the tools take from the bottom of the screen. */
  get height(): number {
    return this.node.hidden ? 0 : window.innerHeight - this.node.getBoundingClientRect().top;
  }

  set(canUndo: boolean, hinted: boolean): void {
    this.undo.disabled = !canUndo;
    this.hint.classList.toggle('used', hinted);
  }

  show(on: boolean): void {
    this.node.hidden = !on;
  }
}

/** Solved card: stars, a result line, Next / Try again / Levels. */
export class WinCard extends Overlay {
  private readonly stars = el('div', { class: 'k-stars' });
  private readonly line = el('p', { class: 'lead' });
  private readonly next = el('button', { class: 'cta' }, [t('workshop.next')]);

  constructor(h: { onNext(): void; onReplay(): void; onLevels(): void }) {
    super('workshop-win dialog-layer', 'kWinTitle');
    const replay = el('button', { class: 'ghost-btn' }, [t('workshop.replay')]);
    const levels = el('button', { class: 'ghost-btn' }, [t('workshop.levels')]);
    this.next.addEventListener('click', h.onNext);
    replay.addEventListener('click', h.onReplay);
    levels.addEventListener('click', h.onLevels);
    this.card.append(
      el('h2', { id: 'kWinTitle' }, [t('workshop.solved')]),
      this.stars,
      this.line,
      el('div', { class: 'stack' }, [this.next, replay, levels]),
    );
  }

  present(stars: number, line: string, hasNext: boolean): void {
    this.stars.replaceChildren(starsRow(stars));
    this.stars.setAttribute('aria-label', t('journey.stars', { n: stars }));
    this.line.textContent = line;
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
export class WorkshopHub extends Overlay {
  private readonly counts = new Map<string, HTMLSpanElement>();

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
    c.setAttribute('aria-label', t('journey.stars', { n: earned }));
  }
}
