import * as THREE from 'three';
import { BOARD, COLORS, TABLE, WORLD } from '../config';
import { linearColor } from './color';
import type { Textures } from './textures';

function roundedRect(p: THREE.Path, x: number, y: number, w: number, h: number, r: number): void {
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
}

/**
 * Table slab (top at y = 0) with a rounded carved hole, the board floor deep inside it, a dark
 * plane under the margin, and raised ridges between cells. Returns a dispose function.
 */
export interface Table {
  /** Ridge tint (linear hex) for the current wood theme. */
  setRidge(hex: number): void;
  dispose(): void;
}

export function buildTable(scene: THREE.Scene, tex: Textures): Table {
  const group = new THREE.Group();
  const geos: THREE.BufferGeometry[] = [];
  const mats: THREE.Material[] = [];

  const s = new THREE.Shape();
  const T = TABLE.halfSize;
  roundedRect(s, -T, -T, 2 * T, 2 * T, TABLE.cornerRadius);
  const hole = new THREE.Path();
  roundedRect(hole, -TABLE.hole / 2, -TABLE.hole / 2, TABLE.hole, TABLE.hole, TABLE.holeRadius);
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
  const slabMat = new THREE.MeshStandardMaterial({ map: tex.table, roughness: TABLE.roughness });
  const slab = new THREE.Mesh(slabGeo, slabMat);
  slab.receiveShadow = true;
  group.add(slab);
  geos.push(slabGeo);
  mats.push(slabMat);

  const floorGeo = new THREE.PlaneGeometry(TABLE.boardTexSpan, TABLE.boardTexSpan).rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({ map: tex.board, roughness: TABLE.boardRoughness });
  const floor = new THREE.Mesh(floorGeo, floorMat);
  floor.position.y = WORLD.baseY;
  floor.receiveShadow = true;
  group.add(floor);
  geos.push(floorGeo);
  mats.push(floorMat);

  const underGeo = new THREE.PlaneGeometry(TABLE.underSize, TABLE.underSize).rotateX(-Math.PI / 2);
  const underMat = new THREE.MeshStandardMaterial({
    color: linearColor(COLORS.under),
    roughness: TABLE.underRoughness,
  });
  const under = new THREE.Mesh(underGeo, underMat);
  under.position.y = WORLD.baseY - TABLE.underDrop;
  under.receiveShadow = true;
  group.add(under);
  geos.push(underGeo);
  mats.push(underMat);

  // Raised ridges: blocks drop down *into* their slots.
  const ridgeMat = new THREE.MeshStandardMaterial({
    map: tex.side,
    color: linearColor(COLORS.ridge),
    roughness: TABLE.ridgeRoughness,
  });
  mats.push(ridgeMat);
  const n = BOARD.size;
  const RH = TABLE.ridgeHeight;
  for (let i = 0; i <= n; i++) {
    const w = i % BOARD.box === 0 ? TABLE.ridgeBoxWidth : TABLE.ridgeWidth;
    const hzGeo = new THREE.BoxGeometry(n + w, RH, w);
    const vtGeo = new THREE.BoxGeometry(w, RH, n + w);
    geos.push(hzGeo, vtGeo);
    const hz = new THREE.Mesh(hzGeo, ridgeMat);
    hz.position.set(0, WORLD.baseY + RH / 2, WORLD.z0 + i);
    const vt = new THREE.Mesh(vtGeo, ridgeMat);
    vt.position.set(WORLD.x0 + i, WORLD.baseY + RH / 2, 0);
    for (const m of [hz, vt]) {
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
    }
  }

  scene.add(group);
  return {
    setRidge: (hex) => ridgeMat.color.setHex(hex, THREE.LinearSRGBColorSpace),
    dispose: () => {
      scene.remove(group);
      geos.forEach((g) => g.dispose());
      mats.forEach((m) => m.dispose());
    },
  };
}
