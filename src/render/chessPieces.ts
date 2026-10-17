import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CHESS } from '../config';

/**
 * Turned wooden Staunton pieces, one geometry per type (index = type − 1: pawn, knight, bishop,
 * rook, queen, king). Bodies are lathe profiles (radius, height) in squares, standing on y = 0;
 * the rook's battlements, the queen's crown beads and the king's cross are added parts, and the
 * knight's head is a carved, bevelled silhouette facing +x. Every part is non-indexed with
 * position / normal / uv, so they merge into one mesh per piece.
 */

type Profile = readonly (readonly [number, number])[];

/** The foot every piece shares: a flat base, a rounded plinth and a collar. */
const FOOT = (w: number): [number, number][] => [
  [0, 0],
  [0.33 * w, 0],
  [0.345 * w, 0.012],
  [0.35 * w, 0.045],
  [0.335 * w, 0.075],
  [0.3 * w, 0.09],
  [0.29 * w, 0.105],
  [0.305 * w, 0.12],
  [0.29 * w, 0.14],
  [0.25 * w, 0.155],
];

/** An arc of points (centre cy, radius r) from angle a0 to a1 (radians, 0 = outward). */
function arc(cy: number, r: number, a0: number, a1: number, n = 8): [number, number][] {
  const out: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push([Math.max(0, Math.cos(a) * r), cy + Math.sin(a) * r]);
  }
  return out;
}

const PAWN: Profile = [
  ...FOOT(0.9),
  [0.2, 0.18],
  [0.14, 0.24],
  [0.105, 0.33],
  [0.095, 0.38],
  [0.155, 0.4],
  [0.16, 0.42],
  [0.11, 0.445],
  ...arc(0.53, 0.115, -Math.PI / 2 + 0.55, Math.PI / 2, 9),
];

const ROOK: Profile = [
  ...FOOT(1),
  [0.23, 0.19],
  [0.2, 0.26],
  [0.185, 0.46],
  [0.2, 0.49],
  [0.245, 0.51],
  [0.245, 0.6],
  [0.19, 0.6],
  [0.19, 0.57],
  [0, 0.57],
];

const BISHOP: Profile = [
  ...FOOT(0.95),
  [0.21, 0.18],
  [0.14, 0.25],
  [0.1, 0.42],
  [0.095, 0.5],
  [0.17, 0.53],
  [0.175, 0.555],
  [0.11, 0.575],
  [0.125, 0.61],
  [0.15, 0.67],
  [0.145, 0.73],
  [0.115, 0.79],
  [0.07, 0.835],
  [0.045, 0.85],
  ...arc(0.885, 0.045, -Math.PI / 2 + 0.4, Math.PI / 2, 6),
];

const QUEEN: Profile = [
  ...FOOT(1.02),
  [0.23, 0.18],
  [0.15, 0.27],
  [0.115, 0.48],
  [0.11, 0.58],
  [0.19, 0.61],
  [0.195, 0.64],
  [0.12, 0.665],
  [0.135, 0.72],
  [0.2, 0.86],
  [0.19, 0.885],
  [0.12, 0.9],
  [0.07, 0.93],
  ...arc(0.97, 0.05, -Math.PI / 2 + 0.3, Math.PI / 2, 6),
];

const KING: Profile = [
  ...FOOT(1.05),
  [0.24, 0.18],
  [0.155, 0.28],
  [0.12, 0.52],
  [0.115, 0.62],
  [0.2, 0.65],
  [0.205, 0.68],
  [0.125, 0.705],
  [0.14, 0.76],
  [0.2, 0.88],
  [0.19, 0.905],
  [0.12, 0.92],
  [0.085, 0.94],
  [0, 0.945],
];

const KNIGHT_BASE: Profile = [...FOOT(1), [0.23, 0.18], [0.2, 0.2], [0, 0.2]];

