import * as THREE from 'three';
import { RENDER, TRAY, WORLD } from '../config';
import type { LayoutSpec } from '../config';
import { getShape, shapeCenter } from '../core/shapes';
import type { BoardState, Group, Piece, Shape, Tray, UvCenter } from '../core/types';
import { easeOutBack, easeOutCubic } from '../fx/tween';
import type { Tweens } from '../fx/tween';
import { Blocks } from './blocks';
import type { BlockMesh } from './blocks';
import { createCamera, fitCamera, layoutFor } from './camera';
import { addLights } from './lights';
import { buildTable } from './table';
import type { Table } from './table';
import type { Textures } from './textures';

export interface TrayPiece {
  readonly slot: number;
  readonly piece: Piece;
  readonly shape: Shape;
  readonly center: UvCenter;
  readonly mesh: BlockMesh;
  /** Centred pivot: position/scale/tilt of the piece. */
  readonly pivot: THREE.Group;
  /** Busy animating (deal, drop, return): not pickable, not hover-animated. */
  anim: boolean;
  fits: boolean;
  /** Previous pivot position, for drag velocity. */
  readonly prev: THREE.Vector3;
}

/** Scene graph for the board: table, placed group meshes and tray pieces. Holds no game rules. */
export class World {
  readonly scene = new THREE.Scene();
  readonly camera = createCamera();
  /** Camera resting position; shake is applied on top. */
  readonly camBase = new THREE.Vector3();
  readonly blocks: Blocks;
  layout: LayoutSpec;
  readonly groups = new Map<number, BlockMesh>();
  readonly tray: (TrayPiece | null)[] = [null, null, null];
  private readonly table: Table;
  private readonly disposeLights: () => void;
  private readonly tmp = new THREE.Vector3();

  constructor(tex: Textures) {
    this.scene.background = new THREE.Color(RENDER.background);
    this.blocks = new Blocks(tex);
    this.table = buildTable(this.scene, tex);
    this.disposeLights = addLights(this.scene);
    this.layout = layoutFor(1);
  }

  /** Theme colours that are not in textures: scene background and ridge tint. */
  setThemeColors(background: string, ridge: number): void {
    (this.scene.background as THREE.Color).set(background);
    this.table.setRidge(ridge);
  }

  /** Recompute layout + camera for a new viewport. Idle tray pieces snap to their slots. */
  resize(width: number, height: number, topPx: number, bottomInsetPx: number, leftPx = 0): void {
    this.layout = layoutFor(width / height);
    fitCamera(
      this.camera,
      width,
      height,
      this.layout,
      topPx + this.layout.padTop,
      bottomInsetPx + this.layout.padBottom,
      this.camBase,
      leftPx,
    );
    for (const t of this.tray) if (t && !t.anim) this.slotPos(t.slot, t.pivot.position);
  }

  slotPos(slot: number, out: THREE.Vector3): THREE.Vector3 {
    const s = this.layout.slots[slot] ?? [0, 0];
    return out.set(s[0], 0, s[1]);
  }

  // ---------- placed groups ----------

  addGroup(g: Group): BlockMesh {
    this.removeGroup(g.id);
    const m = this.blocks.make(g.cells, g.center, g.seed);
    m.position.set(WORLD.x0, WORLD.baseY, WORLD.z0);
    this.scene.add(m);
    this.groups.set(g.id, m);
    return m;
  }

  removeGroup(id: number): void {
    const m = this.groups.get(id);
    if (!m) return;
    Blocks.dispose(m);
    this.groups.delete(id);
  }

  // ---------- tray ----------

  addTrayPiece(slot: number, piece: Piece): TrayPiece | null {
    this.removeTrayPiece(slot);
    const shape = getShape(piece.shapeIndex);
    if (!shape) return null;
    const center = shapeCenter(shape);
    const mesh = this.blocks.make(shape.cells, center, piece.seed);
    // transparent from the start, so fading it while dragging never compiles a new shader mid-game
    for (const m of mesh.material) m.transparent = true;
    mesh.position.set(-shape.w / 2, 0, -shape.h / 2);
    const pivot = new THREE.Group();
    pivot.add(mesh);
    pivot.scale.setScalar(TRAY.scale);
    this.slotPos(slot, pivot.position);
    this.scene.add(pivot);
    const tp: TrayPiece = {
      slot,
      piece,
      shape,
      center,
      mesh,
      pivot,
      anim: false,
      fits: true,
      prev: new THREE.Vector3(),
    };
    this.tray[slot] = tp;
    return tp;
  }

  removeTrayPiece(slot: number): void {
    const t = this.tray[slot];
    if (!t) return;
    Blocks.dispose(t.mesh);
    t.pivot.removeFromParent();
    this.tray[slot] = null;
  }

  setFits(fits: readonly boolean[]): void {
    this.tray.forEach((t, i) => {
      if (!t) return;
      t.fits = fits[i] ?? false;
      this.blocks.setTint(t.mesh, t.piece.seed, !t.fits);
    });
  }

  /** New pieces slide in from the side with an ease-out-back scale pop, staggered. */
  dealIn(tweens: Tweens): void {
    this.tray.forEach((t, i) => {
      if (!t) return;
      const to = this.slotPos(i, new THREE.Vector3());
      const from = to.clone();
      from.x += this.layout.dealFromX;
      t.anim = true;
      t.pivot.position.copy(from);
      t.pivot.scale.setScalar(0.01);
      tweens.add({
        delay: TRAY.dealDelay + i * TRAY.dealStagger,
        dur: TRAY.dealDuration,
        update: (_e, k) => {
          // the layout may change mid-deal (rotation): always aim at the current slot
          this.slotPos(i, to);
          t.pivot.position.lerpVectors(from, to, easeOutCubic(k));
          // a short hop on the way in, like a piece being set down on the table
          t.pivot.position.y += Math.sin(Math.min(1, k) * Math.PI) * TRAY.dealArc;
          t.pivot.scale.setScalar(
            Math.max(0.01, TRAY.scale * easeOutBack(Math.min(1, k * TRAY.dealScaleSpeed))),
          );
        },
        done: () => {
          t.anim = false;
          t.pivot.scale.setScalar(TRAY.scale);
        },
      });
    });
  }

  /** Rebuild every mesh from a game state (new game, continue, tutorial step). */
  syncAll(board: BoardState, tray: Tray, fits: readonly boolean[]): void {
    for (const id of [...this.groups.keys()]) this.removeGroup(id);
    for (let i = 0; i < this.tray.length; i++) this.removeTrayPiece(i);
    for (const g of board.groups) this.addGroup(g);
    tray.forEach((p, i) => {
      if (p) this.addTrayPiece(i, p);
    });
    this.setFits(fits);
  }

  /** Board-space world position of the centre of a piece placed at (r0, c0). */
  dropPoint(shape: Shape, r0: number, c0: number, out: THREE.Vector3): THREE.Vector3 {
    return out.set(WORLD.x0 + c0 + shape.w / 2, WORLD.baseY, WORLD.z0 + r0 + shape.h / 2);
  }

  /** Project a world point to CSS pixels. */
  toScreen(x: number, y: number, z: number, width: number, height: number): { x: number; y: number } {
    const v = this.tmp.set(x, y, z).project(this.camera);
    return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
  }

  dispose(): void {
    for (const id of [...this.groups.keys()]) this.removeGroup(id);
    for (let i = 0; i < this.tray.length; i++) this.removeTrayPiece(i);
    this.blocks.dispose();
    this.table.dispose();
    this.disposeLights();
  }
}
