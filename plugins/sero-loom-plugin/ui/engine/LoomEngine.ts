// LoomEngine — compiles a LoomGraph into ordered, blended layers and drives them.
// Number fields are tweened uniforms (smooth, no recompile); expressions and
// structure trigger a layer rebuild with a per-layer fade-in.

import { uniform } from 'three/tsl';
import { Color, OrthographicCamera, PerspectiveCamera, RenderTarget, Vector3, WebGPURenderer } from 'three/webgpu';

import type { LoomGraph } from '../../shared/graph';
import { DEFAULT_GRAPH, rebuildKey } from '../../shared/graph';
import { buildParticleLayer } from './layer-particles';
import { buildRaymarchLayer } from './layer-raymarch';
import type { LayerRuntime } from './layers';
import { newRegistry, type Registry } from './scalars';

export type Backend = 'webgpu' | 'webgl' | 'none';

function walk(obj: any, path: (string | number)[]): unknown {
  let cur: any = obj;
  for (const k of path) {
    if (cur == null) return undefined;
    cur = cur[k];
  }
  return cur;
}

export class LoomEngine {
  private readonly uTime = uniform(0);
  private readonly uAspect = uniform(1);

  private renderer: any = null;
  private backend: Backend = 'none';

  private readonly orthoCam = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private readonly perspCam = new PerspectiveCamera(60, 1, 0.1, 100);
  private readonly clearColor = new Color();

  private layers: LayerRuntime[] = [];
  private reg: Registry = newRegistry();

  private target: LoomGraph = DEFAULT_GRAPH;
  private appliedKey = '';
  private readonly bg = new Vector3(0.02, 0.02, 0.05);

