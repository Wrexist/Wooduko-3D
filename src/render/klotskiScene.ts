import * as THREE from 'three';
import { BLOCK, CAMERA_VIEWS, KLOTSKI, RENDER, TABLE, WORLD } from '../config';
import type { LayoutSpec } from '../config';
import type { Cell } from '../core/types';
import type { KLevel, KPiece } from '../core/klotski';
import { Blocks } from './blocks';
import type { BlockMesh } from './blocks';
import { createCamera, fitCamera } from './camera';
import { linearColor } from './color';
import { addLights } from './lights';
import type { Textures } from './textures';

const rectCells = (w: number, h: number): Cell[] => {
  const out: Cell[] = [];
  for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) out.push([r, c]);
  return out;
};

/**
 * Klotski scene: a table slab with a carved w×h tray (an exit notch in the bottom wall),
 * one carved block per piece. Holds no rules: the controller tells it where pieces are.
 */
export class KlotskiScene {
  readonly scene = new THREE.Scene();
  readonly camera = createCamera();
  private readonly blocks: Blocks;
  private readonly disposeLights: () => void;
  private readonly table = new THREE.Group();
  private readonly meshes = new Map<number, BlockMesh>();
  private level: KLevel | null = null;
  private readonly camPos = new THREE.Vector3();
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private fit: [number, number, number, number] = [1, 1, 0, 0];

  constructor(private readonly tex: Textures) {
    this.scene.background = new THREE.Color(RENDER.background);
    this.blocks = new Blocks(tex);
    this.disposeLights = addLights(this.scene);
    this.scene.add(this.table);
  }

  setBackground(color: string): void {
    (this.scene.background as THREE.Color).set(color);
  }

  /** World x/z of a cell's top-left corner. */
  cellX(c: number): number {
    return c - (this.level?.w ?? 0) / 2;
  }
  cellZ(r: number): number {
    return r - (this.level?.h ?? 0) / 2;
  }

  load(level: KLevel, pieces: readonly KPiece[]): void {
    this.clear();
    this.level = level;
    this.buildTable(level);
    for (const p of pieces) {
      const seed = { a: p.id * 1.7, s: 0.9 + (p.id % 3) * 0.1, jx: 0, jy: 0, t: 0.9 + (p.id % 2) * 0.04 };
      const m = this.blocks.make(rectCells(p.w, p.h), [p.w / 2, p.h / 2], seed);
      if (p.key) for (const mat of m.material) mat.color.setRGB(...KLOTSKI.keyTint);
      this.scene.add(m);
      this.meshes.set(p.id, m);
      this.place(p, 0, 0, 0);
    }
    this.resize(...this.fit);
  }

  /** Put a piece at its cell, offset by (dc, dr) cells and lifted by `lift`. */
  place(p: KPiece, dc: number, dr: number, lift: number): void {
    const m = this.meshes.get(p.id);
    if (!m) return;
    m.position.set(this.cellX(p.c + dc), WORLD.baseY + lift, this.cellZ(p.r + dr));
  }

  /** Screen point → board cells (fractional), on the plane of the block tops. */
  pointCells(x: number, y: number, width: number, height: number): { col: number; row: number } | null {
    return this.toCells(x, y, width, height, WORLD.baseY + BLOCK.height);
  }

  /** Piece id under a screen point, or -1. Also returns the hit point in cells (fractional). */
  pick(x: number, y: number, width: number, height: number): { id: number; col: number; row: number } {
    const hit = this.pointCells(x, y, width, height);
    if (!hit) return { id: -1, col: 0, row: 0 };
    let id = -1;
    for (const [pid, m] of this.meshes) {
      const c0 = m.position.x - this.cellX(0);
      const r0 = m.position.z - this.cellZ(0);
      const box = m.geometry.boundingBox ?? (m.geometry.computeBoundingBox(), m.geometry.boundingBox);
      if (!box) continue;
      if (hit.col >= c0 + box.min.x && hit.col <= c0 + box.max.x && hit.row >= r0 + box.min.z && hit.row <= r0 + box.max.z)
        id = pid;
    }
    return { id, col: hit.col, row: hit.row };
  }

