import * as THREE from 'three';
import { BLOCK } from '../config';
import type { Cell, UvCenter, WoodSeed } from '../core/types';

type Pt = readonly [x: number, y: number];

/**
 * Trace the outline of a polyomino. Every cell adds its 4 CCW edges; shared edges cancel against
 * their opposite; the rest chain into closed loops. Collinear points are dropped.
 * Coordinates are (x = col, y = row) in cell units.
 */
export function outlineLoops(cells: readonly Cell[]): Pt[][] {
  const edges = new Map<string, readonly [number, number, number, number]>();
  const add = (x1: number, y1: number, x2: number, y2: number): void => {
    const reverse = `${x2},${y2}>${x1},${y1}`;
    if (edges.has(reverse)) edges.delete(reverse);
    else edges.set(`${x1},${y1}>${x2},${y2}`, [x1, y1, x2, y2]);
  };
  for (const [r, c] of cells) {
    add(c, r, c + 1, r);
    add(c + 1, r, c + 1, r + 1);
    add(c + 1, r + 1, c, r + 1);
    add(c, r + 1, c, r);
  }
  const byStart = new Map<string, readonly [number, number, number, number]>();
  for (const e of edges.values()) byStart.set(`${e[0]},${e[1]}`, e);
  const used = new Set<string>();
  const loops: Pt[][] = [];
  const guardMax = edges.size + 1;
  for (const [k, e0] of byStart) {
    if (used.has(k)) continue;
    const pts: Pt[] = [];
    let e: readonly [number, number, number, number] | undefined = e0;
    for (let guard = 0; e && !used.has(`${e[0]},${e[1]}`) && guard < guardMax; guard++) {
      used.add(`${e[0]},${e[1]}`);
      pts.push([e[0], e[1]]);
      e = byStart.get(`${e[2]},${e[3]}`);
    }
    const out: Pt[] = [];
    const n = pts.length;
    for (let i = 0; i < n; i++) {
      const p = pts[(i - 1 + n) % n] as Pt;
      const q = pts[i] as Pt;
      const nx = pts[(i + 1) % n] as Pt;
      const cross = (q[0] - p[0]) * (nx[1] - q[1]) - (q[1] - p[1]) * (nx[0] - q[0]);
      if (cross !== 0) out.push(q);
    }
    if (out.length >= 4) loops.push(out);
  }
  return loops;
}

/** Move every vertex inward by `g` along the inward normals of both adjacent edges. */
export function insetLoop(pts: readonly Pt[], g: number): Pt[] {
  const n = pts.length;
  return pts.map((q, i): Pt => {
    const p = pts[(i - 1 + n) % n] as Pt;
    const nx = pts[(i + 1) % n] as Pt;
    const l1 = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const l2 = Math.hypot(nx[0] - q[0], nx[1] - q[1]);
    const d1x = (q[0] - p[0]) / l1;
    const d1y = (q[1] - p[1]) / l1;
    const d2x = (nx[0] - q[0]) / l2;
    const d2y = (nx[1] - q[1]) / l2;
    return [q[0] + (-d1y - d2y) * g, q[1] + (d1x + d2x) * g];
  });
}

/** Closed shape with every corner rounded by a quadratic curve of radius `r`. */
function loopToShape(pts: readonly Pt[], r: number): THREE.Shape {
  const s = new THREE.Shape();
  const n = pts.length;
  pts.forEach((q, i) => {
    const p = pts[(i - 1 + n) % n] as Pt;
    const nx = pts[(i + 1) % n] as Pt;
    const lp = Math.hypot(p[0] - q[0], p[1] - q[1]);
    const ln = Math.hypot(nx[0] - q[0], nx[1] - q[1]);
    const ax = q[0] + ((p[0] - q[0]) / lp) * r;
    const ay = q[1] + ((p[1] - q[1]) / lp) * r;
    const bx = q[0] + ((nx[0] - q[0]) / ln) * r;
    const by = q[1] + ((nx[1] - q[1]) / ln) * r;
    if (i === 0) s.moveTo(ax, ay);
    else s.lineTo(ax, ay);
    s.quadraticCurveTo(q[0], q[1], bx, by);
  });
  s.closePath();
  return s;
}

/** Material index of the end-grain caps in ExtrudeGeometry. */
export const CAP_MATERIAL = 0;

/**
 * One carved block for a set of cells. Local space: x = col, z = row (cell units, origin at the
 * board's top-left corner), bottom at y = 0. Cap UVs are remapped around the block's UV centre
 * with its wood seed, so every block shows its own ring centre and splits keep continuous grain.
 */
export function buildBlockGeometry(
  cells: readonly Cell[],
  center: UvCenter,
  seed: WoodSeed,
): THREE.ExtrudeGeometry {
  const shapes = outlineLoops(cells).map((l) =>
    loopToShape(insetLoop(l, BLOCK.gap + BLOCK.bevelSize), BLOCK.cornerRadius),
  );
  const geo = new THREE.ExtrudeGeometry(shapes, {
    depth: BLOCK.depth,
    bevelEnabled: true,
    bevelThickness: BLOCK.bevelThickness,
    bevelSize: BLOCK.bevelSize,
    bevelSegments: BLOCK.bevelSegments,
    curveSegments: BLOCK.curveSegments,
  });
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const ca = Math.cos(seed.a);
  const sa = Math.sin(seed.a);
  const rep = seed.s * BLOCK.uvPerCell;
  for (const grp of geo.groups) {
    if (grp.materialIndex !== CAP_MATERIAL) continue;
    for (let i = grp.start; i < grp.start + grp.count; i++) {
      const x = pos.getX(i) - center[0];
      const y = pos.getY(i) - center[1];
      uv.setXY(i, 0.5 + seed.jx + (x * ca - y * sa) * rep, 0.5 + seed.jy + (x * sa + y * ca) * rep);
    }
  }
  uv.needsUpdate = true;
  // Extrusion runs along +z; turn it so the block stands up (shape y → world z), bottom at y = 0.
  geo.rotateX(Math.PI / 2);
  geo.translate(0, BLOCK.depth + BLOCK.bevelThickness, 0);
  geo.computeBoundingSphere();
  return geo;
}
