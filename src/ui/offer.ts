import { UPSELL } from '../config';
import { t } from '../i18n';
import { Overlay } from './dialogs';
import { el, ICONS } from './dom';

export type OfferResult = 'bought' | 'dismissed';

/**
 * "Play without ads" popup: what you get, the price on a big gold button, Restore, and a clearly
 * visible "Not now". Buying / restoring is done by the caller (`onBuy` / `onRestore` resolve true
 * when Remove ads is owned afterwards).
 */
export class RemoveAdsOffer extends Overlay {
  private readonly buy = el('button', { class: 'cta offer-buy' });
  private readonly restore = el('button', { class: 'link-btn' }, [t('offer.restore')]);
  private readonly notNow = el('button', { class: 'ghost-btn' }, [t('offer.notNow')]);
  private readonly note = el('p', { class: 'note', 'aria-live': 'polite' });
  private resolve: ((r: OfferResult) => void) | null = null;
  private busy = false;
  /** Seconds until "Not now" reacts (the tap that closed an ad must not dismiss this). */
  private lock = 0;

  constructor(private readonly h: { onBuy(): Promise<boolean>; onRestore(): Promise<boolean> }) {
    super('offer-layer dialog-layer', 'offerTitle');
    const perks = el('ul', { class: 'perks' }, [
      perk(t('offer.noAds')),
      perk(t('offer.revive')),
      perk(t('offer.forever')),
      perk(t('offer.support')),
    ]);
    this.card.classList.add('offer-card');
    this.card.append(
      el('div', { class: 'badge', 'aria-hidden': 'true', html: ICONS.noAds }),
      el('h2', { id: 'offerTitle' }, [t('offer.title')]),
      el('p', { class: 'lead' }, [t('offer.lead')]),
      perks,
      el('div', { class: 'stack' }, [this.buy, this.notNow]),
      this.restore,
      this.note,
    );
    this.buy.addEventListener('click', () => void this.purchase(() => this.h.onBuy(), false));
    this.restore.addEventListener('click', () => void this.purchase(() => this.h.onRestore(), true));
    this.notNow.addEventListener('click', () => this.dismiss());
    this.node.addEventListener('pointerdown', (e) => {
      if (e.target === this.node) this.dismiss();
    });
  }

  /** Show the offer; resolves when it is bought or dismissed. */
  ask(price: string | null): Promise<OfferResult> {
    this.finish('dismissed');
    this.buy.textContent = price ? t('offer.buy', { price }) : t('settings.removeAds');
    this.note.textContent = '';
    this.setBusy(false);
    this.lock = UPSELL.dismissDelay;
    // the menu underneath steps out of the way (nothing shows through the card on any GPU)
    document.documentElement.classList.add('offer-open');
    this.show();
    this.buy.focus({ preventScroll: true });
    return new Promise((res) => {
      this.resolve = res;
    });
  }

  /** "Not now", Escape or a tap on the scrim (ignored for a moment after opening). */
  dismiss(): void {
    if (this.busy || this.lock > 0) return;
    this.finish('dismissed');
  }

  update(dt: number): void {
    if (this.lock > 0) this.lock -= dt;
  }

  private async purchase(fn: () => Promise<boolean>, restoring: boolean): Promise<void> {
    if (this.busy) return;
    this.setBusy(true);
    this.note.textContent = '';
    let owned: boolean;
    try {
      owned = await fn();
    } catch {
      owned = false;
    }
    this.setBusy(false);
    if (owned) this.finish('bought');
    else this.note.textContent = restoring ? t('settings.nothingToRestore') : t('offer.failed');
  }

  private setBusy(busy: boolean): void {
    this.busy = busy;
    for (const b of [this.buy, this.restore, this.notNow]) b.disabled = busy;
    this.card.classList.toggle('busy', busy);
  }

  private finish(r: OfferResult): void {
    const res = this.resolve;
    this.resolve = null;
    if (res) {
      document.documentElement.classList.remove('offer-open');
      this.hide();
      res(r);
    }
  }
}

function perk(text: string): HTMLLIElement {
  return el('li', {}, [el('span', { class: 'tick', 'aria-hidden': 'true', html: ICONS.check }), text]);
}
