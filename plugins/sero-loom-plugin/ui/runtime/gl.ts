// Low-level WebGL2 helpers for the Loom runtime: context creation, program
// compilation with captured info logs, and render targets.

export interface Target {
  tex: WebGLTexture;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

export function createContext(canvas: HTMLCanvasElement): WebGL2RenderingContext | null {
  return canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });
}

/** Render targets are RGBA16F when renderable on this device (feedback sims want range), else RGBA8. */
export function supportsFloatTargets(gl: WebGL2RenderingContext): boolean {
  return gl.getExtension('EXT_color_buffer_float') !== null;
}

export type ProgramResult = { ok: true; program: WebGLProgram } | { ok: false; log: string };

export function compileProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string): ProgramResult {
  const compile = (type: number, source: string): { shader: WebGLShader } | { log: string } => {
    const shader = gl.createShader(type);
    if (!shader) return { log: 'Failed to allocate shader' };
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(shader) ?? '';
      gl.deleteShader(shader);
      return { log: log || 'Unknown shader compile error' };
    }
    return { shader };
  };

  const vs = compile(gl.VERTEX_SHADER, vsSource);
  if ('log' in vs) return { ok: false, log: vs.log };
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  if ('log' in fs) {
    gl.deleteShader(vs.shader);
    return { ok: false, log: fs.log };
  }

  const program = gl.createProgram();
  gl.attachShader(program, vs.shader);
  gl.attachShader(program, fs.shader);
  gl.linkProgram(program);
  gl.deleteShader(vs.shader);
  gl.deleteShader(fs.shader);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program) ?? 'Unknown link error';
    gl.deleteProgram(program);
    return { ok: false, log };
  }
  return { ok: true, program };
}

export function createTarget(gl: WebGL2RenderingContext, width: number, height: number, float: boolean): Target {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, float ? gl.RGBA16F : gl.RGBA8, Math.max(1, width), Math.max(1, height));
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return { tex, fbo, width: Math.max(1, width), height: Math.max(1, height) };
}

export function deleteTarget(gl: WebGL2RenderingContext, target: Target | null | undefined): void {
  if (!target) return;
  gl.deleteFramebuffer(target.fbo);
  gl.deleteTexture(target.tex);
}

/** Clear a target to transparent black (fresh feedback buffers must start deterministic). */
export function clearTarget(gl: WebGL2RenderingContext, target: Target): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  gl.viewport(0, 0, target.width, target.height);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

/** Draw the fullscreen triangle (vertices synthesized from gl_VertexID). */
export function drawFullscreen(gl: WebGL2RenderingContext): void {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
