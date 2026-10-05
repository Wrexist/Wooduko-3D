import { GENERATOR, WOOD_SEED } from '../config';
import { canFitAnywhere } from './board';
import { ORIENTATIONS, TOTAL_WEIGHT } from './shapes';
import type { BoardState, Piece, WoodSeed } from './types';

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

/** Deal a full tray. Re-rolls until at least one piece fits (up to `fitRetries` tries). */
export function dealTray(board: BoardState, rng: Rng): Piece[] {
  let set: number[] = [];
  for (let t = 0; t < GENERATOR.fitRetries; t++) {
    set = Array.from({ length: GENERATOR.traySize }, () => pickShape(rng));
    if (set.some((i) => fits(board, i))) break;
  }
  return set.map((shapeIndex) => ({ shapeIndex, seed: makeWoodSeed(rng) }));
}
