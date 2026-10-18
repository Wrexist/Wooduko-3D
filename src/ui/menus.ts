import { CAMERA_VIEW_ORDER } from '../config';
import type { CameraView } from '../config';
import type { Settings } from '../core/types';
import { num, t } from '../i18n';
import type { Key } from '../i18n';
import { Overlay } from './dialogs';
import { el, ICONS, rise } from './dom';

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
  readonly journeyLevel: number;
  readonly journeyStars: number;
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

/** A mode card: a tinted icon chip, the name, and one short line with an optional badge beside it. */
function modeCard(
  cls: string,
  icon: string,
  name: string,
  sub: HTMLElement,
  badge: HTMLElement | null,
  onClick: () => void,
): HTMLButtonElement {
  const b = el('button', { class: `mode ${cls}` }, [
    el('span', { class: 'chip-icon', html: icon }),
    el('span', { class: 'mode-text' }, [el('strong', {}, [name]), sub, ...(badge ? [badge] : [])]),
  ]);
  b.addEventListener('click', onClick);
  return b;
}

/** A full-width row: icon chip, a title with a line (or bar) under it, something on the right. */
function homeRow(cls: string, icon: string, body: HTMLElement[], end: HTMLElement): HTMLButtonElement {
  return el('button', { class: `h-row ${cls}` }, [
    el('span', { class: 'chip-icon', html: icon }),
    el('span', { class: 'h-row-text' }, body),
    end,
  ]);
}

/**
 * Home, top to bottom: best score with Awards and Settings, the title, one big Play (Continue
 * when a save exists, with New game under it), the four modes as cards, the Workshop, and
 * today's quests with a progress bar. Everything rises in, one beat after the other.
 */
export class HomeMenu extends Overlay {
  private readonly bestVal = el('span', {}, ['0']);
  private readonly cont = el('button', { class: 'cta hero' }, [
    el('span', { class: 'cta-icon', html: ICONS.play }),
    el('span', {}, [t('home.continue')]),
  ]);
  private readonly playLabel = el('span', {}, [t('home.play')]);
  private readonly play = el('button', { class: 'cta hero' }, [
    el('span', { class: 'cta-icon', html: ICONS.play }),
    this.playLabel,
  ]);
  private readonly daily: HTMLButtonElement;
  private readonly dailySub = el('small');
  private readonly dailyStreak = el('span', { class: 'streak', hidden: '' });
  private readonly blitzSub = el('small', {}, [t('mode.blitzDesc')]);
  private readonly questsBtn: HTMLButtonElement;
  private readonly questsFill = el('i');
  private readonly questsCount = el('span', { class: 'count' });
  private readonly journeyBtn: HTMLButtonElement;
  /** "Journey" with the next level under it (two short lines, never a wrapped long one). */
  private readonly journeyLevel = el('small');
  private readonly journeyStars = el('span', { class: 'jstars' });

  /** Soft ask for the daily reminder (shown once, after a few sessions, native only). */
  private readonly offer: HTMLDivElement;

