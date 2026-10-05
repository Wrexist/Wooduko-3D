import * as THREE from 'three';
import { BLOCK, COLORS } from '../config';
import type { Cell, UvCenter, WoodSeed } from '../core/types';
import { buildBlockGeometry } from './blockGeometry';
import type { Textures } from './textures';

export type BlockMesh = THREE.Mesh<THREE.ExtrudeGeometry, THREE.MeshStandardMaterial[]>;

/** Light maple tint per block; dimmed blocks go grey. */
export function tintFor(seed: WoodSeed, dim: boolean, out: THREE.Color): THREE.Color {
  const t = dim ? COLORS.noFit : seed.t;
  const k = dim ? COLORS.noFitRatio : COLORS.tintRatio;
  return out.setRGB(t * k[0], t * k[1], t * k[2]);
}

export class Blocks {
  private readonly top: THREE.MeshStandardMaterial;
  private readonly side: THREE.MeshStandardMaterial;

  constructor(tex: Textures) {
    this.top = new THREE.MeshStandardMaterial({ map: tex.ring, roughness: BLOCK.roughnessTop, metalness: 0 });
    this.side = new THREE.MeshStandardMaterial({
      map: tex.side,
      roughness: BLOCK.roughnessSide,
      metalness: 0,
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
