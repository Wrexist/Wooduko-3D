import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BLOCK, CAMERA_VIEWS, CHECKERS, RENDER, TABLE } from '../config';
import type { LayoutSpec } from '../config';
import { colOf, isDark, rowOf, SIZE } from '../core/checkers';
import type { CBoard } from '../core/checkers';
import { easeInQuad, easeOutCubic } from '../fx/tween';
import { createCamera, fitCamera } from './camera';
import { linearColor } from './color';
import { addLights } from './lights';
import type { Textures } from './textures';

/** One hop of an animated move: a step or a jump (`cap` = square of the jumped disc, or −1). */
export interface CStep {
  readonly from: number;
  readonly to: number;
  readonly cap: number;
  /** Crowned on landing. */
  readonly crown: boolean;
}

interface Disc {
  readonly group: THREE.Group;
  /** Crown inlay (shown on kings). */
  readonly crown: THREE.Mesh;
  /** +1 player, −1 computer. */
  readonly side: number;
}

interface Running {
  readonly steps: readonly CStep[];
  i: number;
  t: number;
  readonly onStep: (s: CStep) => void;
  readonly onDone: () => void;
}

/** A jumped disc sinking away. Its materials are its own (clones), so the fade can't touch others. */
interface Fading {
  readonly group: THREE.Group;
  t: number;
}

const POOL = 16;
const centre = (i: number): number => i - SIZE / 2 + 0.5;

/** The rim of a disc: a lathe of a rounded rectangle profile (the top is a separate cap). */
export function rimGeometry(): THREE.LatheGeometry {
  const { radius: R, height: H, edge: e } = CHECKERS;
  const pts: THREE.Vector2[] = [new THREE.Vector2(R - e, 0)];
  const arc = (cx: number, cy: number, a0: number, a1: number): void => {
    for (let k = 1; k <= 4; k++) {
      const a = a0 + ((a1 - a0) * k) / 4;
      pts.push(new THREE.Vector2(cx + Math.cos(a) * e, cy + Math.sin(a) * e));
    }
  };
  arc(R - e, e, -Math.PI / 2, 0);
  pts.push(new THREE.Vector2(R, H - e));
  arc(R - e, H - e, 0, Math.PI / 2);
  return new THREE.LatheGeometry(pts, 48);
}

