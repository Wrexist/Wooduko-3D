import * as THREE from 'three';
import { BOARD, TABLE, WOOD } from '../config';
import type { ThemeSpec } from '../config';
import { createRng, nextFloat } from '../core/generator';

const TAU = Math.PI * 2;

type Ctx = CanvasRenderingContext2D;
type R = () => number;

function seeded(seed: number): R {
  const rng = createRng(seed);
  return () => nextFloat(rng);
}

function canvas(w: number, h: number, reuse?: HTMLCanvasElement): { cv: HTMLCanvasElement; g: Ctx } {
  const cv = reuse ?? document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const g = cv.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  return { cv, g };
}

function speckle(g: Ctx, w: number, h: number, R: R, amt: number): void {
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (R() - 0.5) * amt;
    d[i] = (d[i] ?? 0) + n;
    d[i + 1] = (d[i + 1] ?? 0) + n;
    d[i + 2] = (d[i + 2] ?? 0) + n * 0.8;
  }
  g.putImageData(img, 0, 0);
}

interface GrainRecipe {
  readonly seed: number;
  readonly base: string;
  readonly dark: string;
  readonly light: string;
  readonly lines: number;
  readonly bands: number;
  readonly noise: number;
}

/**
 * Long-grain streaks. Tileable in both directions: every sine uses an integer number of periods
 * over the width, and lines near the top/bottom edge are redrawn shifted by ±height.
 */
