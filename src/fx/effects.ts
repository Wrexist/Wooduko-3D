import * as THREE from 'three';
import { BOARD, COLORS, FX, WORLD } from '../config';
import type { ClearUnit, Group } from '../core/types';
import { Blocks } from '../render/blocks';
import type { BlockMesh } from '../render/blocks';
import { linearColor } from '../render/color';
import type { Textures } from '../render/textures';
import type { Chips, Sparkles } from './particles';
import { easeInCubic, easeOutCubic } from './tween';
import type { Tweens } from './tween';

const FX_Y = WORLD.topY + WORLD.fxLift;
const N = BOARD.size;
const B = BOARD.box;

type FxMesh = THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

export interface EffectsDeps {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  readonly tweens: Tweens;
  readonly tex: Textures;
  readonly sparkles: Sparkles;
  readonly chips: Chips;
  readonly blocks: Blocks;
  readonly reducedMotion: () => boolean;
  /** Player turned screen shake off in Settings. */
  readonly shakeOff?: () => boolean;
  readonly screenFlash: (tier: number) => void;
}

/** Visual reward layer. Everything is time-based and cleans up its own GPU resources. */
export class Effects {
  /** Current camera shake amplitude (decays exponentially). */
  shake = 0;
  private readonly unitPlane = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly barPlane = new THREE.PlaneGeometry(...FX.sweepSize).rotateX(-Math.PI / 2);
  private readonly boxPlane = new THREE.PlaneGeometry(FX.sweepBoxSize, FX.sweepBoxSize).rotateX(-Math.PI / 2);
  private readonly popTint = linearColor(COLORS.popEmissive);

  constructor(private readonly d: EffectsDeps) {}

  private plane(geo: THREE.PlaneGeometry, tex: THREE.Texture, color: number, additive = true): FxMesh {
    const m = new THREE.Mesh(
      geo,
      new THREE.MeshBasicMaterial({
        map: tex,
        color: linearColor(color),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        toneMapped: false,
      }),
    );
    m.renderOrder = 5;
    this.d.scene.add(m);
    return m;
  }

  private static kill(m: FxMesh): void {
    m.removeFromParent();
    m.material.dispose(); // geometry is shared
  }

  addShake(amount: number): void {
    if (amount <= 0 || this.d.reducedMotion() || this.d.shakeOff?.()) return;
    this.shake = Math.max(this.shake, amount);
  }

  /** Gold bar along a cleared row/column (or soft square for a box) with a travelling bright head. */
  sweep(u: ClearUnit, delay: number, sparkScale = 1): void {
    const { tex, tweens, sparkles } = this.d;
    let cx = 0;
    let cz = 0;
    let len: number = N;
    let m: FxMesh;
    if (u.kind === 'row') {
      cz = WORLD.z0 + u.index + 0.5;
      m = this.plane(this.barPlane, tex.bar, COLORS.sweep);
    } else if (u.kind === 'col') {
      cx = WORLD.x0 + u.index + 0.5;
      m = this.plane(this.barPlane, tex.bar, COLORS.sweep);
      m.rotation.y = Math.PI / 2;
    } else {
      const br = Math.floor(u.index / B);
      const bc = u.index % B;
      cx = WORLD.x0 + bc * B + B / 2;
      cz = WORLD.z0 + br * B + B / 2;
      len = B * B;
      m = this.plane(this.boxPlane, tex.boxGlow, COLORS.sweep);
    }
    m.position.set(cx, FX_Y, cz);
    let lastCell = -1;
    tweens.add({
      delay,
      dur: FX.sweepDuration,
      update: (_e, k) => {
        m.material.opacity =
          (k < FX.sweepPeakAt
            ? k / FX.sweepPeakAt
            : 1 - easeOutCubic((k - FX.sweepPeakAt) / (1 - FX.sweepPeakAt))) * FX.sweepOpacity;
        const sc = 1 + FX.sweepGrow * easeOutCubic(k);
        if (u.kind === 'box') m.scale.set(sc, 1, sc);
        else m.scale.set(1, 1, sc);
        // sparkles per cell crossed: frame-rate independent
        const cell = Math.min(len - 1, Math.floor(easeOutCubic(Math.min(1, k * FX.sweepHeadSpeed)) * len));
        while (lastCell < cell) {
          lastCell++;
          let x = cx;
          let z = cz;
          if (u.kind === 'row') x = WORLD.x0 + lastCell + 0.5;
          else if (u.kind === 'col') z = WORLD.z0 + lastCell + 0.5;
          else {
            x = cx + ((lastCell % B) - 1);
            z = cz + (Math.floor(lastCell / B) - 1);
          }
          sparkles.emit(
            x,
            FX_Y,
            z,
            Math.round((u.kind === 'box' ? FX.sweepSparksPerBoxCell : FX.sweepSparksPerCell) * sparkScale),
            FX.sweepSparkSpeed,
            FX.sweepSparkUp,
            FX.sweepSparkSpread,
          );
        }
      },
      done: () => Effects.kill(m),
    });
  }

