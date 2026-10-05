// Daily quests: three small goals a day, the same for everyone, progressed by any mode. Pure.
import { QUESTS } from '../config';
import type { Mode } from '../config';
import { createRng, nextFloat } from './generator';
import { hashSeed } from './daily';
import type { MoveResult } from './rules';

export type QuestKind = keyof typeof QUESTS.targets;

export interface Quest {
  readonly kind: QuestKind;
  readonly target: number;
}

export interface QuestDay {
  readonly date: string;
  readonly quests: readonly Quest[];
  readonly progress: readonly number[];
  /** All quests of this day were completed (streak already counted). */
  readonly done: boolean;
}

/** Kinds whose progress is the best single value (per game) rather than a running total. */
const MAX_KINDS: ReadonlySet<QuestKind> = new Set(['combo', 'score', 'blitz']);

/** The day's quests: distinct kinds, targets from the configured lists, all from the date. */
export function questsFor(date: string): Quest[] {
  const rng = createRng(hashSeed(`grain-quests-${date}`));
  const kinds = Object.keys(QUESTS.targets) as QuestKind[];
  const picked: Quest[] = [];
  while (picked.length < QUESTS.perDay && kinds.length) {
    const kind = kinds.splice(Math.floor(nextFloat(rng) * kinds.length), 1)[0];
    if (!kind) break;
    const list: readonly number[] = QUESTS.targets[kind];
    picked.push({ kind, target: list[Math.floor(nextFloat(rng) * list.length)] ?? list[0] ?? 1 });
  }
  return picked;
}

export const newQuestDay = (date: string): QuestDay => {
  const quests = questsFor(date);
  return { date, quests, progress: quests.map(() => 0), done: false };
};

/** Make sure the quest day is today's (a new day brings new quests). */
export const questDayFor = (q: QuestDay | null, date: string): QuestDay =>
  q && q.date === date ? q : newQuestDay(date);

export interface QuestEvent {
  readonly mode: Mode;
  /** Present for a placement. */
  readonly move?: MoveResult;
  /** Score of the current game after this event. */
  readonly gameScore: number;
  /** Today's daily-challenge goal was reached. */
  readonly dailyDone?: boolean;
}

function gain(kind: QuestKind, e: QuestEvent): number {
  const m = e.move;
  switch (kind) {
    case 'lines':
      return m?.clear.units ?? 0;
    case 'boxes':
      return m?.clear.list.filter((u) => u.kind === 'box').length ?? 0;
    case 'pieces':
      return m ? 1 : 0;
    case 'triple':
      return m && m.clear.units >= 3 ? 1 : 0;
    case 'daily':
      return e.dailyDone ? 1 : 0;
    case 'combo':
      return m?.streak ?? 0;
    case 'score':
      return e.gameScore;
    case 'blitz':
      return e.mode === 'blitz' ? e.gameScore : 0;
  }
}

/** Apply one event. Returns the new day and whether this event completed every quest. */
export function applyQuestEvent(q: QuestDay, e: QuestEvent): { day: QuestDay; completed: boolean } {
  // zen has no pressure, so it can't farm score-style quests
  const progress = q.quests.map((quest, i) => {
    const before = q.progress[i] ?? 0;
    if (e.mode === 'zen' && MAX_KINDS.has(quest.kind)) return before;
    const g = gain(quest.kind, e);
    const next = MAX_KINDS.has(quest.kind) ? Math.max(before, g) : before + g;
    return Math.min(quest.target, next);
  });
  const allDone = q.quests.every((quest, i) => (progress[i] ?? 0) >= quest.target);
  const completed = allDone && !q.done;
  return { day: { ...q, progress, done: q.done || allDone }, completed };
}

export function parseQuestDay(raw: string | null): QuestDay | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown>;
    if (typeof v.date !== 'string' || !Array.isArray(v.progress)) return null;
    const fresh = newQuestDay(v.date);
    // the quests themselves always come from the date (tamper-proof); only progress is stored
    const progress = fresh.quests.map((qq, i) => {
      const p = (v.progress as unknown[])[i];
      return typeof p === 'number' && Number.isFinite(p) && p >= 0 ? Math.min(qq.target, p) : 0;
    });
    return { ...fresh, progress, done: v.done === true };
  } catch {
    return null;
  }
}
