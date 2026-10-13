import * as THREE from 'three';
import { BLOCK, CAMERA_VIEWS, PLANK, RENDER, TABLE, WORLD } from '../config';
import type { LayoutSpec } from '../config';
import type { Cells, PlankLevel } from '../core/plank';
import { Blocks } from './blocks';
import type { BlockMesh } from './blocks';
import { insetLoop, outlineLoops } from './blockGeometry';
import { createCamera, fitCamera } from './camera';
import { linearColor } from './color';
import { addLights } from './lights';
import type { Textures } from './textures';

/** Where a piece is drawn: centre (x, z), height and scale. Eased toward a target every frame. */
export interface PieceLook {
  x: number;
  z: number;
  y: number;
  s: number;
  /** Remaining yaw (radians) of a turn animation, eased to 0. */
  turn: number;
}

interface PieceView {
  readonly pivot: THREE.Group;
  mesh: BlockMesh;
  w: number;
  h: number;
  readonly seed: { a: number; s: number; jx: number; jy: number; t: number };
}

/**
 * Plank fit scene: a table slab with the level's silhouette carved into it, and one carved block
 * per piece. Board cell (r, c) spans x ∈ [x0 + c, x0 + c + 1], z ∈ [r, r + 1]; loose pieces lie on
 * the table below the board. Holds no rules.
 */
export class PlankScene {
  readonly scene = new THREE.Scene();
  readonly camera = createCamera();
  private readonly blocks: Blocks;
  private readonly disposeLights: () => void;
  private readonly table = new THREE.Group();
  private readonly views = new Map<number, PieceView>();
  private level: PlankLevel | null = null;
  private readonly camPos = new THREE.Vector3();
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private fit: [number, number, number, number] = [1, 1, 0, 0];
  private trayRows = 1;

  constructor(private readonly tex: Textures) {
    this.scene.background = new THREE.Color(RENDER.background);
    this.blocks = new Blocks(tex);
    this.disposeLights = addLights(this.scene);
    this.scene.add(this.table);
  }

  setBackground(color: string): void {
    (this.scene.background as THREE.Color).set(color);
  }

  get x0(): number {
    return -(this.level?.w ?? 0) / 2;
  }

  get trayWidth(): number {
    return Math.max(this.level?.w ?? 0, PLANK.trayMinWidth);
  }

  /** Centre of tray slot `i` (on the table, below the board). */
  slot(i: number): { x: number; z: number } {
    const cols = PLANK.trayCols;
    const w = this.trayWidth / cols;
    const row = Math.floor(i / cols);
    return {
      x: -this.trayWidth / 2 + w * ((i % cols) + 0.5),
      z: (this.level?.h ?? 0) + PLANK.trayGap + PLANK.trayRowDepth * (row + 0.5),
    };
  }

  load(level: PlankLevel): void {
    this.clear();
    this.level = level;
    this.trayRows = Math.ceil(level.pieces.length / PLANK.trayCols);
    this.buildTable(level);
    for (const p of level.pieces) {
      const seed = { a: p.id * 2.3, s: 0.9 + (p.id % 3) * 0.1, jx: 0, jy: 0, t: 0.88 + (p.id % 3) * 0.04 };
      const pivot = new THREE.Group();
      this.scene.add(pivot);
      const mesh = this.makeMesh(p.cells, seed);
      mesh.userData.pieceId = p.id;
      pivot.add(mesh);
      const w = Math.max(...p.cells.map((q) => q[1])) + 1;
      const h = Math.max(...p.cells.map((q) => q[0])) + 1;
      this.views.set(p.id, { pivot, mesh, w, h, seed });
    }
    this.resize(...this.fit);
  }

  private makeMesh(cells: Cells, seed: PieceView['seed']): BlockMesh {
    const w = Math.max(...cells.map((p) => p[1])) + 1;
    const h = Math.max(...cells.map((p) => p[0])) + 1;
    const m = this.blocks.make(cells, [w / 2, h / 2], seed);
    m.position.set(-w / 2, 0, -h / 2);
    return m;
  }

  /** New orientation for a piece (rebuilds its geometry, centred on the pivot). */
  setCells(id: number, cells: Cells): void {
    const v = this.views.get(id);
    if (!v) return;
    Blocks.dispose(v.mesh);
    v.mesh = this.makeMesh(cells, v.seed);
    v.mesh.userData.pieceId = id;
    v.w = Math.max(...cells.map((p) => p[1])) + 1;
    v.h = Math.max(...cells.map((p) => p[0])) + 1;
    v.pivot.add(v.mesh);
  }

  /** Board centre of a piece of size w×h with its top-left at cell (r, c). */
  cellCentre(r: number, c: number, w: number, h: number): { x: number; z: number } {
    return { x: this.x0 + c + w / 2, z: r + h / 2 };
  }

