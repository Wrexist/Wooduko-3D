import type { AchievementId } from './core/progress';

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

export interface GeneratorConfig {
  readonly traySize: number;
  /** Re-roll a tray up to this many times until at least one piece fits. */
  readonly fitRetries: number;
  /** After the re-rolls, force one fitting piece into the tray (fit is then guaranteed). */
  readonly forceFit: boolean;
  /** Pieces with at most this many cells count as "small" for the drought guard. */
  readonly smallCells: number;
  /** A tray must contain a small piece once this many pieces have been dealt without one. */
  readonly droughtMax: number;
  /** Pieces with at least this many cells count as "big" for the difficulty ramp. */
  readonly bigCells: number;
  /** Ramp reaches full strength at this score. */
  readonly rampScore: number;
  /** Weight multipliers at score 0 → at rampScore. */
  readonly bigWeight: readonly [start: number, end: number];
  readonly smallWeight: readonly [start: number, end: number];
}

export const GENERATOR: GeneratorConfig = {
  traySize: 3,
  fitRetries: 40,
  forceFit: true,
  smallCells: 3,
  droughtMax: 7,
  bigCells: 5,
  rampScore: 4000,
  bigWeight: [0.85, 1.2],
  smallWeight: [1.1, 0.92],
};

/** The prototype's generator, kept for before/after comparisons in the playtest simulator. */
export const GENERATOR_PROTOTYPE: GeneratorConfig = {
  ...GENERATOR,
  forceFit: false,
  droughtMax: Infinity,
  bigWeight: [1, 1],
  smallWeight: [1, 1],
};

/**
 * Combo rule. The streak grows on every placement that clears. A placement that clears nothing
 * is a "miss": the streak survives `grace` misses in a row and resets on the next one.
 * grace 0 = strict (the prototype's rule).
 *
 * Decided in Phase 3 from the bot playtest (`npm run sim`, see LEARNINGS.md): grace 1 doubles how
 * often casual players see a combo (23% → 45% of clears) for ~13% higher median scores; grace 2
 * makes combos the norm (70–80%) and doubles skilled scores, which cheapens them.
 */
export const COMBO = {
  grace: 1,
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
  version: 3,
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
  /** Faint glow on the last empty cell of a nearly full row/column/square. */
  hints: false,
  theme: 'maple',
} as const;

export const PROGRESS = {
  statsKey: 'grain_stats_v1',
  achievementsKey: 'grain_achievements_v1',
  /** Seconds an achievement banner stays up. */
  bannerSeconds: 2.6,
} as const;

/** Colours that change per wood theme. Everything else in `WOOD` (sizes, counts) is shared. */
export interface ThemeSpec {
  readonly id: ThemeId;
  /** Display name lives in i18n as `wood.<id>`. */
  /** Achievement that unlocks it (null = always available). */
  readonly unlock: AchievementId | null;
  /** Scene + page background. */
  readonly background: string;
  /** Ridge tint between cells (linear multiplier on the side grain, like `COLORS`). */
  readonly ridge: number;
  /** Blocks: end-grain cap gradient (centre → edge), ring band + line colours (rgba prefixes). */
  readonly ring: {
    readonly gradient: readonly [string, string, string];
    readonly band: string;
    readonly line: string;
    readonly check: string;
  };
  readonly side: { readonly base: string; readonly dark: string; readonly light: string };
  readonly table: { readonly base: string; readonly dark: string; readonly light: string };
  readonly board: { readonly base: string; readonly dark: string; readonly light: string };
}

export type ThemeId = 'maple' | 'walnut' | 'cherry' | 'birch' | 'driftwood' | 'ebony';

