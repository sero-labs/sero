// Compiles a LoomPiece into a set of per-pass GL programs with ping-pong
// render targets, and renders one frame of the whole pass chain.

import {
  assemblePassSource,
  mapErrorLog,
  VERTEX_SOURCE,
  type BuildError,
  type LoomPass,
  type LoomPiece,
  type PassId,
} from '../../shared/types';
import { clearTarget, compileProgram, createTarget, deleteTarget, drawFullscreen, type Target } from './gl';

interface PassProgram {
  pass: LoomPass;
  program: WebGLProgram;
  loc: {
    iResolution: WebGLUniformLocation | null;
    iTime: WebGLUniformLocation | null;
    iTimeDelta: WebGLUniformLocation | null;
    iFrame: WebGLUniformLocation | null;
    iMouse: WebGLUniformLocation | null;
    iChannel: (WebGLUniformLocation | null)[];
    params: Map<string, WebGLUniformLocation | null>;
  };
  /** Ping-pong pair; `write` indexes the texture rendered this frame. */
  ping: [Target, Target] | null;
  write: 0 | 1;
}

export interface FrameEnv {
  time: number;
  timeDelta: number;
  frame: number;
  /** Shadertoy iMouse in normalized [0..1] coords; scaled per-pass to pixels. */
  mouse: { x: number; y: number; clickX: number; clickY: number; down: boolean; clicked: boolean };
  /** Tweened param values, flattened to float arrays. */
  params: Map<string, number[]>;
}

export type CompileOutcome = { ok: true; set: ProgramSet } | { ok: false; errors: BuildError[] };

const DEFAULT_BUFFER_SCALE = 0.5;

export class ProgramSet {
  private constructor(
    private readonly gl: WebGL2RenderingContext,
    /** Mutable so param-value-only updates (same compileKey) can adopt the new piece without a rebuild. */
    public piece: LoomPiece,
    private readonly passes: PassProgram[],
    private readonly float: boolean,
  ) {}

  static compile(gl: WebGL2RenderingContext, piece: LoomPiece, float: boolean): CompileOutcome {
    const passes: PassProgram[] = [];
    const errors: BuildError[] = [];
    for (const pass of piece.passes) {
      const assembled = assemblePassSource(piece, pass);
      const result = compileProgram(gl, VERTEX_SOURCE, assembled.source);
      if (!result.ok) {
        for (const e of mapErrorLog(result.log, assembled)) {
          errors.push({ pass: pass.id, line: e.line, message: e.message });
        }
        if (!errors.some((e) => e.pass === pass.id)) {
          errors.push({ pass: pass.id, line: null, message: result.log.trim() || 'Unknown compile error' });
        }
        continue;
      }
      const program = result.program;
      const params = new Map<string, WebGLUniformLocation | null>();
      for (const p of piece.params) params.set(p.name, gl.getUniformLocation(program, `u_${p.name}`));
      passes.push({
        pass,
        program,
        loc: {
          iResolution: gl.getUniformLocation(program, 'iResolution'),
          iTime: gl.getUniformLocation(program, 'iTime'),
          iTimeDelta: gl.getUniformLocation(program, 'iTimeDelta'),
          iFrame: gl.getUniformLocation(program, 'iFrame'),
          iMouse: gl.getUniformLocation(program, 'iMouse'),
          iChannel: [0, 1, 2, 3].map((i) => gl.getUniformLocation(program, `iChannel${i}`)),
          params,
        },
        ping: null,
        write: 0,
      });
    }
    if (errors.length > 0) {
      for (const p of passes) gl.deleteProgram(p.program);
      return { ok: false, errors };
    }
    return { ok: true, set: new ProgramSet(gl, piece, passes, float) };
  }

