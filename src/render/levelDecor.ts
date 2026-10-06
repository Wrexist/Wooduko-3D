import * as THREE from 'three';
import { BOARD, COLORS, JOURNEY_FX, WORLD } from '../config';
import { easeOutCubic } from '../fx/tween';
import type { Tweens } from '../fx/tween';
import type { Sparkles } from '../fx/particles';
import { linearColor } from './color';

const N = BOARD.size;

/**
 * Journey decor: gems lying in board cells (hidden inside a block once one covers them) that
 * spin and bob, and fly up when a clear collects them. Crates are ordinary blocks with a darker
 * stain (see World.crates). Holds no rules: the store says which gems are left.
 */
export class LevelDecor {
  private readonly geo = new THREE.OctahedronGeometry(JOURNEY_FX.gemSize, 0);
  private readonly mat = new THREE.MeshStandardMaterial({
    color: linearColor(COLORS.gem),
    emissive: linearColor(COLORS.gemGlow),
    emissiveIntensity: JOURNEY_FX.gemGlow,
    roughness: 0.25,
    metalness: 0.1,
    flatShading: true,
  });
  private readonly gems = new Map<number, THREE.Mesh>();
  /** Soft additive glow under each gem, so they read from any camera angle. */
  private readonly glowGeo = new THREE.PlaneGeometry(0.9, 0.9).rotateX(-Math.PI / 2);
  private readonly glowMat = new THREE.MeshBasicMaterial({
    map: radialTexture(),
    color: new THREE.Color(COLORS.gem),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private readonly glows = new Map<number, THREE.Mesh>();
  /** Crossed planks on crate tops. */
  private readonly markGeo = new THREE.PlaneGeometry(0.78, 0.78).rotateX(-Math.PI / 2);
  private readonly markMat = new THREE.MeshBasicMaterial({
    map: crateTexture(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  private readonly marks = new Map<number, THREE.Mesh>();
  private readonly flying = new Set<THREE.Mesh>();

  constructor(
    private readonly scene: THREE.Scene,
    private readonly tweens: Tweens,
    private readonly sparkles: Sparkles,
  ) {}

  /** Crossed-plank marks on the crates still on the board. */
  setCrates(keys: readonly number[]): void {
    const want = new Set(keys);
    for (const [k, m] of this.marks)
      if (!want.has(k)) {
        m.removeFromParent();
        this.marks.delete(k);
      }
    for (const k of keys) {
      if (this.marks.has(k)) continue;
      const m = new THREE.Mesh(this.markGeo, this.markMat);
      const [x, z] = cellCentre(k);
      m.position.set(x, WORLD.topY, z);
      m.renderOrder = 2;
      this.scene.add(m);
      this.marks.set(k, m);
    }
  }

  /** Show exactly these gems (board keys r·9+c); others are removed without a fuss. */
  setGems(keys: readonly number[]): void {
    const want = new Set(keys);
    for (const [k, m] of this.gems) if (!want.has(k)) this.remove(k, m);
    for (const [k, g] of this.glows)
      if (!want.has(k)) {
        g.removeFromParent();
        this.glows.delete(k);
      }
    for (const k of keys) {
      if (this.gems.has(k)) continue;
      const m = new THREE.Mesh(this.geo, this.mat);
      const [x, z] = cellCentre(k);
      m.position.set(x, WORLD.baseY + JOURNEY_FX.gemLift, z);
      m.castShadow = true;
      m.userData.phase = k * 0.7;
      this.scene.add(m);
      this.gems.set(k, m);
      const g = new THREE.Mesh(this.glowGeo, this.glowMat);
      g.position.set(x, WORLD.ghostY + 0.004, z);
      g.renderOrder = 2;
      this.scene.add(g);
      this.glows.set(k, g);
    }
  }

  /** Gems collected by a clear rise, spin up and pop in a burst of sparkles. */
  collect(keys: readonly number[], delay: number): void {
    keys.forEach((k, i) => {
      const m = this.gems.get(k);
      if (!m) return;
      this.gems.delete(k);
      this.glows.get(k)?.removeFromParent();
      this.glows.delete(k);
      this.flying.add(m);
      const from = m.position.clone();
      this.tweens.add({
        delay: delay + i * JOURNEY_FX.gemStagger,
        dur: JOURNEY_FX.gemFly,
        update: (_e, t) => {
          const e = easeOutCubic(t);
          m.position.set(from.x, from.y + e * JOURNEY_FX.gemRise, from.z - e * 0.6);
          m.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.8);
          m.rotation.y += 0.35;
        },
        done: () => {
          this.sparkles.emit(m.position.x, m.position.y, m.position.z, 1.4, 0, 0, 0);
          m.removeFromParent();
          this.flying.delete(m);
        },
      });
    });
  }

  update(time: number): void {
    for (const m of this.gems.values()) {
      const p = m.userData.phase as number;
      m.rotation.y = time * JOURNEY_FX.gemSpin + p;
      m.position.y = WORLD.baseY + JOURNEY_FX.gemLift + Math.sin(time * 2.2 + p) * JOURNEY_FX.gemBob;
    }
  }

  clear(): void {
    for (const [k, m] of this.gems) this.remove(k, m);
    this.setCrates([]);
    for (const g of this.glows.values()) g.removeFromParent();
    this.glows.clear();
    for (const m of this.flying) m.removeFromParent();
    this.flying.clear();
  }

  private remove(k: number, m: THREE.Mesh): void {
    m.removeFromParent();
    this.gems.delete(k);
  }

  dispose(): void {
    this.clear();
    this.geo.dispose();
    this.mat.dispose();
    this.glowGeo.dispose();
    this.glowMat.map?.dispose();
    this.glowMat.dispose();
    this.markGeo.dispose();
    this.markMat.map?.dispose();
    this.markMat.dispose();
  }
}

/** World x/z of a board key's cell centre. */
export function cellCentre(k: number): [number, number] {
  return [WORLD.x0 + (k % N) + 0.5, WORLD.z0 + Math.floor(k / N) + 0.5];
}

/** Soft round glow (white centre → transparent edge). */
function radialTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  if (g) {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    r.addColorStop(0, 'rgba(255,255,255,1)');
    r.addColorStop(0.45, 'rgba(255,255,255,0.35)');
    r.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Two dark crossed planks with nail heads: reads as "crate" on top of a stained block. */
function crateTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  if (g) {
    g.lineCap = 'round';
    for (const [w, col] of [
      [20, 'rgba(30,14,6,0.55)'],
      [13, 'rgba(150,96,58,0.95)'],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = w;
      g.beginPath();
      g.moveTo(22, 22);
      g.lineTo(106, 106);
      g.moveTo(106, 22);
      g.lineTo(22, 106);
      g.stroke();
    }
    g.fillStyle = 'rgba(40,24,14,0.9)';
    for (const [x, y] of [
      [26, 26],
      [102, 26],
      [26, 102],
      [102, 102],
      [64, 64],
    ] as const)
      g.fillRect(x - 3, y - 3, 6, 6);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
