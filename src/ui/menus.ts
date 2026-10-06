import { CAMERA_VIEW_ORDER } from '../config';
import type { CameraView } from '../config';
import type { Settings } from '../core/types';
import { num, t } from '../i18n';
import type { Key } from '../i18n';
import { Overlay } from './dialogs';
import { el, ICONS } from './dom';

export interface QuestView {
  readonly text: string;
  readonly progress: number;
  readonly target: number;
}

/** Everything the home screen shows. */
export interface HomeView {
  readonly best: number;
  readonly hasSave: boolean;
  readonly daily: {
    readonly goal: number;
    readonly done: boolean;
    readonly best: number;
    readonly streak: number;
  };
  readonly blitzBest: number;
  readonly quests: readonly QuestView[];
  readonly questsDone: boolean;
  readonly questStreak: number;
}

/** Quest rows with progress bars. */
function questRows(quests: readonly QuestView[]): HTMLLIElement[] {
  return quests.map((q) => {
    const done = q.progress >= q.target;
    const fill = el('i');
    fill.style.width = `${Math.round((100 * Math.min(q.progress, q.target)) / q.target)}%`;
    const right = el('span', { class: 'n', 'aria-hidden': 'true' });
    if (done) right.innerHTML = ICONS.check;
    else right.textContent = `${num(q.progress)}/${num(q.target)}`;
    return el('li', { class: done ? 'done' : '' }, [
      el('span', { class: 'q' }, [q.text]),
      right,
      el('span', { class: 'bar', 'aria-hidden': 'true' }, [fill]),
      el('span', { class: 'sr-only' }, [
        done ? t('awards.unlocked') : t('quest.progress', { n: q.progress, total: q.target }),
      ]),
    ]);
  });
}

/** A mode tile: icon, name, one short line. */
function tile(icon: string, name: string, sub: HTMLElement, onClick: () => void): HTMLButtonElement {
  const b = el('button', { class: 'tile' }, [
    el('span', { class: 'icon', html: icon }),
    el('strong', {}, [name]),
    sub,
  ]);
  b.addEventListener('click', onClick);
  return b;
}

/**
 * Home: title, best, Continue (when a save exists), Play / New game, the other modes (Daily,
 * Zen, Blitz) as tiles, today's quests, Awards and Settings.
 */
export class HomeMenu extends Overlay {
  private readonly bestVal = el('span', {}, ['0']);
  private readonly cont = el('button', { class: 'cta' }, [t('home.continue')]);
  private readonly play = el('button', { class: 'cta' }, [t('home.play')]);
  private readonly daily: HTMLButtonElement;
  private readonly dailySub = el('small');
  private readonly dailyStreak = el('span', { class: 'streak', hidden: '' });
  private readonly blitzSub = el('small', {}, [t('mode.blitzDesc')]);
  private readonly questsBtn = el('button', { class: 'ghost-btn quests-btn' });
  private readonly questsCount = el('span', { class: 'count' });

  /** Soft ask for the daily reminder (shown once, after a few sessions, native only). */
  private readonly offer: HTMLDivElement;