  /** (Re)allocate targets for a base resolution; resets feedback state. */
  resize(width: number, height: number): void {
    const { gl } = this;
    for (const p of this.passes) {
      const scale = p.pass.id === 'image' ? 1 : (p.pass.scale ?? DEFAULT_BUFFER_SCALE);
      const w = Math.max(1, Math.round(width * scale));
      const h = Math.max(1, Math.round(height * scale));
      if (p.ping && p.ping[0].width === w && p.ping[0].height === h) continue;
      if (p.ping) for (const t of p.ping) deleteTarget(gl, t);
      p.ping = [createTarget(gl, w, h, this.float), createTarget(gl, w, h, this.float)];
      p.write = 0;
      for (const t of p.ping) clearTarget(gl, t);
    }
  }

  renderFrame(env: FrameEnv): void {
    const { gl } = this;
    // Previous-frame outputs, readable by any pass ('self' and forward references).
    const previous = new Map<PassId, Target>();
    const latest = new Map<PassId, Target>();
    for (const p of this.passes) {
      if (p.ping) previous.set(p.pass.id, p.ping[1 - p.write]);
    }

    for (const p of this.passes) {
      if (!p.ping) continue;
      const target = p.ping[p.write];
      gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
      gl.viewport(0, 0, target.width, target.height);
      gl.useProgram(p.program);

      gl.uniform3f(p.loc.iResolution, target.width, target.height, 1);
      gl.uniform1f(p.loc.iTime, env.time);
      gl.uniform1f(p.loc.iTimeDelta, env.timeDelta);
      gl.uniform1i(p.loc.iFrame, env.frame);
      const m = env.mouse;
      // Shadertoy iMouse.zw carry the click position with a sign that encodes
      // button-down / clicked-this-frame. Bias the magnitude off zero so the
      // sign survives a click at the exact left/bottom edge (coord 0), where
      // `iMouse.z > 0.0` would otherwise read as button-up.
      const clickX = Math.max(0.5, m.clickX * target.width);
      const clickY = Math.max(0.5, m.clickY * target.height);
      gl.uniform4f(
        p.loc.iMouse,
        m.x * target.width,
        m.y * target.height,
        (m.down ? 1 : -1) * clickX,
        (m.clicked ? 1 : -1) * clickY,
      );
      for (const param of this.piece.params) {
        const loc = p.loc.params.get(param.name);
        const v = env.params.get(param.name);
        if (!loc || !v) continue;
        if (v.length === 1) gl.uniform1f(loc, v[0]);
        else if (v.length === 2) gl.uniform2f(loc, v[0], v[1]);
        else gl.uniform3f(loc, v[0], v[1], v[2]);
      }

      for (const binding of p.pass.inputs ?? []) {
        const source =
          binding.source === 'self'
            ? previous.get(p.pass.id)
            : (latest.get(binding.source) ?? previous.get(binding.source));
        if (!source) continue;
        gl.activeTexture(gl.TEXTURE0 + binding.channel);
        gl.bindTexture(gl.TEXTURE_2D, source.tex);
        gl.uniform1i(p.loc.iChannel[binding.channel], binding.channel);
      }

      drawFullscreen(gl);
      latest.set(p.pass.id, target);
      p.write = (1 - p.write) as 0 | 1;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  /** Latest rendered image-pass target (call after renderFrame). */
  get latestImage(): Target | null {
    const image = this.passes[this.passes.length - 1];
    if (!image?.ping) return null;
    return image.ping[1 - image.write];
  }

  /**
   * True only for genuine feedback: a pass sampling its own previous frame
   * ('self'), or a pass reading a pass that renders later in the chain (a
   * forward reference resolved from the previous frame). A pure feed-forward
   * multi-pass chain has no feedback and needs no warm-up.
   */
  get hasFeedback(): boolean {
    const order = new Map<PassId, number>(this.piece.passes.map((p, i) => [p.id, i]));
    return this.piece.passes.some((p, i) =>
      (p.inputs ?? []).some((b) => b.source === 'self' || (order.get(b.source) ?? -1) >= i),
    );
  }

  dispose(): void {
    const { gl } = this;
    for (const p of this.passes) {
      gl.deleteProgram(p.program);
      if (p.ping) for (const t of p.ping) deleteTarget(gl, t);
      p.ping = null;
    }
  }
}
