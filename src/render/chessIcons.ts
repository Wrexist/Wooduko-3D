import * as THREE from 'three';
import { CHESS } from '../config';

/**
 * Flat piece silhouettes for the view from above (where turned pieces all look like round tops),
 * drawn in our own shapes: maple with a dark outline for White, walnut with light detail for Black.
 * Shapes live in a 100 × 100 box, base at the bottom, the knight facing left.
 */

/** A shape filled with wood and outlined. */
interface Part {
  readonly path: Path2D;
  /** Detail in the contrast colour: a line inside the piece, or a dot (the knight's eye). */
  readonly detail?: 'line' | 'dot';
}

const p = (d: string): Path2D => new Path2D(d);
const circle = (x: number, y: number, r: number): string =>
  `M ${x + r} ${y} A ${r} ${r} 0 1 0 ${x - r} ${y} A ${r} ${r} 0 1 0 ${x + r} ${y} Z`;
/** A rounded slab from x0 to x1, y0 to y1. */
const slab = (x0: number, y0: number, x1: number, y1: number, r = 3): string =>
  `M ${x0 + r} ${y0} L ${x1 - r} ${y0} Q ${x1} ${y0} ${x1} ${y0 + r} L ${x1} ${y1 - r} Q ${x1} ${y1} ${x1 - r} ${y1} ` +
  `L ${x0 + r} ${y1} Q ${x0} ${y1} ${x0} ${y1 - r} L ${x0} ${y0 + r} Q ${x0} ${y0} ${x0 + r} ${y0} Z`;
/** A flat collar (an ellipse) centred at x 50. */
const collar = (y: number, w: number, h: number): string =>
  `M ${50 - w / 2} ${y} A ${w / 2} ${h / 2} 0 1 0 ${50 + w / 2} ${y} A ${w / 2} ${h / 2} 0 1 0 ${50 - w / 2} ${y} Z`;

const BASE = slab(22, 80, 78, 91, 4);

/** Parts from the back (drawn first) to the front. Types: 1 pawn … 6 king. */
const SHAPES: Record<number, () => Part[]> = {
  1: () => [
    { path: p(BASE) },
    { path: p('M 40 50 C 40 62 34 70 30 81 L 70 81 C 66 70 60 62 60 50 Z') },
    { path: p(collar(50, 32, 9)) },
    { path: p(circle(50, 31, 14)) },
  ],
  2: () => [
    { path: p(BASE) },
    {
      path: p(
        'M 30 81 C 28 70 34 62 42 55 C 36 58 28 60 22 58 C 15 56 13 49 17 44 ' +
          'C 24 35 28 26 36 19 L 39 8 L 47 16 C 66 16 80 32 79 55 C 78 66 74 74 73 81 Z',
      ),
    },
    { path: p('M 49 21 C 63 24 72 37 72 55 C 72 66 69 73 68 79'), detail: 'line' },
    { path: p(circle(37, 31, 3.2)), detail: 'dot' },
    { path: p(circle(21.5, 50, 2)), detail: 'dot' },
  ],
  3: () => [
    { path: p(BASE) },
    { path: p('M 42 60 C 42 68 36 74 32 81 L 68 81 C 64 74 58 68 58 60 Z') },
    { path: p(collar(60, 34, 9)) },
    { path: p('M 50 17 C 62 24 68 36 64 48 C 62 54 56 57 50 57 C 44 57 38 54 36 48 C 32 36 38 24 50 17 Z') },
    { path: p(circle(50, 12, 5.5)) },
    { path: p('M 56 28 L 45 41'), detail: 'line' },
  ],
  4: () => [
    { path: p(BASE) },
    { path: p(slab(28, 72, 72, 81, 2)) },
    { path: p('M 35 36 L 65 36 L 67 72 L 33 72 Z') },
    { path: p(slab(29, 29, 71, 38, 2)) },
    {
      path: p(
        'M 27 31 L 27 14 L 37 14 L 37 21 L 45 21 L 45 14 L 55 14 L 55 21 L 63 21 L 63 14 L 73 14 L 73 31 Z',
      ),
    },
    { path: p('M 34 50 L 66 50'), detail: 'line' },
  ],
  5: () => [
    { path: p(BASE) },
    { path: p('M 31 69 L 69 69 L 74 81 L 26 81 Z') },
    {
      path: p(
        'M 29 69 L 18 31 L 33 50 L 35 24 L 44 48 L 50 19 L 56 48 L 65 24 L 67 50 L 82 31 L 71 69 Z',
      ),
    },
    { path: p(collar(69, 44, 8)) },
    ...[
      [18, 29],
      [35, 21],
      [50, 15],
      [65, 21],
      [82, 29],
    ].map(([x, y]) => ({ path: p(circle(x ?? 0, y ?? 0, 5)) })),
  ],
  6: () => [
    { path: p(BASE) },
    { path: p('M 31 69 L 69 69 L 74 81 L 26 81 Z') },
    { path: p('M 46 26 L 54 26 L 54 46 L 46 46 Z') },
    {
      path: p(
        'M 29 69 C 14 54 22 33 38 38 C 44 40 48 44 50 48 C 52 44 56 40 62 38 C 78 33 86 54 71 69 Z',
      ),
    },
    { path: p(collar(69, 44, 8)) },
    { path: p('M 46 6 L 54 6 L 54 13 L 61 13 L 61 21 L 54 21 L 54 30 L 46 30 L 46 21 L 39 21 L 39 13 L 46 13 Z') },
    { path: p('M 50 49 L 50 62'), detail: 'line' },
  ],
};

