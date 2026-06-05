import {
  abs, clamp, cos, dot, float, length, Loop, max, mix, normalize, screenUV, sin, smoothstep, uniform, vec3, vec4,
} from 'three/tsl';
import { Mesh, MeshBasicNodeMaterial, PlaneGeometry, Scene } from 'three/webgpu';

import type { RaymarchLayer } from '../../shared/graph';
import { calcNormal } from './nodes';
import { compileExprSafe } from './expr-compile';
import { compileSdf } from './sdf-compile';
import { paletteFn, resolveScalar, type Path } from './scalars';
import { blendOf, easeFade, type BuildCtx, type LayerRuntime } from './layers';

const STEPS = 72;

export function buildRaymarchLayer(layer: RaymarchLayer, index: number, ctx: BuildCtx): LayerRuntime {
  const reg = ctx.reg;
  const path: Path = ['layers', index];
  const uTime = ctx.uTime;

  const sdfFn = compileSdf(layer.sdf, [...path, 'sdf'], reg, uTime);
  const distR = resolveScalar(layer.camera.distance, 4, reg, [...path, 'camera', 'distance']);
  const orbitR = resolveScalar(layer.camera.orbitSpeed, 0.3, reg, [...path, 'camera', 'orbitSpeed']);
  const heightR = resolveScalar(layer.camera.height, 0.6, reg, [...path, 'camera', 'height']);
  const glowR = resolveScalar(layer.glow, 0.4, reg, [...path, 'glow']);
  const opacityR = resolveScalar(layer.opacity, 1, reg, [...path, 'opacity']);
  const palette = paletteFn(layer.palette, reg, [...path, 'palette']);
  const fade = uniform(0);
  const fold = layer.fractalFold | 0;

  const env = { t: uTime };

  // Apply the optional fractal mirror-fold, then evaluate the SDF tree.
  const sdfAt = (point: any): any => {
    let q = point;
    for (let k = 0; k < fold; k++) q = abs(q).sub(vec3(0.65, 0.65, 0.65));
    return sdfFn(q);
  };

  const colorNode = (() => {
    const uvc = screenUV.sub(0.5).mul(2).toVar();
    uvc.x.mulAssign(ctx.uAspect);

    const ang = uTime.mul(orbitR(env));
    const ro = vec3(sin(ang).mul(distR(env)), heightR(env), cos(ang).mul(distR(env))).toVar();
    const fwd = normalize(ro.negate());
    const right = normalize(vec3(0, 1, 0).cross(fwd));
    const up = fwd.cross(right);
    const rd = normalize(right.mul(uvc.x).add(up.mul(uvc.y)).add(fwd.mul(1.6)));

    const tHit = float(0).toVar();
    const glowAcc = float(0).toVar();
    Loop(STEPS, () => {
      const p = ro.add(rd.mul(tHit));
      const d = sdfAt(p).toVar();
      glowAcc.addAssign(float(1).div(float(1).add(d.mul(d).mul(40))));
      tHit.addAssign(max(d.mul(0.85), float(0.002)));
    });

    const hp = ro.add(rd.mul(tHit));
    const dFinal = sdfAt(hp);
    const hit = smoothstep(0.06, 0.0, dFinal);
    const n = calcNormal(sdfAt, hp);
    const diff = max(dot(n, normalize(vec3(0.6, 0.8, 0.4))), float(0)).mul(0.8).add(0.2);

    const depth = length(hp);
    const ny = n.y;
    const tcol = compileExprSafe(layer.colorDrive, { t: uTime, depth, ny }, depth.mul(0.25));
    const surf = palette(tcol).mul(diff);
    const glowA = clamp(glowAcc.mul(glowR(env)).mul(0.03), 0, 1);
    const glowCol = palette(glowAcc.mul(0.05)).mul(glowA);
    const rgb = mix(glowCol, surf, hit).clamp(0, 1);
    const alpha = max(hit, glowA).mul(opacityR(env)).mul(fade);
    return vec4(rgb.x, rgb.y, rgb.z, alpha);
  })();

  const material = new MeshBasicNodeMaterial();
  (material as any).colorNode = colorNode;
  material.transparent = true;
  material.depthTest = false;
  material.depthWrite = false;
  material.blending = blendOf(layer.blend);

  const mesh = new Mesh(new PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  const scene = new Scene();
  scene.add(mesh);

  return {
    scene,
    kind: 'ortho',
    update(dt) {
      easeFade(fade, dt);
    },
    dispose() {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}
