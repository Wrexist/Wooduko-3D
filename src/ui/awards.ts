import { THEMES } from '../config';
import type { ThemeId } from '../config';
import { ACHIEVEMENTS, averageScore, themeUnlocked } from '../core/progress';
import type { AchievementId, Stats, Unlocked } from '../core/progress';
import { num, t } from '../i18n';
import type { Key } from '../i18n';
import { Overlay } from './dialogs';
import { el, ICONS } from './dom';

const fmt = num;
export const achTitle = (id: AchievementId): string => t(`ach.${id}` as Key);
export const achDesc = (id: AchievementId): string => t(`ach.${id}.desc` as Key);
export const woodName = (id: ThemeId): string => t(`wood.${id}` as Key);
const titleOf = (id: AchievementId | null): string => (id ? achTitle(id) : '');

/** Stats, wood themes and achievements. */
export class AwardsPanel extends Overlay {
  private readonly statsEl = el('dl', { class: 'stats' });
  private readonly themesEl = el('div', {
    class: 'themes',
    role: 'radiogroup',
    'aria-label': t('awards.wood'),
  });
  private readonly listEl = el('ul', { class: 'achievements' });
  private readonly countEl = el('span', { class: 'count' });

  private readonly leaderboard = el('button', { class: 'ghost-btn', hidden: '' }, [t('awards.leaderboard')]);

  constructor(private readonly h: { onTheme(id: ThemeId): void; onClose(): void; onLeaderboard(): void }) {
    super('awards dialog-layer', 'awardsTitle');
    const done = el('button', { class: 'cta' }, [t('common.done')]);
    done.addEventListener('click', h.onClose);
    this.leaderboard.addEventListener('click', h.onLeaderboard);
    this.node.addEventListener('pointerdown', (e) => {
      if (e.target === this.node) h.onClose();
    });
    this.card.classList.add('wide');
    this.card.append(
      el('h2', { id: 'awardsTitle' }, [t('awards.title')]),
      this.statsEl,
      el('h3', {}, [t('awards.wood')]),
      this.themesEl,
      el('h3', {}, [`${t('awards.achievements')} `, this.countEl]),
      this.listEl,
      el('div', { class: 'stack' }, [this.leaderboard, done]),
    );
  }

  update(stats: Stats, best: number, unlocked: Unlocked, theme: ThemeId, leaderboard = false): void {
    this.leaderboard.hidden = !leaderboard;
    const rows: [string, string][] = [
      [t('stat.best'), fmt(Math.max(best, stats.bestScore))],
      [t('stat.games'), fmt(stats.gamesPlayed)],
      [t('stat.average'), fmt(averageScore(stats))],
      [t('stat.lines'), fmt(stats.linesCleared)],
      [t('stat.bestCombo'), stats.bestCombo ? `×${stats.bestCombo}` : '–'],
      [t('stat.boardClears'), fmt(stats.boardClears)],
    ];
    this.statsEl.replaceChildren(
      ...rows.map(([k, v]) => el('div', { class: 'stat' }, [el('dt', {}, [k]), el('dd', {}, [v])])),
    );

    this.themesEl.replaceChildren(
      ...THEMES.map((th) => {
        const open = themeUnlocked(th, unlocked);
        const name = woodName(th.id);
        const b = el('button', {
          class: `swatch${th.id === theme ? ' on' : ''}${open ? '' : ' locked'}`,
          role: 'radio',
          'aria-checked': String(th.id === theme),
          'aria-label': open ? name : t('awards.locked', { name, req: titleOf(th.unlock) }),
          title: open ? name : t('awards.unlock', { req: titleOf(th.unlock) }),
        });
        const chip = el('span', { class: 'chip', 'aria-hidden': 'true' });
        chip.style.background = `radial-gradient(circle at 50% 45%, ${th.ring.gradient[0]}, ${th.ring.gradient[2]})`;
        chip.style.boxShadow = `0 0 0 3px ${th.table.base}`;
        b.append(chip, el('span', { class: 'name' }, [open ? name : titleOf(th.unlock)]));
        if (open) b.addEventListener('click', () => this.h.onTheme(th.id));
        else b.setAttribute('aria-disabled', 'true');
        return b;
      }),
    );

    const got = ACHIEVEMENTS.filter((a) => unlocked[a.id] !== undefined).length;
    this.countEl.textContent = `${got}/${ACHIEVEMENTS.length}`;
    this.listEl.replaceChildren(
      ...ACHIEVEMENTS.map((a) => {
        const have = unlocked[a.id] !== undefined;
        const icon = el('span', {
          class: 'icon',
          'aria-hidden': 'true',
          html: have ? ICONS.crown : ICONS.lock,
        });
        return el('li', { class: have ? 'have' : '' }, [
          icon,
          el('span', { class: 'text' }, [
            el('strong', {}, [achTitle(a.id)]),
            el('small', {}, [achDesc(a.id)]),
          ]),
          el('span', { class: 'sr-only' }, [have ? t('awards.unlocked') : t('awards.lockedShort')]),
        ]);
      }),
    );
  }
}

/** Slide-down "Achievement unlocked" banner under the HUD. Queues; never takes input. */
export class AchievementBanner {
  readonly node = el('div', { class: 'banner', role: 'status', 'aria-live': 'polite' });
  private readonly title = el('strong');
  private readonly detail = el('small');
  private queue: { title: string; detail: string }[] = [];
  private left = 0;

  constructor(private readonly seconds: number) {
    // built once; each achievement only swaps the text
    this.node.append(
      el('span', { class: 'icon', 'aria-hidden': 'true', html: ICONS.crown }),
      el('span', { class: 'text' }, [this.title, this.detail]),
    );
  }

  push(ids: readonly AchievementId[]): void {
    for (const id of ids) {
      const unlocksTheme = THEMES.find((th) => th.unlock === id);
      const detail = unlocksTheme
        ? `${achDesc(id)} · ${t('awards.woodUnlocked', { name: woodName(unlocksTheme.id) })}`
        : achDesc(id);
      this.pushText(achTitle(id), detail);
    }
  }

  /** Any other good news (e.g. daily quests complete). */
  pushText(title: string, detail: string): void {
    this.queue.push({ title, detail });
    if (this.left <= 0) this.next();
  }

  private next(): void {
    const item = this.queue.shift();
    if (!item) {
      this.node.classList.remove('show');
      return;
    }
    this.title.textContent = item.title;
    this.detail.textContent = item.detail;
    this.node.classList.add('show');
    this.left = this.seconds;
  }

  update(dt: number): void {
    if (this.left <= 0) return;
    this.left -= dt;
    if (this.left <= 0) this.next();
  }

  get showing(): boolean {
    return this.node.classList.contains('show');
  }
}
