import { kUnlocked } from '../core/klotski';
import type { KProgress } from '../core/klotski';
import { num, t } from '../i18n';
import { Overlay } from './dialogs';
import { el, ICONS } from './dom';

const starsRow = (n: number): HTMLSpanElement => {
  const row = el('span', { class: 'stars', 'aria-hidden': 'true' });
  for (let i = 0; i < 3; i++) row.append(el('i', { class: i < n ? 'on' : '', html: ICONS.star }));
  return row;
};

/** Workshop → Sliding blocks: a grid of levels, best stars under each, later ones locked. */
export class KlotskiPicker extends Overlay {
  private readonly grid = el('div', { class: 'k-grid' });
  private readonly note = el('p', { class: 'note' });

  constructor(
    private readonly total: number,
    h: { onPlay(n: number): void; onClose(): void },
  ) {
    super('workshop dialog-layer', 'workshopTitle');
    this.card.classList.add('wide', 'workshop-card');
    const close = el('button', { class: 'btn close', 'aria-label': t('common.done'), html: '×' });
    close.addEventListener('click', h.onClose);
    this.node.addEventListener('pointerdown', (e) => {
      if (e.target === this.node) h.onClose();
    });
    this.card.append(
      el('div', { class: 'journey-head' }, [
        el('h2', { id: 'workshopTitle' }, [t('workshop.klotski')]),
        close,
      ]),
      el('p', { class: 'lead' }, [t('workshop.goal')]),
      this.grid,
      this.note,
    );
    for (let n = 1; n <= total; n++) {
      const b = el('button', { class: 'stone' }, [el('b', {}, [String(n)])]);
      b.addEventListener('click', () => h.onPlay(n));
      this.grid.append(b);
    }
  }

  update(p: KProgress): void {
    const open = kUnlocked(p, this.total);
    let solved = 0;
    [...this.grid.children].forEach((node, i) => {
      const n = i + 1;
      const b = node as HTMLButtonElement;
      const stars = p.stars[n - 1] ?? 0;
      if (stars) solved++;
      const locked = n > open;
      b.className = `stone${locked ? ' locked' : ''}${n === open && !stars ? ' current' : ''}${stars ? ' done' : ''}`;
      b.disabled = locked;
      b.setAttribute(
        'aria-label',
        locked ? t('journey.locked', { n }) : `${t('journey.level', { n })}, ${t('journey.stars', { n: stars })}`,
      );
      b.querySelector('.stars')?.remove();
      if (!locked) b.append(starsRow(stars));
    });
    this.note.textContent = solved === this.total ? t('workshop.allDone') : '';
  }
}

/** Top bar while sliding: back, level, moves (with the best possible), restart. */
export class KlotskiBar {
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

  set(level: number, moves: number, par: number): void {
    this.title.textContent = t('journey.level', { n: level });
    this.moves.textContent = t('workshop.moves', { n: num(moves) });
    this.par.textContent = t('workshop.par', { n: num(par) });
  }

  show(on: boolean): void {
    this.node.hidden = !on;
  }
}

/** Solved card: stars, moves vs the best possible, Next / Try again / Levels. */
export class KlotskiWin extends Overlay {
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

  present(stars: number, moves: number, par: number, hasNext: boolean): void {
    this.stars.replaceChildren(starsRow(stars));
    this.stars.setAttribute('aria-label', t('journey.stars', { n: stars }));
    this.line.textContent = t('workshop.result', { n: num(moves), p: num(par) });
    this.next.hidden = !hasNext;
    this.show();
  }
}

const BACK =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