  shockRing(
    x: number,
    z: number,
    size: number,
    color: number,
    peak: number,
    dur: number = FX.shockDuration,
  ): void {
    const m = this.plane(this.unitPlane, this.d.tex.halo, color);
    m.position.set(x, FX_Y - FX.shockDrop, z);
    this.d.tweens.add({
      dur,
      update: (_e, k) => {
        const s = FX.shockStartScale + size * easeOutCubic(k);
        m.scale.set(s, 1, s);
        m.material.opacity = peak * (1 - k) * (1 - k);
      },
      done: () => Effects.kill(m),
    });
  }

  landingRing(x: number, z: number, w: number, h: number): void {
    const m = this.plane(this.unitPlane, this.d.tex.halo, COLORS.landing, false);
    m.position.set(x, WORLD.baseY + FX.landingY, z);
    m.renderOrder = 4;
    const pad = FX.landingPad;
    const base = Math.max(w, h) + pad;
    this.d.tweens.add({
      dur: FX.landingDuration,
      update: (_e, k) => {
        const s = base * (FX.landingScaleFrom + FX.landingScaleGrow * easeOutCubic(k));
        m.scale.set((s * (w + pad)) / base, 1, (s * (h + pad)) / base);
        m.material.opacity = FX.landingOpacity * (1 - k);
      },
      done: () => Effects.kill(m),
    });
  }

  /** Quick zoom-in, slow release. */
  punch(amount: number): void {
    if (this.d.reducedMotion()) return;
    const cam = this.d.camera;
    this.d.tweens.add({
      dur: FX.punchDuration,
      update: (_e, k) => {
        const inK = FX.punchInAt;
        cam.zoom = 1 + amount * (k < inK ? easeOutCubic(k / inK) : (1 - (k - inK) / (1 - inK)) ** 2);
        cam.updateProjectionMatrix();
      },
      done: () => {
        cam.zoom = 1;
        cam.updateProjectionMatrix();
      },
    });
  }

  flash(tier: number): void {
    if (!this.d.reducedMotion()) this.d.screenFlash(tier);
  }

  /** Squash-and-settle on a freshly placed block. */
  /**
   * Squash-and-settle on a freshly placed block, with a tiny rocking wobble. The block is briefly
   * parented to a pivot at its own centre (ox, oz) so it rocks in place, not around the board corner.
   */
  squash(mesh: THREE.Object3D, ox: number, oz: number): void {
    const { scene } = this.d;
    const pivot = new THREE.Group();
    pivot.position.set(ox, mesh.position.y, oz);
    scene.add(pivot);
    const home = mesh.position.clone();
    pivot.add(mesh);
    mesh.position.set(home.x - ox, 0, home.z - oz);
    const sx = (Math.random() - 0.5) * 2;
    const sz = (Math.random() - 0.5) * 2;
    const reduced = this.d.reducedMotion();
    this.d.tweens.add({
      dur: FX.squashDuration,
      update: (_e, k) => {
        const decay = Math.exp(-k * FX.squashDecay);
        pivot.scale.y = 1 - FX.squashAmount * decay * Math.cos(k * FX.squashFreq);
        if (!reduced) {
          const w = FX.settleAngle * decay * Math.sin(k * FX.settleFreq);
          pivot.rotation.set(w * sx, 0, w * sz);
        }
      },
      done: () => {
        pivot.removeFromParent();
        // the block may already have been cleared (and disposed) by a later move
        if (mesh.parent === pivot) {
          mesh.position.copy(home);
          scene.add(mesh);
        }
      },
    });
  }

