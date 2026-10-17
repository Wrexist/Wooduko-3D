import { describe, expect, it } from 'vitest';
import { Engine, fromFen, legalMoves, makeMove, START_FEN, status } from '../src/core/chess';
import { goalHint, stepAllows } from '../src/core/chessSchool';
import {
  addLessonCards,
  addMistake,
  asWhite,
  allPuzzles,
  buildSession,
  drillOf,
  emptyTrain,
  expected,
  finishSession,
  fullFen,
  interleave,
  intervalFor,
  MAX_MISTAKES,
  mirrorFen,
  mirrorUci,
  moveOf,
  newCard,
  OPENINGS,
  parseTrain,
  rankOf,
  rateAfter,
  rateSolve,
  recordResult,
  review,
  themeOfCard,
  uciOf,
} from '../src/core/chessTrain';

const DAY = 20000;

describe('positions', () => {
  it('fullFen round-trips, castling and en passant included', () => {
    for (const fen of [START_FEN, 'r3k2r/8/8/3pP3/8/8/8/R3K2R w Kq d6 3 1'])
      expect(fullFen(fromFen(fen))).toBe(fen);
  });

  it('mirrorFen swaps sides and flips the board', () => {
    const fen = 'r3k2r/pp6/8/3pP3/8/8/6PP/R3K2R b Kq e3 0 1';
    const m = mirrorFen(fen);
    expect(m).toBe('r3k2r/6pp/8/8/3Pp3/8/PP6/R3K2R w Qk e6 0 1');
    expect(mirrorFen(m)).toBe(fen);
  });

  it('moveOf finds moves by name, a bare promotion as a queen', () => {
    const p = fromFen('8/4P3/8/8/8/8/8/k6K w - - 0 1');
    expect(uciOf(moveOf(p, 'e7e8'))).toBe('e7e8q');
    expect(uciOf(moveOf(p, 'e7e8n'))).toBe('e7e8n');
    expect(moveOf(p, 'e7e6')).toBe(0);
  });
});

describe('openings', () => {
  it('every line is legal, starts from the start, and ends on your move', () => {
    for (const o of OPENINGS) {
      const p = fromFen(START_FEN);
      for (const u of o.moves) {
        const m = moveOf(p, u);
        expect(m, `${o.id} ${u}`).not.toBe(0);
        makeMove(p, m);
      }
      expect(o.moves.length % 2, o.id).toBe(1);
    }
  });

  it('the line goal accepts only the next move of the line, and hints it', () => {
    const o = OPENINGS[0];
    if (!o) throw new Error('no openings');
    const step = { fen: START_FEN, goal: 'line' as const, accept: o.moves };
    const p = fromFen(START_FEN);
    const right = moveOf(p, o.moves[0] ?? '');
    const wrong = legalMoves(p).find((m) => m !== right) ?? 0;
    expect(stepAllows(step, p, right)).toBe(true);
    expect(stepAllows(step, p, wrong)).toBe(false);
    expect(goalHint(step, p)).toBe(right);
    makeMove(p, right);
    makeMove(p, moveOf(p, o.moves[1] ?? ''));
    expect(uciOf(goalHint(step, p))).toBe(o.moves[2]);
  });

  it('no line drops material to a two-move trick (engine sanity check)', () => {
    const e = new Engine();
    for (const o of OPENINGS) {
      const p = fromFen(START_FEN);
      for (const u of o.moves) makeMove(p, moveOf(p, u));
      // Black to move at the end: White shouldn't be losing much
      const r = e.think(p, 400, 6);
      expect(-r.score, o.id).toBeGreaterThan(-120);
    }
  });
});

describe('memory model', () => {
  it('good reviews stretch the interval; a miss brings the card back tomorrow', () => {
    let c = review(newCard(), 3, DAY);
    const gaps = [c.due - DAY];
    let day = c.due;
    for (let i = 0; i < 4; i++) {
      c = review(c, 3, day);
      gaps.push(c.due - day);
      day = c.due;
    }
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]).toBeGreaterThan(gaps[i - 1] ?? 0);
    const missed = review(c, 1, day);
    expect(missed.due).toBe(day + 1);
    expect(missed.stab).toBeLessThan(c.stab);
    expect(missed.lapses).toBe(1);
  });

  it('easy beats good beats hard', () => {
    const c = review(newCard(), 3, DAY);
    const at = c.due;
    const [h, g, e] = ([2, 3, 4] as const).map((r) => review(c, r, at).due - at);
    expect(h).toBeLessThanOrEqual(g ?? 0);
    expect(g).toBeLessThan(e ?? 0);
  });

  it('intervals stay within a day and a year', () => {
    expect(intervalFor(0.01)).toBe(1);
    expect(intervalFor(10000)).toBe(365);
  });

  it('a solve rates by mistakes, hints and speed', () => {
    expect(rateSolve(1, false, 3, 1)).toBe(1);
    expect(rateSolve(0, true, 3, 1)).toBe(1);
    expect(rateSolve(0, false, 5, 1)).toBe(4);
    expect(rateSolve(0, false, 30, 1)).toBe(3);
    expect(rateSolve(0, false, 90, 1)).toBe(2);
  });
});