  /** Top-left cell nearest to a piece of size w×h centred at (x, z). */
  nearestCell(x: number, z: number, w: number, h: number): { r: number; c: number } {
    return { r: Math.round(z - h / 2), c: Math.round(x - this.x0 - w / 2) };
  }

  draw(id: number, look: PieceLook): void {
    const v = this.views.get(id);
    if (!v) return;
    v.pivot.position.set(look.x, look.y, look.z);
    v.pivot.scale.setScalar(look.s);
    v.pivot.rotation.y = look.turn;
  }

  /** Piece id under a screen point, or -1. */
  pick(x: number, y: number, width: number, height: number): number {
    this.ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    const hits = this.ray.intersectObjects(
      [...this.views.values()].map((v) => v.mesh),
      false,
    );
    const id = hits[0]?.object.userData.pieceId as number | undefined;
    return id ?? -1;
  }

  /** Screen point → world (x, z) on the plane at height y. */
  toWorld(
    x: number,
    y: number,
    width: number,
    height: number,
    planeY: number,
  ): { x: number; z: number } | null {
    this.ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    this.plane.constant = -planeY;
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, p)) return null;
    return { x: p.x, z: p.z };
  }

  resize(width: number, height: number, topPx: number, bottomPx: number): void {
    this.fit = [width, height, topPx, bottomPx];
    const h = this.level?.h ?? 4;
    const half = Math.max((this.level?.w ?? 4) / 2, this.trayWidth / 2) + 0.4;
    const spec: LayoutSpec = {
      landscape: false,
      slots: [],
      hit: [0, 0],
      bounds: { x0: -half, x1: half, z0: -0.5, z1: h + PLANK.trayGap + PLANK.trayRowDepth * this.trayRows },
      dealFromX: 0,
      padTop: 12,
      padBottom: 12,
    };
    const dir = new THREE.Vector3(...CAMERA_VIEWS.top).normalize();
    fitCamera(
      this.camera,
      width,
      height,
      spec,
      topPx + spec.padTop,
      bottomPx + spec.padBottom,
      this.camPos,
      0,
      dir,
    );
  }

  private buildTable(level: PlankLevel): void {
    const tex = this.tex;
    const T = TABLE.halfSize;
    const s = new THREE.Shape();
    s.moveTo(-T, -T);
    s.lineTo(T, -T);
    s.lineTo(T, T);
    s.lineTo(-T, T);
    s.lineTo(-T, -T);
    // the silhouette, pushed out by the wall gap (+ bevel, which narrows it again); shape y = world z
    const loop = outlineLoops(level.target)[0] ?? [];
    const out = insetLoop(loop, -(PLANK.wallGap + TABLE.bevel));
    const hole = new THREE.Path();
    out.forEach(([cx, cy], i) => {
      if (i === 0) hole.moveTo(this.x0 + cx, cy);
      else hole.lineTo(this.x0 + cx, cy);
    });
    hole.closePath();
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
    const slab = new THREE.Mesh(
      slabGeo,
      new THREE.MeshStandardMaterial({ map: tex.table, roughness: TABLE.roughness }),
    );
    slab.receiveShadow = true;
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(level.w + 2, level.h + 2).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        map: tex.side,
        color: linearColor(PLANK.floor),
        roughness: TABLE.boardRoughness,
      }),
    );
    floor.position.set(0, WORLD.baseY, level.h / 2);
    floor.receiveShadow = true;
    this.table.add(slab, floor);
    // grooves between neighbouring target cells
    const inside = new Set(level.target.map((p) => `${p[0]},${p[1]}`));
    const gw = PLANK.grooveWidth;
    for (const [r, c] of level.target) {
      for (const [dr, dc] of [
        [0, 1],
        [1, 0],
      ] as const) {
        if (!inside.has(`${r + dr},${c + dc}`)) continue;
        const geo = new THREE.PlaneGeometry(dc ? gw : 1, dc ? 1 : gw).rotateX(-Math.PI / 2);
        const line = new THREE.Mesh(
          geo,
          new THREE.MeshBasicMaterial({
            color: linearColor(PLANK.groove),
            transparent: true,
            opacity: PLANK.grooveOpacity,
            depthWrite: false,
          }),
        );
        line.position.set(this.x0 + c + (dc ? 1 : 0.5), WORLD.baseY + 0.003, r + (dr ? 1 : 0.5));
        line.renderOrder = 1;
        this.table.add(line);
      }
    }
  }

  /** Height of a piece lying in the board (tops just above the table) or on the table. */
  static readonly boardY = WORLD.baseY;
  static readonly tableY = 0;
  static readonly topY = WORLD.baseY + BLOCK.height;

  private clear(): void {
    for (const v of this.views.values()) {
      Blocks.dispose(v.mesh);
      v.pivot.removeFromParent();
    }
    this.views.clear();
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
