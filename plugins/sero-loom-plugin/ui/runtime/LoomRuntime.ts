// The Loom shader runtime: owns the WebGL2 context and render loop, swaps
// compiled pieces with a cross-fade, tweens param uniforms, watches frame time
// (resolution scaling), recovers from context loss, and renders captures.
//
// Safety lives here, in run mechanics: compile errors are reported (the
// last-good piece keeps rendering), slow pieces degrade resolution, and a piece
// that kills the GPU context twice is reverted.

import {
  compileKey,
  normalizeParamValue,
  type BuildError,
  type LoomPiece,
  type ParamValue,
} from '../../shared/types';
import { compileProgram, createContext, createTarget, deleteTarget, drawFullscreen, supportsFloatTargets, type Target } from './gl';
import { ProgramSet, type FrameEnv } from './program-set';

export const BLIT_VS = `#version 300 es
void main() {
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

export const BLIT_FS = `#version 300 es
precision highp float;
uniform sampler2D uNew;
uniform sampler2D uOld;
uniform float uFade;
uniform vec2 uSize;
out vec4 outColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uSize;
  vec3 next = texture(uNew, uv).rgb;
  vec3 prev = texture(uOld, uv).rgb;
  outColor = vec4(mix(prev, next, uFade), 1.0);
}`;

const RES_STEPS = [1, 0.75, 0.5] as const;

export type SetPieceResult = { status: 'ok' } | { status: 'error'; errors: BuildError[] };

export interface RuntimeEvents {
  /** A piece killed the GPU context twice and was reverted to the previous good piece. */
  onGpuHostileRevert?: (piece: LoomPiece) => void;
}

function flatten(piece: LoomPiece, name: string, value: ParamValue | undefined): number[] {
  const param = piece.params.find((p) => p.name === name);
  if (!param) return [0];
  const v = normalizeParamValue(param, value);
  if (typeof v === 'number') return [v];
  if (typeof v === 'boolean') return [v ? 1 : 0];
  return [...v];
}

export class LoomRuntime {
  private gl: WebGL2RenderingContext | null = null;
  private floatTargets = false;
  private set: ProgramSet | null = null;
  private lastGood: LoomPiece | null = null;

  private blit: { program: WebGLProgram; uNew: WebGLUniformLocation | null; uOld: WebGLUniformLocation | null; uFade: WebGLUniformLocation | null; uSize: WebGLUniformLocation | null } | null = null;
  private fadeTarget: Target | null = null;
  private fadeStart = 0;
  private fadeMs = 0;

  private raf = 0;
  private running = false;
  private disposed = false;
  private lastTick = 0;
  private time = 0;
  private frame = 0;
  private speed = 1;
  private paused = false;
  private transitionMs = 1200;

  private baseW = 2;
  private baseH = 2;
  private resScale = 1;
  private dts: number[] = [];
  private goodWindows = 0;

  private mouse = { x: 0.5, y: 0.5, clickX: 0.5, clickY: 0.5, down: false, clicked: false };
  private paramCur = new Map<string, number[]>();
  private paramTarget = new Map<string, number[]>();

  private contextLosses = new Map<string, number>();
  private removeListeners: (() => void) | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly events: RuntimeEvents = {},
  ) {}

  init(): void {
    const gl = createContext(this.canvas);
    if (!gl) throw new Error('WebGL2 is not available on this device.');
    this.gl = gl;
    this.floatTargets = supportsFloatTargets(gl);
    this.buildBlit();
    this.attachListeners();
    this.lastTick = performance.now();
    this.running = true;
    this.raf = requestAnimationFrame(this.tick);
  }

  private buildBlit(): void {
    const gl = this.gl;
    if (!gl) return;
    const result = compileProgram(gl, BLIT_VS, BLIT_FS);
    if (!result.ok) throw new Error(`Loom blit shader failed: ${result.log}`);
    this.blit = {
      program: result.program,
      uNew: gl.getUniformLocation(result.program, 'uNew'),
      uOld: gl.getUniformLocation(result.program, 'uOld'),
      uFade: gl.getUniformLocation(result.program, 'uFade'),
      uSize: gl.getUniformLocation(result.program, 'uSize'),
    };
  }

  private attachListeners(): void {
    const canvas = this.canvas;
    const norm = (e: PointerEvent): { x: number; y: number } => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: Math.min(1, Math.max(0, (e.clientX - rect.left) / Math.max(1, rect.width))),
        y: 1 - Math.min(1, Math.max(0, (e.clientY - rect.top) / Math.max(1, rect.height))),
      };
    };
    const onMove = (e: PointerEvent) => {
      const p = norm(e);
      this.mouse.x = p.x;
      this.mouse.y = p.y;
    };
    const onDown = (e: PointerEvent) => {
      const p = norm(e);
      Object.assign(this.mouse, { x: p.x, y: p.y, clickX: p.x, clickY: p.y, down: true, clicked: true });
    };
    const onUp = () => {
      this.mouse.down = false;
    };
    const onLost = (e: Event) => {
      e.preventDefault();
      this.running = false;
    };
    const onRestored = () => {
      this.recoverFromContextLoss();
    };
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);
    this.removeListeners = () => {
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
    };
  }

  private recoverFromContextLoss(): void {
    const piece = this.set?.piece ?? this.lastGood;
    this.set = null;
    this.fadeTarget = null;
    this.blit = null;
    this.buildBlit();
    if (piece) {
      const key = compileKey(piece);
      const losses = (this.contextLosses.get(key) ?? 0) + 1;
      this.contextLosses.set(key, losses);
      if (losses >= 2 && this.lastGood && compileKey(this.lastGood) !== key) {
        const fallback = this.lastGood;
        this.setPiece(fallback, { transitionMs: 0 });
        this.events.onGpuHostileRevert?.(fallback);
      } else {
        this.setPiece(piece, { transitionMs: 0 });
      }
    }
    this.lastTick = performance.now();
    this.running = true;
    this.raf = requestAnimationFrame(this.tick);
  }

  // ── Public controls ─────────────────────────────────────────

  setSpeed(v: number): void {
    this.speed = v;
  }

  setPaused(v: boolean): void {
    this.paused = v;
  }

  setTransitionMs(v: number): void {
    this.transitionMs = v;
  }

  resize(cssWidth: number, cssHeight: number): void {
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    this.canvas.width = Math.max(2, Math.round(cssWidth * dpr));
    this.canvas.height = Math.max(2, Math.round(cssHeight * dpr));
    this.applyResScale();
  }

  private applyResScale(): void {
    this.baseW = Math.max(2, Math.round(this.canvas.width * this.resScale));
    this.baseH = Math.max(2, Math.round(this.canvas.height * this.resScale));
    this.set?.resize(this.baseW, this.baseH);
  }

  fps(): number {
    if (this.dts.length === 0) return 0;
    const avg = this.dts.reduce((a, b) => a + b, 0) / this.dts.length;
    return avg > 0 ? 1 / avg : 0;
  }

  /** Swap to a new piece (compile + cross-fade) or retarget params when only values changed. */
  setPiece(piece: LoomPiece, opts: { transitionMs?: number } = {}): SetPieceResult {
    const gl = this.gl;
    if (!gl) return { status: 'error', errors: [{ pass: 'image', line: null, message: 'Runtime not initialized' }] };
    const transition = opts.transitionMs ?? this.transitionMs;

    if (this.set && compileKey(this.set.piece) === compileKey(piece)) {
      // Same code — tween the uniforms only.
      this.retargetParams(piece);
      return { status: 'ok' };
    }

    const outcome = ProgramSet.compile(gl, piece, this.floatTargets);
    if (!outcome.ok) return { status: 'error', errors: outcome.errors };

    // Snapshot the outgoing frame so the new piece fades in over it.
    if (this.set) {
      this.snapshotForFade();
      this.lastGood = this.set.piece;
      this.set.dispose();
    }
    this.set = outcome.set;
    this.set.resize(this.baseW, this.baseH);
    this.frame = 0;
    this.fadeStart = performance.now();
    this.fadeMs = this.fadeTarget ? transition : 0;
    this.paramCur.clear();
    this.retargetParams(piece, true);
    return { status: 'ok' };
  }

  private retargetParams(piece: LoomPiece, snap = false): void {
    this.paramTarget.clear();
    for (const p of piece.params) {
      const target = flatten(piece, p.name, piece.paramValues[p.name]);
      this.paramTarget.set(p.name, target);
      if (snap || !this.paramCur.has(p.name)) this.paramCur.set(p.name, [...target]);
    }
    if (this.set) this.set.piece = piece;
  }

  private snapshotForFade(): void {
    const gl = this.gl;
    const source = this.set?.latestImage;
    if (!gl || !source) return;
    if (!this.fadeTarget || this.fadeTarget.width !== this.canvas.width || this.fadeTarget.height !== this.canvas.height) {
      deleteTarget(gl, this.fadeTarget);
      // Must match the pass targets' float-ness: blitFramebuffer cannot copy
      // a floating-point read buffer into a fixed-point draw buffer.
      this.fadeTarget = createTarget(gl, this.canvas.width, this.canvas.height, this.floatTargets);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, source.fbo);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, this.fadeTarget.fbo);
    gl.blitFramebuffer(0, 0, source.width, source.height, 0, 0, this.fadeTarget.width, this.fadeTarget.height, gl.COLOR_BUFFER_BIT, gl.LINEAR);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
  }

  // ── Frame loop ──────────────────────────────────────────────

  private tick = (): void => {
    if (!this.running || this.disposed) return;
    const now = performance.now();
    const dt = Math.min(0.1, Math.max(0.0001, (now - this.lastTick) / 1000));
    this.lastTick = now;
    this.watchdog(dt);

    if (!this.paused) this.time += dt * this.speed;
    this.stepParams(dt);
    this.renderOnce(this.paused ? 0 : dt * this.speed);
    this.mouse.clicked = false;
    this.raf = requestAnimationFrame(this.tick);
  };

  private stepParams(dt: number): void {
    const tau = Math.max(1, this.transitionMs) / 1000;
    const k = 1 - Math.exp((-5 * dt) / tau);
    for (const [name, target] of this.paramTarget) {
      const cur = this.paramCur.get(name) ?? [...target];
      for (let i = 0; i < target.length; i++) cur[i] += (target[i] - cur[i]) * k;
      this.paramCur.set(name, cur);
    }
  }

  private watchdog(dt: number): void {
    this.dts.push(dt);
    if (this.dts.length < 48) return;
    const avg = this.dts.reduce((a, b) => a + b, 0) / this.dts.length;
    this.dts = [];
    const idx = RES_STEPS.indexOf(this.resScale as (typeof RES_STEPS)[number]);
    if (avg > 0.05 && idx < RES_STEPS.length - 1) {
      this.resScale = RES_STEPS[idx + 1];
      this.goodWindows = 0;
      this.applyResScale();
    } else if (avg < 0.022 && idx > 0 && ++this.goodWindows >= 4) {
      this.resScale = RES_STEPS[idx - 1];
      this.goodWindows = 0;
      this.applyResScale();
    }
  }

  private frameEnv(dt: number): FrameEnv {
    return {
      time: this.time,
      timeDelta: dt,
      frame: this.frame,
      mouse: { ...this.mouse },
      params: this.paramCur,
    };
  }

  private renderOnce(dt: number): void {
    const gl = this.gl;
    if (!gl || !this.set || !this.blit) return;
    this.set.renderFrame(this.frameEnv(dt));
    this.frame++;

    const image = this.set.latestImage;
    if (!image) return;
    const fade = this.fadeMs <= 0 ? 1 : Math.min(1, (performance.now() - this.fadeStart) / this.fadeMs);
    this.blitTo(null, this.canvas.width, this.canvas.height, image, fade * fade * (3 - 2 * fade));
    if (fade >= 1) this.fadeMs = 0;
  }

  private blitTo(fbo: WebGLFramebuffer | null, width: number, height: number, image: Target, fade: number): void {
    const gl = this.gl;
    if (!gl || !this.blit) return;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.blit.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, image.tex);
    gl.uniform1i(this.blit.uNew, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, (this.fadeTarget ?? image).tex);
    gl.uniform1i(this.blit.uOld, 1);
    gl.uniform1f(this.blit.uFade, fade);
    gl.uniform2f(this.blit.uSize, width, height);
    drawFullscreen(gl);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ── Captures ────────────────────────────────────────────────

  private readTargetToDataUrl(target: Target, type: 'image/png' | 'image/jpeg', quality?: number): string {
    const gl = this.gl;
    if (!gl) throw new Error('Runtime not initialized');
    const { width, height } = target;
    const pixels = new Uint8Array(width * height * 4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // GL reads bottom-up; canvas wants top-down.
    const flipped = new Uint8ClampedArray(width * height * 4);
    const row = width * 4;
    for (let y = 0; y < height; y++) flipped.set(pixels.subarray(y * row, (y + 1) * row), (height - 1 - y) * row);
    for (let i = 3; i < flipped.length; i += 4) flipped[i] = 255;

    const out = document.createElement('canvas');
    out.width = width;
    out.height = height;
    out.getContext('2d')!.putImageData(new ImageData(flipped, width, height), 0, 0);
    return out.toDataURL(type, quality);
  }

  /**
   * Render one frame offscreen at the target resolution/aspect (recomposed, not
   * stretched) and return a PNG data URL. Feedback pieces get warm-up frames.
   */
  capture(width: number, height: number): string {
    const gl = this.gl;
    if (!gl || !this.set) throw new Error('Renderer is not ready');
    this.set.resize(width, height);
    const warmup = this.set.hasFeedback ? 36 : 0;
    let t = this.time - warmup / 30;
    for (let i = 0; i < warmup; i++) {
      t += 1 / 30;
      this.set.renderFrame({ ...this.frameEnv(1 / 30), time: t, frame: i });
    }
    this.set.renderFrame({ ...this.frameEnv(1 / 60), time: this.time });
    const image = this.set.latestImage;
    if (!image) throw new Error('No image pass output');

    const capTarget = createTarget(gl, width, height, false);
    this.blitTo(capTarget.fbo, width, height, image, 1);
    const dataUrl = this.readTargetToDataUrl(capTarget, 'image/png');
    deleteTarget(gl, capTarget);
    this.set.resize(this.baseW, this.baseH);
    return dataUrl;
  }

  /**
   * Capture small frames for the agent's eyes without disturbing the live
   * buffers' size: renders at current resolution, downsampled into `width`.
   * Time between frames is simulated (no real waiting).
   */
  seeFrames(width: number, frames: number, spacingSeconds: number): string[] {
    const gl = this.gl;
    if (!gl || !this.set) throw new Error('Renderer is not ready');
    const aspect = this.canvas.height / Math.max(1, this.canvas.width);
    const height = Math.max(16, Math.round(width * aspect));
    const capTarget = createTarget(gl, width, height, false);
    const urls: string[] = [];
    let t = this.time;
    for (let i = 0; i < frames; i++) {
      if (i > 0) {
        const steps = Math.min(240, Math.max(1, Math.round(spacingSeconds * 60)));
        const stepDt = spacingSeconds / steps;
        for (let s = 0; s < steps; s++) {
          t += stepDt;
          this.set.renderFrame({ ...this.frameEnv(stepDt), time: t, frame: this.frame++ });
        }
      } else {
        this.set.renderFrame({ ...this.frameEnv(1 / 60), time: t });
      }
      const image = this.set.latestImage;
      if (!image) break;
      this.blitTo(capTarget.fbo, width, height, image, 1);
      urls.push(this.readTargetToDataUrl(capTarget, 'image/jpeg', 0.85));
    }
    deleteTarget(gl, capTarget);
    return urls;
  }

  dispose(): void {
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.removeListeners?.();
    this.removeListeners = null;
    const gl = this.gl;
    if (gl) {
      this.set?.dispose();
      deleteTarget(gl, this.fadeTarget);
      if (this.blit) gl.deleteProgram(this.blit.program);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
    this.set = null;
    this.fadeTarget = null;
    this.blit = null;
    this.gl = null;
  }
}
