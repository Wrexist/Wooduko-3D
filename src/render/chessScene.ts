import * as THREE from 'three';
import { BLOCK, CHECKERS, CHESS, FX, RENDER, TABLE } from '../config';
import type { LayoutSpec } from '../config';
import { Sparkles } from '../fx/particles';
import { easeInOutCubic, easeInQuad } from '../fx/tween';
import { createCamera, fitCamera } from './camera';
import { buildBoard } from './checkersScene';
import { pieceGeometries } from './chessPieces';
import { linearColor } from './color';
import { addLights } from './lights';
import type { Textures } from './textures';

const SIZE = 8;
const POOL = 28;
const centre = (i: number): number => i - SIZE / 2 + 0.5;
const rowOf = (s: number): number => s >> 3;
const colOf = (s: number): number => s & 7;

/** An arrow on the board (squares 0..63) in a colour (sRGB hex). */
export interface ChessArrow {
  readonly from: number;
  readonly to: number;
  readonly color: number;
}

/** Board coordinates in the square corners (files on the bottom row, ranks on the left file). */
function coordTexture(): THREE.CanvasTexture {
  const px = 128;
  const c = document.createElement('canvas');
  c.width = c.height = px * SIZE;
  const g = c.getContext('2d');
  if (g) {
    g.font = `800 ${px * 0.24}px "DM Sans", system-ui, sans-serif`;
    // deep brown on light squares, cream on dark ones (the square tints alone are too close)
    const ink = (dark: boolean): string => (dark ? CHESS.coordOnDark : CHESS.coordOnLight);
    for (let i = 0; i < SIZE; i++) {
      g.fillStyle = ink(i % 2 === 1);
      g.textAlign = 'left';
      g.textBaseline = 'top';
      g.fillText(String(SIZE - i), px * 0.07, i * px + px * 0.05);
      g.fillStyle = ink((SIZE - 1 + i) % 2 === 1);
      g.textAlign = 'right';
      g.textBaseline = 'bottom';
      g.fillText(String.fromCharCode(97 + i), i * px + px * 0.94, SIZE * px - px * 0.04);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

/** A flat arrow along +x from 0 to `len` (squares), lying on the board. */
function arrowGeometry(len: number): THREE.ShapeGeometry {
  const w = CHESS.arrowWidth / 2;
  const hw = CHESS.arrowHead / 2;
  const hl = Math.min(CHESS.arrowHeadLength, len * 0.6);
  const start = CHESS.arrowInset;
  const shape = new THREE.Shape();
  shape.moveTo(start, -w);
  shape.lineTo(len - hl, -w);
  shape.lineTo(len - hl, -hw);
  shape.lineTo(len, 0);
  shape.lineTo(len - hl, hw);
  shape.lineTo(len - hl, w);
  shape.lineTo(start, w);
  shape.closePath();
  return new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
}

/** One move on screen (squares are 0..63, row 0 at the top). */
export interface ChessAnim {
  readonly from: number;
  readonly to: number;
  /** Square of the piece taken (differs from `to` en passant), or −1. */
  readonly cap: number;
  /** Castling: the rook's move, or −1. */
  readonly rookFrom: number;
  readonly rookTo: number;
  /** Promotion: the new piece type, or 0. */
  readonly promo: number;
  /** A knight hops; everything else glides. */
  readonly hop: boolean;
}

/**
 * A piece: `group` sits on its square (or follows the finger), `tilt` leans with its velocity and
 * squashes when it lands (like a dragged block), `body` is the turned wood (knights turn to face).
 */
interface Piece {
  readonly group: THREE.Group;
  readonly tilt: THREE.Group;
  readonly body: THREE.Mesh;
  readonly white: boolean;
  /** Last frame's position (for the lean) and the landing settle (−1 = none). */
  readonly prev: THREE.Vector3;
  settle: number;
  sx: number;
  sz: number;
}

interface Running {
  readonly a: ChessAnim;
  t: number;
  taken: boolean;
  readonly done: () => void;
}

interface Fading {
  readonly group: THREE.Group;
  t: number;
}

/**
 * Chess scene: the carved board of Checkers with wooden discs, each with its piece burned into
 * the top (readable straight from above). Holds no rules; the controller says what moves.
 */
export class ChessScene {
  readonly scene = new THREE.Scene();
  readonly camera = createCamera();
  private readonly disposeLights: () => void;
  private readonly table = new THREE.Group();
  private readonly pieces = new Map<number, Piece>();
  private readonly fading: Fading[] = [];
  private run: Running | null = null;
  private readonly pieceGeos = pieceGeometries();
  /** Maple for you, walnut for the computer. */
  private readonly woodMats: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  /** The piece following the finger, and where it's heading. */
  private dragSq = -1;
  private readonly dragTarget = new THREE.Vector3();
  private readonly bodies: THREE.Object3D[] = [];
  private readonly coords: THREE.Mesh;
  private readonly arrowMeshes: THREE.Mesh<THREE.ShapeGeometry, THREE.MeshBasicMaterial>[] = [];
  /** Captured pieces beside the board: yours in front, the computer's behind. */
  private readonly trays = new THREE.Group();
  private trayKey = '';
  private readonly hits: THREE.Intersection[] = [];
  private readonly dotGeo = new THREE.CircleGeometry(0.16, 32).rotateX(-Math.PI / 2);
  private readonly ringGeo = new THREE.RingGeometry(0.41, 0.49, 48).rotateX(-Math.PI / 2);
  private readonly squareGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly dotMat: THREE.MeshBasicMaterial;
  private readonly selMat: THREE.MeshBasicMaterial;
  private readonly lastMat: THREE.MeshBasicMaterial;
  private readonly checkMat: THREE.MeshBasicMaterial;
  /** Coach: rings on your pieces that can be taken for free (or by something cheaper). */
  private readonly dangerMat: THREE.MeshBasicMaterial;
  /** A gold ring that sweeps out from a solved square. */
  private readonly waveMat: THREE.MeshBasicMaterial;
  private readonly wave: THREE.Mesh;
  private waveT = 1;
  private readonly dangers: THREE.Mesh[] = [];
  private readonly dots: THREE.Mesh[] = [];
  private readonly rings: THREE.Mesh[] = [];
  private readonly lasts: THREE.Mesh[] = [];
  private readonly selSquare: THREE.Mesh;
  private readonly checkSquare: THREE.Mesh;
  private time = 0;
  private hintTo = -1;
  /** Celebrations: sparkles, and a piece that bounces on its square. */
  private readonly sparkles: Sparkles;
  private bounceSq = -1;
  private bounceT = 1;
  private readonly projected = new THREE.Vector3();
  private readonly camPos = new THREE.Vector3();
  private readonly ray = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private readonly hitPoint = new THREE.Vector3();

  constructor(tex: Textures) {
    this.scene.background = new THREE.Color(RENDER.background);
    this.disposeLights = addLights(this.scene);
    this.scene.add(this.table);
    this.sparkles = new Sparkles(this.scene, tex);
    const wood = (tint: readonly [number, number, number]) => {
      const m = new THREE.MeshStandardMaterial({
        map: tex.side,
        normalMap: tex.sideNormal,
        normalScale: new THREE.Vector2(BLOCK.normalScaleTop, BLOCK.normalScaleTop),
        roughness: CHESS.pieceRoughness,
        metalness: 0,
      });
      m.color.setRGB(...tint);
      return m;
    };
    this.woodMats = [wood(CHESS.whiteTint), wood(CHESS.blackTint)];
    const flat = (hex: number, opacity: number) =>
      new THREE.MeshBasicMaterial({
        color: linearColor(hex),
        transparent: true,
        opacity,
        toneMapped: false,
        depthWrite: false,
      });
    this.dotMat = flat(CHECKERS.marker, CHECKERS.dotOpacity);
    this.selMat = flat(CHECKERS.marker, CHECKERS.selOpacity);
    this.lastMat = flat(CHECKERS.marker, CHECKERS.lastOpacity);
    this.checkMat = flat(CHESS.check, CHESS.checkOpacity);
    this.dangerMat = flat(CHESS.danger, CHESS.dangerOpacity);
    this.waveMat = flat(CHESS.wave, 0);
    this.waveMat.blending = THREE.AdditiveBlending;
    const y = CHECKERS.floorY;
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, dy: number): THREE.Mesh => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y + dy;
      m.visible = false;
      m.renderOrder = 2;
      this.scene.add(m);
      return m;
    };
    for (let i = 0; i < 2; i++) this.lasts.push(add(this.squareGeo, this.lastMat, 0.01));
    this.checkSquare = add(this.squareGeo, this.checkMat, 0.012);
    this.selSquare = add(this.squareGeo, this.selMat, 0.014);
    for (let i = 0; i < POOL; i++) this.dots.push(add(this.dotGeo, this.dotMat, 0.016));
    for (let i = 0; i < 16; i++) this.rings.push(add(this.ringGeo, this.dotMat, 0.016));
    for (let i = 0; i < 16; i++) this.dangers.push(add(this.ringGeo, this.dangerMat, 0.015));
    this.wave = add(this.ringGeo, this.waveMat, 0.03);
    this.wave.renderOrder = 5;
    buildBoard(tex, this.table, CHECKERS.light, CHECKERS.dark);
    this.coords = new THREE.Mesh(
      new THREE.PlaneGeometry(SIZE, SIZE).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({
        map: coordTexture(),
        transparent: true,
        opacity: CHESS.coordOpacity,
        depthWrite: false,
        toneMapped: false,
        // the dark squares are pulled forward with a polygon offset: pull the labels further
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    this.coords.position.y = CHECKERS.floorY + 0.004;
    this.coords.renderOrder = 1;
    this.scene.add(this.coords, this.trays);
  }

  /** Arrows on the board (the hint, the better move, a review's best move); [] clears them. */
  arrows(list: readonly ChessArrow[]): void {
    for (const m of this.arrowMeshes) {
      m.removeFromParent();
      m.geometry.dispose();
      m.material.dispose();
    }
    this.arrowMeshes.length = 0;
    for (const a of list) {
      const x0 = centre(colOf(a.from));
      const z0 = centre(rowOf(a.from));
      const dx = centre(colOf(a.to)) - x0;
      const dz = centre(rowOf(a.to)) - z0;
      const m = new THREE.Mesh(
        arrowGeometry(Math.hypot(dx, dz)),
        new THREE.MeshBasicMaterial({
          color: linearColor(a.color),
          transparent: true,
          opacity: CHESS.arrowOpacity,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      m.position.set(x0, CHECKERS.floorY + CHESS.arrowY, z0);
      m.rotation.y = -Math.atan2(dz, dx);
      m.renderOrder = 4;
      this.scene.add(m);
      this.arrowMeshes.push(m);
    }
  }

  /**
   * Captured pieces in two rows on the table: what you took (dark pieces) in front of the board,
   * what the computer took behind it. Types, most valuable first.
   */
  captured(byYou: readonly number[], byComputer: readonly number[]): void {
    const key = `${byYou.join('')}|${byComputer.join('')}`;
    if (key === this.trayKey) return;
    this.trayKey = key;
    for (const c of [...this.trays.children]) c.removeFromParent();
    const row = (types: readonly number[], white: boolean, z: number): void =>
      types.forEach((type, i) => {
        const m = new THREE.Mesh(this.pieceGeos[type - 1], this.woodMats[white ? 0 : 1]);
        m.scale.setScalar(CHESS.trayScale);
        m.position.set(-SIZE / 2 + 0.3 + i * CHESS.trayStep, 0, z);
        if (type === 2) m.rotation.y = white ? CHESS.knightYaw : CHESS.knightYaw - Math.PI;
        m.castShadow = true;
        this.trays.add(m);
      });
    const edge = SIZE / 2 + CHECKERS.wallGap + TABLE.bevel + CHESS.trayGap;
    row(byYou, false, edge);
    row(byComputer, true, -edge);
  }

  setBackground(color: string): void {
    (this.scene.background as THREE.Color).set(color);
  }

  get busy(): boolean {
    return this.run !== null;
  }

  /** Every piece where the board says (64 squares, ±type), no animation. */
  sync(board: readonly number[]): void {
    this.run = null;
    this.endBounce();
    this.dragSq = -1;
    for (const p of this.pieces.values()) p.group.removeFromParent();
    this.pieces.clear();
    board.forEach((v, s) => {
      if (!v) return;
      this.pieces.set(s, this.makePiece(v));
      this.place(s, 0);
      const p = this.pieces.get(s);
      p?.prev.copy(p.group.position);
    });
  }

  place(s: number, lift: number): void {
    if (s === this.dragSq) this.dragSq = -1;
    this.pieces.get(s)?.group.position.set(centre(colOf(s)), CHECKERS.floorY + lift, centre(rowOf(s)));
  }

  /** A piece following the finger (board position in squares, fractional): it eases after it and leans. */
  hover(s: number, col: number, row: number, lift: number): void {
    this.dragSq = s;
    this.dragTarget.set(col - SIZE / 2, CHECKERS.floorY + lift, row - SIZE / 2);
  }

  animate(a: ChessAnim, done: () => void): void {
    this.run = { a, t: 0, taken: false, done };
  }

  /** A piece let go on its square: the move happens at once. */
  drop(a: ChessAnim): void {
    this.dragSq = -1;
    if (a.cap >= 0) this.capture(a.cap);
    this.move(a.from, a.to);
    if (a.rookFrom >= 0) this.move(a.rookFrom, a.rookTo);
    if (a.promo) this.promote(a.to, a.promo);
  }

  /**
   * Markers: dots on empty squares the selected piece can reach, rings on pieces it can take,
   * its square lit, the last move, a red square under a king in check, and a pulsing hint.
   */
  mark(o: {
    dots: readonly number[];
    rings: readonly number[];
    danger?: readonly number[];
    sel: number;
    last: readonly number[];
    check: number;
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
    put(this.rings, o.rings);
    put(this.dangers, o.danger ?? []);
    put(this.lasts, o.last);
    put([this.selSquare], o.sel >= 0 ? [o.sel] : []);
    put([this.checkSquare], o.check >= 0 ? [o.check] : []);
    this.hintTo = o.hint;
  }

  /** A solved card: sparkles from the square and its piece bounces; `big` adds bursts around the board. */
  celebrate(s: number, big: boolean): void {
    const burst = (sq: number, n: number): void =>
      this.sparkles.emit(
        centre(colOf(sq)),
        CHECKERS.floorY + CHESS.sparkY,
        centre(rowOf(sq)),
        n,
        CHESS.sparkSpeed,
        CHESS.sparkUp,
        0.5,
      );
    burst(s, big ? CHESS.sparkBig : CHESS.sparkSmall);
    if (big) for (const sq of [0, 7, 56, 63, 27, 36]) burst(sq, CHESS.sparkSmall);
    this.wave.position.set(centre(colOf(s)), this.wave.position.y, centre(rowOf(s)));
    this.wave.visible = true;
    this.waveT = 0;
    this.endBounce();
    this.bounceSq = s;
    this.bounceT = 0;
  }

  /** Screen point (CSS px) over a square's centre. */
  screenOf(s: number, width: number, height: number): { x: number; y: number } {
    const v = this.projected.set(centre(colOf(s)), CHECKERS.floorY + CHESS.sparkY, centre(rowOf(s)));
    v.project(this.camera);
    return { x: ((v.x + 1) / 2) * width, y: ((1 - v.y) / 2) * height };
  }

  private endBounce(): void {
    if (this.bounceSq >= 0) this.pieces.get(this.bounceSq)?.group.scale.setScalar(1);
    this.bounceSq = -1;
    this.bounceT = 1;
  }

  update(dt: number): void {
    this.time += dt;
    this.sparkles.update(dt);
    if (this.waveT < 1) {
      this.waveT = Math.min(1, this.waveT + dt / CHESS.waveTime);
      const k = 1 - Math.pow(1 - this.waveT, 3);
      this.wave.scale.setScalar(0.6 + k * CHESS.waveScale);
      this.waveMat.opacity = (1 - this.waveT) * CHESS.waveOpacity;
      this.wave.visible = this.waveT < 1;
    }
    if (this.bounceT < 1) {
      this.bounceT = Math.min(1, this.bounceT + dt / CHESS.bounceTime);
      const k = this.bounceT;
      const g = this.pieces.get(this.bounceSq)?.group;
      if (g)
        g.scale.set(
          1 + CHESS.bounceScale * Math.sin(Math.PI * k) * (1 - k * 0.5),
          1 + CHESS.bounceScale * 1.6 * Math.sin(Math.PI * k),
          1 + CHESS.bounceScale * Math.sin(Math.PI * k) * (1 - k * 0.5),
        );
      if (k >= 1) this.endBounce();
    }
    if (this.hintTo >= 0) {
      const hx = centre(colOf(this.hintTo));
      const hz = centre(rowOf(this.hintTo));
      const pulse = 1 + Math.sin(this.time * 6) * 0.12;
      for (const m of [...this.dots, ...this.rings])
        if (m.visible)
          m.scale.setScalar(
            Math.abs(m.position.x - hx) < 0.01 && Math.abs(m.position.z - hz) < 0.01
              ? pulse * (m.geometry === this.dotGeo ? 1.3 : 1)
              : 1,
          );
    }
    this.checkMat.opacity = CHESS.checkOpacity * (0.8 + 0.2 * Math.sin(this.time * 5));
    this.moveFeel(dt);
    for (let i = this.fading.length - 1; i >= 0; i--) {
      const f = this.fading[i];
      if (!f) continue;
      f.t = Math.min(1, f.t + dt / CHECKERS.captureFade);
      f.group.position.y = CHECKERS.floorY - easeInQuad(f.t) * CHECKERS.height;
      f.group.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (mat) mat.opacity = (1 - f.t) * (mat.userData.baseOpacity ?? 1);
      });
      if (f.t >= 1) {
        disposeClones(f.group);
        this.fading.splice(i, 1);
      }
    }
    const r = this.run;
    if (!r) return;
    const a = r.a;
    r.t = Math.min(1, r.t + dt / CHESS.moveDuration);
    const k = easeInOutCubic(r.t);
    const lift = Math.sin(Math.PI * r.t) * (a.hop ? CHESS.knightHop : CHESS.glideHop);
    this.glide(a.from, a.to, k, lift);
    if (a.rookFrom >= 0) this.glide(a.rookFrom, a.rookTo, k, 0);
    if (a.cap >= 0 && !r.taken && r.t >= 0.6) {
      r.taken = true;
      this.capture(a.cap);
    }
    if (r.t < 1) return;
    this.run = null;
    if (a.cap >= 0 && !r.taken) this.capture(a.cap);
    this.move(a.from, a.to);
    if (a.rookFrom >= 0) this.move(a.rookFrom, a.rookTo);
    if (a.promo) this.promote(a.to, a.promo);
    r.done();
  }

  private glide(from: number, to: number, k: number, lift: number): void {
    const p = this.pieces.get(from);
    if (!p) return;
    const x0 = centre(colOf(from));
    const z0 = centre(rowOf(from));
    p.group.position.set(
      x0 + (centre(colOf(to)) - x0) * k,
      CHECKERS.floorY + lift,
      z0 + (centre(rowOf(to)) - z0) * k,
    );
  }

  private move(from: number, to: number): void {
    const p = this.pieces.get(from);
    if (!p) return;
    this.pieces.delete(from);
    this.pieces.set(to, p);
    this.place(to, 0);
    // land like a placed block: a quick squash and a small rocking settle
    p.settle = 0;
    p.sx = Math.random() - 0.5;
    p.sz = Math.random() - 0.5;
  }

  /**
   * Per frame, for every piece: the dragged one eases after the finger; anything moving leans
   * into its motion (like a held block) and straightens when it stops; a landed piece squashes
   * and rocks to rest. All time-based.
   */
  private moveFeel(dt: number): void {
    if (dt <= 0) return;
    const drag = this.dragSq >= 0 ? this.pieces.get(this.dragSq) : undefined;
    if (drag) {
      const g = drag.group.position;
      const axz = 1 - Math.exp(-CHESS.followRate * dt);
      g.x += (this.dragTarget.x - g.x) * axz;
      g.z += (this.dragTarget.z - g.z) * axz;
      g.y += (this.dragTarget.y - g.y) * (1 - Math.exp(-CHESS.followRateY * dt));
    }
    const ease = 1 - Math.exp(-CHESS.tiltRate * dt);
    const cl = (x: number): number => Math.max(-CHESS.tiltMax, Math.min(CHESS.tiltMax, x));
    for (const p of this.pieces.values()) {
      const pos = p.group.position;
      const vx = (pos.x - p.prev.x) / dt;
      const vz = (pos.z - p.prev.z) / dt;
      p.prev.copy(pos);
      let rx = p.tilt.rotation.x + (cl(vz * CHESS.tiltPerSpeed) - p.tilt.rotation.x) * ease;
      let rz = p.tilt.rotation.z + (cl(-vx * CHESS.tiltPerSpeed) - p.tilt.rotation.z) * ease;
      let sy = 1;
      if (p.settle >= 0) {
        p.settle = Math.min(1, p.settle + dt / FX.squashDuration);
        const k = p.settle;
        const decay = Math.exp(-k * FX.squashDecay);
        sy = 1 - CHESS.squash * decay * Math.cos(k * FX.squashFreq);
        const w = CHESS.settleAngle * decay * Math.sin(k * FX.settleFreq);
        rx += w * p.sx;
        rz += w * p.sz;
        if (k >= 1) p.settle = -1;
      }
      p.tilt.rotation.x = rx;
      p.tilt.rotation.z = rz;
      if (p.group !== this.bounceGroup()) p.tilt.scale.set(1 / Math.sqrt(sy), sy, 1 / Math.sqrt(sy));
    }
  }

  private bounceGroup(): THREE.Group | undefined {
    return this.bounceT < 1 ? this.pieces.get(this.bounceSq)?.group : undefined;
  }

  private promote(s: number, type: number): void {
    const p = this.pieces.get(s);
    const g = this.pieceGeos[type - 1];
    if (!p || !g) return;
    p.body.geometry = g;
    p.body.rotation.y = type === 2 ? (p.white ? CHESS.knightYaw : CHESS.knightYaw - Math.PI) : 0;
  }

  private capture(s: number): void {
    const p = this.pieces.get(s);
    if (!p) return;
    this.pieces.delete(s);
    // own clones, so the fade leaves the shared materials alone
    p.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = (m.material as THREE.Material).clone();
      mat.userData.baseOpacity = mat.opacity;
      mat.transparent = true;
      m.material = mat;
    });
    this.fading.push({ group: p.group, t: 0 });
  }

  /**
   * The square under a screen point. A square `prefer` accepts (a legal target) wins; otherwise a
   * touched piece's body wins (tall pieces hide the squares behind them); otherwise the board.
   */
  squareAt(x: number, y: number, width: number, height: number, prefer?: (s: number) => boolean): number {
    const ground = this.groundSquare(x, y, width, height);
    if (ground >= 0 && prefer?.(ground)) return ground;
    this.ndc.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
    this.ray.setFromCamera(this.ndc, this.camera);
    this.bodies.length = 0;
    for (const pc of this.pieces.values()) this.bodies.push(pc.body);
    this.hits.length = 0;
    this.ray.intersectObjects(this.bodies, false, this.hits);
    const hit = this.hits[0]?.object;
    if (hit) for (const [sq, pc] of this.pieces) if (pc.body === hit && sq !== this.dragSq) return sq;
    return ground;
  }

  private groundSquare(x: number, y: number, width: number, height: number): number {
    const p = this.pointSquares(x, y, width, height);
    if (!p) return -1;
    const c = Math.floor(p.col);
    const r = Math.floor(p.row);
    if (r < 0 || r >= SIZE || c < 0 || c >= SIZE) return -1;
    return r * SIZE + c;
  }

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
      // the back row's tall pieces stand up into the view: a little more room at the far edge
      bounds: { x0: -m, x1: m, z0: -m - CHESS.backRoom, z1: m + CHESS.frontRoom },
      dealFromX: 0,
      padTop: CHECKERS.padTop,
      padBottom: CHECKERS.padBottom,
    };
    const dir = new THREE.Vector3(...CHESS.camDir).normalize();
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

  private makePiece(v: number): Piece {
    const white = v > 0;
    const type = Math.abs(v);
    const group = new THREE.Group();
    const tilt = new THREE.Group();
    const body = new THREE.Mesh(this.pieceGeos[type - 1], this.woodMats[white ? 0 : 1]);
    // knights look across the board, turned a little toward the other side
    if (type === 2) body.rotation.y = white ? CHESS.knightYaw : CHESS.knightYaw - Math.PI;
    body.castShadow = true;
    body.receiveShadow = true;
    tilt.add(body);
    group.add(tilt);
    this.scene.add(group);
    return { group, tilt, body, white, prev: new THREE.Vector3(), settle: -1, sx: 0, sz: 0 };
  }

  dispose(): void {
    this.run = null;
    this.sparkles.dispose();
    for (const p of this.pieces.values()) p.group.removeFromParent();
    this.pieces.clear();
    for (const f of this.fading) disposeClones(f.group);
    this.fading.length = 0;
    for (const child of [...this.table.children]) {
      const m = child as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
      m.removeFromParent();
      m.geometry.dispose();
      m.material.dispose();
    }
    this.arrows([]);
    for (const c of [...this.trays.children]) c.removeFromParent();
    const cm = this.coords.material as THREE.MeshBasicMaterial;
    cm.map?.dispose();
    cm.dispose();
    this.coords.geometry.dispose();
    for (const g of [...this.pieceGeos, this.dotGeo, this.ringGeo, this.squareGeo]) g.dispose();
    for (const m of [
      ...this.woodMats,
      this.dotMat,
      this.selMat,
      this.lastMat,
      this.checkMat,
      this.dangerMat,
      this.waveMat,
    ])
      m.dispose();
    this.disposeLights();
  }
}

/** Free a taken piece's cloned materials (its geometry is shared). */
function disposeClones(g: THREE.Group): void {
  g.removeFromParent();
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) (m.material as THREE.Material).dispose();
  });
}
