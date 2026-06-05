// LoomEngine — owns the WebGPU renderer, both paradigm scenes, the render loop,
// the smooth uniform tweener, and offscreen capture. Reads plain LoomConfig and
// morphs toward it; never touches React or the DOM beyond the canvas.

import { PerspectiveCamera, RenderTarget, Scene, WebGPURenderer } from 'three/webgpu';

import type { LoomConfig, Vec3 } from '../../shared/types';
import { DEFAULT_CONFIG } from '../../shared/types';
import { ParticleSystem } from './particles';
import { RaymarchScene } from './raymarch';
import { createUniforms, type LoomUniforms } from './uniforms';

export type Backend = 'webgpu' | 'webgl' | 'none';

function fieldGravityMix(field: LoomConfig['particles']['field']): number {
  switch (field) {
    case 'gravity':
      return 1;
    case 'aizawa':
      return 0.6;
    case 'lorenz':
      return 0.3;
    case 'curl':
    default:
      return 0;
  }
}

function colorWeights(mode: LoomConfig['particles']['colorMode']): Vec3 {
  switch (mode) {
    case 'position':
      return [1, 0, 0];
    case 'age':
      return [0, 1, 0];
    case 'velocity':
    default:
      return [0, 0, 1];
  }
}

export class LoomEngine {
  private readonly u: LoomUniforms = createUniforms();
  private renderer: any = null;
  private backend: Backend = 'none';

  private particleScene = new Scene();
  private particleCamera = new PerspectiveCamera(60, 1, 0.1, 100);
  private particles: ParticleSystem;
  private raymarch: RaymarchScene;

  private target: LoomConfig = DEFAULT_CONFIG;
  private particleKey = '';
  private raymarchKey = '';

