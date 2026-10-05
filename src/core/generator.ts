import { GENERATOR, WOOD_SEED } from '../config';
import type { GeneratorConfig } from '../config';
import { canFitAnywhere } from './board';
import { ORIENTATIONS, TOTAL_WEIGHT } from './shapes';
import type { BoardState, Piece, Shape, WoodSeed } from './types';

/** Mutable xorshift32 generator. Core functions take one of these; its `state` is saved. */
export interface Rng {
  state: number;
}

export function createRng(state: number): Rng {
  return { state: state >>> 0 || 1 };
}

/** Next float in [0, 1). */
export function nextFloat(rng: Rng): number {
  let s = rng.state;
  s ^= s << 13;
  s >>>= 0;
  s ^= s >>> 17;
  s ^= s << 5;
  s >>>= 0;
  rng.state = s || 1;
  return s / 4294967296;
}

export const range = (rng: Rng, min: number, max: number): number => min + nextFloat(rng) * (max - min);

export function makeWoodSeed(rng: Rng): WoodSeed {
  const j = WOOD_SEED.jitter / 2;
  return {
    a: nextFloat(rng) * WOOD_SEED.angleMax,
    s: range(rng, WOOD_SEED.scaleMin, WOOD_SEED.scaleMax),
    jx: range(rng, -j, j),
    jy: range(rng, -j, j),
    t: range(rng, WOOD_SEED.tintMin, WOOD_SEED.tintMax),
  };
}

/** Weighted pick of an orientation index. */
export function pickShape(rng: Rng): number {
  let x = nextFloat(rng) * TOTAL_WEIGHT;
  for (const o of ORIENTATIONS) {
    x -= o.weight;
    if (x <= 0) return o.index;
  }
  return ORIENTATIONS.length - 1;
}

const fits = (board: BoardState, index: number): boolean => {
  const shape = ORIENTATIONS[index];
  return shape !== undefined && canFitAnywhere(board, shape);
};

export const isSmall = (shape: Shape, cfg: GeneratorConfig = GENERATOR): boolean =>
  shape.cells.length <= cfg.smallCells;

/** Difficulty ramp: big pieces get a little more likely and small ones a little less as the score climbs. */
export function rampWeights(score: number, cfg: GeneratorConfig = GENERATOR): number[] {
  const t = Math.min(1, Math.max(0, score / cfg.rampScore));
  const big = cfg.bigWeight[0] + (cfg.bigWeight[1] - cfg.bigWeight[0]) * t;
  const small = cfg.smallWeight[0] + (cfg.smallWeight[1] - cfg.smallWeight[0]) * t;
  return ORIENTATIONS.map((o) => {
    const n = o.cells.length;
    return o.weight * (n >= cfg.bigCells ? big : n <= cfg.smallCells ? small : 1);
  });
}

/** Weighted pick among orientations, optionally restricted by `allow`. -1 if nothing is allowed. */
export function pickWeighted(
  rng: Rng,
  weights: readonly number[],
  allow?: (index: number) => boolean,
): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) if (!allow || allow(i)) total += weights[i] ?? 0;
  if (total <= 0) return -1;
  let x = nextFloat(rng) * total;
  let last = -1;
  for (let i = 0; i < weights.length; i++) {
    if (allow && !allow(i)) continue;
    last = i;
    x -= weights[i] ?? 0;
    if (x <= 0) return i;
  }
  return last;
}

export interface DealContext {
  readonly score: number;
  /** Pieces dealt since the last small piece. */
  readonly sinceSmall: number;
}

export interface Deal {
  readonly pieces: Piece[];
  readonly sinceSmall: number;
}

/**
 * Deal a full tray:
 * 1. weighted picks, with the difficulty ramp applied for the current score;
 * 2. drought guard: if too many pieces went by without a small one, one slot becomes small;
 * 3. fit: re-roll until at least one piece fits; if that keeps failing, force a fitting piece
 *    into one slot. Some empty cell always exists (full lines clear), so a fit is guaranteed.
 */
export function dealTray(
  board: BoardState,
  rng: Rng,
  ctx: DealContext,
  cfg: GeneratorConfig = GENERATOR,
): Deal {
  const weights = rampWeights(ctx.score, cfg);
  const smallIdx = (i: number): boolean => {
    const o = ORIENTATIONS[i];
    return o !== undefined && isSmall(o, cfg);
  };
  const needSmall = ctx.sinceSmall + cfg.traySize >= cfg.droughtMax;
  let set: number[] = [];
  for (let t = 0; t < Math.max(1, cfg.fitRetries); t++) {
    set = Array.from({ length: cfg.traySize }, () => pickWeighted(rng, weights));
    if (needSmall && !set.some(smallIdx)) {
      const slot = Math.floor(nextFloat(rng) * cfg.traySize);
      const small = pickWeighted(rng, weights, (i) => smallIdx(i) && fits(board, i));
      set[slot] = small >= 0 ? small : pickWeighted(rng, weights, smallIdx);
    }
    if (set.some((i) => fits(board, i))) break;
  }
  if (cfg.forceFit && !set.some((i) => fits(board, i))) {
    // keep a small piece in place if the drought guard put one there
    const keep = set.findIndex(smallIdx);
    const slots = Array.from({ length: cfg.traySize }, (_, i) => i).filter((i) => i !== keep);
    const slot = slots[Math.floor(nextFloat(rng) * slots.length)] ?? 0;
    const forced = pickWeighted(rng, weights, (i) => fits(board, i));
    if (forced >= 0) set[slot] = forced;
  }
  let sinceSmall = ctx.sinceSmall;
  for (const i of set) sinceSmall = smallIdx(i) ? 0 : sinceSmall + 1;
  return { pieces: set.map((shapeIndex) => ({ shapeIndex, seed: makeWoodSeed(rng) })), sinceSmall };
}