  /** Screen point → board cells (fractional) on the plane at height y. */
  toCells(x: number, y: number, width: number, height: number, planeY: number): { col: number; row: number } | null {
    this.ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    this.plane.constant = -planeY;
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, p)) return null;
    return { col: p.x - this.cellX(0), row: p.z - this.cellZ(0) };
  }

  resize(width: number, height: number, topPx: number, bottomPx: number): void {
    this.fit = [width, height, topPx, bottomPx];
    const w = this.level?.w ?? 4;
    const h = this.level?.h ?? 5;
    const m = KLOTSKI.wallGap + TABLE.bevel + 0.3;
    const spec: LayoutSpec = {
      landscape: false,
      slots: [],
      hit: [0, 0],
      bounds: { x0: -w / 2 - m, x1: w / 2 + m, z0: -h / 2 - m, z1: h / 2 + m + KLOTSKI.exitDepth },
      dealFromX: 0,
      padTop: KLOTSKI.padTop,
      padBottom: KLOTSKI.padBottom,
    };
    const dir = new THREE.Vector3(...CAMERA_VIEWS.top).normalize();
    fitCamera(this.camera, width, height, spec, topPx + spec.padTop, bottomPx + spec.padBottom, this.camPos, 0, dir);
  }

  private buildTable(level: KLevel): void {
    const tex = this.tex;
    // the slab bevel narrows the hole by `bevel` on each side (as in table.ts)
    const g = KLOTSKI.wallGap + TABLE.bevel;
    const x0 = -level.w / 2 - g;
    const x1 = level.w / 2 + g;
    const z0 = -level.h / 2 - g;
    const z1 = level.h / 2 + g;
    const ex0 = this.cellX(level.exit.c) - g;
    const ex1 = this.cellX(level.exit.c + 2) + g;
    const T = TABLE.halfSize;
    const s = new THREE.Shape();
    s.moveTo(-T, -T);
    s.lineTo(T, -T);
    s.lineTo(T, T);
    s.lineTo(-T, T);
    s.lineTo(-T, -T);
    // the carved tray, with the exit notch on the bottom (+z) edge; after rotateX(90°) shape y = world z
    const hole = new THREE.Path();
    hole.moveTo(x0, z0);
    hole.lineTo(x0, z1);
    hole.lineTo(ex0, z1);
    hole.lineTo(ex0, z1 + KLOTSKI.exitDepth);
    hole.lineTo(ex1, z1 + KLOTSKI.exitDepth);
    hole.lineTo(ex1, z1);
    hole.lineTo(x1, z1);
    hole.lineTo(x1, z0);
    hole.lineTo(x0, z0);
    s.holes.push(hole);
    const slabGeo = new THREE.ExtrudeGeometry(s, {
      depth: TABLE.depth,
      bevelEnabled: true,
      bevelThickness: TABLE.bevel,
      bevelSize: TABLE.bevel,
      bevelSegments: TABLE.bevelSegments,
      curveSegments: TABLE.curveSegments,
    });
    slabGeo.rotateX(Math.PI / 2);
    slabGeo.translate(0, -TABLE.bevel, 0);
    const slab = new THREE.Mesh(slabGeo, new THREE.MeshStandardMaterial({ map: tex.table, roughness: TABLE.roughness }));
    slab.receiveShadow = true;
    const floorGeo = new THREE.PlaneGeometry(level.w + 2, level.h + 2 + KLOTSKI.exitDepth).rotateX(-Math.PI / 2);
    const floor = new THREE.Mesh(
      floorGeo,
      new THREE.MeshStandardMaterial({ map: tex.side, color: linearColor(KLOTSKI.floor), roughness: TABLE.boardRoughness }),
    );
    floor.position.y = WORLD.baseY;
    floor.receiveShadow = true;
    this.table.add(slab, floor);
  }

  private clear(): void {
    for (const m of this.meshes.values()) Blocks.dispose(m);
    this.meshes.clear();
    for (const child of [...this.table.children]) {
      const m = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      m.removeFromParent();
      m.geometry.dispose();
      m.material.dispose();
    }
  }

  dispose(): void {
    this.clear();
    this.blocks.dispose();
    this.disposeLights();
  }
}