  private timeSec = 0;
  private speedEased = 1;
  private paused = false;
  private freeze = false; // holds time for the duration of a capture
  private raf = 0;
  private lastFrame = 0;
  private width = 1;
  private height = 1;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.orthoCam.position.z = 1;
    this.perspCam.position.set(0, 0, 4);
    this.perspCam.lookAt(0, 0, 0);
  }

  getBackend(): Backend {
    return this.backend;
  }

  async init(initial: LoomGraph, prefer: 'auto' | 'webgpu' | 'webgl'): Promise<Backend> {
    this.target = initial;
    const make = async (forceWebGL: boolean): Promise<any> => {
      const r = new WebGPURenderer({ canvas: this.canvas, antialias: true, alpha: false, forceWebGL } as never);
      await r.init();
      return r;
    };
    try {
      this.renderer = await make(prefer === 'webgl');
    } catch (err) {
      if (prefer === 'webgl') {
        this.backend = 'none';
        throw err;
      }
      this.renderer = await make(true); // WebGPU unavailable → WebGL fallback
    }

    const be = (this.renderer as { backend?: { isWebGPUBackend?: boolean } }).backend;
    this.backend = be?.isWebGPUBackend ? 'webgpu' : 'webgl';
    this.renderer.autoClear = false;
    this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));

    this.bg.set(initial.background[0], initial.background[1], initial.background[2]);
    this.speedEased = initial.speed;
    this.build(initial);

    this.lastFrame = performance.now();
    this.loop();
    return this.backend;
  }

  setGraph(graph: LoomGraph): void {
    this.target = graph;
    const key = rebuildKey(graph);
    if (key !== this.appliedKey) this.build(graph);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
  }

  resize(width: number, height: number): void {
    this.width = Math.max(1, Math.floor(width));
    this.height = Math.max(1, Math.floor(height));
    if (!this.renderer) return;
    this.renderer.setSize(this.width, this.height, false);
    this.perspCam.aspect = this.width / this.height;
    this.perspCam.updateProjectionMatrix();
    this.uAspect.value = this.width / this.height;
  }

  // ── Build / compile ───────────────────────────────────────────

  private build(graph: LoomGraph): void {
    for (const l of this.layers) l.dispose();
    this.reg = newRegistry();
    const ctx = { uTime: this.uTime, uAspect: this.uAspect, reg: this.reg };
    this.layers = graph.layers.map((layer, i) =>
      layer.type === 'particles' ? buildParticleLayer(layer, i, ctx) : buildRaymarchLayer(layer, i, ctx),
    );
    this.appliedKey = rebuildKey(graph);
  }

  // ── Tweening ──────────────────────────────────────────────────

  private easeTargets(k: number): void {
    for (const e of this.reg.scalars) {
      const t = walk(this.target, e.path);
      if (typeof t === 'number' && Number.isFinite(t)) e.uni.value += (t - e.uni.value) * k;
    }
    for (const e of this.reg.vectors) {
      const t = walk(this.target, e.path) as number[] | undefined;
      if (Array.isArray(t) && t.length >= 3) {
        e.uni.value.x += (t[0] - e.uni.value.x) * k;
        e.uni.value.y += (t[1] - e.uni.value.y) * k;
        e.uni.value.z += (t[2] - e.uni.value.z) * k;
      }
    }
    const b = this.target.background;
    this.bg.x += (b[0] - this.bg.x) * k;
    this.bg.y += (b[1] - this.bg.y) * k;
    this.bg.z += (b[2] - this.bg.z) * k;
  }

  // ── Render ────────────────────────────────────────────────────

  private renderFrame(): void {
    const r = this.renderer;
    r.setClearColor(this.clearColor.setRGB(this.bg.x, this.bg.y, this.bg.z), 1);
    r.clear();
    const layers = this.target.layers;
    for (let i = 0; i < this.layers.length; i++) {
      if (layers[i]?.enabled === false) continue;
      const lr = this.layers[i];
      r.render(lr.scene, lr.kind === 'ortho' ? this.orthoCam : this.perspCam);
    }
  }

  private loop = (): void => {
    this.raf = requestAnimationFrame(this.loop);
    if (!this.renderer) return;
    const now = performance.now();
    const dt = Math.min((now - this.lastFrame) / 1000, 0.05);
    this.lastFrame = now;
    const k = 1 - Math.exp(-dt / 0.4);

    this.speedEased += (this.target.speed - this.speedEased) * k;
    if (!this.paused && !this.freeze) this.timeSec += dt * this.speedEased;
    this.uTime.value = this.timeSec;
    this.easeTargets(k);
    for (const l of this.layers) l.update(dt);
    this.renderFrame();
  };

  // ── Capture (offscreen, arbitrary resolution) ─────────────────

  async capture(width: number, height: number, freeze = false): Promise<string> {
    const r = this.renderer;
    if (!r) throw new Error('Renderer not ready');
    const w = Math.max(16, Math.floor(width));
    const h = Math.max(16, Math.floor(height));
    const rt = new RenderTarget(w, h, { depthBuffer: true });

    // Hold time so the captured frame matches the on-screen instant and does not
    // drift across the async readback. Restored in `finally`.
    this.freeze = freeze;
    const prevAspect = this.uAspect.value;
    this.uAspect.value = w / h;
    this.perspCam.aspect = w / h;
    this.perspCam.updateProjectionMatrix();
    try {
      r.setRenderTarget(rt);
      r.setClearColor(this.clearColor.setRGB(this.bg.x, this.bg.y, this.bg.z), 1);
      r.clear();
      const layers = this.target.layers;
      for (let i = 0; i < this.layers.length; i++) {
        if (layers[i]?.enabled === false) continue;
        const lr = this.layers[i];
        await r.render(lr.scene, lr.kind === 'ortho' ? this.orthoCam : this.perspCam);
      }
      const raw = await r.readRenderTargetPixelsAsync(rt, 0, 0, w, h);
      const buffer: Uint8Array = raw instanceof Uint8Array ? raw : new Uint8Array((raw as ArrayBufferView).buffer);
      r.setRenderTarget(null);

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('2D context unavailable for capture');
      const img = ctx.createImageData(w, h);
      const rowBytes = w * 4;
      for (let y = 0; y < h; y++) {
        const src = (h - 1 - y) * rowBytes; // GPU readback is bottom-up
        img.data.set(buffer.subarray(src, src + rowBytes), y * rowBytes);
      }
      ctx.putImageData(img, 0, 0);
      return canvas.toDataURL('image/png');
    } finally {
      this.freeze = false;
      this.uAspect.value = prevAspect;
      this.perspCam.aspect = this.width / this.height;
      this.perspCam.updateProjectionMatrix();
      rt.dispose();
    }
  }

  dispose(): void {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    for (const l of this.layers) l.dispose();
    this.layers = [];
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