export const THEMES: readonly ThemeSpec[] = [
  {
    id: 'maple',
    ridge: 0x3e1c0f,
    unlock: null,
    background: '#3a2415',
    ring: {
      gradient: ['#f1d9a8', '#e9cc95', '#ddb980'],
      band: 'rgba(200,150,90,',
      line: 'rgba(150,92,42,',
      check: 'rgba(140,90,45,',
    },
    side: { base: '#e4c38d', dark: 'rgba(150,100,52,', light: 'rgba(250,228,186,' },
    table: { base: '#8e5330', dark: 'rgba(70,34,14,', light: 'rgba(196,128,76,' },
    board: { base: '#4f2416', dark: 'rgba(22,8,3,', light: 'rgba(132,64,38,' },
  },
  {
    id: 'walnut',
    ridge: 0x2a1c12,
    unlock: 'score-1k',
    background: '#2b2a24',
    ring: {
      gradient: ['#9a6a45', '#8a5b39', '#774c2e'],
      band: 'rgba(70,40,20,',
      line: 'rgba(48,26,12,',
      check: 'rgba(40,22,10,',
    },
    side: { base: '#86593a', dark: 'rgba(52,28,14,', light: 'rgba(170,120,82,' },
    table: { base: '#b8946a', dark: 'rgba(110,80,48,', light: 'rgba(230,200,160,' },
    board: { base: '#3a2a1e', dark: 'rgba(18,10,5,', light: 'rgba(110,80,56,' },
  },
  {
    id: 'cherry',
    ridge: 0x3a160c,
    unlock: 'combo-5',
    background: '#2e1a14',
    ring: {
      gradient: ['#e2a27a', '#d48e66', '#c27854'],
      band: 'rgba(170,90,52,',
      line: 'rgba(122,56,30,',
      check: 'rgba(110,52,28,',
    },
    side: { base: '#d08a62', dark: 'rgba(130,64,36,', light: 'rgba(245,190,152,' },
    table: { base: '#5e3a2a', dark: 'rgba(32,16,9,', light: 'rgba(140,90,64,' },
    board: { base: '#3a1a12', dark: 'rgba(16,5,2,', light: 'rgba(120,50,34,' },
  },
  {
    id: 'birch',
    ridge: 0x3a2c1c,
    unlock: 'games-10',
    background: '#3a2a18',
    ring: {
      gradient: ['#fbf1de', '#f3e4c8', '#e8d4b2'],
      band: 'rgba(214,186,140,',
      line: 'rgba(176,140,92,',
      check: 'rgba(160,128,84,',
    },
    side: { base: '#efdcb8', dark: 'rgba(176,146,100,', light: 'rgba(255,246,226,' },
    table: { base: '#b98d52', dark: 'rgba(110,74,34,', light: 'rgba(232,196,140,' },
    board: { base: '#4a3222', dark: 'rgba(20,12,6,', light: 'rgba(130,92,62,' },
  },
  {
    id: 'driftwood',
    ridge: 0x22282a,
    unlock: 'board-clear',
    background: '#1d2427',
    ring: {
      gradient: ['#d9dcd8', '#c6cac6', '#b1b6b2'],
      band: 'rgba(150,140,124,',
      line: 'rgba(108,100,88,',
      check: 'rgba(96,90,80,',
    },
    side: { base: '#bfc3bf', dark: 'rgba(92,98,96,', light: 'rgba(232,236,232,' },
    table: { base: '#4c5659', dark: 'rgba(24,30,32,', light: 'rgba(120,134,138,' },
    board: { base: '#262c2e', dark: 'rgba(8,10,11,', light: 'rgba(80,92,96,' },
  },
  {
    id: 'ebony',
    ridge: 0x4a3220,
    unlock: 'score-10k',
    background: '#1c1a19',
    ring: {
      gradient: ['#6b5a4e', '#594a40', '#47392f'],
      band: 'rgba(34,24,18,',
      line: 'rgba(18,12,8,',
      check: 'rgba(16,11,8,',
    },
    side: { base: '#55463b', dark: 'rgba(22,15,10,', light: 'rgba(120,100,86,' },
    table: { base: '#c9a77c', dark: 'rgba(120,88,52,', light: 'rgba(240,214,176,' },
    board: { base: '#a87d50', dark: 'rgba(96,64,36,', light: 'rgba(214,172,124,' },
  },
];

export const themeById = (id: string): ThemeSpec =>
  THEMES.find((t) => t.id === id) ?? (THEMES[0] as ThemeSpec);

