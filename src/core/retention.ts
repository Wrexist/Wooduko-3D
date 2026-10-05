// Retention rules: sessions, review prompt eligibility, reminder offer and timing. Pure.
import { RETENTION } from '../config';

export type ReminderChoice = 'unasked' | 'on' | 'off';

export interface Meta {
  readonly sessions: number;
  /** ms since epoch of the first launch (0 = unknown). */
  readonly firstOpen: number;
  /** ms since epoch of the last review prompt (0 = never). */
  readonly lastReviewAsk: number;
  readonly reviewAsks: number;
  readonly reminder: ReminderChoice;
  /** Local hours of day of recent sessions (newest last). */
  readonly playHours: readonly number[];
}

export const emptyMeta = (): Meta => ({
  sessions: 0,
  firstOpen: 0,
  lastReviewAsk: 0,
  reviewAsks: 0,
  reminder: 'unasked',
  playHours: [],
});

export function recordSession(m: Meta, now: Date): Meta {
  const hours = [...m.playHours, now.getHours()].slice(-RETENTION.hoursKept);
  return { ...m, sessions: m.sessions + 1, firstOpen: m.firstOpen || now.getTime(), playHours: hours };
}

const DAY = 24 * 60 * 60 * 1000;

/**
 * Ask for an App Store review only after a strong moment (a new best), never after a plain loss,
 * and only for players who have stayed a while. Apple also caps it at 3 a year.
 */
export function shouldAskReview(m: Meta, newBest: boolean, gamesPlayed: number, now: Date): boolean {
  return (
    newBest &&
    m.sessions >= RETENTION.reviewMinSessions &&
    gamesPlayed >= RETENTION.reviewMinGames &&
    m.reviewAsks < RETENTION.reviewMaxAsks &&
    now.getTime() - m.lastReviewAsk >= RETENTION.reviewGapDays * DAY
  );
}

export const reviewAsked = (m: Meta, now: Date): Meta => ({
  ...m,
  lastReviewAsk: now.getTime(),
  reviewAsks: m.reviewAsks + 1,
});

/** Offer the daily reminder once, after a few sessions (never on first launch). */
export const shouldOfferReminder = (m: Meta): boolean =>
  m.reminder === 'unasked' && m.sessions >= RETENTION.reminderAfterSessions;

/** The hour they usually play (most frequent recent hour, ties → latest), or the default. */
export function usualHour(m: Meta): number {
  if (!m.playHours.length) return RETENTION.reminderDefaultHour;
  const count = new Map<number, number>();
  for (const h of m.playHours) count.set(h, (count.get(h) ?? 0) + 1);
  let best: number = RETENTION.reminderDefaultHour;
  let n = 0;
  for (const h of m.playHours) {
    const c = count.get(h) ?? 0;
    if (c >= n) {
      n = c;
      best = h;
    }
  }
  return best;
}

/**
 * Tomorrow at their usual hour. Re-scheduled on every launch, so it only fires on a day they
 * did not open the game.
 */
export function nextReminder(m: Meta, now: Date): Date {
  const at = new Date(now.getTime());
  at.setDate(at.getDate() + 1);
  at.setHours(usualHour(m), 0, 0, 0);
  return at;
}

/** Which reminder copy to use (rotates by day; text lives in i18n as `reminder.<i>.*`). */
export function reminderIndex(at: Date): number {
  return Math.floor(at.getTime() / DAY) % RETENTION.reminderLines;
}

export function parseMeta(raw: string | null): Meta {
  const base = emptyMeta();
  if (!raw) return base;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (typeof v !== 'object' || v === null) return base;
    const n = (k: keyof Meta): number => {
      const x = v[k];
      return typeof x === 'number' && Number.isFinite(x) && x >= 0 ? x : (base[k] as number);
    };
    const reminder = v.reminder === 'on' || v.reminder === 'off' ? v.reminder : 'unasked';
    const playHours = Array.isArray(v.playHours)
      ? v.playHours
          .filter((h): h is number => Number.isInteger(h) && h >= 0 && h < 24)
          .slice(-RETENTION.hoursKept)
      : [];
    return {
      sessions: n('sessions'),
      firstOpen: n('firstOpen'),
      lastReviewAsk: n('lastReviewAsk'),
      reviewAsks: n('reviewAsks'),
      reminder,
      playHours,
    };
  } catch {
    return base;
  }
}
