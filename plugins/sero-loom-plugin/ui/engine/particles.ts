// Particle paradigm: a GPU point cloud whose per-point position is evaluated in
// the vertex stage by a TSL flow-field function of (base, uTime). Stateless and
// robust across devices; the visual "simulation" comes from the animated field.

import { attribute, float, fract, length, vec3 } from 'three/tsl';
import {
  AdditiveBlending,
  BufferGeometry,
  Float32BufferAttribute,
  Group,
  Points,
  PointsNodeMaterial,
} from 'three/webgpu';

import { paletteColor, trigFlow } from './nodes';
import type { LoomUniforms } from './uniforms';

export class ParticleSystem {
  readonly group = new Group();
  private geometry: any = null;
  private material: any = null;
  private points: any = null;
  private count = 0;

  constructor(private readonly u: LoomUniforms) {}

  /** (Re)build the point cloud for a given count. */
  setCount(count: number): void {
    if (count === this.count && this.points) return;
    this.disposeMesh();
    this.count = count;

    const aBase = new Float32Array(count * 3);
    const aSeed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      // Uniform-ish distribution inside a sphere for a pleasing initial cloud.
      const r = Math.cbrt(Math.random()) * 1.3;
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

    const material = new PointsNodeMaterial();
    material.transparent = true;
    material.depthWrite = false;
    material.blending = AdditiveBlending;
    this.bindNodes(material);

    const points = new Points(geometry, material);
    points.frustumCulled = false;
    this.group.add(points);

    this.geometry = geometry;
    this.material = material;
    this.points = points;
  }

  private bindNodes(material: any): void {
    const u = this.u;
    const base = attribute('aBase', 'vec3');
    const seed = attribute('aSeed', 'float');

    const sample = base.mul(u.pNoiseFreq).add(vec3(u.uTime.mul(u.pNoiseEvo)));
    const flow = trigFlow(sample);
    const swirl = vec3(base.z, base.y.mul(0.2), base.x.negate());
    const disp = flow.mul(u.pFieldStrength).add(swirl.mul(u.pGravityMix));

    // positionNode overrides the geometry position with the animated field.
    (material as any).positionNode = base.add(disp.mul(u.pTurb));

    const tPos = length(base).mul(0.4);
    const tAge = seed;
    const tVel = length(flow).mul(0.5);
    const t = tPos
      .mul(u.pColorW.x)
      .add(tAge.mul(u.pColorW.y))
      .add(tVel.mul(u.pColorW.z))
      .add(u.uTime.mul(0.02));

    (material as any).colorNode = paletteColor(u, fract(t));
    (material as any).opacityNode = float(0.55);
    (material as any).sizeNode = u.pPointSize;
  }

  /** Slow auto-rotation for depth; called from the render loop. */
  update(timeSec: number): void {
    this.group.rotation.y = timeSec * 0.05;
    this.group.rotation.x = Math.sin(timeSec * 0.03) * 0.2;
  }

  private disposeMesh(): void {
    if (this.points) this.group.remove(this.points);
    this.geometry?.dispose();
    this.material?.dispose();
    this.geometry = null;
    this.material = null;
    this.points = null;
  }

  dispose(): void {
    this.disposeMesh();
  }
}