export const TUTORIAL_KEY = 'grain_tutorial_v1';

// =====================================================================================
// Render / feel. 1 world unit = 1 cell. Board spans x,z ∈ [−4.5, 4.5]; row 0 is at −z.
// =====================================================================================

const BLOCK_DEPTH = 0.86;
const BLOCK_BEVEL_THICKNESS = 0.06;
const BLOCK_LIP = 0.04;

export const BLOCK = {
  depth: BLOCK_DEPTH,
  bevelThickness: BLOCK_BEVEL_THICKNESS,
  bevelSize: 0.05,
  bevelSegments: 3,
  curveSegments: 3,
  /** Gap to the cell edge, before the bevel. */
  gap: 0.045,
  cornerRadius: 0.1,
  /** Total block height incl. both bevels. */
  height: BLOCK_DEPTH + 2 * BLOCK_BEVEL_THICKNESS,
  /** End-grain UV scale per cell (ring texture repeats every 6.4 cells at seed scale 1). */
  uvPerCell: 1 / 6.4,
  roughnessTop: 0.66,
  roughnessSide: 0.62,
  /** Side subdivisions so the baked AO gradient has vertices to live on. */
  steps: 4,
  /** Baked ambient occlusion: brightness at the very bottom, and the height (units) where it fades out. */
  aoMin: 0.55,
  aoHeight: 0.5,
  /** Grain relief from the texture luminance (normal map strength). */
  normalScaleTop: 0.35,
  normalScaleSide: 0.25,
} as const;

/** Board origin and key heights. */
export const WORLD = {
  x0: -4.5,
  z0: -4.5,
  /** Board floor: deep enough that placed blocks sit flush with the table plus a tiny lip. */
  baseY: -BLOCK.height + BLOCK_LIP,
  /** Just above the block tops. */
  topY: -BLOCK.height + BLOCK_LIP + BLOCK.height + 0.012,
  ghostY: -BLOCK.height + BLOCK_LIP + 0.003,
  /** FX planes float a bit above the block tops. */
  fxLift: 0.06,
} as const;

export const TABLE = {
  halfSize: 40,
  cornerRadius: 1,
  hole: 9.8,
  holeRadius: 0.22,
  depth: 1.25,
  bevel: 0.05,
  bevelSegments: 3,
  curveSegments: 6,
  roughness: 0.72,
  /** Board texture spans this many units (9 cells + a dark margin). */
  boardTexSpan: 9.24,
  boardRoughness: 0.78,
  underSize: 10.1,
  underRoughness: 0.9,
  /** The dark margin plane sits just under the board floor (no z-fighting). */
  underDrop: 0.002,
  ridgeHeight: 0.26,
  ridgeWidth: 0.06,
  ridgeBoxWidth: 0.085,
  ridgeRoughness: 0.8,
} as const;

export interface LayoutSpec {
  readonly landscape: boolean;
  readonly slots: readonly (readonly [x: number, z: number])[];
  /** Pickup hit box half-size around each slot: [x, z]. */
  readonly hit: readonly [number, number];
  readonly bounds: { readonly x0: number; readonly x1: number; readonly z0: number; readonly z1: number };
  /** Deal animation starts this far to the +x side. */
  readonly dealFromX: number;
  /** Screen padding (px) under the HUD and above the bottom safe area. */
  readonly padTop: number;
  readonly padBottom: number;
}

export const LAYOUT: {
  readonly portrait: LayoutSpec;
  readonly landscape: LayoutSpec;
  readonly landscapeAspect: number;
} = {
  landscapeAspect: 1.15,
  portrait: {
    landscape: false,
    slots: [
      [-3.5, 7.3],
      [0, 7.3],
      [3.5, 7.3],
    ],
    hit: [1.75, 1.9],
    bounds: { x0: -5.05, x1: 5.05, z0: -4.95, z1: 8.9 },
    dealFromX: 13,
    padTop: 10,
    padBottom: 20,
  },
  landscape: {
    landscape: true,
    slots: [
      [7.7, -3.3],
      [7.7, 0],
      [7.7, 3.3],
    ],
    hit: [1.95, 1.62],
    bounds: { x0: -4.95, x1: 9.7, z0: -4.95, z1: 4.95 },
    dealFromX: 9,
    padTop: 6,
    padBottom: 14,
  },
};

