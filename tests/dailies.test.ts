import { describe, expect, it } from 'vitest';
import { MODES, QUESTS } from '../src/config';
import {
  dailyGoal,
  dailySeed,
  dateKey,
  extendStreak,
  emptyStreak,
  hashSeed,
  nextDay,
  streakAlive,
} from '../src/core/daily';
import { applyQuestEvent, newQuestDay, parseQuestDay, questDayFor, questsFor } from '../src/core/quests';
import type { QuestDay } from '../src/core/quests';
import { zenRescue } from '../src/core/revive';
import { newGame, playMove } from '../src/core/rules';
import type { GameState, Piece } from '../src/core/types';
import { boardFrom, checkerboard, SEED, shapeIndexOf } from './helpers';

describe('calendar', () => {
  it('formats local dates and walks to the next day across months and years', () => {
    expect(dateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
    expect(nextDay('2026-01-31')).toBe('2026-02-01');
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
    expect(nextDay('2028-02-28')).toBe('2028-02-29');
  });

  it('daily seed and goal are stable for a day and differ between days', () => {
    expect(dailySeed('2026-10-06')).toBe(dailySeed('2026-10-06'));
    expect(dailySeed('2026-10-06')).not.toBe(dailySeed('2026-10-07'));
    expect(hashSeed('a')).not.toBe(hashSeed('b'));
    const g = dailyGoal('2026-10-06');
    expect(g).toBeGreaterThanOrEqual(MODES.dailyGoalBase);
    expect(g).toBeLessThan(MODES.dailyGoalBase + MODES.dailyGoalStep * MODES.dailyGoalSteps);
    expect(newGame(dailySeed('2026-10-06')).tray).toEqual(newGame(dailySeed('2026-10-06')).tray);
  });

  it('day streaks grow on consecutive days and restart after a gap', () => {
    let s = extendStreak(emptyStreak(), '2026-10-01');
    s = extendStreak(s, '2026-10-01');
    expect(s.count).toBe(1);
    s = extendStreak(s, '2026-10-02');
    expect(s.count).toBe(2);
    expect(streakAlive(s, '2026-10-03')).toBe(true);
    expect(streakAlive(s, '2026-10-04')).toBe(false);
    s = extendStreak(s, '2026-10-05');
    expect(s).toEqual({ count: 1, last: '2026-10-05' });
  });
});

describe('quests', () => {
  const piece = (id: string): Piece => ({ shapeIndex: shapeIndexOf(id), seed: SEED });
  const state = (p: Partial<GameState>): GameState => ({
    board: boardFrom([]),
    tray: [null, null, null],
    score: 0,
    streak: 0,
    misses: 0,
    sinceSmall: 0,
    revives: 0,
    rng: 1,
    over: false,
    ...p,
  });

  it('picks three distinct quests per day, the same for everyone', () => {
    const q = questsFor('2026-10-06');
    expect(q).toHaveLength(QUESTS.perDay);
    expect(new Set(q.map((x) => x.kind)).size).toBe(QUESTS.perDay);
    expect(questsFor('2026-10-06')).toEqual(q);
    for (const x of q) expect(QUESTS.targets[x.kind] as readonly number[]).toContain(x.target);
  });

  it('progresses from moves and completes once', () => {
    const day: QuestDay = {
      date: 'd',
      quests: [
        { kind: 'lines', target: 1 },
        { kind: 'pieces', target: 1 },
        { kind: 'score', target: 10 },
      ],
      progress: [0, 0, 0],
      done: false,
    };
    const m = playMove(
      state({ board: boardFrom(['aaaaaaaa.']), tray: [piece('mono'), piece('mono'), null], score: 30 }),
      0,
      0,
      8,
    );
    if (!m) throw new Error('move');
    const r = applyQuestEvent(day, { mode: 'classic', move: m, gameScore: m.state.score });
    expect(r.day.progress).toEqual([1, 1, 10]);
    expect(r.completed).toBe(true);
    expect(applyQuestEvent(r.day, { mode: 'classic', move: m, gameScore: 99 }).completed).toBe(false);
  });

  it('zen cannot farm score quests; blitz quests count only in blitz', () => {
    const day: QuestDay = {
      date: 'd',
      quests: [
        { kind: 'score', target: 500 },
        { kind: 'blitz', target: 300 },
        { kind: 'daily', target: 1 },
      ],
      progress: [0, 0, 0],
      done: false,
    };
    expect(applyQuestEvent(day, { mode: 'zen', gameScore: 9999 }).day.progress).toEqual([0, 0, 0]);
    expect(applyQuestEvent(day, { mode: 'classic', gameScore: 400 }).day.progress).toEqual([400, 0, 0]);
    expect(applyQuestEvent(day, { mode: 'blitz', gameScore: 350 }).day.progress).toEqual([350, 300, 0]);
    expect(applyQuestEvent(day, { mode: 'daily', gameScore: 0, dailyDone: true }).day.progress).toEqual([
      0, 0, 1,
    ]);
  });

  it('a new day brings new quests; stored progress is validated against the date', () => {
    const d = newQuestDay('2026-10-06');
    expect(questDayFor(d, '2026-10-06')).toBe(d);
    expect(questDayFor(d, '2026-10-07').date).toBe('2026-10-07');
    const parsed = parseQuestDay(
      JSON.stringify({ date: '2026-10-06', progress: [999, -3, 'x'], done: true }),
    );
    expect(parsed?.quests).toEqual(d.quests);
    expect(parsed?.progress[0]).toBe(d.quests[0]?.target);
    expect(parsed?.progress[1]).toBe(0);
    expect(parseQuestDay('{bad')).toBeNull();
  });
});

describe('zen rescue', () => {
  it('clears the fullest square without using up a revive, and always leaves a move', () => {
    const s: GameState = {
      board: checkerboard(),
      tray: [{ shapeIndex: shapeIndexOf('o4'), seed: SEED }, null, null],
      score: 50,
      streak: 0,
      misses: 0,
      sinceSmall: 0,
      revives: 0,
      rng: 3,
      over: true,
    };
    const { state } = zenRescue(s);
    expect(state.over).toBe(false);
    expect(state.revives).toBe(0);
    expect(zenRescue(zenRescue(s).state).state.revives).toBe(0);
  });
});
