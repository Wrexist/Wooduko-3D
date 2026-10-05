import { describe, expect, it } from 'vitest';
import { UPSELL } from '../src/config';
import { emptyMeta, parseMeta } from '../src/core/retention';
import type { Meta } from '../src/core/retention';
import { dayNumber, offerShown, shouldOfferRemoveAds } from '../src/core/upsell';
import type { OfferContext } from '../src/core/upsell';

const NOW = new Date(2026, 9, 6, 15).getTime();
const MIN = 60 * 1000;
const ctx = (p: Partial<OfferContext> = {}): OfferContext => ({
  trigger: 'afterAd',
  removeAds: false,
  available: true,
  gamesPlayed: 10,
  meta: { ...emptyMeta(), sessions: 5 },
  now: NOW,
  ...p,
});

describe('remove-ads offer pacing', () => {
  it('shows after every interstitial, but never to owners or when the store is unavailable', () => {
    expect(shouldOfferRemoveAds(ctx())).toBe(true);
    expect(shouldOfferRemoveAds(ctx({ removeAds: true }))).toBe(false);
    expect(shouldOfferRemoveAds(ctx({ available: false }))).toBe(false);
  });

  it('respects the gaps for each trigger', () => {
    const shown = offerShown(ctx().meta, NOW);
    expect(shouldOfferRemoveAds(ctx({ meta: shown, now: NOW + 30 * 1000 }))).toBe(false);
    expect(shouldOfferRemoveAds(ctx({ meta: shown, now: NOW + UPSELL.afterAdGapMs }))).toBe(true);
    expect(shouldOfferRemoveAds(ctx({ trigger: 'afterRewarded', meta: shown, now: NOW + 5 * MIN }))).toBe(
      false,
    );
    expect(
      shouldOfferRemoveAds(
        ctx({ trigger: 'afterRewarded', meta: shown, now: NOW + UPSELL.afterRewardedGapMs }),
      ),
    ).toBe(true);
  });

  it('home offer waits for a few sessions and games', () => {
    const home = (meta: Meta, gamesPlayed: number) =>
      shouldOfferRemoveAds(ctx({ trigger: 'home', meta, gamesPlayed }));
    expect(home({ ...emptyMeta(), sessions: 1 }, 10)).toBe(false);
    expect(home({ ...emptyMeta(), sessions: 5 }, UPSELL.homeFromGames - 1)).toBe(false);
    expect(home({ ...emptyMeta(), sessions: 5 }, UPSELL.homeFromGames)).toBe(true);
  });

  it('is capped per day and the cap resets the next day', () => {
    let m: Meta = { ...emptyMeta(), sessions: 5 };
    let t = NOW;
    for (let i = 0; i < UPSELL.maxPerDay; i++) {
      expect(shouldOfferRemoveAds(ctx({ meta: m, now: t }))).toBe(true);
      m = offerShown(m, t);
      t += UPSELL.afterAdGapMs;
    }
    expect(shouldOfferRemoveAds(ctx({ meta: m, now: t }))).toBe(false);
    const tomorrow = new Date(2026, 9, 7, 9).getTime();
    expect(dayNumber(tomorrow)).toBe(dayNumber(NOW) + 1);
    expect(shouldOfferRemoveAds(ctx({ meta: m, now: tomorrow }))).toBe(true);
    expect(offerShown(m, tomorrow).offersToday).toBe(1);
    expect(m.offersShown).toBe(UPSELL.maxPerDay);
  });

  it('offer pacing survives a reload', () => {
    const m = offerShown({ ...emptyMeta(), sessions: 2 }, NOW);
    expect(parseMeta(JSON.stringify(m))).toEqual(m);
  });
});