export const CAMERA = {
  fov: 36,
  near: 0.1,
  far: 300,
  /** Camera looks down along −dir; dir = normalize(0, 1, 0.4) ≈ 22° tilt. */
  dir: [0, 1, 0.4] as const,
  /** Content bounds also include this height so tray pieces are not clipped. */
  boundsTopY: 0.4,
  /** Max |ndc.x| for content. */
  xLimit: 0.95,
  fitMin: 4,
  fitMax: 250,
  fitIterations: 40,
} as const;

export const RENDER = {
  maxPixelRatio: 2,
  minPixelRatio: 1,
  pixelRatioStep: 0.25,
  /** Lower the pixel ratio when the average frame time stays above this for `slowSeconds`. */
  slowFrameMs: 20,
  slowSeconds: 2,
  /** dt is clamped so a hitch never teleports anything. */
  maxDt: 0.05,
  exposure: 0.94,
  background: 0x3a2415,
} as const;

/**
 * Light intensities use physical units (three r155+). The r128 prototype used legacy lights;
 * its numbers × π are the starting point, retuned by screenshot.
 */
export const LIGHTS = {
  hemiSky: 0xfff2de,
  hemiGround: 0x3a2312,
  hemiIntensity: 1.3,
  keyColor: 0xfff0d6,
  keyIntensity: 3.8,
  /** Almost overhead so shadows fall under the blocks, never to the side. */
  keyPosition: [-3, 20, -2.4] as const,
  shadowMapSize: 2048,
  shadowFrustum: 12,
  shadowNear: 1,
  shadowFar: 60,
  shadowBias: -0.0005,
  shadowNormalBias: 0.02,
  /** PCF blur radius in shadow-map texels (soft edges, no dashing). */
  shadowRadius: 3,
  fillColor: 0xffdcb4,
  fillIntensity: 1.0,
  fillPosition: [7, 8, 11] as const,
} as const;

/** Procedural wood recipes: sizes, counts and baked board details. Wood colours come from `THEMES`. */
export const WOOD = {
  ring: {
    size: 1024,
    seed: 11,
    gradientRadius: 0.72,
    maxRadius: 0.76,
    ringStepMin: 7,
    ringStepMax: 21,
    bandWidthMin: 6,
    bandWidthMax: 14,
    lineWidthMin: 0.9,
    lineWidthMax: 2.9,
    checks: 26,
    noise: 13,
  },
  side: {
    size: 512,
    seed: 21,
    lines: 140,
    bands: 8,
    noise: 10,
    repeat: 0.4,
  },
  table: {
    size: 1024,
    seed: 33,
    lines: 170,
    bands: 18,
    noise: 7,
    repeat: 0.1,
  },
  board: {
    size: 1024,
    seed: 5,
    lines: 260,
    bands: 18,
    noise: 10,
    margin: 'rgba(12,4,1,.6)',
    boxLight: 'rgba(255,190,150,.07)',
    boxDark: 'rgba(0,0,0,.14)',
    cellHighlight: 'rgba(255,200,170,.10)',
    cellShadow: 'rgba(0,0,0,.28)',
    lines9: 'rgba(10,3,1,.92)',
  },
} as const;

/**
 * Colours used as material multipliers. Interpreted as *linear* values (like the r128 prototype)
 * so the look carries over.
 */
