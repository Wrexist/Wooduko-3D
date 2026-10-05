import * as THREE from 'three';
import { COLORS, FX, SPARKS } from '../config';
import { linearColor } from '../render/color';
import type { Textures } from '../render/textures';

/** One pooled additive point cloud. Dead particles have colour 0; updates stop when none live. */
export class Sparkles {
  readonly points: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>;
  private readonly pos = new Float32Array(SPARKS.count * 3);
  private readonly col = new Float32Array(SPARKS.count * 3);
  private readonly vel = new Float32Array(SPARKS.count * 3);
  private readonly rgb = new Float32Array(SPARKS.count * 3);
  private readonly age = new Float32Array(SPARKS.count).fill(1);
  private readonly life = new Float32Array(SPARKS.count);
  private head = 0;
  /** Frames left to update after the last particle died (to zero the colours). */
  private live = 0;

  constructor(scene: THREE.Scene, tex: Textures) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: SPARKS.size,
        map: tex.spark,
        vertexColors: true,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
      }),
    );
    this.points.frustumCulled = false;
    this.points.renderOrder = 6;
    scene.add(this.points);
  }

  emit(x: number, y: number, z: number, n: number, speed: number, up: number, spread: number): void {
    for (let k = 0; k < n; k++) {
      const i = this.head;
      const i3 = i * 3;
      this.head = (this.head + 1) % SPARKS.count;
      this.pos[i3] = x + (Math.random() - 0.5) * spread;
      this.pos[i3 + 1] = y;
      this.pos[i3 + 2] = z + (Math.random() - 0.5) * spread;
      const a = Math.random() * Math.PI * 2;
      const sp = speed * (SPARKS.speedMin + Math.random() * SPARKS.speedRand);
      this.vel[i3] = Math.cos(a) * sp;
      this.vel[i3 + 1] = up * (SPARKS.upMin + Math.random() * SPARKS.upRand);
      this.vel[i3 + 2] = Math.sin(a) * sp;
      const c = COLORS.sparks[Math.floor(Math.random() * COLORS.sparks.length)] ?? COLORS.sparks[0];
      this.rgb[i3] = c[0];
      this.rgb[i3 + 1] = c[1];
      this.rgb[i3 + 2] = c[2];
      this.age[i] = 0;
      this.life[i] = SPARKS.lifeMin + Math.random() * SPARKS.lifeRand;
    }
    this.live = 2;
  }

  update(dt: number): void {
    if (!this.live) return;
    let alive = 0;
    const drag = Math.exp(-dt * SPARKS.drag);
    const { pos, col, vel, rgb, age, life } = this;
    for (let i = 0; i < SPARKS.count; i++) {
      const i3 = i * 3;
      const a = age[i] ?? 1;
      const l = life[i] ?? 0;
      if (a >= l) {
        if (col[i3] !== 0) col[i3] = col[i3 + 1] = col[i3 + 2] = 0;
        continue;
      }
      alive++;
      const na = a + dt;
      age[i] = na;
      const vx = (vel[i3] ?? 0) * drag;
      const vy = (vel[i3 + 1] ?? 0) * drag - SPARKS.gravity * dt;
      const vz = (vel[i3 + 2] ?? 0) * drag;
      vel[i3] = vx;
      vel[i3 + 1] = vy;
      vel[i3 + 2] = vz;
      pos[i3] = (pos[i3] ?? 0) + vx * dt;
      pos[i3 + 1] = (pos[i3 + 1] ?? 0) + vy * dt;
      pos[i3 + 2] = (pos[i3 + 2] ?? 0) + vz * dt;
      const f = Math.max(0, 1 - na / l);
      const tw = f * f * (1 - SPARKS.twinkleDepth + SPARKS.twinkleDepth * Math.sin(na * SPARKS.twinkle + i));
      col[i3] = (rgb[i3] ?? 0) * tw;
      col[i3 + 1] = (rgb[i3 + 1] ?? 0) * tw;
      col[i3 + 2] = (rgb[i3 + 2] ?? 0) * tw;
    }
    const geo = this.points.geometry;
    (geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (geo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
    if (!alive) this.live--;
  }

  get alive(): boolean {
    return this.live > 0;
  }

  dispose(): void {
    this.points.removeFromParent();
    this.points.geometry.dispose();
    this.points.material.dispose();
  }
}

interface Chip {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  sx: number;
  sy: number;
  life: number;
  age: number;
  on: boolean;
}

/** Pooled wood splinters that burst out of popping blocks, bounce and fade. */
export class Chips {
  private readonly geo = new THREE.BoxGeometry(...FX.chipSize);
  private readonly mat: THREE.MeshStandardMaterial;
  private readonly pool: Chip[] = [];
  private next = 0;
  private active = 0;

  constructor(scene: THREE.Scene, tex: Textures) {
    this.mat = new THREE.MeshStandardMaterial({
      map: tex.side,
      color: linearColor(COLORS.chip),
      roughness: FX.chipRoughness,
    });
    for (let i = 0; i < FX.chipPool; i++) {
      const mesh = new THREE.Mesh(this.geo, this.mat);
      mesh.castShadow = true;
      mesh.visible = false;
      scene.add(mesh);
      this.pool.push({ mesh, vx: 0, vy: 0, vz: 0, sx: 0, sy: 0, life: 0, age: 0, on: false });
    }
  }

  spawn(x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const c = this.pool[this.next];
      this.next = (this.next + 1) % this.pool.length;
      if (!c) continue;
      if (!c.on) this.active++;
      c.on = true;
      c.mesh.visible = true;
      c.mesh.position.set(
        x + (Math.random() - 0.5) * FX.chipSpawnSpread,
        y + FX.chipSpawnLift,
        z + (Math.random() - 0.5) * FX.chipSpawnSpread,
      );
      c.mesh.rotation.set(
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
        Math.random() * Math.PI * 2,
      );
      c.mesh.scale.setScalar(1);
      const a = Math.random() * Math.PI * 2;
      const sp = FX.chipSpeedMin + Math.random() * FX.chipSpeedRand;
      c.vx = Math.cos(a) * sp;
      c.vz = Math.sin(a) * sp;
      c.vy = FX.chipUpMin + Math.random() * FX.chipUpRand;
      c.sx = (Math.random() - 0.5) * FX.chipSpinMax;
      c.sy = (Math.random() - 0.5) * FX.chipSpinMax;
      c.life = FX.chipLifeMin + Math.random() * FX.chipLifeRand;
      c.age = 0;
    }
  }

  update(dt: number): void {
    if (!this.active) return;
    for (const c of this.pool) {
      if (!c.on) continue;
      const p = c.mesh.position;
      c.age += dt;
      c.vy -= FX.chipGravity * dt;
      p.x += c.vx * dt;
      p.y += c.vy * dt;
      p.z += c.vz * dt;
      if (p.y < FX.chipFloorY) {
        p.y = FX.chipFloorY;
        c.vy *= -FX.chipBounce;
        c.vx *= FX.chipFriction;
        c.vz *= FX.chipFriction;
        c.sx *= FX.chipSpinBounce;
        c.sy *= FX.chipSpinBounce;
      }
      c.mesh.rotation.x += c.sx * dt;
      c.mesh.rotation.y += c.sy * dt;
      const s = c.age > c.life - FX.chipFade ? Math.max(0.001, (c.life - c.age) / FX.chipFade) : 1;
      c.mesh.scale.setScalar(s);
      if (c.age >= c.life) {
        c.on = false;
        c.mesh.visible = false;
        this.active--;
      }
    }
  }

  /** Show one chip so its shader compiles at boot. */
  warmup(on: boolean): void {
    const c = this.pool[0];
    if (c && !c.on) c.mesh.visible = on;
  }

  dispose(): void {
    for (const c of this.pool) c.mesh.removeFromParent();
    this.geo.dispose();
    this.mat.dispose();
  }
}