describe('rating', () => {
  it('moves up on a solve, down on a miss, more against harder puzzles', () => {
    expect(expected(1000, 1000)).toBeCloseTo(0.5);
    expect(rateAfter(1000, 1000, true, 0)).toBeGreaterThan(1000);
    expect(rateAfter(1000, 1000, false, 0)).toBeLessThan(1000);
    expect(rateAfter(1000, 1400, true, 0) - 1000).toBeGreaterThan(rateAfter(1000, 1000, true, 0) - 1000);
    // settles: later games move it less
    expect(rateAfter(1000, 1000, true, 100) - 1000).toBeLessThan(rateAfter(1000, 1000, true, 0) - 1000);
  });

  it('ranks climb to Grandmaster', () => {
    expect(rankOf(500)).toBe(0);
    expect(rankOf(1100)).toBe(2);
    expect(rankOf(2600)).toBe(7);
  });
});

describe('state and sessions', () => {
  it('parses junk as a fresh start', () => {
    expect(parseTrain(null).rating).toBe(800);
    expect(parseTrain('{').cards).toEqual({});
    expect(parseTrain('{"v":2}').cards).toEqual({});
  });

  it('a session mixes due cards, one new opening and new puzzles, without repeats', () => {
    let s = emptyTrain();
    s = addMistake(s, '6k1/5ppp/8/8/8/8/8/R5K1 w - - 0 1', 'a1a8', DAY);
    const q = buildSession(s, DAY, () => 0.42);
    expect(new Set(q).size).toBe(q.length);
    expect(q.some((id) => id.startsWith('m:'))).toBe(true);
    expect(q.filter((id) => id.startsWith('o:')).length).toBe(1);
    if (allPuzzles().length) expect(q.filter((id) => id.startsWith('p')).length).toBeGreaterThanOrEqual(5);
  });

  it('interleaving keeps neighbours on different themes where it can', () => {
    const ids = ['o:italian', 'o:petrov', 'm:x|a1a2', 'm:y|a1a2', 'l:mate1.0', 'l:mate1.1'];
    const out = interleave(ids, () => 0.3);
    expect([...out].sort()).toEqual([...ids].sort());
    let same = 0;
    for (let i = 1; i < out.length; i++)
      if (themeOfCard(out[i] ?? '') === themeOfCard(out[i - 1] ?? '')) same++;
    expect(same).toBe(0);
  });

  it('records results: first tries move the rating, retries only the schedule', () => {
    const p = allPuzzles()[0];
    const id = p?.id ?? 'o:italian';
    const s = emptyTrain();
    const a = recordResult(s, id, 3, DAY, true);
    expect(a.state.tried).toBe(1);
    expect(a.state.solved).toBe(1);
    if (p) expect(a.delta).not.toBe(0);
    const b = recordResult(a.state, id, 1, DAY, false);
    expect(b.state.rating).toBe(a.state.rating);
    expect(b.state.tried).toBe(1);
  });

  it('streak counts days in a row', () => {
    let s = finishSession(emptyTrain(), DAY);
    expect(s.streak).toBe(1);
    s = finishSession(s, DAY);
    expect(s.streak).toBe(1);
    s = finishSession(s, DAY + 1);
    expect(s.streak).toBe(2);
    s = finishSession(s, DAY + 5);
    expect(s.streak).toBe(1);
  });

  it('keeps at most MAX_MISTAKES of your own mistakes', () => {
    let s = emptyTrain();
    for (let i = 0; i < MAX_MISTAKES + 10; i++) s = addMistake(s, `fen${i}`, 'a1a2', DAY);
    expect(Object.keys(s.cards).filter((k) => k.startsWith('m:')).length).toBe(MAX_MISTAKES);
  });

  it('lesson cards wait until tomorrow', () => {
    const s = addLessonCards(emptyTrain(), ['l:mate1.0'], DAY);
    expect(s.cards['l:mate1.0']?.due).toBe(DAY + 1);
    expect(drillOf('l:mate1.0')).toEqual({ kind: 'lesson', lesson: 'mate1', step: 0 });
  });
});

describe('puzzles', () => {
  const all = allPuzzles();

  it('are White to move, unique, and their lines legal', () => {
    const seen = new Set<string>();
    for (const pz of all) {
      expect(pz.fen.split(' ')[1], pz.fen).toBe('w');
      expect(seen.has(pz.id)).toBe(false);
      seen.add(pz.id);
      const p = fromFen(pz.fen);
      for (const u of pz.line) {
        const m = moveOf(p, u);
        expect(m, `${pz.fen} ${u}`).not.toBe(0);
        makeMove(p, m);
      }
    }
  });

  it('spread from beginner to expert', () => {
    if (!all.length) return;
    const ratings = all.map((p) => p.rating);
    expect(Math.min(...ratings)).toBeLessThan(600);
    expect(Math.max(...ratings)).toBeGreaterThan(2500);
  });

  it('mate puzzles really end in mate (our rules agree with Lichess)', () => {
    let n = 0;
    for (const pz of all) {
      if (!pz.theme.startsWith('mate')) continue;
      const p = fromFen(pz.fen);
      for (const u of pz.line) makeMove(p, moveOf(p, u));
      expect(status(p), pz.fen).toBe('mate');
      n++;
    }
    if (all.length) expect(n).toBeGreaterThan(100);
  });
});

describe('mistakes made as Black', () => {
  it('become White-to-move cards on the mirrored board', () => {
    const fen = 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2';
    const card = asWhite(fen, 'b8c6');
    expect(card.fen.split(' ')[1]).toBe('w');
    expect(card.best).toBe('b1c3');
    const p = fromFen(card.fen);
    expect(moveOf(p, card.best)).not.toBe(0);
    expect(mirrorUci('e7e8q')).toBe('e2e1q');
    // White's own stay as they are
    expect(asWhite(START_FEN, 'e2e4')).toEqual({ fen: START_FEN, best: 'e2e4' });
  });
});