  constructor(h: {
    onPlay(): void;
    onContinue(): void;
    onDaily(): void;
    onZen(): void;
    onBlitz(): void;
    onQuests(): void;
    onSettings(): void;
    onAwards(): void;
    onReminder(yes: boolean): void;
  }) {
    super('home', 'homeTitle');
    const best = el('div', { class: 'best' });
    best.innerHTML = ICONS.crown;
    best.append(this.bestVal);
    const settings = el('button', {
      class: 'ghost-btn icon-btn',
      'aria-label': t('home.settings'),
      html: ICONS.gear,
    });
    const awards = el('button', {
      class: 'ghost-btn icon-btn',
      'aria-label': t('home.awards'),
      html: ICONS.trophy,
    });
    awards.addEventListener('click', h.onAwards);
    settings.addEventListener('click', h.onSettings);
    this.cont.addEventListener('click', h.onContinue);
    this.play.addEventListener('click', h.onPlay);
    this.questsBtn.innerHTML = ICONS.list;
    this.questsBtn.append(el('span', {}, [t('quests.short')]), this.questsCount);
    this.questsBtn.addEventListener('click', h.onQuests);

    this.daily = tile(ICONS.calendar, t('mode.dailyShort'), this.dailySub, h.onDaily);
    this.daily.classList.add('daily');
    this.daily.append(this.dailyStreak);
    const zen = tile(ICONS.leaf, t('mode.zen'), el('small', {}, [t('mode.zenDesc')]), h.onZen);
    const blitz = tile(ICONS.clock, t('mode.blitz'), this.blitzSub, h.onBlitz);

    this.card.append(
      el('div', { class: 'title', id: 'homeTitle' }, [t('app.title')]),
      el('div', { class: 'subtitle' }, [t('app.subtitle')]),
      best,
      el('div', { class: 'stack' }, [
        this.cont,
        this.play,
        el('div', { class: 'tiles' }, [this.daily, zen, blitz]),
        el('div', { class: 'tools' }, [this.questsBtn, awards, settings]),
      ]),
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

  update(v: HomeView): void {
    this.bestVal.textContent = num(v.best);
    this.cont.hidden = !v.hasSave;
    this.play.textContent = v.hasSave ? t('home.newGame') : t('home.play');
    this.play.className = v.hasSave ? 'ghost-btn' : 'cta';

    const goal = t('daily.goal', { n: num(v.daily.goal) });
    this.daily.classList.toggle('done', v.daily.done);
    this.dailySub.textContent = v.daily.done ? t('daily.doneShort') : goal;
    const streak = v.daily.streak > 0 ? `, ${t('daily.streak', { n: v.daily.streak })}` : '';
    this.daily.setAttribute(
      'aria-label',
      `${t('mode.daily')}, ${v.daily.done ? t('daily.done', { n: num(v.daily.best) }) : goal}${streak}`,
    );
    this.dailyStreak.hidden = v.daily.streak < 1;
    this.dailyStreak.innerHTML = ICONS.flame;
    this.dailyStreak.append(String(v.daily.streak));
    this.blitzSub.textContent = v.blitzBest > 0 ? num(v.blitzBest) : t('mode.blitzDesc');

    const done = v.quests.filter((q) => q.progress >= q.target).length;
    this.questsCount.textContent = `${done}/${v.quests.length}`;
    this.questsBtn.classList.toggle('done', v.questsDone);
    this.questsBtn.setAttribute(
      'aria-label',
      `${t('quests.title')} ${t('quest.progress', { n: done, total: v.quests.length })}`,
    );
  }
}

/** Today's quests: progress, the quest streak and the woods it unlocks. */
export class QuestsPanel extends Overlay {
  private readonly list = el('ul', { class: 'quests' });
  private readonly note = el('p', { class: 'quest-note' });
  private readonly streak = el('span', { class: 'count' });

  constructor(onClose: () => void) {
    super('quests-panel dialog-layer', 'questsTitle');
    const done = el('button', { class: 'cta' }, [t('common.done')]);
    done.addEventListener('click', onClose);
    this.node.addEventListener('pointerdown', (e) => {
      if (e.target === this.node) onClose();
    });
    this.card.append(
      el('h2', { id: 'questsTitle' }, [t('quests.title')]),
      el('h3', {}, [t('quests.streakTitle'), ' ', this.streak]),
      this.list,
      this.note,
      el('div', { class: 'stack' }, [done]),
    );
  }

  update(v: HomeView): void {
    this.list.replaceChildren(...questRows(v.quests));
    this.streak.textContent = String(v.questStreak);
    this.note.textContent = v.questsDone ? t('quests.allDone') : t('quests.hint');
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
export type ToggleKey = Exclude<keyof Settings, 'theme' | 'camera'>;

const LABELS: Record<ToggleKey, Key> = {
  sound: 'settings.sound',
  music: 'settings.music',
  haptics: 'settings.haptics',
  reduceMotion: 'settings.reduceMotion',
  hints: 'settings.hints',
  shake: 'settings.shake',
};

/** Camera angle picker: one tap per angle, the current one highlighted. */
function cameraPicker(onPick: (v: CameraView) => void): { node: HTMLDivElement; set(v: CameraView): void } {
  const buttons = new Map<CameraView, HTMLButtonElement>();
  const row = el('div', { class: 'segmented', role: 'radiogroup', 'aria-labelledby': 'set-camera' });
  for (const v of CAMERA_VIEW_ORDER) {
    const b = el('button', { role: 'radio', 'aria-checked': 'false' }, [t(`camera.${v}` as Key)]);
    b.addEventListener('click', () => onPick(v));
    buttons.set(v, b);
    row.append(b);
  }
  const node = el('div', { class: 'setting camera-setting' }, [
    el('span', { id: 'set-camera' }, [t('settings.camera')]),
    row,
  ]);
  return {
    node,
    set: (cur) => {
      for (const [v, b] of buttons) b.setAttribute('aria-checked', String(v === cur));
    },
  };
}

export class SettingsPanel extends Overlay {
  private readonly toggles = new Map<ToggleKey, HTMLButtonElement>();
  private readonly camera: ReturnType<typeof cameraPicker>;

  private readonly reminderRow: HTMLDivElement;
  private readonly reminderToggle: HTMLButtonElement;
  private readonly buy = el('button', { class: 'ghost-btn buy', hidden: '' });
  private readonly restore = el('button', { class: 'ghost-btn', hidden: '' });
  private readonly owned = el('p', { class: 'owned', hidden: '' });
  private readonly privacy = el('button', { class: 'ghost-btn', hidden: '' });
  private readonly note = el('p', { class: 'note', 'aria-live': 'polite' });

  constructor(h: {
    onToggle(key: ToggleKey): void;
    onCamera(view: CameraView): void;
    onReminder(): void;
    onReset(): void;
    onClose(): void;
    onBuy(): void;
    onRestore(): void;
    onPrivacy(): void;
  }) {
    super('settings dialog-layer', 'settingsTitle');
    const list = el('div', { class: 'settings-list' });
    this.camera = cameraPicker(h.onCamera);
    list.append(this.camera.node);
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
    this.camera.set(s.camera);
  }
}
