import { SCORE_UI } from '../config';
import { easeOutCubic } from '../fx/tween';
import type { Tweens } from '../fx/tween';
import { num, t } from '../i18n';
import { el, ICONS } from './dom';

/** How a mode words its results: title, the line under the score, and whether it can be shared. */
export interface ResultsInfo {
  readonly title: string;
  /** Replaces the best line (e.g. the daily goal). */
  readonly line?: string;
  /** The line is good news (gold, animated). */
  readonly good?: boolean;
  readonly share?: boolean;
}

/** Full-screen scrim with a centred card. */
export class Overlay {
  readonly node: HTMLDivElement;
  readonly card: HTMLDivElement;
  private lastFocus: Element | null = null;

  constructor(cls: string, labelId: string) {
    this.card = el('div', {
      class: 'card',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': labelId,
    });
    this.node = el('div', { class: `overlay hidden ${cls}` }, [this.card]);
    this.node.setAttribute('aria-hidden', 'true');
  }

  get open(): boolean {
    return !this.node.classList.contains('hidden');
  }

  show(): void {
    if (this.open) return;
    this.lastFocus = document.activeElement;
    this.node.classList.remove('hidden');
    this.node.setAttribute('aria-hidden', 'false');
    const first = this.card.querySelector<HTMLElement>('button');
    first?.focus({ preventScroll: true });
  }

  hide(): void {
    if (!this.open) return;
    this.node.classList.add('hidden');
    this.node.setAttribute('aria-hidden', 'true');
    if (this.lastFocus instanceof HTMLElement) this.lastFocus.focus({ preventScroll: true });
  }
}

export interface ConfirmOptions {
  title: string;
  body: string;
  confirm: string;
  cancel?: string;
  danger?: boolean;
}

/** Yes/no dialog. Resolves true on confirm, false on cancel / Escape / scrim tap. */
export class ConfirmDialog extends Overlay {
  private resolve: ((ok: boolean) => void) | null = null;
  private readonly title = el('h2', { id: 'confirmTitle' });
  private readonly body = el('p');
  private readonly ok = el('button', { class: 'cta' });
  private readonly no = el('button', { class: 'ghost-btn' });

  constructor() {
    super('confirm-layer', 'confirmTitle');
    this.card.append(this.title, this.body, el('div', { class: 'row2' }, [this.no, this.ok]));
    this.ok.addEventListener('click', () => this.finish(true));
    this.no.addEventListener('click', () => this.finish(false));
    this.node.addEventListener('pointerdown', (e) => {
      if (e.target === this.node) this.finish(false);
    });
  }

  ask(o: ConfirmOptions): Promise<boolean> {
    this.finish(false);
    this.title.textContent = o.title;
    this.body.textContent = o.body;
    this.ok.textContent = o.confirm;
    this.no.textContent = o.cancel ?? t('common.cancel');
    this.ok.classList.toggle('danger', o.danger === true);
    this.show();
    this.no.focus({ preventScroll: true });
    return new Promise((res) => {
      this.resolve = res;
    });
  }

  /** Escape / back closes as "cancel". */
  cancel(): void {
    this.finish(false);
  }

  private finish(ok: boolean): void {
    const r = this.resolve;
    this.resolve = null;
    if (r) {
      this.hide();
      r(ok);
    }
  }
}

/** Game-over card: score counts up, "New best" if earned. */
export class ResultsCard extends Overlay {
  private readonly finalEl = el('div', { class: 'final' }, ['0']);
  private readonly bestEl = el('div', { class: 'bestline' });
  private readonly revive = el('button', { class: 'cta revive', hidden: '' });
  private readonly title = el('h2', { id: 'overTitle' }, [t('results.title')]);
  private readonly share = el('button', { class: 'ghost-btn share', hidden: '' });
  private readonly note = el('p', { class: 'note', 'aria-live': 'polite' });

  constructor(handlers: { onAgain(): void; onHome(): void; onRevive(): void; onShare(): void }) {
    super('results', 'overTitle');
    const again = el('button', { class: 'cta' }, [t('results.again')]);
    const home = el('button', { class: 'ghost-btn' }, [t('results.home')]);
    again.addEventListener('click', handlers.onAgain);
    home.addEventListener('click', handlers.onHome);
    this.revive.addEventListener('click', handlers.onRevive);
    this.share.innerHTML = ICONS.share;
    this.share.append(t('results.share'));
    this.share.addEventListener('click', handlers.onShare);
    this.card.append(
      this.title,
      this.finalEl,
      this.bestEl,
      el('div', { class: 'stack' }, [this.revive, again, this.share, home]),
      this.note,
    );
  }

  /** A short status line under the buttons (e.g. "Copied"). */
  setNote(text: string): void {
    this.note.textContent = text;
  }

  /** Second-chance button: 'ad' = watch a rewarded ad, 'free' = owns Remove ads, null = hidden. */
  setRevive(offer: 'ad' | 'free' | null): void {
    this.revive.hidden = offer === null;
    this.revive.disabled = false;
    this.revive.textContent = offer === 'free' ? t('results.reviveFree') : t('results.reviveAd');
    // the revive button is the hero action when offered; Play again steps back
    const again = this.revive.nextElementSibling;
    if (again) again.className = offer ? 'ghost-btn' : 'cta';
  }

  /** While a full-screen ad is up, no button on the card reacts. */
  setBusy(busy: boolean): void {
    for (const b of this.card.querySelectorAll('button')) b.disabled = busy;
  }

  present(score: number, best: number, newBest: boolean, tweens: Tweens, info?: ResultsInfo): void {
    this.finalEl.textContent = '0';
    this.title.textContent = info?.title ?? t('results.title');
    this.share.hidden = info?.share !== true;
    this.note.textContent = '';
    const good = info?.line !== undefined ? info.good === true : newBest && score > 0;
    this.bestEl.textContent =
      info?.line ?? (newBest && score > 0 ? t('results.newBest') : t('results.best', { n: num(best) }));
    this.bestEl.classList.toggle('new', good);
    this.show();
    tweens.add({
      dur: Math.min(SCORE_UI.overCountMax, SCORE_UI.overCountBase + score * SCORE_UI.overCountPerPoint),
      ease: easeOutCubic,
      update: (e) => {
        this.finalEl.textContent = num(Math.round(score * e));
      },
    });
  }
}
