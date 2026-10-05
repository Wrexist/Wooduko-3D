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

/** Procedural wood recipes. Colours are CSS strings; `dark`/`light` are rgba prefixes. */
export const WOOD = {
  ring: {
    size: 1024,
    seed: 11,
    gradient: ['#f1d9a8', '#e9cc95', '#ddb980'] as const,
    gradientRadius: 0.72,
    maxRadius: 0.76,
    ringStepMin: 7,
    ringStepMax: 21,
    bandWidthMin: 6,
    bandWidthMax: 14,
    lineWidthMin: 0.9,
    lineWidthMax: 2.9,
    band: 'rgba(200,150,90,',
    line: 'rgba(150,92,42,',
    checks: 26,
    check: 'rgba(140,90,45,',
    noise: 13,
  },
  side: {
    size: 512,
    seed: 21,
    base: '#e4c38d',
    dark: 'rgba(150,100,52,',
    light: 'rgba(250,228,186,',
    lines: 140,
    bands: 8,
    noise: 10,
    repeat: 0.4,
  },
  table: {
    size: 1024,
    seed: 33,
    base: '#8e5330',
    dark: 'rgba(70,34,14,',
    light: 'rgba(196,128,76,',
    lines: 170,
    bands: 18,
    noise: 7,
    repeat: 0.1,
  },
  board: {
    size: 1024,
    seed: 5,
    base: '#4f2416',
    dark: 'rgba(22,8,3,',
    light: 'rgba(132,64,38,',
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
} as const;

export const FX = {
  squashDuration: 0.36,
  squashAmount: 0.1,
  squashDecay: 6,
  squashFreq: 14,
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
  shockBase: 4,
  shockPerUnit: 2.5,
  shockDuration: 0.7,
  shockPeak: 0.7,
  shockPeakPerUnit: 0.1,
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
  overRowDelay: 0.05,
  overFadeDuration: 0.4,
  overCardDelay: 0.9,
  floatLift: 0.3,
  floatLiftClear: 0.4,
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

/** Toast words by tier. */
export const WORDS = {
  nice: 'Nice!',
  combo: 'Combo!',
  fire: 'On fire!',
  great: 'Great!',
  excellent: 'Excellent!',
  unreal: 'Unreal!',
  boardClear: 'Board clear!',
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
} as const;

export const HAPTICS = {
  pickup: 8,
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
} as const;
