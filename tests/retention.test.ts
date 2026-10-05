import { describe, expect, it } from 'vitest';
import { RETENTION } from '../src/config';
import {
  emptyMeta,
  nextReminder,
  parseMeta,
  recordSession,
  reminderText,
  reviewAsked,
  shouldAskReview,
  shouldOfferReminder,
  usualHour,
} from '../src/core/retention';

const at = (h: number, day = 10): Date => new Date(2026, 9, day, h, 15);

describe('sessions', () => {
  it('counts launches, remembers the first one and recent play hours', () => {
    let m = recordSession(emptyMeta(), at(8));
    m = recordSession(m, at(21, 11));
    expect(m.sessions).toBe(2);
    expect(m.firstOpen).toBe(at(8).getTime());
    expect(m.playHours).toEqual([8, 21]);
  });

  it('keeps only the last N hours', () => {
    let m = emptyMeta();
    for (let i = 0; i < RETENTION.hoursKept + 5; i++) m = recordSession(m, at(i % 24));
    expect(m.playHours).toHaveLength(RETENTION.hoursKept);
  });
});

describe('review prompt', () => {
  const settled = { ...emptyMeta(), sessions: 5 };
  it('asks only after a new best, for players who stayed', () => {
    expect(shouldAskReview(settled, true, 8, at(12))).toBe(true);
    expect(shouldAskReview(settled, false, 8, at(12))).toBe(false); // a plain loss: never
    expect(shouldAskReview({ ...settled, sessions: 1 }, true, 8, at(12))).toBe(false);
    expect(shouldAskReview(settled, true, 2, at(12))).toBe(false);
  });

  it('waits between asks and stops after the cap', () => {
    const asked = reviewAsked(settled, at(12));
    expect(shouldAskReview(asked, true, 8, at(12, 20))).toBe(false);
    const later = new Date(at(12).getTime() + (RETENTION.reviewGapDays + 1) * 864e5);
    expect(shouldAskReview(asked, true, 8, later)).toBe(true);
    expect(shouldAskReview({ ...asked, reviewAsks: RETENTION.reviewMaxAsks }, true, 8, later)).toBe(false);
  });
});

describe('reminder', () => {
  it('is offered once, after a few sessions', () => {
    expect(shouldOfferReminder({ ...emptyMeta(), sessions: 1 })).toBe(false);
    expect(shouldOfferReminder({ ...emptyMeta(), sessions: RETENTION.reminderAfterSessions })).toBe(true);
    expect(shouldOfferReminder({ ...emptyMeta(), sessions: 9, reminder: 'off' })).toBe(false);
  });

  it('fires tomorrow at the hour they usually play', () => {
    const m = { ...emptyMeta(), playHours: [8, 21, 21, 12, 21] };
    expect(usualHour(m)).toBe(21);
    const when = nextReminder(m, at(9));
    expect(when.getDate()).toBe(11);
    expect(when.getHours()).toBe(21);
    expect(when.getMinutes()).toBe(0);
  });

  it('defaults to the evening with no history, and always has copy', () => {
    expect(usualHour(emptyMeta())).toBe(RETENTION.reminderDefaultHour);
    expect(reminderText(at(9)).title.length).toBeGreaterThan(0);
  });
});

describe('meta persistence', () => {
  it('parses defensively', () => {
    expect(parseMeta(null)).toEqual(emptyMeta());
    expect(parseMeta('{oops')).toEqual(emptyMeta());
    const m = parseMeta(
      JSON.stringify({ sessions: 4, reminder: 'on', playHours: [3, 30, 'x', 22], reviewAsks: -1 }),
    );
    expect(m.sessions).toBe(4);
    expect(m.reminder).toBe('on');
    expect(m.playHours).toEqual([3, 22]);
    expect(m.reviewAsks).toBe(0);
  });
});
