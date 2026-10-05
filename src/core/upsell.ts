// When to put the "Remove ads" offer in front of the player. Pure.
// Pushy but honest: shown often while ads are actually being seen, always with a clear "Not now",
// never to owners, never before ads have started, and capped per day (App Review guideline 5.6).
import { UPSELL } from '../config';
import type { Meta } from './retention';

export type OfferTrigger =
  /** Straight after an interstitial closed: the moment ads are most annoying. */
  | 'afterAd'
  /** After a rewarded "Keep playing" ad. */
  | 'afterRewarded'
  /** Opening the home screen. */
  | 'home';

export interface OfferContext {
  readonly trigger: OfferTrigger;
  readonly removeAds: boolean;
  /** The store can sell it right now. */
  readonly available: boolean;
  readonly gamesPlayed: number;
  readonly meta: Meta;
  readonly now: number;
}

/** Local calendar day number (for the per-day cap). */
export const dayNumber = (ms: number): number => {
  const d = new Date(ms);
  return Math.floor((ms - d.getTimezoneOffset() * 60000) / 86400000);
};

const offersToday = (m: Meta, now: number): number => (m.offerDay === dayNumber(now) ? m.offersToday : 0);

export function shouldOfferRemoveAds(c: OfferContext): boolean {
  if (c.removeAds || !c.available) return false;
  if (offersToday(c.meta, c.now) >= UPSELL.maxPerDay) return false;
  const since = c.now - c.meta.lastOfferAt;
  switch (c.trigger) {
    case 'afterAd':
      return since >= UPSELL.afterAdGapMs;
    case 'afterRewarded':
      return since >= UPSELL.afterRewardedGapMs;
    case 'home':
      // only once ads are part of their game: from the session ads start, after a few games
      return (
        c.meta.sessions >= UPSELL.homeFromSession &&
        c.gamesPlayed >= UPSELL.homeFromGames &&
        since >= UPSELL.homeGapMs
      );
  }
}

/** Record that the offer was shown. */
export function offerShown(m: Meta, now: number): Meta {
  const day = dayNumber(now);
  return {
    ...m,
    lastOfferAt: now,
    offerDay: day,
    offersToday: (m.offerDay === day ? m.offersToday : 0) + 1,
    offersShown: m.offersShown + 1,
  };
}