/** Side view of the horse's head (facing +x), from the back of the neck round to the chest. */
const KNIGHT_HEAD: readonly [number, number][] = [
  [-0.16, 0.17],
  [0.17, 0.17],
  [0.15, 0.27],
  [0.08, 0.38],
  [0.1, 0.43],
  [0.22, 0.47],
  [0.27, 0.52],
  [0.27, 0.57],
  [0.22, 0.61],
  [0.13, 0.68],
  [0.1, 0.77],
  [0.06, 0.8],
  [0.03, 0.73],
  [-0.05, 0.75],
  [-0.12, 0.69],
  [-0.17, 0.58],
  [-0.2, 0.42],
  [-0.2, 0.28],
];

const SEGMENTS = 40;

function lathe(p: Profile): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    p.map(([r, y]) => new THREE.Vector2(r, y)),
    SEGMENTS,
  ).toNonIndexed();
}

/** A small rounded block (battlement, cross arm), UVs scaled so the grain stays fine. */
function block(
  w: number,
  h: number,
  d: number,
  x: number,
  y: number,
  z: number,
  rotY = 0,
): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(w, h, d, 1, 1, 1).toNonIndexed();
  const uv = g.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w * 2, uv.getY(i) * h * 2);
  return g.rotateY(rotY).translate(x, y, z);
}

function bead(r: number, x: number, y: number, z: number): THREE.BufferGeometry {
  return new THREE.SphereGeometry(r, 10, 8).toNonIndexed().translate(x, y, z);
}

function rook(): THREE.BufferGeometry {
  const parts = [lathe(ROOK)];
  // four battlements on the rim, with gaps between them
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    parts.push(block(0.11, 0.08, 0.075, Math.cos(a) * 0.2, 0.64, Math.sin(a) * 0.2, -a));
  }
  return merge(parts);
}

function queen(): THREE.BufferGeometry {
  const parts = [lathe(QUEEN)];
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    parts.push(bead(0.032, Math.cos(a) * 0.19, 0.9, Math.sin(a) * 0.19));
  }
  return merge(parts);
}

function king(): THREE.BufferGeometry {
  return merge([lathe(KING), block(0.055, 0.2, 0.055, 0, 1.03, 0), block(0.16, 0.055, 0.055, 0, 1.07, 0)]);
}

function knight(): THREE.BufferGeometry {
  const shape = new THREE.Shape(KNIGHT_HEAD.map(([x, y]) => new THREE.Vector2(x, y)));
  const depth = 0.15;
  const bevel = 0.035;
  const head = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 4,
  })
    .toNonIndexed()
    .translate(0, 0, -depth / 2);
  // the extrusion's UVs are in shape units: scale them to the grain size of the turned parts
  const uv = head.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2, uv.getY(i) * 2);
  head.computeVertexNormals();
  // eyes: two small beads either side
  return merge([
    lathe(KNIGHT_BASE),
    head,
    bead(0.022, 0.15, 0.62, depth / 2 + bevel - 0.006),
    bead(0.022, 0.15, 0.62, -depth / 2 - bevel + 0.006),
  ]);
}

function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  for (const p of parts) {
    // the same attributes everywhere (some generators add none of these extras, but be safe)
    for (const name of Object.keys(p.attributes))
      if (!['position', 'normal', 'uv'].includes(name)) p.deleteAttribute(name);
  }
  const g = mergeGeometries(parts, false);
  for (const p of parts) p.dispose();
  if (!g) throw new Error('chess piece merge failed');
  return g;
}

/** One geometry per piece type, scaled to CHESS.pieceScale. */
export function pieceGeometries(): THREE.BufferGeometry[] {
  const s = CHESS.pieceScale;
  return [lathe(PAWN), knight(), lathe(BISHOP), rook(), queen(), king()].map((g) => {
    g.scale(s, s * CHESS.pieceHeight, s);
    g.computeBoundingSphere();
    return g;
  });
}

/** The bishop's mitre cut: a dark diagonal groove, so a bishop reads from above (not like a pawn). */
export function bishopSlit(): THREE.BufferGeometry {
  const s = CHESS.pieceScale;
  return new THREE.BoxGeometry(0.055, 0.09, 0.29)
    .rotateX(0.5)
    .rotateY(Math.PI / 4)
    .translate(0, 0.79, 0)
    .scale(s, s * CHESS.pieceHeight, s);
}
