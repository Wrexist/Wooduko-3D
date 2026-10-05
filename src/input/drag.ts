import * as THREE from 'three';
import { BOARD, DRAG, TRAY, WORLD } from '../config';
import { canPlace, previewClears } from '../core/board';
import type { BoardState } from '../core/types';
import { damp, easeInQuad, easeOutBack, easeOutCubic } from '../fx/tween';
import type { Tweens } from '../fx/tween';
import type { Preview } from '../render/preview';
import type { TrayPiece, World } from '../render/world';

export interface DragHooks {
  /** May a drag start right now? */
  canStart(): boolean;
  board(): BoardState;
  onPickup(tp: TrayPiece): void;
  /** Drop animation finished on a valid spot: commit the move. */
  onDropped(tp: TrayPiece, r0: number, c0: number): void;
  onReturn(tp: TrayPiece): void;
  /** Ghost snapped to a new cell. */
  onSnap?: () => void;
}

interface DragState {
  tp: TrayPiece;
  pointerId: number;
  offZ: number;
  target: THREE.Vector3;
  valid: boolean;
  r0: number;
  c0: number;
  key: string;
  /** Last pointer position, to re-aim after a resize. */
  last: ScreenPoint;
}

interface ScreenPoint {
  clientX: number;
  clientY: number;
}

/**
 * Pointer handling: hover (mouse), pickup from the tray, drag on the camera line of sight above
 * the landing spot, snapping with hysteresis + magnet, drop or fly back.
 */
