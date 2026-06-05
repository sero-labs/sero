import { attribute, float, fract, length, uniform, vec3 } from 'three/tsl';
import { BufferGeometry, Float32BufferAttribute, Points, PointsNodeMaterial, Scene } from 'three/webgpu';

import type { ParticleLayer } from '../../shared/graph';
import { compileExprSafe } from './expr-compile';
import { paletteFn, resolveScalar, type Path } from './scalars';
import { blendOf, easeFade, type BuildCtx, type LayerRuntime } from './layers';

export function buildParticleLayer(layer: ParticleLayer, index: number, ctx: BuildCtx): LayerRuntime {
  const reg = ctx.reg;
  const path: Path = ['layers', index];
  const uTime = ctx.uTime;
  const count = Math.max(1000, Math.min(1_500_000, layer.count | 0));

  // Base points distributed in a unit sphere; `spread` scales them live.
  const aBase = new Float32Array(count * 3);
  const aSeed = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const r = Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    aBase[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    aBase[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    aBase[i * 3 + 2] = r * Math.cos(phi);
    aSeed[i] = Math.random();
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(aBase.slice(), 3));
  geometry.setAttribute('aBase', new Float32BufferAttribute(aBase, 3));
  geometry.setAttribute('aSeed', new Float32BufferAttribute(aSeed, 1));

  const base = attribute('aBase', 'vec3');
  const seed = attribute('aSeed', 'float');
  const strengthR = resolveScalar(layer.strength, 0.6, reg, [...path, 'strength']);
  const spreadR = resolveScalar(layer.spread, 1.3, reg, [...path, 'spread']);
  const sizeR = resolveScalar(layer.pointSize, 2, reg, [...path, 'pointSize']);
  const opacityR = resolveScalar(layer.opacity, 1, reg, [...path, 'opacity']);
  const palette = paletteFn(layer.palette, reg, [...path, 'palette']);
  const fade = uniform(0);
  const env = { t: uTime };

  // Agent-authored flow field: an expression returning a vec3 of (p, t, id).
  const field = compileExprSafe(layer.field, { t: uTime, p: base, id: seed }, vec3(0, 0, 0));
  const position = base.mul(spreadR(env)).add(field.mul(strengthR(env)));

  const drive = compileExprSafe(layer.colorDrive, { t: uTime, id: seed, speed: length(field) }, seed);

  const material = new PointsNodeMaterial();
  (material as any).positionNode = position;
  (material as any).colorNode = palette(fract(drive));
  (material as any).sizeNode = sizeR(env);
  (material as any).opacityNode = opacityR(env).mul(fade).mul(0.55);
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.blending = blendOf(layer.blend);

  const points = new Points(geometry, material);
  points.frustumCulled = false;
  const scene = new Scene();
  scene.add(points);

  let rot = 0;
  return {
    scene,
    kind: 'perspective',
    update(dt) {
      easeFade(fade, dt);
      rot += dt * 0.05;
      points.rotation.y = rot;
      points.rotation.x = Math.sin(rot * 0.6) * 0.2;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
