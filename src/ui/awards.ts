import { THEMES } from '../config';
import type { ThemeId } from '../config';
import { ACHIEVEMENTS, averageScore, themeUnlocked } from '../core/progress';
import type { AchievementId, Stats, Unlocked } from '../core/progress';
import { Overlay } from './dialogs';
import { el, ICONS } from './dom';

const fmt = (n: number): string => n.toLocaleString('en-US');
const titleOf = (id: AchievementId | null): string => ACHIEVEMENTS.find((a) => a.id === id)?.title ?? '';

/** Stats, wood themes and achievements. */
export class AwardsPanel extends Overlay {
  private readonly statsEl = el('dl', { class: 'stats' });
  private readonly themesEl = el('div', { class: 'themes', role: 'radiogroup', 'aria-label': 'Wood' });
  private readonly listEl = el('ul', { class: 'achievements' });
  private readonly countEl = el('span', { class: 'count' });

  private readonly leaderboard = el('button', { class: 'ghost-btn', hidden: '' }, [
    'Game Center leaderboard',
  ]);

  constructor(private readonly h: { onTheme(id: ThemeId): void; onClose(): void; onLeaderboard(): void }) {
    super('awards dialog-layer', 'awardsTitle');
    const done = el('button', { class: 'cta' }, ['Done']);
    done.addEventListener('click', h.onClose);
    this.leaderboard.addEventListener('click', h.onLeaderboard);
    this.node.addEventListener('pointerdown', (e) => {
      if (e.target === this.node) h.onClose();
    });
    this.card.classList.add('wide');
    this.card.append(
      el('h2', { id: 'awardsTitle' }, ['Awards']),
      this.statsEl,
      el('h3', {}, ['Wood']),
      this.themesEl,
      el('h3', {}, ['Achievements ', this.countEl]),
      this.listEl,
      el('div', { class: 'stack' }, [this.leaderboard, done]),
    );
  }

  update(stats: Stats, best: number, unlocked: Unlocked, theme: ThemeId, leaderboard = false): void {
    this.leaderboard.hidden = !leaderboard;
    const rows: [string, string][] = [
      ['Best', fmt(Math.max(best, stats.bestScore))],
      ['Games', fmt(stats.gamesPlayed)],
      ['Average', fmt(averageScore(stats))],
      ['Lines', fmt(stats.linesCleared)],
      ['Best combo', stats.bestCombo ? `×${stats.bestCombo}` : '–'],
      ['Board clears', fmt(stats.boardClears)],
    ];
    this.statsEl.replaceChildren(
      ...rows.map(([k, v]) => el('div', { class: 'stat' }, [el('dt', {}, [k]), el('dd', {}, [v])])),
    );

    this.themesEl.replaceChildren(
      ...THEMES.map((t) => {
        const open = themeUnlocked(t, unlocked);
        const b = el('button', {
          class: `swatch${t.id === theme ? ' on' : ''}${open ? '' : ' locked'}`,
          role: 'radio',
          'aria-checked': String(t.id === theme),
          'aria-label': open ? t.name : `${t.name}, locked: ${titleOf(t.unlock)}`,
          title: open ? t.name : `Unlock: ${titleOf(t.unlock)}`,
        });
        const chip = el('span', { class: 'chip', 'aria-hidden': 'true' });
        chip.style.background = `radial-gradient(circle at 50% 45%, ${t.ring.gradient[0]}, ${t.ring.gradient[2]})`;
        chip.style.boxShadow = `0 0 0 3px ${t.table.base}`;
        b.append(chip, el('span', { class: 'name' }, [open ? t.name : titleOf(t.unlock)]));
        if (open) b.addEventListener('click', () => this.h.onTheme(t.id));
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
          el('span', { class: 'text' }, [el('strong', {}, [a.title]), el('small', {}, [a.description])]),
          el('span', { class: 'sr-only' }, [have ? 'Unlocked' : 'Locked']),
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
  private queue: AchievementId[] = [];
  private left = 0;

  constructor(private readonly seconds: number) {
    // built once; each achievement only swaps the text
    this.node.append(
      el('span', { class: 'icon', 'aria-hidden': 'true', html: ICONS.crown }),
      el('span', { class: 'text' }, [this.title, this.detail]),
    );
  }

  push(ids: readonly AchievementId[]): void {
    this.queue.push(...ids);
    if (this.left <= 0) this.next();
  }

  private next(): void {
    const id = this.queue.shift();
    if (!id) {
      this.node.classList.remove('show');
      return;
    }
    const a = ACHIEVEMENTS.find((x) => x.id === id);
    const unlocksTheme = THEMES.find((t) => t.unlock === id);
    this.title.textContent = a?.title ?? '';
    this.detail.textContent = unlocksTheme
      ? `${a?.description ?? ''} · ${unlocksTheme.name} wood unlocked`
      : (a?.description ?? '');
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
