import * as THREE from 'three';
import { BOARD, COLORS, PREVIEW, WORLD } from '../config';
import type { Cell } from '../core/types';
import { damp } from '../fx/tween';
import type { Tweens } from '../fx/tween';
import { linearColor } from './color';
import type { Textures } from './textures';

const N = BOARD.size;

/**
 * Drag feedback: a translucent ghost of the piece at its snapped spot, gold glow on every placed
 * cell that would clear, and a short warm flash on cleared cells.
 */
export class Preview {
  private readonly glowGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly overlayGeo = new THREE.PlaneGeometry(PREVIEW.overlaySize, PREVIEW.overlaySize).rotateX(
    -Math.PI / 2,
  );
  private readonly glows: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly overlays: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly glowTarget = new Float32Array(N * N);
  private readonly hints: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>[] = [];
  private readonly hintTarget = new Float32Array(N * N);
  private readonly ghostColor = linearColor(COLORS.ghost);
  // Signal colours use true sRGB so the clear preview reads clearly over light maple.
  private readonly ghostGold = new THREE.Color(COLORS.ghostGold);

  private ghost: {
    pivot: THREE.Group;
    mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    target: THREE.Vector3;
    show: boolean;
    clears: boolean;
    dead: boolean;
  } | null = null;

