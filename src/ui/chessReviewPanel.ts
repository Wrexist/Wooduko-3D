import type { Grade } from '../core/chessSchool';
import type { GradeCounts, Review } from '../core/chessReview';
import { num, t } from '../i18n';
import type { Key } from '../i18n';
import { el } from './dom';
import { countUp } from './workshop';

const ICON = {
  first:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M17 6l-6 6 6 6"/><path d="M7 6v12"/></svg>',
  prev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6"/></svg>',
  next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
};

const SHOWN: readonly Grade[] = ['best', 'inaccuracy', 'mistake', 'blunder'];

/**
 * The game review along the bottom: while the engine looks at every position, a progress bar;
 * then each side's accuracy and how many best moves / slips / mistakes / blunders, and buttons to
 * step through the game (start, back, forward, next mistake, done).
 */
export class ReviewPanel {
  readonly node = el('div', { class: 'rv', hidden: '', role: 'region', 'aria-label': t('review.title') });
  private readonly progress = el('div', { class: 'rv-progress' });
  private readonly progressText = el('span');
  private readonly progressFill = el('i');
  private readonly summary = el('div', { class: 'rv-summary', hidden: '' });
  private readonly nav = el('div', { class: 'rv-nav', hidden: '' });
  private readonly ply = el('span', { class: 'rv-ply', 'aria-live': 'polite' });
  private readonly prevBtn: HTMLButtonElement;
  private readonly nextBtn: HTMLButtonElement;
  private readonly firstBtn: HTMLButtonElement;
  private readonly mistakeBtn: HTMLButtonElement;

  constructor(h: { onFirst(): void; onPrev(): void; onNext(): void; onMistake(): void; onDone(): void }) {
    const icon = (html: string, label: Key, run: () => void): HTMLButtonElement => {
      const b = el('button', { class: 'btn rv-icon', 'aria-label': t(label), html });
      b.addEventListener('click', run);
      return b;
    };
    this.firstBtn = icon(ICON.first, 'review.start', h.onFirst);
    this.prevBtn = icon(ICON.prev, 'review.prev', h.onPrev);
    this.nextBtn = icon(ICON.next, 'review.next', h.onNext);
    this.mistakeBtn = el('button', { class: 'ghost-btn rv-mistake' }, [t('review.nextMistake')]);
    this.mistakeBtn.addEventListener('click', h.onMistake);
    const done = el('button', { class: 'ghost-btn rv-done' }, [t('review.done')]);
    done.addEventListener('click', h.onDone);
    this.progress.append(el('span', { class: 'rv-track' }, [this.progressFill]), this.progressText);
    this.nav.append(
      el('div', { class: 'rv-steps' }, [this.firstBtn, this.prevBtn, this.ply, this.nextBtn]),
      el('div', { class: 'rv-actions' }, [this.mistakeBtn, done]),
    );
    this.node.append(this.progress, this.summary, this.nav);
  }

  get height(): number {
    if (this.node.hidden) return 0;
    return window.innerHeight - this.node.getBoundingClientRect().top;
  }

  show(on: boolean): void {
    this.node.hidden = !on;
    if (on) {
      this.progress.hidden = false;
      this.summary.hidden = true;
      this.nav.hidden = true;
      this.analysing(0);
    }
  }

  analysing(fraction: number): void {
    const pct = Math.round(fraction * 100);
    this.progressFill.style.width = `${pct}%`;
    this.progressText.textContent = t('review.analysing', { n: pct });
  }

  /** The analysis is in: accuracies count up, then the steps appear. */
  ready(r: Review): void {
    this.progress.hidden = true;
    const side = (label: string, acc: number, c: GradeCounts, you: boolean): HTMLElement => {
      const pct = el('b', { class: 'rv-acc' });
      countUp(pct, 0, acc, (n) => `${num(n)} %`);
      const chips = el(
        'div',
        { class: 'rv-chips' },
        SHOWN.map((g) =>
          el('span', { class: `rv-chip g-${g}`, title: t(`review.g.${g}` as Key) }, [
            el('i', { 'aria-hidden': 'true' }),
            `${num(c[g])} ${t(`review.g.${g}` as Key).toLowerCase()}`,
          ]),
        ),
      );
      return el('div', { class: `rv-side${you ? ' you' : ''}` }, [
        el('small', {}, [`${label} · ${t('review.accuracy')}`]),
        pct,
        chips,
      ]);
    };
    this.summary.replaceChildren(
      side(t('review.you'), r.white, r.whiteCounts, true),
      side(t('review.computer'), r.black, r.blackCounts, false),
    );
    this.summary.hidden = false;
    this.nav.hidden = false;
  }

  at(ply: number, total: number, hasMistake: boolean): void {
    this.ply.textContent = `${num(ply)} / ${num(total)}`;
    this.firstBtn.disabled = ply === 0;
    this.prevBtn.disabled = ply === 0;
    this.nextBtn.disabled = ply >= total;
    this.mistakeBtn.disabled = !hasMistake;
  }
}
