// Calendar helpers for the daily challenge and quests. Pure (dates are passed in).
import { MODES } from '../config';

/** Local calendar day as 'YYYY-MM-DD'. */
export function dateKey(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** 32-bit FNV-1a hash: the same text gives the same seed on every device. */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h || 1;
}

/** Seed of the daily challenge: everyone gets the same pieces on the same day. */
export const dailySeed = (key: string): number => hashSeed(`grain-daily-${key}`);

export const dailyGoal = (key: string): number =>
  MODES.dailyGoalBase + MODES.dailyGoalStep * (hashSeed(`goal-${key}`) % MODES.dailyGoalSteps);

/** The day after `key` ('YYYY-MM-DD'). */
export function nextDay(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + 1));
}

export interface Streak {
  readonly count: number;
  /** Last day counted ('' = never). */
  readonly last: string;
}

export const emptyStreak = (): Streak => ({ count: 0, last: '' });

/** Count `today` into a day streak: same day = no change, next day = +1, a gap restarts at 1. */
export function extendStreak(s: Streak, today: string): Streak {
  if (s.last === today) return s;
  if (s.last && nextDay(s.last) === today) return { count: s.count + 1, last: today };
  return { count: 1, last: today };
}

/** A streak is still alive today if it was extended today or yesterday. */
export const streakAlive = (s: Streak, today: string): boolean =>
  s.last === today || (s.last !== '' && nextDay(s.last) === today);

/** Today's daily challenge: best score and whether the goal was reached. */
export interface DailyRecord {
  readonly date: string;
  readonly best: number;
  readonly done: boolean;
}

export const emptyDaily = (date: string): DailyRecord => ({ date, best: 0, done: false });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const count = (x: unknown): number => (typeof x === 'number' && Number.isInteger(x) && x >= 0 ? x : 0);

export function parseStreak(v: unknown): Streak {
  if (typeof v !== 'object' || v === null) return emptyStreak();
  const o = v as Record<string, unknown>;
  const last = typeof o.last === 'string' && DATE_RE.test(o.last) ? o.last : '';
  return last ? { count: Math.max(1, count(o.count)), last } : emptyStreak();
}

/** Stored daily record + streak (untrusted JSON). A record from another day is replaced by a fresh one. */
export function parseDaily(raw: string | null, today: string): { record: DailyRecord; streak: Streak } {
  const fresh = { record: emptyDaily(today), streak: emptyStreak() };
  if (!raw) return fresh;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    const r = (v.record ?? {}) as Record<string, unknown>;
    const record =
      r.date === today ? { date: today, best: count(r.best), done: r.done === true } : emptyDaily(today);
    return { record, streak: parseStreak(v.streak) };
  } catch {
    return fresh;
  }
}
