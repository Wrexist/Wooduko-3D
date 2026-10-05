import type { Settings } from '../core/types';
import { num, t } from '../i18n';
import type { Key } from '../i18n';
import { Overlay } from './dialogs';
import { el, ICONS } from './dom';

/** Home: title, best, Continue (when a save exists), Play / New game, Settings. */
export class HomeMenu extends Overlay {
  private readonly bestVal = el('span', {}, ['0']);
  private readonly cont = el('button', { class: 'cta' }, [t('home.continue')]);
  private readonly play = el('button', { class: 'cta' }, [t('home.play')]);

  /** Soft ask for the daily reminder (shown once, after a few sessions, native only). */
  private readonly offer: HTMLDivElement;

  constructor(h: {
    onPlay(): void;
    onContinue(): void;
    onSettings(): void;
    onAwards(): void;
    onReminder(yes: boolean): void;
  }) {
    super('home', 'homeTitle');
    const best = el('div', { class: 'best' });
    best.innerHTML = ICONS.crown;
    best.append(this.bestVal);
    const settings = el('button', { class: 'ghost-btn' }, [t('home.settings')]);
    const awards = el('button', { class: 'ghost-btn' }, [t('home.awards')]);
    awards.addEventListener('click', h.onAwards);
    this.cont.addEventListener('click', h.onContinue);
    this.play.addEventListener('click', h.onPlay);
    settings.addEventListener('click', h.onSettings);
    this.card.append(
      el('div', { class: 'title', id: 'homeTitle' }, [t('app.title')]),
      el('div', { class: 'subtitle' }, [t('app.subtitle')]),
      best,
      el('div', { class: 'stack' }, [this.cont, this.play, el('div', { class: 'pair' }, [awards, settings])]),
    );
    const yes = el('button', { class: 'cta small' }, [t('home.reminderYes')]);
    const no = el('button', { class: 'ghost-btn small' }, [t('home.reminderNo')]);
    yes.addEventListener('click', () => h.onReminder(true));
    no.addEventListener('click', () => h.onReminder(false));
    this.offer = el('div', { class: 'offer', hidden: '' }, [
      el('p', {}, [t('home.reminder')]),
      el('div', { class: 'pair' }, [no, yes]),
    ]);
    this.card.append(this.offer);
  }

  setOffer(visible: boolean): void {
    this.offer.hidden = !visible;
  }

  update(best: number, hasSave: boolean): void {
    this.bestVal.textContent = num(best);
    this.cont.hidden = !hasSave;
    this.play.textContent = hasSave ? t('home.newGame') : t('home.play');
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
    const resume = el('button', { class: 'cta' }, [t('pause.resume')]);
    const restart = el('button', { class: 'ghost-btn' }, [t('pause.restart')]);
    const settings = el('button', { class: 'ghost-btn' }, [t('home.settings')]);
    const home = el('button', { class: 'ghost-btn' }, [t('pause.home')]);
    const awards = el('button', { class: 'ghost-btn' }, [t('home.awards')]);
    awards.addEventListener('click', h.onAwards);
    resume.addEventListener('click', h.onResume);
    restart.addEventListener('click', h.onRestart);
    settings.addEventListener('click', h.onSettings);
    home.addEventListener('click', h.onHome);
    this.card.append(
      el('h2', { id: 'pauseTitle' }, [t('pause.title')]),
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

const LABELS: Record<ToggleKey, Key> = {
  sound: 'settings.sound',
  music: 'settings.music',
  haptics: 'settings.haptics',
  reduceMotion: 'settings.reduceMotion',
  hints: 'settings.hints',
};

export class SettingsPanel extends Overlay {
  private readonly toggles = new Map<ToggleKey, HTMLButtonElement>();

  private readonly reminderRow: HTMLDivElement;
  private readonly reminderToggle: HTMLButtonElement;
  private readonly buy = el('button', { class: 'ghost-btn buy', hidden: '' });
  private readonly restore = el('button', { class: 'ghost-btn', hidden: '' });
  private readonly owned = el('p', { class: 'owned', hidden: '' });
  private readonly privacy = el('button', { class: 'ghost-btn', hidden: '' });
  private readonly note = el('p', { class: 'note', 'aria-live': 'polite' });

  constructor(h: {
    onToggle(key: ToggleKey): void;
    onReminder(): void;
    onReset(): void;
    onClose(): void;
    onBuy(): void;
    onRestore(): void;
    onPrivacy(): void;
  }) {
    super('settings dialog-layer', 'settingsTitle');
    const list = el('div', { class: 'settings-list' });
    for (const key of Object.keys(LABELS) as ToggleKey[]) {
      const id = `set-${key}`;
      const sw = el('button', {
        class: 'toggle',
        role: 'switch',
        'aria-checked': 'false',
        'aria-labelledby': id,
      });
      sw.addEventListener('click', () => h.onToggle(key));
      this.toggles.set(key, sw);
      list.append(el('div', { class: 'setting' }, [el('span', { id }, [t(LABELS[key])]), sw]));
    }
    this.reminderToggle = el('button', {
      class: 'toggle',
      role: 'switch',
      'aria-checked': 'false',
      'aria-labelledby': 'set-reminder',
    });
    this.reminderToggle.addEventListener('click', h.onReminder);
    this.reminderRow = el('div', { class: 'setting', hidden: '' }, [
      el('span', { id: 'set-reminder' }, [t('settings.reminder')]),
      this.reminderToggle,
    ]);
    list.append(this.reminderRow);
    this.buy.addEventListener('click', h.onBuy);
    this.restore.addEventListener('click', h.onRestore);
    this.privacy.addEventListener('click', h.onPrivacy);
    this.restore.textContent = t('settings.restore');
    this.privacy.textContent = t('settings.privacy');
    this.owned.textContent = t('settings.adsRemoved');
    const reset = el('button', { class: 'ghost-btn danger' }, [t('settings.reset')]);
    const done = el('button', { class: 'cta' }, [t('common.done')]);
    reset.addEventListener('click', h.onReset);
    done.addEventListener('click', h.onClose);
    this.node.addEventListener('pointerdown', (e) => {
      if (e.target === this.node) h.onClose();
    });
    this.card.append(
      el('h2', { id: 'settingsTitle' }, [t('settings.title')]),
      list,
      el('div', { class: 'stack' }, [done, this.owned, this.buy, this.restore, this.privacy, reset]),
      this.note,
      el('p', { class: 'version' }, [`Grain ${__APP_VERSION__}`]),
    );
  }

  /**
   * Remove ads: buy button (with price) and Restore where purchases exist; a thank-you once owned.
   * Privacy choices only where Google's consent rules require it.
   */
  setStore(available: boolean, owned: boolean, price: string | null, privacy: boolean): void {
    this.buy.hidden = !available || owned;
    this.restore.hidden = !available || owned;
    this.owned.hidden = !owned;
    this.buy.textContent = price ? t('settings.removeAdsPrice', { price }) : t('settings.removeAds');
    this.privacy.hidden = !privacy;
  }

  /** A short status line (e.g. after Restore). */
  setNote(text: string): void {
    this.note.textContent = text;
  }

  /** The reminder row only exists where the OS can deliver notifications. */
  setReminder(available: boolean, on: boolean): void {
    this.reminderRow.hidden = !available;
    this.reminderToggle.setAttribute('aria-checked', String(on));
  }

  update(s: Settings): void {
    for (const [key, t] of this.toggles) t.setAttribute('aria-checked', String(s[key]));
  }
}
