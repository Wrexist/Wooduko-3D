import * as THREE from 'three';
import { BLOCK, CAMERA_VIEWS, CHECKERS, CHESS, RENDER, TABLE } from '../config';
import type { LayoutSpec } from '../config';
import { Sparkles } from '../fx/particles';
import { easeInOutCubic, easeInQuad } from '../fx/tween';
import { createCamera, fitCamera } from './camera';
import { buildBoard, rimGeometry } from './checkersScene';
import { glyphAtlas } from './chessGlyphs';
import { linearColor } from './color';
import { addLights } from './lights';
import type { Textures } from './textures';

const SIZE = 8;
const POOL = 28;
const centre = (i: number): number => i - SIZE / 2 + 0.5;
const rowOf = (s: number): number => s >> 3;
const colOf = (s: number): number => s & 7;

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

interface Piece {
  readonly group: THREE.Group;
  readonly glyph: THREE.Mesh;
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
  private readonly rimGeo = rimGeometry();
  private readonly capGeo: THREE.CircleGeometry;
  private readonly glyphGeos: THREE.BufferGeometry[] = [];
  private readonly atlas: THREE.CanvasTexture;
  private readonly rimMats: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  private readonly capMats: [THREE.MeshStandardMaterial, THREE.MeshStandardMaterial];
  private readonly inkMats: [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial];
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
    const { radius: R, height: H, edge: e } = CHECKERS;
    this.capGeo = new THREE.CircleGeometry(R - e, 48).rotateX(-Math.PI / 2).translate(0, H, 0);
    // one flat square per piece type, its UVs on that piece's cell of the atlas
    for (let t = 0; t < 6; t++) {
      const g = new THREE.PlaneGeometry(CHESS.glyph, CHESS.glyph)
        .rotateX(-Math.PI / 2)
        .translate(0, H + 0.003, 0);
      const uv = g.attributes.uv as THREE.BufferAttribute;
      for (let i = 0; i < uv.count; i++) uv.setX(i, (t + uv.getX(i)) / 6);
      this.glyphGeos.push(g);
    }
    this.atlas = new THREE.CanvasTexture(glyphAtlas());
    this.atlas.colorSpace = THREE.SRGBColorSpace;
    this.atlas.anisotropy = 4;
    const wood = (
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
    this.rimMats = [
      wood(tex.side, tex.sideNormal, CHESS.whiteTint, BLOCK.roughnessSide),
      wood(tex.side, tex.sideNormal, CHESS.blackTint, BLOCK.roughnessSide),
    ];
    this.capMats = [
      wood(tex.ring, tex.ringNormal, CHESS.whiteTint, BLOCK.roughnessTop),
      wood(tex.ring, tex.ringNormal, CHESS.blackTint, BLOCK.roughnessTop),
    ];
    // unlit, like a burn mark: under the bright key light a lit dark ink washes out to caramel
    const ink = (hex: number) =>
      new THREE.MeshBasicMaterial({
        map: this.atlas,
        color: linearColor(hex),
        transparent: true,
        depthWrite: false,
      });
    this.inkMats = [ink(CHESS.whiteInk), ink(CHESS.blackInk)];
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
    for (const p of this.pieces.values()) p.group.removeFromParent();
    this.pieces.clear();
    board.forEach((v, s) => {
      if (!v) return;
      this.pieces.set(s, this.makePiece(v));
      this.place(s, 0);
    });
  }

  place(s: number, lift: number): void {
    this.pieces.get(s)?.group.position.set(centre(colOf(s)), CHECKERS.floorY + lift, centre(rowOf(s)));
  }

  /** A piece following the finger (board position in squares, fractional). */
  hover(s: number, col: number, row: number, lift: number): void {
    this.pieces.get(s)?.group.position.set(col - SIZE / 2, CHECKERS.floorY + lift, row - SIZE / 2);
  }

  animate(a: ChessAnim, done: () => void): void {
    this.run = { a, t: 0, taken: false, done };
  }

  /** A piece let go on its square: the move happens at once. */
  drop(a: ChessAnim): void {
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
    const lift = a.hop ? Math.sin(Math.PI * r.t) * CHESS.knightHop : Math.sin(Math.PI * r.t) * 0.05;
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
  }

  private promote(s: number, type: number): void {
    const p = this.pieces.get(s);
    const g = this.glyphGeos[type - 1];
    if (p && g) p.glyph.geometry = g;
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

  squareAt(x: number, y: number, width: number, height: number): number {
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

  private makePiece(v: number): Piece {
    const k = v > 0 ? 0 : 1;
    const group = new THREE.Group();
    const rim = new THREE.Mesh(this.rimGeo, this.rimMats[k]);
    const cap = new THREE.Mesh(this.capGeo, this.capMats[k]);
    const glyph = new THREE.Mesh(this.glyphGeos[Math.abs(v) - 1], this.inkMats[k]);
    glyph.renderOrder = 3;
    rim.castShadow = true;
    cap.castShadow = true;
    rim.receiveShadow = true;
    cap.receiveShadow = true;
    group.add(rim, cap, glyph);
    this.scene.add(group);
    return { group, glyph };
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
    for (const g of [this.rimGeo, this.capGeo, ...this.glyphGeos, this.dotGeo, this.ringGeo, this.squareGeo])
      g.dispose();
    for (const m of [
      ...this.rimMats,
      ...this.capMats,
      ...this.inkMats,
      this.dotMat,
      this.selMat,
      this.lastMat,
      this.checkMat,
      this.dangerMat,
      this.waveMat,
    ])
      m.dispose();
    this.atlas.dispose();
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
