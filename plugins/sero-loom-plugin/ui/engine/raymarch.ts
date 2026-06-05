// Raymarch paradigm: a full-screen SDF scene. Per-primitive position/scale/morph
// are tweenable uniforms; the shape list and fractal-fold count are structural,
// so the colour node is rebuilt when they change.

import {
  cos,
  cross,
  dot,
  float,
  length,
  Loop,
  max,
  mix,
  normalize,
  screenUV,
  sin,
  smoothstep,
  vec3,
  vec4,
} from 'three/tsl';
import {
  Mesh,
  MeshBasicNodeMaterial,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
} from 'three/webgpu';

import { calcNormal, paletteColor, sdBox, sdCapsule, sdSphere, sdTorus, smin } from './nodes';
import { createPrimitiveUniforms, type LoomUniforms, type PrimitiveUniforms } from './uniforms';
import type { SdfPrimitive } from '../../shared/types';

const STEPS = 72;
const MAX_DIST = 24;

function shapeSdf(shape: SdfPrimitive['shape'], p: any, r: any): any {
  switch (shape) {
    case 'box':
      return sdBox(p, r);
    case 'torus':
      return sdTorus(p, r);
    case 'capsule':
      return sdCapsule(p, r);
    case 'sphere':
    default:
      return sdSphere(p, r);
  }
}

export class RaymarchScene {
  readonly scene = new Scene();
  readonly camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  primUniforms: PrimitiveUniforms[] = [];

  private mesh: any;
  private material: any;

  constructor(private readonly u: LoomUniforms) {
    this.camera.position.z = 1;
    this.material = new MeshBasicNodeMaterial();
    this.mesh = new Mesh(new PlaneGeometry(2, 2), this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
  }

  /** Rebuild the shader graph for a given primitive list + fractal fold count. */
  build(primitives: SdfPrimitive[], fractalIterations: number): void {
    const u = this.u;
    this.primUniforms = primitives.map((p) =>
      createPrimitiveUniforms(p.position, p.scale, p.morphAmount, p.morphSpeed),
    );
    const shapes = primitives.map((p) => p.shape);
    const iter = Math.max(0, Math.min(5, fractalIterations | 0));

    const sceneSdf = (point: any): any => {
      // Optional mirror fold for fractal-like repetition.
      let q = point;
      for (let k = 0; k < iter; k++) {
        q = q.abs().sub(vec3(0.65, 0.65, 0.65));
      }
      let d: any = null;
      this.primUniforms.forEach((pu, i) => {
        const lp = q.sub(pu.pos);
        const rEff = pu.scale.mul(float(1).add(pu.morph.mul(sin(u.uTime.mul(pu.morphSpeed)))));
        const di = shapeSdf(shapes[i], lp, rEff);
        d = d === null ? di : smin(d, di, u.rBlend);
      });
      return d ?? sdSphere(point, float(1));
    };

    const colorNode = (() => {
      const uvc = screenUV.sub(0.5).mul(2).toVar();
      uvc.x.mulAssign(u.uAspect);

      const ang = u.uTime.mul(u.rOrbit);
      const ro = vec3(sin(ang).mul(u.rCamDist), float(0.6), cos(ang).mul(u.rCamDist)).toVar();
      const fwd = normalize(ro.negate());
      const right = normalize(cross(vec3(0, 1, 0), fwd));
      const up = cross(fwd, right);
      const rd = normalize(right.mul(uvc.x).add(up.mul(uvc.y)).add(fwd.mul(1.6)));

      const tHit = float(0).toVar();
      const glowAcc = float(0).toVar();

      Loop(STEPS, () => {
        const p = ro.add(rd.mul(tHit));
        const d = sceneSdf(p).toVar();
        glowAcc.addAssign(float(1).div(float(1).add(d.mul(d).mul(40))));
        tHit.addAssign(max(d.mul(0.85), float(0.002)));
      });

      const hp = ro.add(rd.mul(tHit));
      const dFinal = sceneSdf(hp);
      const hit = smoothstep(0.06, 0.0, dFinal);
      const n = calcNormal(sceneSdf, hp);
      const lightDir = normalize(vec3(0.6, 0.8, 0.4));
      const diff = max(dot(n, lightDir), float(0)).mul(0.8).add(0.2);

      const tcol = length(hp).mul(0.25).add(diff.mul(0.4)).add(u.uTime.mul(0.02));
      const surf = paletteColor(u, tcol).mul(diff);
      const glow = paletteColor(u, glowAcc.mul(0.05)).mul(glowAcc.mul(u.rGlow).mul(0.03));

      const col = mix(u.uBackground, surf, hit).add(glow);
      return vec4(col.x, col.y, col.z, 1).clamp(0, 1);
    })();

    (this.material as any).colorNode = colorNode;
    this.material.needsUpdate = true;
    void MAX_DIST;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}
