import * as THREE from 'three';

/**
 * Hex colour taken as *linear* RGB. The r128 prototype had no colour management, so all its
 * material colours behaved like this; keeping that preserves the look.
 */
export const linearColor = (hex: number): THREE.Color =>
  new THREE.Color().setHex(hex, THREE.LinearSRGBColorSpace);
