import * as THREE from 'three';
import { COMBO_GLOW, TABLE } from '../config';
import { damp } from './tween';

/** Warm light that frames the board while a combo is alive; brighter with the streak, dimmer at risk. */
export class ComboGlow {
  private readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  private readonly tex: THREE.CanvasTexture;
  private target = 0;

  constructor(scene: THREE.Scene) {
    const N = COMBO_GLOW.textureSize;
    const cv = document.createElement('canvas');
    cv.width = cv.height = N;
    const g = cv.getContext('2d');
    if (!g) throw new Error('2D canvas unavailable');
    // a soft frame: bright just outside the board hole, fading out on both sides
    const size = COMBO_GLOW.size;
    const px = N / size;
    const inner = (TABLE.hole / 2) * px;
    const c = N / 2;
    for (let i = 0; i < COMBO_GLOW.rings; i++) {
      const k = i / (COMBO_GLOW.rings - 1);
      const r = inner + (k - 0.35) * COMBO_GLOW.spread * px;
      const a = Math.max(0, 1 - Math.abs(k - 0.35) / 0.65) ** 2;
      g.strokeStyle = `rgba(255,200,110,${a * 0.18})`;
      g.lineWidth = COMBO_GLOW.spread * px * 0.12;
      const rr = TABLE.holeRadius * px + (k - 0.35) * COMBO_GLOW.spread * px;
      g.beginPath();
      g.roundRect(c - r, c - r, 2 * r, 2 * r, Math.max(1, rr));
      g.stroke();
    }
    this.tex = new THREE.CanvasTexture(cv);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: this.tex,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.mesh.position.y = COMBO_GLOW.y;
    this.mesh.renderOrder = 4;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  set(streak: number, atRisk: boolean, reduced: boolean): void {
    if (streak < 2) this.target = 0;
    else {
      const level = Math.min(streak, COMBO_GLOW.maxStreak) - 1;
      this.target = (COMBO_GLOW.base + COMBO_GLOW.perStreak * level) * (atRisk ? COMBO_GLOW.riskFactor : 1);
    }
    if (reduced) this.target *= COMBO_GLOW.reducedFactor;
  }

  update(dt: number, time: number): void {
    const m = this.mesh.material;
    const pulse = 1 - COMBO_GLOW.pulse + COMBO_GLOW.pulse * Math.sin(time * COMBO_GLOW.pulseSpeed);
    m.opacity += (this.target * pulse - m.opacity) * damp(COMBO_GLOW.rate, dt);
    this.mesh.visible = m.opacity > 0.005;
  }

  /** Show once at boot so its texture uploads and shader compiles before the first combo. */
  warmup(on: boolean): void {
    this.mesh.visible = on;
  }

  dispose(): void {
    this.mesh.removeFromParent();
    this.mesh.geometry.dispose();
    this.mesh.material.dispose();
    this.tex.dispose();
  }
}
