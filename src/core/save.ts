import { BOARD, DEFAULT_SETTINGS, GENERATOR, SAVE } from '../config';
import { emptyBoard, inBounds, place } from './board';
import { getShape } from './shapes';
import type { BoardState, Cell, GameState, Piece, SaveData, Settings, UvCenter, WoodSeed } from './types';

export function toSave(state: GameState): SaveData {
  return {
    version: SAVE.version,
    score: state.score,
    streak: state.streak,
    misses: state.misses,
    sinceSmall: state.sinceSmall,
    rng: state.rng,
    groups: state.board.groups.map((g) => ({ cells: g.cells, center: g.center, seed: g.seed })),
    tray: state.tray.map((p) => (p ? { shapeIndex: p.shapeIndex, seed: p.seed } : null)),
  };
}

export const serializeSave = (state: GameState): string => JSON.stringify(toSave(state));

// ---------- validation helpers (input is untrusted JSON) ----------

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isNonNegInt = (v: unknown): v is number => Number.isInteger(v) && (v as number) >= 0;

function readSeed(v: unknown): WoodSeed | null {
  if (!isObj(v)) return null;
  const { a, s, jx, jy, t } = v;
  return isNum(a) && isNum(s) && isNum(jx) && isNum(jy) && isNum(t) ? { a, s, jx, jy, t } : null;
}

function readCenter(v: unknown): UvCenter | null {
  return Array.isArray(v) && v.length === 2 && isNum(v[0]) && isNum(v[1]) ? [v[0], v[1]] : null;
}

function readCells(v: unknown): Cell[] | null {
  if (!Array.isArray(v) || v.length === 0) return null;
  const out: Cell[] = [];
  for (const p of v) {
    if (!Array.isArray(p) || p.length !== 2 || !Number.isInteger(p[0]) || !Number.isInteger(p[1]))
      return null;
    if (!inBounds(p[0], p[1])) return null;
    out.push([p[0], p[1]]);
  }
  return out;
}

function readPiece(v: unknown, shapeKey: string): Piece | null | undefined {
  if (v === null) return null;
  if (!isObj(v)) return undefined;
  const shapeIndex = v[shapeKey];
  const seed = readSeed(v.seed);
  if (!isNonNegInt(shapeIndex) || !getShape(shapeIndex) || !seed) return undefined;
  return { shapeIndex, seed };
}

/**
 * Upgrade older save formats step by step to the current shape.
 * v0 = the single-file prototype: no `version`, tray items use `shape`, no RNG state.
 * v1 = Phase 1 rebuild: no combo misses, no generator drought counter.
 */
function migrate(input: Obj, fallbackRng: number): Obj | null {
  let raw = input;
  if ((raw.version ?? 0) === 0) {
    const tray = Array.isArray(raw.tray)
      ? raw.tray.map((t: unknown) => (isObj(t) ? { shapeIndex: t.shape, seed: t.seed } : t))
      : raw.tray;
    raw = { ...raw, version: 1, rng: fallbackRng, tray };
  }
  if (raw.version === 1) raw = { ...raw, version: 2, misses: 0, sinceSmall: 0 };
  return raw.version === SAVE.version ? raw : null;
}

/**
 * Parse and validate a saved game. Returns null on any problem (bad JSON, out-of-bounds or
 * overlapping cells, unknown shapes, bad numbers) so the caller starts a fresh game instead.
 */
export function parseSave(json: string | null, fallbackRng: number): GameState | null {
  if (!json) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return null;
  }
  if (!isObj(parsed)) return null;
  const raw = migrate(parsed, fallbackRng);
  if (!raw) return null;
  const { score, streak, misses, sinceSmall, rng, groups, tray } = raw;
  if (!isNonNegInt(score) || !isNonNegInt(streak) || !isNonNegInt(rng)) return null;
  if (!isNonNegInt(misses) || !isNonNegInt(sinceSmall)) return null;
  if (!Array.isArray(groups) || !Array.isArray(tray) || tray.length !== GENERATOR.traySize) return null;

  let board: BoardState = emptyBoard();
  const taken = new Set<number>();
  for (const g of groups) {
    if (!isObj(g)) return null;
    const cells = readCells(g.cells);
    const center = readCenter(g.center);
    const seed = readSeed(g.seed);
    if (!cells || !center || !seed) return null;
    for (const [r, c] of cells) {
      const k = r * BOARD.size + c;
      if (taken.has(k)) return null;
      taken.add(k);
    }
    board = place(board, cells, center, seed).board;
  }

  const pieces: (Piece | null)[] = [];
  for (const t of tray) {
    const p = readPiece(t, 'shapeIndex');
    if (p === undefined) return null;
    pieces.push(p);
  }

  return { board, tray: pieces, score, streak, misses, sinceSmall, rng, over: false };
}

export function parseBest(raw: string | null): number {
  const n = raw === null ? 0 : Number.parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function parseSettings(raw: string | null, legacyMute: string | null): Settings {
  const base: Settings = { ...DEFAULT_SETTINGS, sound: legacyMute !== '1' };
  if (!raw) return base;
  try {
    const v: unknown = JSON.parse(raw);
    if (!isObj(v)) return base;
    const pick = (k: keyof Settings): boolean => (typeof v[k] === 'boolean' ? (v[k] as boolean) : base[k]);
    return {
      sound: pick('sound'),
      music: pick('music'),
      haptics: pick('haptics'),
      reduceMotion: pick('reduceMotion'),
    };
  } catch {
    return base;
  }
}
