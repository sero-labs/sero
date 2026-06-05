import { AdditiveBlending, NormalBlending } from 'three/webgpu';
import type { BlendMode } from '../../shared/graph';
import type { Registry } from './scalars';

export interface LayerRuntime {
  scene: any;
  kind: 'ortho' | 'perspective';
  update(dt: number): void;
  dispose(): void;
}

export interface BuildCtx {
  uTime: any;
  uAspect: any;
  reg: Registry;
}

export function blendOf(mode: BlendMode): number {
  // 'screen' approximated by additive for now.
  return mode === 'normal' ? NormalBlending : AdditiveBlending;
}

export function easeFade(fade: { value: number }, dt: number): void {
  fade.value += (1 - fade.value) * Math.min(1, dt * 4);
}
