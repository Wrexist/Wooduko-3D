import type { ThemeId } from '../config';

// Core data types. Pure data: everything here is JSON-serializable.

/** A board coordinate `[row, col]`. Row 0 is the top of the screen (far side of the board). */
export type Cell = readonly [r: number, c: number];

/** UV centre of a block's end-grain rings, in cell units `[x, y]` = `[col, row]` space. */
export type UvCenter = readonly [x: number, y: number];

/** Per-block wood look: ring angle, ring scale, ring-centre jitter, brightness tint. */
export interface WoodSeed {
  readonly a: number;
  readonly s: number;
  readonly jx: number;
  readonly jy: number;
  readonly t: number;
}

/** One orientation of a base shape, normalized so its min row/col is 0. */
export interface Shape {
  /** Index into `ORIENTATIONS`. Stored in saves. */
  readonly index: number;
  /** Id of the base shape this orientation came from. */
  readonly baseId: string;
  readonly cells: readonly Cell[];
  readonly w: number;
  readonly h: number;
  readonly weight: number;
}

/** A piece waiting in the tray. */
export interface Piece {
  readonly shapeIndex: number;
  readonly seed: WoodSeed;
}

export type Tray = readonly (Piece | null)[];

/** A placed piece: one carved block mesh. Splits keep `seed` and `center`. */
export interface Group {
  readonly id: number;
  readonly cells: readonly Cell[];
  readonly center: UvCenter;
  readonly seed: WoodSeed;
}

export interface BoardState {
  /** `grid[r][c]` = group id, or 0 when empty. */
  readonly grid: readonly (readonly number[])[];
  readonly groups: readonly Group[];
  readonly nextId: number;
}

export type ClearUnitKind = 'row' | 'col' | 'box';

export interface ClearUnit {
  readonly kind: ClearUnitKind;
  /** Row index, column index, or box index (`boxRow·3 + boxCol`). */
  readonly index: number;
}

export interface ClearResult {
  /** Cells to clear (union of every full unit), sorted row-major. */
  readonly cells: readonly Cell[];
  /** Number of full rows + columns + boxes. */
  readonly units: number;
  readonly list: readonly ClearUnit[];
}

export interface Settings {
  readonly theme: ThemeId;
  readonly sound: boolean;
  readonly music: boolean;
  readonly haptics: boolean;
  readonly reduceMotion: boolean;
}

/** Everything needed to resume a game. */
export interface GameState {
  readonly board: BoardState;
  readonly tray: Tray;
  readonly score: number;
  readonly streak: number;
  /** Placements in a row that cleared nothing while a streak was alive (combo grace). */
  readonly misses: number;
  /** Pieces dealt since the last small piece (drought guard). */
  readonly sinceSmall: number;
  /** Revives used this game (at most one). */
  readonly revives: number;
  /** Seeded RNG state (xorshift32). */
  readonly rng: number;
  readonly over: boolean;
}

export interface SaveData {
  readonly version: number;
  readonly score: number;
  readonly streak: number;
  readonly misses: number;
  readonly sinceSmall: number;
  readonly revives: number;
  readonly rng: number;
  readonly groups: readonly {
    readonly cells: readonly Cell[];
    readonly center: UvCenter;
    readonly seed: WoodSeed;
  }[];
  readonly tray: readonly ({ readonly shapeIndex: number; readonly seed: WoodSeed } | null)[];
}
