import * as THREE from 'three';
import { CAMERA, LAYOUT } from '../config';
import type { LayoutSpec } from '../config';

export const layoutFor = (aspect: number): LayoutSpec =>
  aspect > LAYOUT.landscapeAspect ? LAYOUT.landscape : LAYOUT.portrait;

export function createCamera(): THREE.PerspectiveCamera {
  return new THREE.PerspectiveCamera(CAMERA.fov, 1, CAMERA.near, CAMERA.far);
}

const dir = new THREE.Vector3(...CAMERA.dir).normalize();
const tmp = new THREE.Vector3();

/**
 * Fit the content bounds into the screen band between `topPx` and `bottomPx` (from the bottom),
 * and right of `leftPx` (used when the tutorial text sits beside the board),
 * by binary-searching the camera distance, then centre the content in that band with a view offset.
 * Returns the resting camera position (shake is applied on top of it).
 */
export function fitCamera(
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  layout: LayoutSpec,
  topPx: number,
  bottomPx: number,
  out: THREE.Vector3,
  leftPx = 0,
): THREE.Vector3 {
  camera.aspect = width / height;
  camera.clearViewOffset();
  camera.updateProjectionMatrix();
  const b = layout.bounds;
  const target = new THREE.Vector3((b.x0 + b.x1) / 2, 0, (b.z0 + b.z1) / 2);
  const yTop = 1 - (2 * topPx) / height;
  const yBot = -1 + (2 * bottomPx) / height;
  const half = (yTop - yBot) / 2;
  const mid = (yTop + yBot) / 2;
  const xRight = CAMERA.xLimit;
  const xLeft = leftPx > 0 ? -1 + (2 * leftPx) / width : -CAMERA.xLimit;
  const halfX = (xRight - xLeft) / 2;
  const midX = (xLeft + xRight) / 2;
  const pts: THREE.Vector3[] = [];
  for (const x of [b.x0, b.x1]) {
    for (const z of [b.z0, b.z1])
      for (const y of [0, CAMERA.boundsTopY]) pts.push(new THREE.Vector3(x, y, z));
  }
  let lo: number = CAMERA.fitMin;
  let hi: number = CAMERA.fitMax;
  for (let i = 0; i < CAMERA.fitIterations; i++) {
    const d = (lo + hi) / 2;
    camera.position.copy(target).addScaledVector(dir, d);
    camera.lookAt(target);
    camera.updateMatrixWorld(true);
    const ok = pts.every((p) => {
      tmp.copy(p).project(camera);
      return Math.abs(tmp.x) <= halfX && Math.abs(tmp.y) <= half;
    });
    if (ok) hi = d;
    else lo = d;
  }
  camera.position.copy(target).addScaledVector(dir, hi);
  camera.lookAt(target);
  camera.updateMatrixWorld(true);
  camera.setViewOffset(width, height, (-midX * width) / 2, (mid * height) / 2, width, height);
  camera.updateProjectionMatrix();
  return out.copy(camera.position);
}