  /**
   * A cleared cell becomes a temporary single-cell block (same seed + UV centre) that waits by its
   * distance from the drop point, rises, swells, spins slightly, flashes warm and vanishes.
   */
  pop(r: number, c: number, g: Group, ox: number, oz: number): void {
    const { scene, tweens, blocks, chips } = this.d;
    const m: BlockMesh = blocks.make([[r, c]], g.center, g.seed);
    const piv = new THREE.Group();
    piv.position.set(WORLD.x0 + c + 0.5, WORLD.baseY, WORLD.z0 + r + 0.5);
    m.position.set(-(c + 0.5), 0, -(r + 0.5));
    piv.add(m);
    scene.add(piv);
    const dist = Math.hypot(piv.position.x - ox, piv.position.z - oz);
    const rx = (Math.random() - 0.5) * FX.popSpin;
    const rz = (Math.random() - 0.5) * FX.popSpin;
    const top = m.material[0];
    if (top) {
      top.emissive.copy(this.popTint);
      top.emissiveIntensity = 0;
    }
    let started = false;
    tweens.add({
      delay: dist * FX.popDelayPerUnit,
      dur: FX.popDuration,
      update: (_e, k) => {
        if (!started) {
          started = true;
          chips.spawn(piv.position.x, piv.position.y, piv.position.z, FX.chipsPerCell);
        }
        piv.position.y = WORLD.baseY + easeOutCubic(Math.min(1, k * FX.popRiseSpeed)) * FX.popRise;
        const s =
          k < FX.popPeakAt
            ? 1 + (FX.popPeak - 1) * (k / FX.popPeakAt)
            : FX.popPeak * (1 - easeInCubic((k - FX.popPeakAt) / (1 - FX.popPeakAt)));
        piv.scale.setScalar(Math.max(0.001, s));
        piv.rotation.x = rx * k;
        piv.rotation.z = rz * k;
        if (top) top.emissiveIntensity = FX.popEmissive * Math.sin(Math.min(1, k * 2) * Math.PI);
      },
      done: () => {
        piv.removeFromParent();
        Blocks.dispose(m);
      },
    });
  }

  /** Sparkle bursts across the board for a board clear. */
  boardClear(): void {
    const { tweens, sparkles } = this.d;
    for (let i = 0; i < FX.boardClearBursts; i++) {
      tweens.after(i * FX.boardClearBurstGap, () =>
        sparkles.emit(
          WORLD.x0 + Math.random() * N,
          FX_Y,
          WORLD.z0 + Math.random() * N,
          FX.boardClearSparks,
          FX.boardClearSparkSpeed,
          FX.boardClearSparkUp,
          FX.boardClearSparkSpread,
        ),
      );
    }
    this.shockRing(
      0,
      0,
      FX.boardClearRing,
      COLORS.shockBoard,
      FX.boardClearRingPeak,
      FX.boardClearRingDuration,
    );
  }

  /** One frame of shake decay. Returns the current amplitude. */
  updateShake(dt: number): number {
    this.shake *= Math.exp(-dt * FX.shakeDecay);
    if (this.shake < 1e-4) this.shake = 0;
    return this.shake;
  }

  /** Spawn one of each FX material so their shaders compile at boot; returns a cleanup. */
  warmup(): () => void {
    const a = this.plane(this.barPlane, this.d.tex.bar, COLORS.sweep);
    const b = this.plane(this.unitPlane, this.d.tex.halo, COLORS.landing, false);
    const c = this.plane(this.boxPlane, this.d.tex.boxGlow, COLORS.sweep);
    const all = [a, b, c];
    for (const m of all) m.position.y = WORLD.baseY - 1;
    return () => all.forEach((m) => Effects.kill(m));
  }

  dispose(): void {
    this.unitPlane.dispose();
    this.barPlane.dispose();
    this.boxPlane.dispose();
  }
}
