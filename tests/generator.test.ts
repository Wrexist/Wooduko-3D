import { describe, expect, it } from 'vitest';
import { BASE_SHAPES, GENERATOR, GENERATOR_PROTOTYPE, WOOD_SEED } from '../src/config';
import { canFitAnywhere, emptyBoard } from '../src/core/board';
import {
  createRng,
  dealTray,
  isSmall,
  makeWoodSeed,
  nextFloat,
  pickShape,
  rampWeights,
} from '../src/core/generator';
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

const CTX = { score: 0, sinceSmall: 0 };
const anyFits = (board: ReturnType<typeof emptyBoard>, pieces: { shapeIndex: number }[]) =>
  pieces.some((p) => {
    const sh = getShape(p.shapeIndex);
    return sh !== undefined && canFitAnywhere(board, sh);
  });

describe('dealTray', () => {
  it('deals traySize pieces with valid shapes', () => {
    const { pieces } = dealTray(emptyBoard(), createRng(1), CTX);
    expect(pieces).toHaveLength(GENERATOR.traySize);
    pieces.forEach((p) => expect(getShape(p.shapeIndex)).toBeDefined());
  });

  it('always deals at least one piece that fits (forced fit)', () => {
    // a single hole: only the 1-cell piece fits
    const board = fullBoardExcept([[4, 4]]);
    for (let seed = 1; seed <= 500; seed++) {
      expect(anyFits(board, dealTray(board, createRng(seed), CTX).pieces)).toBe(true);
    }
  });

  it('the prototype generator could deal an unplayable tray; the new one never does', () => {
    const board = fullBoardExcept([[4, 4]]);
    let protoMisses = 0;
    for (let seed = 1; seed <= 2000; seed++) {
      if (!anyFits(board, dealTray(board, createRng(seed), CTX, GENERATOR_PROTOTYPE).pieces)) protoMisses++;
    }
    expect(protoMisses).toBeGreaterThan(0);
  });

  it('the prototype config reproduces the old random sequence exactly', () => {
    const r1 = createRng(42);
    const r2 = createRng(42);
    const old = Array.from({ length: 3 }, () => pickShape(r1));
    const now = dealTray(emptyBoard(), r2, CTX, GENERATOR_PROTOTYPE).pieces.map((p) => p.shapeIndex);
    expect(now).toEqual(old);
  });

  it('drought guard: never more than droughtMax + traySize - 2 non-small pieces in a row', () => {
    const rng = createRng(9);
    const board = emptyBoard();
    let sinceSmall = 0;
    let run = 0;
    let worst = 0;
    for (let t = 0; t < 3000; t++) {
      const deal = dealTray(board, rng, { score: 5000, sinceSmall });
      for (const p of deal.pieces) {
        const sh = getShape(p.shapeIndex);
        run = sh && isSmall(sh) ? 0 : run + 1;
        worst = Math.max(worst, run);
      }
      sinceSmall = deal.sinceSmall;
      expect(sinceSmall).toBe(run);
    }
    expect(worst).toBeLessThanOrEqual(GENERATOR.droughtMax + GENERATOR.traySize - 2);
  });

  it('ramp: big pieces get more likely as the score climbs, small ones less', () => {
    const share = (score: number, pred: (n: number) => boolean) => {
      const w = rampWeights(score);
      const total = w.reduce((a, b) => a + b, 0);
      return ORIENTATIONS.reduce((a, o, i) => a + (pred(o.cells.length) ? (w[i] ?? 0) : 0), 0) / total;
    };
    const big = (n: number) => n >= GENERATOR.bigCells;
    const small = (n: number) => n <= GENERATOR.smallCells;
    expect(share(GENERATOR.rampScore, big)).toBeGreaterThan(share(0, big));
    expect(share(GENERATOR.rampScore, small)).toBeLessThan(share(0, small));
    expect(share(GENERATOR.rampScore * 10, big)).toBeCloseTo(share(GENERATOR.rampScore, big), 10);
  });

  it('still returns a tray when nothing at all can fit', () => {
    expect(dealTray(fullBoardExcept([]), createRng(3), CTX).pieces).toHaveLength(GENERATOR.traySize);
  });
});