/** The slab with a carved 8×8 board: light squares under, dark squares (one merged mesh) on top. */
export function buildBoard(tex: Textures, table: THREE.Group, lightHex: number, darkHex: number): void {
  const g = CHECKERS.wallGap + TABLE.bevel;
  const h = SIZE / 2 + g;
  const T = TABLE.halfSize;
  const s = new THREE.Shape();
  s.moveTo(-T, -T);
  s.lineTo(T, -T);
  s.lineTo(T, T);
  s.lineTo(-T, T);
  s.lineTo(-T, -T);
  const hole = new THREE.Path();
  hole.moveTo(-h, -h);
  hole.lineTo(-h, h);
  hole.lineTo(h, h);
  hole.lineTo(h, -h);
  hole.lineTo(-h, -h);
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
  // light squares: one plane under everything; dark squares: one merged mesh on top
  const lightGeo = new THREE.PlaneGeometry(SIZE + 0.4, SIZE + 0.4).rotateX(-Math.PI / 2);
  const light = new THREE.Mesh(
    lightGeo,
    new THREE.MeshStandardMaterial({
      map: tex.side,
      color: linearColor(lightHex),
      roughness: TABLE.boardRoughness,
    }),
  );
  light.position.y = CHECKERS.floorY;
  light.receiveShadow = true;
  const parts: THREE.BufferGeometry[] = [];
  for (let r = 0; r < SIZE; r++)
    for (let c = 0; c < SIZE; c++)
      if (isDark(r, c))
        parts.push(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2).translate(centre(c), 0, centre(r)));
  const darkGeo = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  const dark = new THREE.Mesh(
    darkGeo,
    new THREE.MeshStandardMaterial({
      map: tex.side,
      color: linearColor(darkHex),
      roughness: TABLE.boardRoughness,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  dark.position.y = CHECKERS.floorY + 0.001;
  dark.receiveShadow = true;
  table.add(slab, light, dark);
}

/**
 * Checkers scene: a slab with a carved 8×8 board, wooden discs, and flat markers for moves.
 * Holds no rules: the controller says what is where; the scene animates hops it is given.
 */
export class CheckersScene {
  readonly scene = new THREE.Scene();
  readonly camera = createCamera();
  private readonly disposeLights: () => void;
  private readonly table = new THREE.Group();
  private readonly discs = new Map<number, Disc>();
  private readonly fading: Fading[] = [];
  private run: Running | null = null;
  // shared geometry and materials (disposed once, in dispose())
  private readonly rimGeo = rimGeometry();
  private readonly capGeo: THREE.CircleGeometry;
  private readonly grooveGeo: THREE.RingGeometry;
  private readonly crownGeo: THREE.RingGeometry;
  private readonly dotGeo = new THREE.CircleGeometry(0.17, 32).rotateX(-Math.PI / 2);
  private readonly squareGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly mats: Record<'rim' | 'cap', [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial]>;
  private readonly grooveMat: THREE.MeshBasicMaterial;
  private readonly crownMat: THREE.MeshStandardMaterial;
  private readonly dotMat: THREE.MeshBasicMaterial;
  private readonly mustMat: THREE.MeshBasicMaterial;
  private readonly lastMat: THREE.MeshBasicMaterial;
  private readonly dots: THREE.Mesh[] = [];
  private readonly musts: THREE.Mesh[] = [];
  private readonly lasts: THREE.Mesh[] = [];
  /** The selected disc's square (lit). */
  private readonly selSquare: THREE.Mesh;
  private readonly selMat: THREE.MeshBasicMaterial;
  private time = 0;
  /** Square shown as the hint target (its dot pulses), or −1. */
  private hintTo = -1;
  private readonly camPos = new THREE.Vector3();
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hitPoint = new THREE.Vector3();

  constructor(private readonly tex: Textures) {
    this.scene.background = new THREE.Color(RENDER.background);
    this.disposeLights = addLights(this.scene);
    this.scene.add(this.table);
    const { radius: R, height: H, edge: e } = CHECKERS;
    this.capGeo = new THREE.CircleGeometry(R - e, 48).rotateX(-Math.PI / 2).translate(0, H, 0);
    this.grooveGeo = new THREE.RingGeometry(R * 0.62, R * 0.7, 48)
      .rotateX(-Math.PI / 2)
      .translate(0, H + 0.002, 0);
    this.crownGeo = new THREE.RingGeometry(R * 0.3, R * 0.5, 48)
      .rotateX(-Math.PI / 2)
      .translate(0, H + 0.003, 0);
    const disc = (
      map: THREE.Texture,
      normal: THREE.Texture,
      tint: readonly [number, number, number],
      rough: number,
    ) => {
      const m = new THREE.MeshStandardMaterial({
        map,
        normalMap: normal,
        normalScale: new THREE.Vector2(BLOCK.normalScaleTop, BLOCK.normalScaleTop),
        roughness: rough,
        metalness: 0,
      });
      m.color.setRGB(...tint);
      return m;
    };
    this.mats = {
      rim: [
        disc(tex.side, tex.sideNormal, CHECKERS.playerTint, BLOCK.roughnessSide),
        disc(tex.side, tex.sideNormal, CHECKERS.computerTint, BLOCK.roughnessSide),
      ],
      cap: [
        disc(tex.ring, tex.ringNormal, CHECKERS.playerTint, BLOCK.roughnessTop),
        disc(tex.ring, tex.ringNormal, CHECKERS.computerTint, BLOCK.roughnessTop),
      ],
    };
    this.grooveMat = new THREE.MeshBasicMaterial({
      color: 0x000000,
      transparent: true,
      opacity: 0.22,
      depthWrite: false,
    });
    this.crownMat = new THREE.MeshStandardMaterial({
      color: linearColor(CHECKERS.crown),
      roughness: 0.4,
      metalness: 0.1,
    });
    const flat = (opacity: number) =>
      new THREE.MeshBasicMaterial({
        color: linearColor(CHECKERS.marker),
        transparent: true,
        opacity,
        // markers keep their exact colour (no tone mapping), so they read on any wood
        toneMapped: false,
        depthWrite: false,
      });
    this.dotMat = flat(CHECKERS.dotOpacity);
    this.mustMat = flat(CHECKERS.mustOpacity);
    this.lastMat = flat(CHECKERS.lastOpacity);
    const floorY = CHECKERS.floorY;
    const pool = (
      list: THREE.Mesh[],
      geo: THREE.BufferGeometry,
      mat: THREE.Material,
      y: number,
      n: number,
    ) => {
      for (let i = 0; i < n; i++) {
        const m = new THREE.Mesh(geo, mat);
        m.position.y = y;
        m.visible = false;
        m.renderOrder = 2;
        this.scene.add(m);
        list.push(m);
      }
    };
    pool(this.lasts, this.squareGeo, this.lastMat, floorY + 0.01, 2);
    pool(this.musts, this.squareGeo, this.mustMat, floorY + 0.012, POOL);
    pool(this.dots, this.dotGeo, this.dotMat, floorY + 0.016, POOL);
    this.selMat = flat(CHECKERS.selOpacity);
    this.selSquare = new THREE.Mesh(this.squareGeo, this.selMat);
    this.selSquare.position.y = floorY + 0.014;
    this.selSquare.visible = false;
    this.selSquare.renderOrder = 2;
    this.scene.add(this.selSquare);
    this.buildTable();
  }

  setBackground(color: string): void {
    (this.scene.background as THREE.Color).set(color);
  }

  get busy(): boolean {
    return this.run !== null;
  }

  /** Put every disc where the board says (no animation). */
  sync(b: CBoard): void {
    this.run = null;
    for (const d of this.discs.values()) this.removeDisc(d);
    this.discs.clear();
    for (let s = 0; s < b.length; s++) {
      const v = b[s] ?? 0;
      if (!v) continue;
      const d = this.makeDisc(Math.sign(v));
      d.crown.visible = Math.abs(v) === 2;
      this.discs.set(s, d);
      this.place(s, 0);
    }
  }

  /** A disc at its square, lifted by `lift`. */
  place(s: number, lift: number): void {
    const d = this.discs.get(s);
    d?.group.position.set(centre(colOf(s)), CHECKERS.floorY + lift, centre(rowOf(s)));
  }

  /** A disc following the finger: board position in squares (fractional, 0..8). */
  hover(s: number, col: number, row: number, lift: number): void {
    const d = this.discs.get(s);
    d?.group.position.set(col - SIZE / 2, CHECKERS.floorY + lift, row - SIZE / 2);
  }

  /** Animate hops one after another; `onStep` after each landing, `onDone` after the last. */
  animate(steps: readonly CStep[], onStep: (s: CStep) => void, onDone: () => void): void {
    if (!steps.length) {
      onDone();
      return;
    }
    this.run = { steps, i: 0, t: 0, onStep, onDone };
  }

  /** A disc let go on its new square (no hop): jump and crown at once. */
  drop(s: CStep): void {
    const d = this.discs.get(s.from);
    if (!d) return;
    if (s.cap >= 0) this.capture(s.cap);
    this.discs.delete(s.from);
    this.discs.set(s.to, d);
    this.place(s.to, 0);
    if (s.crown) d.crown.visible = true;
  }

  /** Markers: move dots, the selected disc's ring, rings on discs that must capture, last move. */
  mark(o: {
    dots: readonly number[];
    sel: number;
    must: readonly number[];
    last: readonly number[];
    hint: number;
  }): void {
    const put = (list: THREE.Mesh[], squares: readonly number[]) =>
      list.forEach((m, i) => {
        const s = squares[i];
        m.visible = s !== undefined;
        if (s !== undefined) m.position.set(centre(colOf(s)), m.position.y, centre(rowOf(s)));
        m.scale.setScalar(1);
      });
    put(this.dots, o.dots);
    put(this.musts, o.must);
    put(this.lasts, o.last);
    this.selSquare.visible = o.sel >= 0;
    if (o.sel >= 0)
      this.selSquare.position.set(centre(colOf(o.sel)), this.selSquare.position.y, centre(rowOf(o.sel)));
    this.hintTo = o.hint;
  }

  update(dt: number): void {
    this.time += dt;
    // the hint dot and the "must capture" rings breathe, so they're noticed without shouting
    const pulse = 1 + Math.sin(this.time * 6) * 0.12;
    for (const m of this.dots)
      if (m.visible && this.hintTo >= 0)
        m.scale.setScalar(
          Math.abs(m.position.x - centre(colOf(this.hintTo))) < 0.01 &&
            Math.abs(m.position.z - centre(rowOf(this.hintTo))) < 0.01
            ? pulse * 1.25
            : 1,
        );
    this.mustMat.opacity = CHECKERS.mustOpacity * (0.75 + 0.25 * Math.sin(this.time * 4));
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i];
      if (!f) continue;
      f.t = Math.min(1, f.t + dt / CHECKERS.captureFade);
      f.group.position.y = CHECKERS.floorY - easeInQuad(f.t) * CHECKERS.height;
      f.group.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (mat) mat.opacity = 1 - f.t;
      });
      if (f.t >= 1) {
        this.disposeOwned(f.group);
        this.fading.splice(i, 1);
      }
    }
    this.stepRun(dt);
  }

  private stepRun(dt: number): void {
    const r = this.run;
    if (!r) return;
    const s = r.steps[r.i];
    if (!s) return;
    const jump = s.cap >= 0;
    const dur = jump ? CHECKERS.jumpDuration : CHECKERS.stepDuration;
    const before = r.t;
    r.t = Math.min(1, r.t + dt / dur);
    const d = this.discs.get(s.from);
    if (d) {
      const k = easeOutCubic(r.t);
      const x0 = centre(colOf(s.from));
      const z0 = centre(rowOf(s.from));
      const x1 = centre(colOf(s.to));
      const z1 = centre(rowOf(s.to));
      const hop = (jump ? CHECKERS.jumpHop : CHECKERS.stepHop) * Math.sin(Math.PI * r.t);
      d.group.position.set(x0 + (x1 - x0) * k, CHECKERS.floorY + hop, z0 + (z1 - z0) * k);
    }
    // the jumped disc goes as the jumper passes over it
    if (jump && before < 0.5 && r.t >= 0.5) this.capture(s.cap);
    if (r.t < 1) return;
    if (d) {
      this.discs.delete(s.from);
      this.discs.set(s.to, d);
      this.place(s.to, 0);
      if (s.crown) d.crown.visible = true;
    }
    r.i++;
    r.t = 0;
    r.onStep(s);
    if (r.i >= r.steps.length && this.run === r) {
      this.run = null;
      r.onDone();
    }
  }

  private capture(s: number): void {
    const d = this.discs.get(s);
    if (!d) return;
    this.discs.delete(s);
    // own clones, so fading this disc leaves the shared materials alone
    d.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = (m.material as THREE.Material).clone();
      mat.transparent = true;
      m.material = mat;
    });
    d.group.userData.owned = true;
    this.fading.push({ group: d.group, t: 0 });
  }

  /** Screen point → square (or −1), on the plane of the disc tops. */
  squareAt(x: number, y: number, width: number, height: number): number {
    const p = this.pointSquares(x, y, width, height);
    if (!p) return -1;
    const c = Math.floor(p.col);
    const r = Math.floor(p.row);
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return -1;
    return r * SIZE + c;
  }

  /** Screen point → board position in squares (fractional), on the plane of the disc tops. */
  pointSquares(x: number, y: number, width: number, height: number): { col: number; row: number } | null {
    this.ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    this.plane.constant = -(CHECKERS.floorY + CHECKERS.height);
    if (!this.ray.ray.intersectPlane(this.plane, this.hitPoint)) return null;
    return { col: this.hitPoint.x + SIZE / 2, row: this.hitPoint.z + SIZE / 2 };
  }

  resize(width: number, height: number, topPx: number, bottomPx: number, leftPx = 0): void {
    const m = SIZE / 2 + CHECKERS.wallGap + TABLE.bevel + 0.3;
    const spec: LayoutSpec = {
      landscape: false,
      slots: [],
      hit: [0, 0],
      bounds: { x0: -m, x1: m, z0: -m, z1: m },
      dealFromX: 0,
      padTop: CHECKERS.padTop,
      padBottom: CHECKERS.padBottom,
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
      leftPx,
      dir,
    );
  }

  private makeDisc(side: number): Disc {
    const k = side > 0 ? 0 : 1;
    const group = new THREE.Group();
    const rim = new THREE.Mesh(this.rimGeo, this.mats.rim[k]);
    const cap = new THREE.Mesh(this.capGeo, this.mats.cap[k]);
    const groove = new THREE.Mesh(this.grooveGeo, this.grooveMat);
    const crown = new THREE.Mesh(this.crownGeo, this.crownMat);
    rim.castShadow = true;
    cap.castShadow = true;
    rim.receiveShadow = true;
    cap.receiveShadow = true;
    crown.visible = false;
    group.add(rim, cap, groove, crown);
    this.scene.add(group);
    return { group, crown, side };
  }

  private removeDisc(d: Disc): void {
    d.group.removeFromParent();
    if (d.group.userData.owned) this.disposeOwned(d.group);
  }

  /** Free a faded disc's cloned materials (geometry is shared). */
  private disposeOwned(g: THREE.Group): void {
    g.removeFromParent();
    g.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) (m.material as THREE.Material).dispose();
    });
  }

  private buildTable(): void {
    buildBoard(this.tex, this.table, CHECKERS.light, CHECKERS.dark);
  }

  dispose(): void {
    this.run = null;
    for (const d of this.discs.values()) this.removeDisc(d);
    this.discs.clear();
    for (const f of this.fading) this.disposeOwned(f.group);
    this.fading.length = 0;
    for (const child of [...this.table.children]) {
      const m = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      m.removeFromParent();
      m.geometry.dispose();
      m.material.dispose();
    }
    for (const g of [this.rimGeo, this.capGeo, this.grooveGeo, this.crownGeo, this.dotGeo, this.squareGeo])
      g.dispose();
    for (const m of [
      ...this.mats.rim,
      ...this.mats.cap,
      this.grooveMat,
      this.crownMat,
      this.dotMat,
      this.mustMat,
      this.selMat,
      this.lastMat,
    ])
      m.dispose();
    this.disposeLights();
  }
}
