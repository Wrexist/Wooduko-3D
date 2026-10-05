import * as THREE from 'three';
import { LIGHTS } from '../config';

export function addLights(scene: THREE.Scene): () => void {
  const hemi = new THREE.HemisphereLight(LIGHTS.hemiSky, LIGHTS.hemiGround, LIGHTS.hemiIntensity);
  scene.add(hemi);

  // Key light almost overhead: shadows land under the blocks, so a dragged piece, its shadow
  // and its drop spot all agree.
  const key = new THREE.DirectionalLight(LIGHTS.keyColor, LIGHTS.keyIntensity);
  key.position.set(...LIGHTS.keyPosition);
  key.castShadow = true;
  key.shadow.mapSize.set(LIGHTS.shadowMapSize, LIGHTS.shadowMapSize);
  const f = LIGHTS.shadowFrustum;
  Object.assign(key.shadow.camera, {
    left: -f,
    right: f,
    top: f,
    bottom: -f,
    near: LIGHTS.shadowNear,
    far: LIGHTS.shadowFar,
  });
  key.shadow.camera.updateProjectionMatrix();
  key.shadow.bias = LIGHTS.shadowBias;
  key.shadow.normalBias = LIGHTS.shadowNormalBias;
  key.shadow.radius = LIGHTS.shadowRadius;
  scene.add(key);

  const fill = new THREE.DirectionalLight(LIGHTS.fillColor, LIGHTS.fillIntensity);
  fill.position.set(...LIGHTS.fillPosition);
  scene.add(fill);

  return () => {
    scene.remove(hemi, key, fill);
    key.shadow.dispose();
    hemi.dispose();
    key.dispose();
    fill.dispose();
  };
}