export const COLORS = {
  ridge: 0x3e1c0f,
  under: 0x1e0c05,
  chip: 0xf3dcae,
  ghost: 0xfff1d6,
  ghostGold: 0xffc45c,
  ghostEmissive: 0x2e1d08,
  glow: 0xffa323,
  sweep: 0xffc560,
  shock: 0xffd27a,
  shockBoard: 0xfff0c0,
  landing: 0xfff0d0,
  popEmissive: 0xffa83a,
  cellFlash: 0xffd27a,
  /** Game-over grey. */
  dim: [0.38, 0.35, 0.32] as const,
  /** Tray piece that fits nowhere. */
  noFit: 0.42,
  /** Per-channel tint ratios (warm the light maple; grey the no-fit pieces). */
  tintRatio: [1, 0.992, 0.975] as const,
  /** Per-block warmth: green/blue channels shift by up to these amounts (warmer ↔ cooler wood). */
  toneSpread: [0.022, 0.05] as const,
  noFitRatio: [1, 0.97, 0.93] as const,
  sparks: [
    [1, 0.86, 0.5],
    [1, 0.95, 0.75],
    [1, 0.72, 0.32],
    [1, 1, 0.92],
  ] as const,
} as const;

export const TRAY = {
  scale: 0.62,
  hoverLift: 0.22,
  hoverScale: 1.07,
  hoverRate: 14,
  dealDelay: 0.05,
  dealStagger: 0.08,
  dealDuration: 0.55,
  dealScaleSpeed: 1.15,
  dealSoundDelay: 0.06,
} as const;

export const DRAG = {
  /** Hover height of a dragged piece (world y). */
  lift: 0.7,
  /** On touch the landing point sits this many cells further away (piece floats above the finger). */
  touchOffsetZ: -1.8,
  followRateXZ: 30,
  followRateY: 15,
  scaleRate: 16,
  tiltPerSpeed: 0.028,
  tiltMax: 0.3,
  tiltRate: 12,
  hysteresis: 0.72,
  magnetRadius: 0.85,
  dropDuration: 0.2,
  /** xz finishes a bit before y lands. */
  dropXZSpeed: 1.25,
  returnDuration: 0.38,
  /** Opacity of a held piece, so the ghost under it is never completely hidden. */
  heldOpacity: 0.84,
  heldFadeRate: 14,
  /** Invalid drop over the board: a short decaying head-shake before flying home. */
  nopeDuration: 0.24,
  nopeAngle: 0.14,
  nopeShakes: 2,
} as const;

export const PREVIEW = {
  ghostOpacity: 0.42,
  ghostFadeIn: 16,
  ghostFadeOut: 24,
  ghostGlide: 26,
  ghostRoughness: 0.85,
  glowOpacity: 0.6,
  glowRate: 14,
  pulseBase: 0.8,
  pulseAmp: 0.2,
  pulseSpeed: 6.5,
  cellFlashOpacity: 0.75,
  cellFlashDuration: 0.6,
  overlaySize: 0.94,
  /** "Almost there" hints: honey glow on the floor of a unit's last empty cell. */
  hintColor: 0xf0b94a,
  hintOpacity: 0.5,
  hintPulse: 0.35,
  hintPulseSpeed: 2.2,
  hintRate: 6,
  /** Below this opacity an object is hidden (and a ghost jumps instead of gliding). */
  hiddenOpacity: 0.01,
  ghostJumpOpacity: 0.04,
} as const;

