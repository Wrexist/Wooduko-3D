import { describe, expect, it } from 'vitest';
import {
  isSolved,
  kRecord,
  kStars,
  kUnlocked,
  maxSlide,
  parseKProgress,
  parseLevel,
  slide,
  solve,
} from '../src/core/klotski';
import { KLOTSKI_LEVELS } from '../src/core/klotskiLevels';

describe('klotski rules', () => {
  const lvl = parseLevel(['AA.', 'AA.', 'B..']);

  it('parses pieces, key first, exit centred on the bottom edge', () => {
    expect(lvl.w).toBe(3);
    expect(lvl.h).toBe(3);
    expect(lvl.pieces[0]).toMatchObject({ id: 0, r: 0, c: 0, w: 2, h: 2, key: true });
    expect(lvl.pieces[1]).toMatchObject({ r: 2, c: 0, w: 1, h: 1, key: false });
    expect(lvl.exit).toEqual({ r: 1, c: 0 });
    expect(parseLevel(['.AA.', '.AA.', '....']).exit).toEqual({ r: 1, c: 1 });
  });

  it('rejects broken layouts', () => {
    expect(() => parseLevel(['AB', 'BA'])).toThrow();
    expect(() => parseLevel(['BB', '..'])).toThrow();
    expect(() => parseLevel(['AA', 'A.'])).toThrow();
  });

  it('slides as far as free, not through pieces or walls', () => {
    expect(maxSlide(lvl, lvl.pieces, 0, 'right')).toBe(1);
    expect(maxSlide(lvl, lvl.pieces, 0, 'down')).toBe(0);
    expect(maxSlide(lvl, lvl.pieces, 1, 'right')).toBe(2);
    expect(slide(lvl, lvl.pieces, 0, 'down', 1)).toBeNull();
    const moved = slide(lvl, lvl.pieces, 1, 'right', 5);
    expect(moved?.[1]).toMatchObject({ r: 2, c: 2 });
  });

  it('solves with the fewest straight slides', () => {
    // B right (1), A down (1)
    expect(solve(lvl)).toBe(2);
    const done = slide(lvl, slide(lvl, lvl.pieces, 1, 'right', 2) ?? [], 0, 'down', 1) ?? [];
    expect(isSolved(lvl, done)).toBe(true);
    expect(solve(parseLevel(['AAB', 'AAB']))).toBe(0);
    expect(solve(parseLevel(['BAA', 'CAA', 'DEF'], { r: 0, c: 0 }))).toBe(-1);
  });

  it('scores stars against par', () => {
    expect(kStars(10, 10)).toBe(3);
    expect(kStars(15, 10)).toBe(2);
    expect(kStars(16, 10)).toBe(1);
  });

  it('records best stars and unlocks in order', () => {
    let p = parseKProgress(null);
    expect(kUnlocked(p, 30)).toBe(1);
    p = kRecord(p, 1, 2);
    p = kRecord(p, 1, 1);
    expect(p.stars).toEqual([2]);
    expect(kUnlocked(p, 30)).toBe(2);
    expect(parseKProgress(JSON.stringify(p))).toEqual(p);
    expect(parseKProgress('{bad')).toEqual({ stars: [] });
    expect(parseKProgress(JSON.stringify({ stars: [9, 'x', 2] }))).toEqual({ stars: [0, 0, 2] });
  });
});

describe('klotski levels', () => {
  it('are valid 4×5 boards with a 2×2 key that starts away from the exit', () => {
    expect(KLOTSKI_LEVELS.length).toBe(30);
    for (const { rows } of KLOTSKI_LEVELS) {
      const l = parseLevel(rows);
      expect([l.w, l.h]).toEqual([4, 5]);
      expect(l.pieces[0]).toMatchObject({ w: 2, h: 2, key: true });
      expect(isSolved(l, l.pieces)).toBe(false);
    }
  });

  it('have the par the solver finds (first ten; the rest are checked by klotski:levels)', () => {
    for (const { rows, par } of KLOTSKI_LEVELS.slice(0, 10)) expect(solve(parseLevel(rows))).toBe(par);
  });
});
