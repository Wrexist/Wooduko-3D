import * as THREE from 'three';
import { RENDER } from '../config';

export interface Renderer {
  readonly gl: THREE.WebGLRenderer;
  resize(width: number, height: number): void;
  /** Feed the raw (unclamped) frame time; lowers the pixel ratio if the device struggles. */
  sample(rawDt: number): void;
  dispose(): void;
}

export function createRenderer(canvas: HTMLCanvasElement): Renderer {
  const gl = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    stencil: false,
  });
  let ratio = Math.min(window.devicePixelRatio || 1, RENDER.maxPixelRatio);
  gl.setPixelRatio(ratio);
  gl.outputColorSpace = THREE.SRGBColorSpace;
  gl.toneMapping = THREE.ACESFilmicToneMapping;
  gl.toneMappingExposure = RENDER.exposure;
  gl.shadowMap.enabled = true;
  gl.shadowMap.type = THREE.PCFShadowMap;

  // Adaptive resolution: if the average frame time stays slow for a while, step the ratio down.
  // Never raise it again mid-session (avoids oscillation).
  let acc = 0;
  let frames = 0;
  let slow = 0;

  return {
    gl,
    resize: (w, h) => gl.setSize(w, h, false),
    sample: (raw) => {
      acc += raw;
      frames++;
      if (acc < 1) return;
      const avgMs = (acc / frames) * 1000;
      slow = avgMs > RENDER.slowFrameMs ? slow + 1 : 0;
      acc = 0;
      frames = 0;
      if (slow >= RENDER.slowSeconds && ratio > RENDER.minPixelRatio) {
        ratio = Math.max(RENDER.minPixelRatio, ratio - RENDER.pixelRatioStep);
        gl.setPixelRatio(ratio);
        slow = 0;
      }
    },
    dispose: () => gl.dispose(),
  };
}