export class DragController {
  private drag: DragState | null = null;
  /** Optional restriction (tutorial): only these spots are valid. */
  private allowed: ((r0: number, c0: number) => boolean) | undefined;
  private hoverSlot = -1;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly land = new THREE.Vector3();
  private readonly v = new THREE.Vector3();
  private readonly detach: () => void;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: World,
    private readonly preview: Preview,
    private readonly tweens: Tweens,
    private readonly hooks: DragHooks,
  ) {
    const down = (e: PointerEvent): void => this.onDown(e);
    const move = (e: PointerEvent): void => this.onMove(e);
    const up = (e: PointerEvent): void => {
      if (this.drag && e.pointerId === this.drag.pointerId) this.end(true);
    };
    const cancel = (e: PointerEvent): void => {
      if (this.drag && e.pointerId === this.drag.pointerId) this.end(false);
    };
    const leave = (): void => {
      this.hoverSlot = -1;
      canvas.style.cursor = '';
    };
    const noGesture = (e: Event): void => e.preventDefault();
    canvas.addEventListener('pointerdown', down);
    canvas.addEventListener('pointermove', move);
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', cancel);
    canvas.addEventListener('lostpointercapture', cancel);
    canvas.addEventListener('pointerleave', leave);
    document.addEventListener('gesturestart', noGesture);
    this.detach = () => {
      canvas.removeEventListener('pointerdown', down);
      canvas.removeEventListener('pointermove', move);
      canvas.removeEventListener('pointerup', up);
      canvas.removeEventListener('pointercancel', cancel);
      canvas.removeEventListener('lostpointercapture', cancel);
      canvas.removeEventListener('pointerleave', leave);
      document.removeEventListener('gesturestart', noGesture);
    };
  }

  setAllowed(fn: ((r0: number, c0: number) => boolean) | undefined): void {
    this.allowed = fn;
  }

  get dragging(): boolean {
    return this.drag !== null;
  }

  get draggedSlot(): number {
    return this.drag?.tp.slot ?? -1;
  }

  /** Point under the pointer on the horizontal plane at height y. */
  private onPlane(e: ScreenPoint, y: number, out: THREE.Vector3): THREE.Vector3 | null {
    const rect = this.canvas.getBoundingClientRect();
    this.ndc.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.world.camera);
    const { origin: o, direction: d } = this.raycaster.ray;
    if (Math.abs(d.y) < 1e-6) return null;
    return out.copy(o).addScaledVector(d, (y - o.y) / d.y);
  }

  private slotAt(p: THREE.Vector3, needFree: boolean): TrayPiece | null {
    const [hx, hz] = this.world.layout.hit;
    let best: TrayPiece | null = null;
    let bd = Infinity;
    for (const t of this.world.tray) {
      if (!t || (needFree && t.anim)) continue;
      const s = this.world.slotPos(t.slot, this.v);
      const dx = Math.abs(p.x - s.x);
      const dz = Math.abs(p.z - s.z);
      if (dx < hx && dz < hz && dx + dz < bd) {
        bd = dx + dz;
        best = t;
      }
    }
    return best;
  }

  private onDown(e: PointerEvent): void {
    if (this.drag || !this.hooks.canStart()) return; // second finger is ignored
    const p = this.onPlane(e, 0, this.land);
    if (!p) return;
    const tp = this.slotAt(p, true);
    if (!tp) return;
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      // pointer already gone
    }
    this.drag = {
      tp,
      pointerId: e.pointerId,
      offZ: e.pointerType === 'mouse' ? 0 : DRAG.touchOffsetZ,
      target: new THREE.Vector3().copy(tp.pivot.position),
      valid: false,
      r0: 0,
      c0: 0,
      key: '',
      last: { clientX: e.clientX, clientY: e.clientY },
    };
    tp.prev.copy(tp.pivot.position);
    this.preview.makeGhost(tp.mesh.geometry, tp.shape.w, tp.shape.h);
    this.hoverSlot = -1;
    this.updateTarget(e);
    this.hooks.onPickup(tp);
  }

  private onMove(e: PointerEvent): void {
    if (this.drag) {
      if (e.pointerId === this.drag.pointerId) this.updateTarget(e);
      return;
    }
    if (e.pointerType !== 'mouse') return;
    const p = this.onPlane(e, 0, this.land);
    this.hoverSlot = -1;
    if (p && this.hooks.canStart()) this.hoverSlot = this.slotAt(p, false)?.slot ?? -1;
    this.canvas.style.cursor = this.hoverSlot >= 0 ? 'grab' : '';
  }

  private fits(tp: TrayPiece, r0: number, c0: number): boolean {
    if (this.allowed && !this.allowed(r0, c0)) return false;
    return canPlace(this.hooks.board(), tp.shape.cells, r0, c0);
  }

  private updateTarget(e: ScreenPoint): void {
    const d = this.drag;
    if (!d) return;
    d.last.clientX = e.clientX;
    d.last.clientY = e.clientY;
    // 1. where the finger points on the board floor (on touch the piece floats above the finger)
    const land = this.onPlane(e, WORLD.baseY, this.land);
    if (!land) return;
    land.z += d.offZ;
    // 2. hover on the camera line of sight through that spot, so it sits exactly over it
    const cp = this.world.camBase;
    this.v.copy(land).sub(cp);
    d.target.copy(cp).addScaledVector(this.v, (DRAG.lift - cp.y) / this.v.y);
    // 3. snap
    const { w, h } = d.tp.shape;
    const fc = land.x - WORLD.x0 - w / 2;
    const fr = land.z - WORLD.z0 - h / 2;
    let c0 = Math.round(fc);
    let r0 = Math.round(fr);
    // hysteresis: keep the current spot until the finger clearly moves to the next cell
    if (
      d.valid &&
      Math.abs(fc - d.c0) < DRAG.hysteresis &&
      Math.abs(fr - d.r0) < DRAG.hysteresis &&
      this.fits(d.tp, d.r0, d.c0)
    ) {
      r0 = d.r0;
      c0 = d.c0;
    }
    let valid = this.fits(d.tp, r0, c0);
    if (!valid) {
      // magnet: nearest free spot among the 8 neighbours within reach
      let bd = DRAG.magnetRadius * DRAG.magnetRadius;
      const rr0 = Math.round(fr);
      const cc0 = Math.round(fc);
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = rr0 + dr;
          const cc = cc0 + dc;
          const dd = (rr - fr) ** 2 + (cc - fc) ** 2;
          if (dd < bd && this.fits(d.tp, rr, cc)) {
            bd = dd;
            r0 = rr;
            c0 = cc;
            valid = true;
          }
        }
      }
    }
    const key = valid ? `${r0},${c0}` : '';
    d.valid = valid;
    d.r0 = r0;
    d.c0 = c0;
    if (key !== d.key) {
      d.key = key;
      if (valid) {
        const cells = d.tp.shape.cells;
        const keys = new Set(cells.map(([r, c]) => (r + r0) * BOARD.size + (c + c0)));
        this.preview.show(r0, c0, w, h, previewClears(this.hooks.board(), cells, r0, c0).cells, keys);
        this.hooks.onSnap?.();
      } else this.preview.hide();
    }
  }

  /** The view changed (resize / rotate): re-aim the dragged piece from the last pointer position. */
  refresh(): void {
    const d = this.drag;
    if (!d) return;
    d.key = '';
    this.updateTarget(d.last);
  }

  /** Abort any drag (pause, background, reset): the piece flies home. */
  cancel(): void {
    if (this.drag) this.end(false);
    this.hoverSlot = -1;
  }

  private end(commit: boolean): void {
    const d = this.drag;
    if (!d) return;
    this.drag = null;
    this.preview.hide();
    this.preview.releaseGhost();
    try {
      if (this.canvas.hasPointerCapture(d.pointerId)) this.canvas.releasePointerCapture(d.pointerId);
    } catch {
      // ignore
    }
    if (commit && d.valid && this.fits(d.tp, d.r0, d.c0)) this.dropTo(d.tp, d.r0, d.c0);
    else this.returnHome(d.tp);
  }

  private returnHome(tp: TrayPiece): void {
    if (this.world.tray[tp.slot] !== tp) return;
    tp.anim = true;
    this.hooks.onReturn(tp);
    const pv = tp.pivot;
    const from = pv.position.clone();
    const fs = pv.scale.x;
    const frx = pv.rotation.x;
    const frz = pv.rotation.z;
    const to = new THREE.Vector3();
    this.tweens.add({
      dur: DRAG.returnDuration,
      ease: easeOutBack,
      update: (k) => {
        this.world.slotPos(tp.slot, to);
        pv.position.lerpVectors(from, to, k);
        pv.scale.setScalar(fs + (TRAY.scale - fs) * k);
        pv.rotation.x = frx * (1 - k);
        pv.rotation.z = frz * (1 - k);
      },
      done: () => {
        tp.anim = false;
        this.world.slotPos(tp.slot, pv.position);
        pv.rotation.set(0, 0, 0);
        pv.scale.setScalar(TRAY.scale);
      },
    });
  }

  private dropTo(tp: TrayPiece, r0: number, c0: number): void {
    tp.anim = true;
    const pv = tp.pivot;
    const from = pv.position.clone();
    const fs = pv.scale.x;
    const frx = pv.rotation.x;
    const frz = pv.rotation.z;
    const to = this.world.dropPoint(tp.shape, r0, c0, new THREE.Vector3());
    this.tweens.add({
      dur: DRAG.dropDuration,
      update: (_e, k) => {
        const kx = easeOutCubic(Math.min(1, k * DRAG.dropXZSpeed));
        pv.position.x = from.x + (to.x - from.x) * kx;
        pv.position.z = from.z + (to.z - from.z) * kx;
        pv.position.y = from.y + (to.y - from.y) * easeInQuad(k);
        pv.scale.setScalar(fs + (1 - fs) * kx);
        pv.rotation.x = frx * (1 - kx);
        pv.rotation.z = frz * (1 - kx);
      },
      done: () => this.hooks.onDropped(tp, r0, c0),
    });
  }

  /** Per-frame: smooth follow + tilt for the dragged piece, hover lift for idle tray pieces. */
  update(dt: number): void {
    if (dt <= 0) return;
    const d = this.drag;
    if (d) {
      const pv = d.tp.pivot;
      d.tp.prev.copy(pv.position);
      const axz = damp(DRAG.followRateXZ, dt);
      pv.position.x += (d.target.x - pv.position.x) * axz;
      pv.position.z += (d.target.z - pv.position.z) * axz;
      pv.position.y += (d.target.y - pv.position.y) * damp(DRAG.followRateY, dt);
      pv.scale.setScalar(pv.scale.x + (1 - pv.scale.x) * damp(DRAG.scaleRate, dt));
      const vx = (pv.position.x - d.tp.prev.x) / dt;
      const vz = (pv.position.z - d.tp.prev.z) / dt;
      const cl = (x: number): number => Math.max(-DRAG.tiltMax, Math.min(DRAG.tiltMax, x));
      const a = damp(DRAG.tiltRate, dt);
      pv.rotation.z += (cl(-vx * DRAG.tiltPerSpeed) - pv.rotation.z) * a;
      pv.rotation.x += (cl(vz * DRAG.tiltPerSpeed) - pv.rotation.x) * a;
    }
    const ah = damp(TRAY.hoverRate, dt);
    for (const t of this.world.tray) {
      if (!t || t.anim || d?.tp === t) continue;
      const hov = t.slot === this.hoverSlot;
      const ty = hov ? TRAY.hoverLift : 0;
      const ts = TRAY.scale * (hov ? TRAY.hoverScale : 1);
      t.pivot.position.y += (ty - t.pivot.position.y) * ah;
      t.pivot.scale.setScalar(t.pivot.scale.x + (ts - t.pivot.scale.x) * ah);
    }
  }

  dispose(): void {
    this.detach();
  }
}