export const FX = {
  squashDuration: 0.36,
  squashAmount: 0.1,
  squashDecay: 6,
  squashFreq: 14,
  /** Settle wobble (radians) and its frequency, decaying with the squash. */
  settleAngle: 0.035,
  settleFreq: 18,
  placeShake: 0.06,
  shakeDecay: 14,
  landingDuration: 0.45,
  landingOpacity: 0.55,
  landingY: 0.22,
  popDelayPerUnit: 0.03,
  popDuration: 0.55,
  popRise: 0.95,
  popRiseSpeed: 1.6,
  popPeak: 1.16,
  popPeakAt: 0.28,
  popSpin: 1.4,
  popEmissive: 0.55,
  chipsPerCell: 4,
  chipSize: [0.11, 0.05, 0.17] as const,
  chipGravity: 16,
  chipBounce: 0.32,
  chipFriction: 0.55,
  chipLifeMin: 0.8,
  chipLifeRand: 0.5,
  chipFade: 0.25,
  chipPool: 160,
  chipFloorY: 0.03,
  chipRoughness: 0.7,
  chipSpawnSpread: 0.6,
  chipSpawnLift: 0.55,
  chipSpeedMin: 1.4,
  chipSpeedRand: 2.6,
  chipUpMin: 3,
  chipUpRand: 3.2,
  chipSpinMax: 16,
  chipSpinBounce: 0.5,
  sweepStagger: 0.06,
  sweepDuration: 0.7,
  sweepPeakAt: 0.18,
  sweepOpacity: 0.95,
  sweepGrow: 0.5,
  sweepSize: [9.4, 1.5] as const,
  sweepBoxSize: 3.8,
  sweepHeadSpeed: 2.2,
  sweepSparksPerCell: 6,
  sweepSparksPerBoxCell: 5,
  sweepSparkSpeed: 2.2,
  sweepSparkUp: 3.2,
  sweepSparkSpread: 0.7,
  shockBase: 4,
  shockPerUnit: 2.5,
  shockDuration: 0.7,
  shockPeak: 0.7,
  shockPeakPerUnit: 0.1,
  shockStartScale: 0.4,
  shockDrop: 0.02,
  landingPad: 0.8,
  landingScaleFrom: 0.85,
  landingScaleGrow: 0.45,
  punchBase: 0.022,
  punchPerLevel: 0.012,
  punchMaxLevel: 5,
  punchDuration: 0.5,
  punchInAt: 0.14,
  clearShakeBase: 0.1,
  clearShakePerUnit: 0.04,
  clearShakeMaxUnits: 4,
  flashMinUnits: 2,
  flashMinStreak: 3,
  boardClearRing: 14,
  boardClearBursts: 9,
  boardClearBurstGap: 0.05,
  boardClearSparks: 14,
  boardClearSparkSpeed: 3,
  boardClearSparkUp: 4.5,
  boardClearSparkSpread: 1,
  boardClearRingPeak: 0.9,
  boardClearRingDuration: 1,
  /** Vertical shake is this fraction of horizontal. */
  shakeVertical: 0.5,
  overRowDelay: 0.05,
  overFadeDuration: 0.4,
  overCardDelay: 0.9,
  floatLift: 0.3,
  floatLiftClear: 0.4,
  /** Seconds after the move before the new-best crown flies (lets the clear land first). */
  newBestDelay: 0.45,
  /** Seconds after the results card before the (native) review prompt. */
  reviewDelay: 1.6,
  /** Space (px) between the HUD and the achievement banner. */
  bannerGap: 8,
  /** World point the toast is anchored to. */
  toastAnchor: [0, 0.5, -0.6] as const,
} as const;

export const SPARKS = {
  count: 700,
  size: 0.34,
  drag: 2.2,
  gravity: 5.5,
  lifeMin: 0.45,
  lifeRand: 0.55,
  twinkle: 40,
  twinkleDepth: 0.25,
  speedMin: 0.35,
  speedRand: 0.8,
  upMin: 0.5,
  upRand: 0.8,
} as const;

export const SCORE_UI = {
  countRate: 10,
  overCountBase: 0.4,
  overCountPerPoint: 1 / 600,
  overCountMax: 1.2,
} as const;

export const AUDIO = {
  master: 0.9,
  musicVolume: 0.16,
  scale: [0, 2, 4, 7, 9, 12, 14, 16, 19, 21] as const,
  clearBase: 330,
  clearStreakSemis: 2,
  clearStreakCap: 7,
  clearNoteGap: 0.055,
  noiseSeconds: 0.5,
  /** ±fraction of pitch and volume on percussive sounds. */
  variation: 0.05,
  limiterThreshold: -6,
  limiterKnee: 6,
  limiterRatio: 12,
  limiterAttack: 0.003,
  limiterRelease: 0.2,
} as const;

export const HAPTICS = {
  pickup: 8,
  newBest: [10, 50, 10, 50, 30] as const,
  nope: [6, 30, 6] as const,
  place: 14,
  clear: [12, 40, 12] as const,
  boardClear: [20, 40, 20, 40, 40] as const,
} as const;

