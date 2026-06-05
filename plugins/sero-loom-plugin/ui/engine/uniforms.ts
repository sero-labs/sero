// The engine's uniform bag. Numeric/vector uniforms are tweened toward targets
// every frame so config changes (from a human or the agent) morph smoothly.

import { uniform } from 'three/tsl';
import { Vector3 } from 'three/webgpu';
import type { Vec3 } from '../../shared/types';

function v3(v: Vec3): any {
  return new Vector3(v[0], v[1], v[2]);
}

export function createUniforms() {
  return {
    // global
    uTime: uniform(0),
    uAspect: uniform(1),
    // palette (vec3)
    pa: uniform(v3([0.5, 0.5, 0.5])),
    pb: uniform(v3([0.5, 0.5, 0.5])),
    pc: uniform(v3([1, 1, 1])),
    pd: uniform(v3([0, 0.1, 0.2])),
    uBackground: uniform(v3([0.02, 0.02, 0.05])),
    // particles
    pNoiseFreq: uniform(0.6),
    pNoiseEvo: uniform(0.4),
    pFieldStrength: uniform(1),
    pGravityMix: uniform(0),
    pTurb: uniform(0.5),
    pPointSize: uniform(2),
    pColorW: uniform(v3([0, 0, 1])), // one-hot: position / age / velocity
    // raymarch (scalars; per-primitive uniforms are created on rebuild)
    rBlend: uniform(0.5),
    rCamDist: uniform(4),
    rOrbit: uniform(0.3),
    rGlow: uniform(0.4),
  };
}

export type LoomUniforms = ReturnType<typeof createUniforms>;

export interface PrimitiveUniforms {
  pos: ReturnType<typeof uniform>; // Vector3
  scale: ReturnType<typeof uniform>; // number
  morph: ReturnType<typeof uniform>; // number
  morphSpeed: ReturnType<typeof uniform>; // number
}

export function createPrimitiveUniforms(pos: Vec3, scale: number, morph: number, morphSpeed: number): PrimitiveUniforms {
  return {
    pos: uniform(v3(pos)),
    scale: uniform(scale),
    morph: uniform(morph),
    morphSpeed: uniform(morphSpeed),
  };
}
