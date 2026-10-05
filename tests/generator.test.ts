import { describe, expect, it } from 'vitest';
import { BASE_SHAPES, GENERATOR, WOOD_SEED } from '../src/config';
import { canFitAnywhere, emptyBoard } from '../src/core/board';
import { createRng, dealTray, makeWoodSeed, nextFloat, pickShape } from '../src/core/generator';
import { getShape, ORIENTATIONS } from '../src/core/shapes';
import { fullBoardExcept } from './helpers';

describe('rng', () => {
  it('is deterministic for a seed and stays in [0, 1)', () => {
    const a = createRng(12345);
    const b = createRng(12345);
    for (let i = 0; i < 1000; i++) {
      const x = nextFloat(a);
      expect(x).toBe(nextFloat(b));
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('never gets stuck at 0', () => {
    const r = createRng(0);
    expect(r.state).not.toBe(0);
    expect(nextFloat(r)).toBeGreaterThan(0);
  });

  it('wood seeds stay inside their configured ranges', () => {
    const r = createRng(7);
    for (let i = 0; i < 500; i++) {
      const s = makeWoodSeed(r);
      expect(s.s).toBeGreaterThanOrEqual(WOOD_SEED.scaleMin);
      expect(s.s).toBeLessThanOrEqual(WOOD_SEED.scaleMax);
      expect(s.t).toBeGreaterThanOrEqual(WOOD_SEED.tintMin);
      expect(s.t).toBeLessThanOrEqual(WOOD_SEED.tintMax);
      expect(Math.abs(s.jx)).toBeLessThanOrEqual(WOOD_SEED.jitter / 2);
    }
  });
});

describe('pickShape', () => {
  it('matches the configured base weights over many draws', () => {
    const r = createRng(99);
    const counts = new Map<string, number>();
    const n = 200_000;
    for (let i = 0; i < n; i++) {
      const id = ORIENTATIONS[pickShape(r)]?.baseId ?? '';
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    const total = BASE_SHAPES.reduce((a, b) => a + b.weight, 0);
    for (const b of BASE_SHAPES) {
      expect((counts.get(b.id) ?? 0) / n).toBeCloseTo(b.weight / total, 2);
    }
  });
});

describe('dealTray', () => {
  it('deals traySize pieces with valid shapes', () => {
    const tray = dealTray(emptyBoard(), createRng(1));
    expect(tray).toHaveLength(GENERATOR.traySize);
    tray.forEach((p) => expect(getShape(p.shapeIndex)).toBeDefined());
  });

  it('re-rolls until at least one piece fits when that is possible', () => {
    // Only a single hole: only the 1-cell piece fits. Most trays won't contain one.
    // A single tray hits it ~12% of the time; 40 retries should push that near 99%.
    const board = fullBoardExcept([[4, 4]]);
    const trials = 500;
    let fits = 0;
    for (let seed = 1; seed <= trials; seed++) {
      const tray = dealTray(board, createRng(seed));
      const anyFits = tray.some((p) => {
        const s = getShape(p.shapeIndex);
        return s !== undefined && canFitAnywhere(board, s);
      });
      if (anyFits) fits++;
    }
    expect(fits / trials).toBeGreaterThan(0.97);
  });

  it('still returns a tray when nothing can fit', () => {
    const tray = dealTray(fullBoardExcept([]), createRng(3));
    expect(tray).toHaveLength(GENERATOR.traySize);
  });
});