/** Draw one piece into a square canvas area (x, y, size in px). */
function drawPiece(g: CanvasRenderingContext2D, type: number, white: boolean, x: number, y: number, size: number): void {
  const parts = SHAPES[type]?.() ?? [];
  const k = size / 100;
  g.save();
  g.translate(x, y);
  g.scale(k, k);
  g.lineJoin = 'round';
  g.lineCap = 'round';
  const wood = g.createLinearGradient(20, 10, 80, 90);
  const [w0, w1, w2] = white ? CHESS.iconWhite : CHESS.iconBlack;
  wood.addColorStop(0, w0);
  wood.addColorStop(0.55, w1);
  wood.addColorStop(1, w2);
  const outline = white ? CHESS.iconWhiteLine : CHESS.iconBlackLine;
  const detail = white ? CHESS.iconWhiteLine : CHESS.iconBlackDetail;
  // one soft shadow under a thick outline round the whole piece, then the parts on top
  g.save();
  g.shadowColor = 'rgba(30, 12, 0, 0.5)';
  g.shadowBlur = 7;
  g.shadowOffsetY = 3;
  g.fillStyle = g.strokeStyle = outline;
  g.lineWidth = 7;
  for (const part of parts)
    if (!part.detail) {
      g.fill(part.path);
      g.stroke(part.path);
    }
  g.restore();
  // lines between the parts: dark on maple; a lighter brown on walnut, or they'd vanish
  const seam = white ? outline : CHESS.iconBlackSeam;
  for (const part of parts) {
    if (part.detail === 'dot') {
      g.fillStyle = detail;
      g.fill(part.path);
      continue;
    }
    if (part.detail) {
      g.strokeStyle = detail;
      g.lineWidth = 3.4;
      g.stroke(part.path);
      continue;
    }
    g.fillStyle = wood;
    g.fill(part.path);
    g.strokeStyle = seam;
    g.lineWidth = white ? 3.4 : 2.6;
    g.stroke(part.path);
  }
  g.restore();
}

const ATLAS_CELL = 256;

/**
 * One texture with every piece: 6 columns (pawn … king), White on the top row, Black below.
 * `iconUv` picks a cell.
 */
export function iconAtlas(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = ATLAS_CELL * 6;
  c.height = ATLAS_CELL * 2;
  const g = c.getContext('2d');
  if (g)
    for (let type = 1; type <= 6; type++)
      for (const white of [true, false]) {
        const pad = ATLAS_CELL * 0.04;
        drawPiece(g, type, white, (type - 1) * ATLAS_CELL + pad, (white ? 0 : 1) * ATLAS_CELL + pad, ATLAS_CELL - pad * 2);
      }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** A flat square lying on the board, its UVs on one cell of the atlas. */
export function iconGeometry(type: number, white: boolean): THREE.PlaneGeometry {
  const s = CHESS.iconSize;
  const geo = new THREE.PlaneGeometry(s, s).rotateX(-Math.PI / 2);
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const u0 = (type - 1) / 6;
  const v0 = white ? 0.5 : 0;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, u0 + uv.getX(i) / 6, v0 + uv.getY(i) / 2);
  uv.needsUpdate = true;
  return geo;
}