function drawGrain(g: Ctx, w: number, h: number, o: GrainRecipe): void {
  const R = seeded(o.seed);
  g.fillStyle = o.base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < o.bands; i++) {
    g.strokeStyle = `${R() < 0.5 ? o.dark : o.light}${0.04 + R() * 0.06})`;
    g.lineWidth = 20 + R() * 60;
    const y0 = R() * h;
    const a = 10 + R() * 30;
    const f = (TAU * (1 + Math.floor(R() * 2))) / w;
    const p = R() * 6;
    for (const oy of [-h, 0, h]) {
      g.beginPath();
      for (let x = 0; x <= w; x += 16) {
        const y = oy + y0 + Math.sin(x * f + p) * a;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  for (let i = 0; i < o.lines; i++) {
    const dark = R() < 0.72;
    g.strokeStyle = `${dark ? o.dark : o.light}${dark ? 0.1 + R() * 0.32 : 0.08 + R() * 0.18})`;
    g.lineWidth = 0.6 + R() * (R() < 0.15 ? 4 : 1.8);
    const y0 = R() * h;
    const a1 = 2 + R() * 9;
    const f1 = (TAU * (1 + Math.floor(R() * 4))) / w;
    const p1 = R() * 6;
    const a2 = R() * 1.5;
    const f2 = (TAU * (3 + Math.floor(R() * 5))) / w;
    for (const oy of [-h, 0, h]) {
      if (y0 + oy < -20 || y0 + oy > h + 20) continue;
      g.beginPath();
      for (let x = 0; x <= w; x += 8) {
        const y = oy + y0 + Math.sin(x * f1 + p1) * a1 + Math.sin(x * f2 + p1 * 2) * a2;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  speckle(g, w, h, R, o.noise);
}

function toTexture(cv: HTMLCanvasElement, anisotropy: number, wrap?: THREE.Wrapping): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (wrap !== undefined) t.wrapS = t.wrapT = wrap;
  return t;
}

/** End grain: cream radial base, ~60 wobbly concentric rings, radial checks, fine noise. */
function ringCanvas(theme: ThemeSpec, reuse?: HTMLCanvasElement): HTMLCanvasElement {
  const o = { ...WOOD.ring, ...theme.ring };
  const N = o.size;
  const { cv, g } = canvas(N, N, reuse);
  const R = seeded(o.seed);
  const grd = g.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N * o.gradientRadius);
  grd.addColorStop(0, o.gradient[0]);
  grd.addColorStop(0.6, o.gradient[1]);
  grd.addColorStop(1, o.gradient[2]);
  g.fillStyle = grd;
  g.fillRect(0, 0, N, N);
  const p = [R() * TAU, R() * TAU, R() * TAU, R() * TAU] as const;
  let r = 3;
  const ring = (width: number, col: string, k: number): void => {
    g.strokeStyle = col;
    g.lineWidth = width;
    g.beginPath();
    for (let i = 0; i <= 180; i++) {
      const a = (i / 180) * TAU;
      const rr =
        r +
        k *
          (Math.sin(3 * a + p[0]) * 0.9 +
            Math.sin(5 * a + p[1]) * 0.45 +
            Math.sin(2 * a + p[2]) * 0.8 +
            Math.sin(8 * a + p[3] + r * 0.013) * 0.22);
      const x = N / 2 + Math.cos(a) * rr;
      const y = N / 2 + Math.sin(a) * rr;
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    }
    g.closePath();
    g.stroke();
  };
  while (r < N * o.maxRadius) {
    const k = 1.2 + r * 0.03;
    ring(o.bandWidthMin + R() * (o.bandWidthMax - o.bandWidthMin), `${o.band}${0.05 + R() * 0.06})`, k);
    ring(o.lineWidthMin + R() * (o.lineWidthMax - o.lineWidthMin), `${o.line}${0.26 + R() * 0.26})`, k);
    r += o.ringStepMin + R() * (o.ringStepMax - o.ringStepMin);
  }
  for (let i = 0; i < o.checks; i++) {
    const a = R() * TAU;
    const r0 = 40 + R() * 300;
    const l = 20 + R() * 90;
    g.strokeStyle = `${o.check}${0.05 + R() * 0.08})`;
    g.lineWidth = 0.8;
    g.beginPath();
    g.moveTo(N / 2 + Math.cos(a) * r0, N / 2 + Math.sin(a) * r0);
    g.lineTo(N / 2 + Math.cos(a) * (r0 + l), N / 2 + Math.sin(a) * (r0 + l));
    g.stroke();
  }
  speckle(g, N, N, R, o.noise);
  return cv;
}

function grainCanvas(size: number, o: GrainRecipe, reuse?: HTMLCanvasElement): HTMLCanvasElement {
  const { cv, g } = canvas(size, size, reuse);
  drawGrain(g, size, size, o);
  return cv;
}

/** Dark wenge board floor with 3×3 box tints, carved cell edges and grid lines baked in. */
function boardCanvas(theme: ThemeSpec, reuse?: HTMLCanvasElement): HTMLCanvasElement {
  const o = { ...WOOD.board, ...theme.board };
  const N = o.size;
  const n = BOARD.size;
  const b = BOARD.box;
  const ppu = N / TABLE.boardTexSpan;
  const m = ((TABLE.boardTexSpan - n) / 2) * ppu;
  const cv = grainCanvas(N, o, reuse);
  const g = cv.getContext('2d');
  if (!g) throw new Error('2D canvas unavailable');
  g.fillStyle = o.margin;
  g.fillRect(0, 0, N, m);
  g.fillRect(0, N - m, N, m);
  g.fillRect(0, 0, m, N);
  g.fillRect(N - m, 0, m, N);
  for (let br = 0; br < n / b; br++) {
    for (let bc = 0; bc < n / b; bc++) {
      g.fillStyle = (br + bc) % 2 ? o.boxLight : o.boxDark;
      g.fillRect(m + bc * b * ppu, m + br * b * ppu, b * ppu, b * ppu);
    }
  }
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const x = m + c * ppu;
      const y = m + r * ppu;
      g.fillStyle = o.cellHighlight;
      g.fillRect(x + 3, y + 3, ppu - 6, 3);
      g.fillRect(x + 3, y + 3, 3, ppu - 6);
      g.fillStyle = o.cellShadow;
      g.fillRect(x + 3, y + ppu - 6, ppu - 6, 3);
      g.fillRect(x + ppu - 6, y + 3, 3, ppu - 6);
    }
  }
  g.strokeStyle = o.lines9;
  for (let i = 0; i <= n; i++) {
    g.lineWidth = i % b === 0 ? 7 : 4;
    const v = m + i * ppu;
    g.beginPath();
    g.moveTo(v, m - 2);
    g.lineTo(v, N - m + 2);
    g.stroke();
    g.beginPath();
    g.moveTo(m - 2, v);
    g.lineTo(N - m + 2, v);
    g.stroke();
  }
  return cv;
}

function gradCanvas(w: number, h: number, draw: (g: Ctx, w: number, h: number) => void): HTMLCanvasElement {
  const { cv, g } = canvas(w, h);
  draw(g, w, h);
  return cv;
}

function roundRectPath(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.lineTo(x + w - r, y);
  g.quadraticCurveTo(x + w, y, x + w, y + r);
  g.lineTo(x + w, y + h - r);
  g.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  g.lineTo(x + r, y + h);
  g.quadraticCurveTo(x, y + h, x, y + h - r);
  g.lineTo(x, y + r);
  g.quadraticCurveTo(x, y, x + r, y);
}

export interface Textures {
  readonly ring: THREE.Texture;
  readonly side: THREE.Texture;
  readonly table: THREE.Texture;
  readonly board: THREE.Texture;
  readonly overlay: THREE.Texture;
  readonly spark: THREE.Texture;
  readonly bar: THREE.Texture;
  readonly halo: THREE.Texture;
  readonly boxGlow: THREE.Texture;
  /** Redraw the wood textures for another theme, in place (same textures, same materials). */
  setTheme(theme: ThemeSpec): void;
  dispose(): void;
}

const sideRecipe = (t: ThemeSpec): GrainRecipe => ({ ...WOOD.side, ...t.side });
const tableRecipe = (t: ThemeSpec): GrainRecipe => ({ ...WOOD.table, ...t.table });

export function createTextures(maxAnisotropy: number, theme: ThemeSpec): Textures {
  const ring = toTexture(ringCanvas(theme), maxAnisotropy, THREE.MirroredRepeatWrapping);
  const side = toTexture(grainCanvas(WOOD.side.size, sideRecipe(theme)), maxAnisotropy, THREE.RepeatWrapping);
  side.repeat.set(WOOD.side.repeat, WOOD.side.repeat);
  const table = toTexture(
    grainCanvas(WOOD.table.size, tableRecipe(theme)),
    maxAnisotropy,
    THREE.RepeatWrapping,
  );
  table.repeat.set(WOOD.table.repeat, WOOD.table.repeat);
  const board = toTexture(boardCanvas(theme), maxAnisotropy);

  const overlay = toTexture(
    gradCanvas(128, 128, (g) => {
      g.fillStyle = '#fff';
      roundRectPath(g, 6, 6, 116, 116, 22);
      g.fill();
    }),
    1,
  );
  const spark = toTexture(
    gradCanvas(64, 64, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.25, 'rgba(255,240,200,.85)');
      gr.addColorStop(1, 'rgba(255,200,120,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, w);
    }),
    1,
  );
  const bar = toTexture(
    gradCanvas(16, 128, (g, w, h) => {
      const gr = g.createLinearGradient(0, 0, 0, h);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.5, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }),
    1,
  );
  const halo = toTexture(
    gradCanvas(256, 256, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, w * 0.3, w / 2, w / 2, w / 2);
      gr.addColorStop(0, 'rgba(255,255,255,0)');
      gr.addColorStop(0.72, 'rgba(255,255,255,.9)');
      gr.addColorStop(0.82, 'rgba(255,255,255,.35)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, w);
    }),
    1,
  );
  const boxGlow = toTexture(
    gradCanvas(128, 128, (g, w) => {
      const gr = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w * 0.72);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, w);
    }),
    1,
  );

  const all = [ring, side, table, board, overlay, spark, bar, halo, boxGlow];
  return {
    ring,
    side,
    table,
    board,
    overlay,
    spark,
    bar,
    halo,
    boxGlow,
    setTheme: (t) => {
      const cv = (x: THREE.Texture): HTMLCanvasElement => x.image as HTMLCanvasElement;
      ringCanvas(t, cv(ring));
      grainCanvas(WOOD.side.size, sideRecipe(t), cv(side));
      grainCanvas(WOOD.table.size, tableRecipe(t), cv(table));
      boardCanvas(t, cv(board));
      for (const x of [ring, side, table, board]) x.needsUpdate = true;
    },
    dispose: () => all.forEach((t) => t.dispose()),
  };
}
