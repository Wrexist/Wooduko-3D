import { JOURNEY } from '../config';
import { levelSpec, totalStars, unlockedLevel } from '../core/journey';
import type { Goal, JourneyProgress } from '../core/journey';
import { num, t } from '../i18n';
import type { Key } from '../i18n';
import { Overlay } from './dialogs';
import { el, ICONS } from './dom';

export const GOAL_ICON: Record<Goal['kind'], string> = {
  score: ICONS.star,
  lines: ICONS.lines,
  gems: ICONS.gem,
  crates: ICONS.crate,
};

export const goalLabel = (g: Goal): string => t(`goal.${g.kind}` as Key, { n: num(g.target) });

const starsRow = (n: number, cls = 'stars'): HTMLSpanElement => {
  const row = el('span', { class: cls, 'aria-hidden': 'true' });
  for (let i = 0; i < 3; i++) row.append(el('i', { class: i < n ? 'on' : '', html: ICONS.star }));
  return row;
};

/**
 * Journey map: a winding path of level stones, best stars under each, the next level glowing.
 * Tapping a level opens its card (goals, moves, Play).
 */
export class JourneyMap extends Overlay {
  private readonly path = el('div', { class: 'path' });
  private readonly total = el('span', { class: 'count' });
  private readonly sheet = el('div', { class: 'level-sheet', hidden: '' });
  private progress: JourneyProgress = { stars: [] };
  private selected = 1;

  constructor(private readonly h: { onPlay(n: number): void; onClose(): void }) {
    super('journey dialog-layer', 'journeyTitle');
    this.card.classList.add('wide', 'journey-card');
    const close = el('button', { class: 'btn close', 'aria-label': t('common.done'), html: '×' });
    close.addEventListener('click', h.onClose);
    this.node.addEventListener('pointerdown', (e) => {
      if (e.target === this.node) h.onClose();
    });
    const head = el('div', { class: 'journey-head' }, [
      el('h2', { id: 'journeyTitle' }, [t('mode.journey')]),
      el('span', { class: 'total', html: ICONS.star }, [this.total]),
      close,
    ]);
    this.card.append(head, this.path, this.sheet);
    for (let n = 1; n <= JOURNEY.levels; n++) {
      const b = el('button', { class: 'stone' }, [el('b', {}, [String(n)])]);
      // a gentle zig-zag across the card
      b.style.setProperty('--x', String(Math.round(Math.sin(n * 0.9) * 34)));
      b.addEventListener('click', () => this.select(n));
      this.path.append(b);
    }
  }

  update(p: JourneyProgress): void {
    this.progress = p;
    const open = unlockedLevel(p);
    this.total.textContent = num(totalStars(p));
    [...this.path.children].forEach((node, i) => {
      const n = i + 1;
      const b = node as HTMLButtonElement;
      const stars = p.stars[n - 1] ?? 0;
      const locked = n > open;
      b.className = `stone${locked ? ' locked' : ''}${n === open ? ' current' : ''}${stars ? ' done' : ''}`;
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
  }

  /** Open the map scrolled to the next level to play. */
  openMap(): void {
    this.sheet.hidden = true;
    this.show();
    const cur = this.path.children[unlockedLevel(this.progress) - 1];
    if (cur instanceof HTMLElement) cur.scrollIntoView({ block: 'center' });
  }

  /** Show a level's card (goals, moves, Play). */
  select(n: number): void {
    this.selected = n;
    const spec = levelSpec(n);
    const play = el('button', { class: 'cta' }, [t('journey.play')]);
    play.addEventListener('click', () => this.h.onPlay(this.selected));
    const back = el('button', { class: 'ghost-btn' }, [t('journey.map')]);
    back.addEventListener('click', () => {
      this.sheet.hidden = true;
    });
    this.sheet.replaceChildren(
      el('h3', {}, [t('journey.level', { n })]),
      starsRow(this.progress.stars[n - 1] ?? 0, 'stars big'),
      el('p', { class: 'moves', html: ICONS.moves }, [t('journey.moves', { n: spec.moves })]),
      el(
        'ul',
        { class: 'goal-list' },
        spec.goals.map((g) => el('li', { html: GOAL_ICON[g.kind] }, [goalLabel(g)])),
      ),
      el('div', { class: 'pair' }, [back, play]),
    );
    this.sheet.hidden = false;
    play.focus({ preventScroll: true });
  }
}
