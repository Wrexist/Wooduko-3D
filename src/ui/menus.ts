import type { Settings } from '../core/types';
import { Overlay } from './dialogs';
import { el, ICONS } from './dom';

/** Home: title, best, Continue (when a save exists), Play / New game, Settings. */
export class HomeMenu extends Overlay {
  private readonly bestVal = el('span', {}, ['0']);
  private readonly cont = el('button', { class: 'cta' }, ['Continue']);
  private readonly play = el('button', { class: 'cta' }, ['Play']);

  constructor(h: { onPlay(): void; onContinue(): void; onSettings(): void; onAwards(): void }) {
    super('home', 'homeTitle');
    const best = el('div', { class: 'best' });
    best.innerHTML = ICONS.crown;
    best.append(this.bestVal);
    const settings = el('button', { class: 'ghost-btn' }, ['Settings']);
    const awards = el('button', { class: 'ghost-btn' }, ['Awards']);
    awards.addEventListener('click', h.onAwards);
    this.cont.addEventListener('click', h.onContinue);
    this.play.addEventListener('click', h.onPlay);
    settings.addEventListener('click', h.onSettings);
    this.card.append(
      el('div', { class: 'title', id: 'homeTitle' }, ['Grain']),
      el('div', { class: 'subtitle' }, ['Wood block puzzle']),
      best,
      el('div', { class: 'stack' }, [this.cont, this.play, el('div', { class: 'pair' }, [awards, settings])]),
    );
  }

  update(best: number, hasSave: boolean): void {
    this.bestVal.textContent = String(best);
    this.cont.hidden = !hasSave;
    this.play.textContent = hasSave ? 'New game' : 'Play';
    this.play.className = hasSave ? 'ghost-btn' : 'cta';
  }
}

export class PauseMenu extends Overlay {
  constructor(h: {
    onResume(): void;
    onRestart(): void;
    onSettings(): void;
    onHome(): void;
    onAwards(): void;
  }) {
    super('pause', 'pauseTitle');
    const resume = el('button', { class: 'cta' }, ['Resume']);
    const restart = el('button', { class: 'ghost-btn' }, ['Restart']);
    const settings = el('button', { class: 'ghost-btn' }, ['Settings']);
    const home = el('button', { class: 'ghost-btn' }, ['Home']);
    const awards = el('button', { class: 'ghost-btn' }, ['Awards']);
    awards.addEventListener('click', h.onAwards);
    resume.addEventListener('click', h.onResume);
    restart.addEventListener('click', h.onRestart);
    settings.addEventListener('click', h.onSettings);
    home.addEventListener('click', h.onHome);
    this.card.append(
      el('h2', { id: 'pauseTitle' }, ['Paused']),
      el('div', { class: 'stack' }, [
        resume,
        restart,
        el('div', { class: 'pair' }, [awards, settings]),
        home,
      ]),
    );
  }
}

/** On/off settings (the wood theme is picked on the Awards screen). */
export type ToggleKey = Exclude<keyof Settings, 'theme'>;

const LABELS: Record<ToggleKey, string> = {
  sound: 'Sound effects',
  music: 'Music',
  haptics: 'Haptics',
  reduceMotion: 'Reduce motion',
};

export class SettingsPanel extends Overlay {
  private readonly toggles = new Map<ToggleKey, HTMLButtonElement>();

  constructor(h: { onToggle(key: ToggleKey): void; onReset(): void; onClose(): void }) {
    super('settings dialog-layer', 'settingsTitle');
    const list = el('div', { class: 'settings-list' });
    for (const key of Object.keys(LABELS) as ToggleKey[]) {
      const id = `set-${key}`;
      const t = el('button', {
        class: 'toggle',
        role: 'switch',
        'aria-checked': 'false',
        'aria-labelledby': id,
      });
      t.addEventListener('click', () => h.onToggle(key));
      this.toggles.set(key, t);
      list.append(el('div', { class: 'setting' }, [el('span', { id }, [LABELS[key]]), t]));
    }
    const reset = el('button', { class: 'ghost-btn danger' }, ['Reset progress']);
    const done = el('button', { class: 'cta' }, ['Done']);
    reset.addEventListener('click', h.onReset);
    done.addEventListener('click', h.onClose);
    this.node.addEventListener('pointerdown', (e) => {
      if (e.target === this.node) h.onClose();
    });
    this.card.append(
      el('h2', { id: 'settingsTitle' }, ['Settings']),
      list,
      el('div', { class: 'stack' }, [done, reset]),
    );
  }

  update(s: Settings): void {
    for (const [key, t] of this.toggles) t.setAttribute('aria-checked', String(s[key]));
  }
}