  constructor(h: {
    onPlay(): void;
    onContinue(): void;
    onDaily(): void;
    onZen(): void;
    onBlitz(): void;
    onJourney(): void;
    onWorkshop(): void;
    onQuests(): void;
    onSettings(): void;
    onAwards(): void;
    onReminder(yes: boolean): void;
  }) {
    super('home', 'homeTitle');
    this.card.classList.add('home-card');
    const best = el('div', { class: 'best' });
    best.innerHTML = ICONS.crown;
    best.append(this.bestVal);
    const settings = el('button', {
      class: 'icon-btn',
      'aria-label': t('home.settings'),
      html: ICONS.gear,
    });
    const awards = el('button', {
      class: 'icon-btn',
      'aria-label': t('home.awards'),
      html: ICONS.trophy,
    });
    awards.addEventListener('click', h.onAwards);
    settings.addEventListener('click', h.onSettings);
    this.cont.addEventListener('click', h.onContinue);
    this.play.addEventListener('click', h.onPlay);

    this.journeyBtn = modeCard(
      'journey-btn',
      ICONS.map,
      t('mode.journey'),
      this.journeyLevel,
      this.journeyStars,
      h.onJourney,
    );
    this.daily = modeCard(
      'tile daily',
      ICONS.calendar,
      t('mode.dailyShort'),
      this.dailySub,
      this.dailyStreak,
      h.onDaily,
    );
    const zen = modeCard(
      'tile zen',
      ICONS.leaf,
      t('mode.zen'),
      el('small', {}, [t('mode.zenDesc')]),
      null,
      h.onZen,
    );
    const blitz = modeCard('tile blitz', ICONS.clock, t('mode.blitz'), this.blitzSub, null, h.onBlitz);

    const workshop = homeRow(
      'workshop-btn',
      ICONS.moves,
      [el('strong', {}, [t('mode.workshop')]), el('small', {}, [t('home.workshopDesc')])],
      el('span', { class: 'chev', html: ICONS.chevron }),
    );
    workshop.addEventListener('click', h.onWorkshop);
    this.questsBtn = homeRow(
      'quests-btn',
      ICONS.list,
      [
        el('strong', {}, [t('quests.short')]),
        el('span', { class: 'bar', 'aria-hidden': 'true' }, [this.questsFill]),
      ],
      this.questsCount,
    );
    this.questsBtn.addEventListener('click', h.onQuests);

    // the title's letters drop in like blocks, one after the other
    const title = el('div', { class: 'title', id: 'homeTitle' });
    [...t('app.title')].forEach((ch, i) => {
      const s = el('span', {}, [ch]);
      s.style.setProperty('--l', String(i));
      title.append(s);
    });
    const top = el('div', { class: 'h-top' }, [best, el('div', { class: 'h-actions' }, [awards, settings])]);
    const brand = el('div', { class: 'h-brand' }, [
      title,
      el('div', { class: 'subtitle' }, [t('app.subtitle')]),
    ]);
    const label = el('div', { class: 'h-label' }, [t('home.modes')]);
    const modes = [this.journeyBtn, this.daily, zen, blitz];
    rise([top, brand, this.cont, this.play, label, ...modes, workshop, this.questsBtn]);

    this.card.append(
      top,
      brand,
      el('div', { class: 'stack h-main' }, [this.cont, this.play]),
      el('div', { class: 'h-more' }, [label, el('div', { class: 'tiles' }, modes), workshop, this.questsBtn]),
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

  /** Focus lands on the main button (Continue or Play), not the small ones in the top bar. */
  override show(): void {
    super.show();
    (this.cont.hidden ? this.play : this.cont).focus({ preventScroll: true });
  }

  setOffer(visible: boolean): void {
    this.offer.hidden = !visible;
  }

  update(v: HomeView): void {
    this.bestVal.textContent = num(v.best);
    this.cont.hidden = !v.hasSave;
    this.playLabel.textContent = v.hasSave ? t('home.newGame') : t('home.play');
    // with a save, New game steps back to a quiet button under Continue
    this.play.className = v.hasSave ? 'ghost-btn new-game rise' : 'cta hero rise';

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
    this.questsFill.style.width = `${v.quests.length ? Math.round((100 * done) / v.quests.length) : 0}%`;
    this.questsBtn.classList.toggle('done', v.questsDone);
    this.journeyLevel.textContent = t('journey.level', { n: v.journeyLevel });
    this.journeyStars.innerHTML = ICONS.star;
    this.journeyStars.append(num(v.journeyStars));
    this.journeyBtn.setAttribute(
      'aria-label',
      `${t('journey.home', { n: v.journeyLevel })}, ${t('journey.stars', { n: v.journeyStars })}`,
    );
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
    const rows = questRows(v.quests);
    rise(rows, 1);
    this.list.replaceChildren(...rows);
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
    const pair = el('div', { class: 'pair' }, [awards, settings]);
    rise([resume, restart, pair, home], 1);
    this.card.append(
      el('h2', { id: 'pauseTitle' }, [t('pause.title')]),
      el('div', { class: 'stack' }, [resume, restart, pair, home]),
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
  /** Hints are a Remove-ads perk: locked (off, with a tag) until it is owned. */
  private readonly hintsTag = el('small', { class: 'perk-tag' }, [t('settings.hintsLocked')]);
  private hasNoAds = false;
  private hintsRow: HTMLDivElement = el('div');
  private last: Settings | null = null;

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
    // two calm groups: sound first, then how the game looks and helps
    const SOUND: readonly ToggleKey[] = ['sound', 'music', 'haptics'];
    const order: ToggleKey[] = [...SOUND, 'hints', 'shake', 'reduceMotion'];
    let group = el('div', { class: 'set-card' });
    for (const key of order) {
      if (key === 'sound' || key === 'hints') {
        const head = el('h3', { class: 'set-group' }, [
          t(key === 'sound' ? 'settings.groupSound' : 'settings.groupGame'),
        ]);
        group = el('div', { class: 'set-card' });
        if (key === 'hints') group.append(this.camera.node);
        list.append(head, group);
        rise([head, group], list.children.length - 2);
      }
      const id = `set-${key}`;
      const sw = el('button', {
        class: 'toggle',
        role: 'switch',
        'aria-checked': 'false',
        'aria-labelledby': id,
      });
      sw.addEventListener('click', () => h.onToggle(key));
      this.toggles.set(key, sw);
      const label = el('span', { id }, [t(LABELS[key])]);
      if (key === 'hints') label.append(this.hintsTag);
      const row = el('div', { class: 'setting' }, [label, sw]);
      if (key === 'hints') this.hintsRow = row;
      group.append(row);
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
    group.append(this.reminderRow);
    this.buy.addEventListener('click', h.onBuy);
    this.restore.addEventListener('click', h.onRestore);
    this.privacy.addEventListener('click', h.onPrivacy);
    this.restore.textContent = t('settings.restore');
    this.privacy.textContent = t('settings.privacy');
    this.owned.textContent = t('settings.adsRemoved');
    const reset = el('button', { class: 'link-btn danger' }, [t('settings.reset')]);
    const done = el('button', { class: 'cta' }, [t('common.done')]);
    reset.addEventListener('click', h.onReset);
    done.addEventListener('click', h.onClose);
    this.node.addEventListener('pointerdown', (e) => {
      if (e.target === this.node) h.onClose();
    });
    this.card.append(
      el('h2', { id: 'settingsTitle' }, [t('settings.title')]),
      list,
      el('div', { class: 'stack' }, [done, this.owned, this.buy, this.restore, this.privacy]),
      this.note,
      el('div', { class: 'settings-foot' }, [
        reset,
        el('p', { class: 'version' }, [`Grain ${__APP_VERSION__}`]),
      ]),
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
    this.setOwned(owned);
    // the hints perk can't be bought here (no store): don't show a switch that does nothing
    this.hintsRow.hidden = !available && !owned;
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
    this.last = s;
    for (const [key, t] of this.toggles)
      t.setAttribute('aria-checked', String(s[key] && (key !== 'hints' || this.hasNoAds)));
    this.camera.set(s.camera);
  }

  private setOwned(owned: boolean): void {
    this.hasNoAds = owned;
    this.hintsTag.hidden = owned;
    if (this.last) this.update(this.last);
  }
}
