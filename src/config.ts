// Every tunable number in the game lives here. Rendering and logic code import from this file only.
// Render/feel values are added in step 3.

export const BOARD = {
  size: 9,
  box: 3,
} as const;

/**
 * Base shapes: `|` separates rows, `#` is filled. Each base expands into all unique
 * rotations and mirrors; its weight is split evenly across those orientations.
 * Order matters: orientation indices are stored in saves.
 */
export const BASE_SHAPES: readonly {
  readonly id: string;
  readonly pattern: string;
  readonly weight: number;
}[] = [
  { id: 'mono', pattern: '#', weight: 1.0 },
  { id: 'i2', pattern: '##', weight: 2.2 },
  { id: 'i3', pattern: '###', weight: 2.2 },
  { id: 'i4', pattern: '####', weight: 1.6 },
  { id: 'i5', pattern: '#####', weight: 1.1 },
  { id: 'l3', pattern: '##|#.', weight: 3.0 },
  { id: 'o4', pattern: '##|##', weight: 2.2 },
  { id: 'l4', pattern: '#..|###', weight: 2.6 },
  { id: 't4', pattern: '###|.#.', weight: 2.0 },
  { id: 's4', pattern: '##.|.##', weight: 1.6 },
  { id: 'l5', pattern: '#..|#..|###', weight: 1.5 },
  { id: 'plus', pattern: '.#.|###|.#.', weight: 0.7 },
  { id: 'u5', pattern: '#.#|###', weight: 0.6 },
];

export const SCORING = {
  /** Points per cell placed. */
  perCell: 1,
  /** Clear base = unitLinear·units + unitPair·units·(units−1). */
  unitLinear: 18,
  unitPair: 9,
  /** Clear multiplier = 1 + streakStep·(streak−1). */
  streakStep: 0.5,
  /** Bonus when a clear leaves the board empty. */
  boardClear: 150,
} as const;

export const GENERATOR = {
  traySize: 3,
  /** Re-roll a tray up to this many times until at least one piece fits. */
  fitRetries: 40,
} as const;

/** Per-block wood look, rolled once per piece and kept through splits. */
export const WOOD_SEED = {
  angleMax: Math.PI * 2,
  scaleMin: 0.85,
  scaleMax: 1.2,
  jitter: 0.1,
  tintMin: 0.86,
  tintMax: 0.96,
} as const;

export const SAVE = {
  version: 1,
  gameKey: 'grain_save_v1',
  bestKey: 'grain_best_v1',
  settingsKey: 'grain_settings_v1',
  /** Pre-rebuild prototype stored mute here. */
  legacyMuteKey: 'grain_muted',
} as const;

export const DEFAULT_SETTINGS = {
  sound: true,
  music: true,
  haptics: true,
  reduceMotion: false,
} as const;