export const TUTORIAL = {
  /** Pause after a tutorial clear before the next step loads. */
  advanceDelay: 1.15,
  handLoop: 2.2,
  handPressEnd: 0.18,
  handMoveEnd: 0.72,
  handHoldEnd: 0.86,
  handPress: 0.12,
  /** Must match the CSS rule that moves the tip beside the board (`ui/styles.css`). */
  sideTipQuery: '(max-height: 500px) and (orientation: landscape)',
  /** Space (px) between a side tip and the board. */
  tipGap: 8,
} as const;

export const RETENTION = {
  metaKey: 'grain_meta_v1',
  /** Coming back after at least this long away counts as a new session. */
  sessionGapMs: 30 * 60 * 1000,
  hoursKept: 14,
  reviewMinSessions: 3,
  reviewMinGames: 5,
  reviewMaxAsks: 3,
  reviewGapDays: 60,
  reminderAfterSessions: 3,
  reminderDefaultHour: 19,
  /** Number of reminder texts (`reminder.<i>.title/body` in i18n). */
  reminderLines: 3,
} as const;

/** Game Center ids (must match App Store Connect). */
export const GAME_CENTER = {
  leaderboard: 'grain.best',
  achievementPrefix: 'grain.',
} as const;

/** Feedback scaling by reward tier 1–5 (see `rewardTier`). Index 0 = tier 1. */
export const LADDER = {
  sparkScale: [1, 1.3, 1.7, 2.2, 2.6] as const,
  /** Hit-stop: a tiny freeze of the animation clock right at the clear. */
  hitStop: [0.03, 0.04, 0.05, 0.06, 0.07] as const,
  /** Screen flash from this tier up. */
  flashFrom: 2,
  /** Extra low chord under the marimba from this tier up. */
  chordFrom: 3,
  haptics: [
    [12, 40, 12],
    [14, 40, 14],
    [16, 30, 16, 30, 16],
    [20, 30, 20, 30, 30],
    [20, 40, 20, 40, 40],
  ] as const,
} as const;

export const COMBO_GLOW = {
  textureSize: 512,
  /** World size of the glow plane (centred on the board). */
  size: 12.4,
  spread: 1.1,
  rings: 24,
  y: 0.006,
  base: 0.35,
  perStreak: 0.13,
  maxStreak: 6,
  riskFactor: 0.45,
  reducedFactor: 0.6,
  pulse: 0.18,
  pulseSpeed: 3.2,
  rate: 4,
} as const;

export const HUD_FX = {
  /** New-best crown flight (ms). */
  crownMs: 900,
} as const;

/** Native (Capacitor) glue. */
export const NATIVE = {
  /** Set once localStorage has been copied into Preferences. */
  migratedKey: 'grain_native_migrated_v1',
  /** Vibration pulses up to these lengths (ms) map to light / medium Taptic impacts; longer = heavy. */
  hapticLightMs: 10,
  hapticMediumMs: 16,
  splashFadeMs: 250,
} as const;

/**
 * Monetization. Ad unit / app ids below are Google's public TEST ids — replace with your own
 * before release (see STORE.md). RevenueCat key comes from your RevenueCat project.
 */
export const ADS = {
  /** Interstitials only between games, and never before these thresholds. */
  firstAdSession: 3,
  firstAdGames: 4,
  everyGames: 3,
  minGapMs: 4 * 60 * 1000,
  /** Consent + ATT + AdMob start from this session on (never on first launch). */
  initFromSession: 2,
  maxRevives: 1,
  /** Set false once the real ids are in. */
  testMode: true,
  iosAppId: 'ca-app-pub-3940256099942544~1458002511',
  rewardedId: 'ca-app-pub-3940256099942544/1712485313',
  interstitialId: 'ca-app-pub-3940256099942544/4411468910',
} as const;

export const PURCHASES = {
  /** RevenueCat public iOS SDK key (appl_…). Empty = purchases unavailable. */
  revenueCatKey: '',
  entitlement: 'no_ads',
  productId: 'grain_remove_ads',
  /** Cached ownership, so Remove ads works offline. */
  cacheKey: 'grain_no_ads_v1',
} as const;