  private timeSec = 0;
  private speedEased = 1;
  private paused = false;
  private raf = 0;
  private lastFrame = 0;
  private width = 1;
  private height = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.particles = new ParticleSystem(this.u);
    this.raymarch = new RaymarchScene(this.u);
    this.particleCamera.position.set(0, 0, 4);
    this.particleCamera.lookAt(0, 0, 0);
    this.particleScene.add(this.particles.group);
  }

  getBackend(): Backend {
    return this.backend;
  }

  async init(initial: LoomConfig, prefer: 'auto' | 'webgpu' | 'webgl'): Promise<Backend> {
    this.target = initial;
    const baseOpts = { canvas: this.canvas, antialias: true, alpha: false } as Record<string, unknown>;

    const make = async (forceWebGL: boolean): Promise<any> => {
      const r = new WebGPURenderer({ ...baseOpts, forceWebGL } as never);
      await r.init();
      return r;
    };

    try {
      this.renderer = await make(prefer === 'webgl');
    } catch (err) {
      if (prefer !== 'webgl') {
        // WebGPU unavailable — fall back to the WebGL backend.
        try {
          this.renderer = await make(true);
        } catch {
          this.backend = 'none';
          throw err;
        }
      } else {
        this.backend = 'none';
        throw err;
      }
    }

    const anyBackend = (this.renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend;
    this.backend = anyBackend?.isWebGPUBackend ? 'webgpu' : 'webgl';

    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));

    // Build both paradigm structures once, then snap uniforms to the initial
    // config so the first frame is correct (no morph-in from defaults).
    this.rebuildStructure(initial);
    this.applyTargets(1);
    this.speedEased = initial.motion.speed;

    this.lastFrame = performance.now();
    this.loop();
    return this.backend;
  }

  setConfig(config: LoomConfig): void {
    this.rebuildStructure(config);
    this.target = config;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    if (!this.renderer) return;
    this.renderer.setSize(this.width, this.height, false);
    this.particleCamera.aspect = this.width / this.height;
    this.particleCamera.updateProjectionMatrix();
    this.u.uAspect.value = this.width / this.height;
  }

  // ── Structural rebuilds (count / shapes / fractal fold) ───────

  private rebuildStructure(c: LoomConfig): void {
    const pKey = String(c.particles.count);
    if (pKey !== this.particleKey) {
      this.particles.setCount(c.particles.count);
      this.particleKey = pKey;
    }
    const rKey = `${c.raymarch.fractalIterations}|${c.raymarch.primitives.map((p) => p.shape).join(',')}`;
    if (rKey !== this.raymarchKey) {
      this.raymarch.build(c.raymarch.primitives, c.raymarch.fractalIterations);
      this.raymarchKey = rKey;
    }
  }

  // ── Tweening ──────────────────────────────────────────────────

  private easeScalar(uni: { value: number }, target: number, k: number): void {
    uni.value += (target - uni.value) * k;
  }

  private easeVec(uni: { value: { x: number; y: number; z: number } }, t: Vec3, k: number): void {
    uni.value.x += (t[0] - uni.value.x) * k;
    uni.value.y += (t[1] - uni.value.y) * k;
    uni.value.z += (t[2] - uni.value.z) * k;
  }

  private applyTargets(k: number): void {
    const c = this.target;
    const u = this.u;

    // palette + background
    this.easeVec(u.pa as never, c.palette.a, k);
    this.easeVec(u.pb as never, c.palette.b, k);
    this.easeVec(u.pc as never, c.palette.c, k);
    this.easeVec(u.pd as never, c.palette.d, k);
    this.easeVec(u.uBackground as never, c.background, k);
    this.easeVec(u.pColorW as never, colorWeights(c.particles.colorMode), k);

    // particle scalars
    this.easeScalar(u.pNoiseFreq as never, c.particles.noiseFrequency, k);
    this.easeScalar(u.pNoiseEvo as never, c.particles.noiseEvolution, k);
    this.easeScalar(u.pFieldStrength as never, c.particles.fieldStrength, k);
    this.easeScalar(u.pGravityMix as never, fieldGravityMix(c.particles.field), k);
    this.easeScalar(u.pTurb as never, c.motion.turbulence, k);
    this.easeScalar(u.pPointSize as never, c.particles.pointSize, k);

    // raymarch scalars
    this.easeScalar(u.rBlend as never, c.raymarch.blendSmoothness, k);
    this.easeScalar(u.rCamDist as never, c.raymarch.cameraDistance, k);
    this.easeScalar(u.rOrbit as never, c.raymarch.cameraOrbitSpeed, k);
    this.easeScalar(u.rGlow as never, c.raymarch.glow, k);

    // per-primitive (lengths match because structure rebuilds on shape changes)
    const prims = this.raymarch.primUniforms;
    for (let i = 0; i < prims.length && i < c.raymarch.primitives.length; i++) {
      const p = c.raymarch.primitives[i];
      this.easeVec(prims[i].pos as never, p.position, k);
      this.easeScalar(prims[i].scale as never, p.scale, k);
      this.easeScalar(prims[i].morph as never, p.morphAmount, k);
      this.easeScalar(prims[i].morphSpeed as never, p.morphSpeed, k);
    }
  }

  // ── Render loop ───────────────────────────────────────────────

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    const renderer = this.renderer;
    if (!renderer) return;

    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;

    // Smoothing factor from the (eased) transition window.
    const tau = 0.4; // seconds to ~63% — gives a calm morph
    const k = 1 - Math.exp(-dt / tau);

    this.speedEased += (this.target.motion.speed - this.speedEased) * k;
    if (!this.paused) this.timeSec += dt * this.speedEased;
    this.u.uTime.value = this.timeSec;
    this.applyTargets(k);

    if (this.target.paradigm === 'particles') {
      this.particles.update(this.timeSec);
      renderer.render(this.particleScene, this.particleCamera);
    } else {
      renderer.render(this.raymarch.scene, this.raymarch.camera);
    }
  };

  // ── Capture (offscreen, arbitrary resolution) ─────────────────

  async capture(width: number, height: number): Promise<string> {
    const renderer = this.renderer;
    if (!renderer) throw new Error('Renderer not ready');

    const w = Math.max(16, Math.floor(width));
    const h = Math.max(16, Math.floor(height));
    const rt = new RenderTarget(w, h, { depthBuffer: true });

    const prevAspect = this.u.uAspect.value;
    this.u.uAspect.value = w / h;
    this.particleCamera.aspect = w / h;
    this.particleCamera.updateProjectionMatrix();

    const usingParticles = this.target.paradigm === 'particles';
    const scene = usingParticles ? this.particleScene : this.raymarch.scene;
    const camera = usingParticles ? this.particleCamera : this.raymarch.camera;

    renderer.setRenderTarget(rt);
    await renderer.render(scene, camera);
    // Returns the RGBA byte buffer (do not pass a 6th arg — that's faceIndex).
    const raw = await renderer.readRenderTargetPixelsAsync(rt, 0, 0, w, h);
    const buffer: Uint8Array =
      raw instanceof Uint8Array ? raw : new Uint8Array((raw as ArrayBufferView).buffer);
    renderer.setRenderTarget(null);

    // restore live aspect
    this.u.uAspect.value = prevAspect;
    this.particleCamera.aspect = this.width / this.height;
    this.particleCamera.updateProjectionMatrix();
    rt.dispose();

    // GPU readback is bottom-up; flip into a top-down canvas for PNG encoding.
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D context unavailable for capture');
    const img = ctx.createImageData(w, h);
    const rowBytes = w * 4;
    for (let y = 0; y < h; y++) {
      const src = (h - 1 - y) * rowBytes;
      img.data.set(buffer.subarray(src, src + rowBytes), y * rowBytes);
    }
    ctx.putImageData(img, 0, 0);
    return canvas.toDataURL('image/png');
  }

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.particles.dispose();
    this.raymarch.dispose();
    if (this.renderer) {
      try {
        this.renderer.dispose();
      } catch {
        /* ignore */
      }
      this.renderer = null;
    }
    this.backend = 'none';
  }
}