  constructor(
    private readonly scene: THREE.Scene,
    tex: Textures,
  ) {
    for (let r = 0; r < N; r++) {
      for (let c = 0; c < N; c++) {
        const gm = new THREE.MeshBasicMaterial({
          color: new THREE.Color(COLORS.glow),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          toneMapped: false,
        });
        const g = new THREE.Mesh(this.glowGeo, gm);
        g.position.set(WORLD.x0 + c + 0.5, WORLD.topY, WORLD.z0 + r + 0.5);
        g.visible = false;
        g.renderOrder = 3;
        scene.add(g);
        this.glows.push(g);

        const om = new THREE.MeshBasicMaterial({
          map: tex.overlay,
          color: linearColor(COLORS.cellFlash),
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
        const o = new THREE.Mesh(this.overlayGeo, om);
        o.position.set(WORLD.x0 + c + 0.5, WORLD.ghostY, WORLD.z0 + r + 0.5);
        o.visible = false;
        o.renderOrder = 2;
        scene.add(o);
        this.overlays.push(o);

        const hm = new THREE.MeshBasicMaterial({
          map: tex.overlay,
          color: new THREE.Color(PREVIEW.hintColor),
          transparent: true,
          opacity: 0,
          depthWrite: false,
          // additive: reads as warm light on the dark floor instead of a muddy tint
          blending: THREE.AdditiveBlending,
          toneMapped: false,
        });
        const hint = new THREE.Mesh(this.overlayGeo, hm);
        hint.position.set(WORLD.x0 + c + 0.5, WORLD.ghostY, WORLD.z0 + r + 0.5);
        hint.visible = false;
        hint.renderOrder = 2;
        scene.add(hint);
        this.hints.push(hint);
      }
    }
  }

  /** Create the ghost from a piece's block geometry (cloned). `w`/`h` centre it on its pivot. */
  makeGhost(geometry: THREE.BufferGeometry, w: number, h: number): void {
    this.disposeGhost();
    const mat = new THREE.MeshStandardMaterial({
      color: this.ghostColor,
      emissive: linearColor(COLORS.ghostEmissive),
      roughness: PREVIEW.ghostRoughness,
      transparent: true,
      opacity: 0,
    });
    const mesh = new THREE.Mesh(geometry.clone(), mat);
    mesh.position.set(-w / 2, 0, -h / 2);
    mesh.renderOrder = 1;
    const pivot = new THREE.Group();
    pivot.add(mesh);
    pivot.visible = false;
    this.scene.add(pivot);
    this.ghost = { pivot, mesh, target: new THREE.Vector3(), show: false, clears: false, dead: false };
  }

  /** Let the ghost fade out, then free it. */
  releaseGhost(): void {
    if (this.ghost) {
      this.ghost.dead = true;
      this.ghost.show = false;
    }
  }

  disposeGhost(): void {
    const g = this.ghost;
    if (!g) return;
    g.pivot.removeFromParent();
    g.mesh.geometry.dispose();
    g.mesh.material.dispose();
    this.ghost = null;
  }

  /**
   * Show the ghost at (r0, c0) and glow every already-placed cell in `clearCells`.
   * `pieceKeys` are the board keys (r·9+c) the piece itself would cover.
   */
  show(
    r0: number,
    c0: number,
    w: number,
    h: number,
    clearCells: readonly Cell[],
    pieceKeys: ReadonlySet<number>,
  ): void {
    this.glowTarget.fill(0);
    let clears = false;
    for (const [r, c] of clearCells) {
      const k = r * N + c;
      if (pieceKeys.has(k)) clears = true;
      else this.glowTarget[k] = 1;
    }
    const g = this.ghost;
    if (!g) return;
    g.target.set(WORLD.x0 + c0 + w / 2, WORLD.ghostY, WORLD.z0 + r0 + h / 2);
    if (g.mesh.material.opacity < PREVIEW.ghostJumpOpacity) g.pivot.position.copy(g.target);
    g.show = true;
    g.clears = clears;
  }

  hide(): void {
    this.glowTarget.fill(0);
    if (this.ghost) this.ghost.show = false;
  }

  /** Warm flash on cleared cells (fades out). */
  flashCells(cells: readonly Cell[], tweens: Tweens): void {
    for (const [r, c] of cells) {
      const o = this.overlays[r * N + c];
      if (!o) continue;
      o.visible = true;
      tweens.add({
        dur: PREVIEW.cellFlashDuration,
        update: (_e, k) => {
          o.material.opacity = PREVIEW.cellFlashOpacity * (1 - k);
        },
        done: () => {
          o.visible = false;
        },
      });
    }
  }

  /** Cells to softly highlight as the last gap of a nearly full unit (empty array = none). */
  setHints(cells: readonly Cell[]): void {
    this.hintTarget.fill(0);
    for (const [r, c] of cells) this.hintTarget[r * N + c] = 1;
  }

  update(dt: number, time: number): void {
    const ah = damp(PREVIEW.hintRate, dt);
    const hp = 1 - PREVIEW.hintPulse + PREVIEW.hintPulse * Math.sin(time * PREVIEW.hintPulseSpeed);
    for (let i = 0; i < this.hints.length; i++) {
      const h = this.hints[i];
      if (!h) continue;
      const tgt = (this.hintTarget[i] ?? 0) * PREVIEW.hintOpacity * hp;
      h.material.opacity += (tgt - h.material.opacity) * ah;
      h.visible = h.material.opacity > PREVIEW.hiddenOpacity;
    }
    const a = damp(PREVIEW.glowRate, dt);
    const pulse = PREVIEW.pulseBase + PREVIEW.pulseAmp * Math.sin(time * PREVIEW.pulseSpeed);
    for (let i = 0; i < this.glows.length; i++) {
      const g = this.glows[i];
      if (!g) continue;
      const m = g.material;
      const tgt = (this.glowTarget[i] ?? 0) * PREVIEW.glowOpacity * pulse;
      m.opacity += (tgt - m.opacity) * a;
      g.visible = m.opacity > PREVIEW.hiddenOpacity;
    }
    const gh = this.ghost;
    if (gh) {
      const mat = gh.mesh.material;
      const tgtO = gh.show ? PREVIEW.ghostOpacity : 0;
      mat.opacity += (tgtO - mat.opacity) * damp(gh.show ? PREVIEW.ghostFadeIn : PREVIEW.ghostFadeOut, dt);
      gh.pivot.position.lerp(gh.target, damp(PREVIEW.ghostGlide, dt));
      mat.color.lerp(gh.clears ? this.ghostGold : this.ghostColor, a);
      gh.pivot.visible = mat.opacity > PREVIEW.hiddenOpacity;
      if (gh.dead && mat.opacity < PREVIEW.hiddenOpacity) this.disposeGhost();
    }
  }

  /** Make every preview object visible once so its shader compiles before play. */
  warmup(on: boolean): void {
    const g0 = this.glows[0];
    const o0 = this.overlays[0];
    if (g0) g0.visible = on;
    if (o0) o0.visible = on;
  }

  dispose(): void {
    this.disposeGhost();
    for (const m of [...this.glows, ...this.overlays, ...this.hints]) {
      m.removeFromParent();
      m.material.dispose();
    }
    this.glowGeo.dispose();
    this.overlayGeo.dispose();
  }
}
