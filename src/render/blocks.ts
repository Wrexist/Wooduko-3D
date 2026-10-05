import * as THREE from 'three';
import { BLOCK, COLORS } from '../config';
import type { Cell, UvCenter, WoodSeed } from '../core/types';
import { buildBlockGeometry } from './blockGeometry';
import type { Textures } from './textures';

export type BlockMesh = THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial[]>;

/** Light maple tint per block; dimmed blocks go grey. */
export function tintFor(seed: WoodSeed, dim: boolean, out: THREE.Color): THREE.Color {
  if (dim) {
    const k = COLORS.noFitRatio;
    return out.setRGB(COLORS.noFit * k[0], COLORS.noFit * k[1], COLORS.noFit * k[2]);
  }
  const k = COLORS.tintRatio;
  // a stable warmth per block, derived from its wood seed (no save change): −1 cool … +1 warm
  const h = Math.sin(seed.a * 12.9898 + seed.s * 78.233) * 43758.5453;
  const warm = (h - Math.floor(h)) * 2 - 1;
  return out.setRGB(
    seed.t * k[0],
    seed.t * (k[1] - warm * COLORS.toneSpread[0]),
    seed.t * (k[2] - warm * COLORS.toneSpread[1]),
  );
}

export class Blocks {
  private readonly top: THREE.MeshStandardMaterial;
  private readonly side: THREE.MeshStandardMaterial;

  constructor(tex: Textures) {
    this.top = new THREE.MeshStandardMaterial({
      map: tex.ring,
      normalMap: tex.ringNormal,
      normalScale: new THREE.Vector2(BLOCK.normalScaleTop, BLOCK.normalScaleTop),
      roughness: BLOCK.roughnessTop,
      metalness: 0,
      vertexColors: true,
    });
    this.side = new THREE.MeshStandardMaterial({
      map: tex.side,
      normalMap: tex.sideNormal,
      normalScale: new THREE.Vector2(BLOCK.normalScaleSide, BLOCK.normalScaleSide),
      roughness: BLOCK.roughnessSide,
      metalness: 0,
      vertexColors: true,
    });
  }

  /** One carved block. Material clones share the textures; `dispose` frees the clones. */
  make(cells: readonly Cell[], center: UvCenter, seed: WoodSeed): BlockMesh {
    const top = this.top.clone();
    const side = this.side.clone();
    tintFor(seed, false, top.color);
    side.color.copy(top.color);
    const m = new THREE.Mesh(buildBlockGeometry(cells, center, seed), [top, side]);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  setTint(m: BlockMesh, seed: WoodSeed, dim: boolean): void {
    for (const mat of m.material) tintFor(seed, dim, mat.color);
  }

  static dispose(m: BlockMesh): void {
    m.removeFromParent();
    m.geometry.dispose();
    m.material.forEach((x) => x.dispose());
  }

  dispose(): void {
    this.top.dispose();
    this.side.dispose();
  }
}
