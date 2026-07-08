// Pure GLSL source assembly for a Loom pass, plus compile-error mapping back to
// the author's own line numbers. Headless (no GL) so it is unit-testable and the
// error contract stays stable.

import type { LoomPass, LoomPiece, PieceParam } from './piece';

export const VERTEX_SOURCE = `#version 300 es
void main() {
  // Fullscreen triangle from gl_VertexID — no buffers needed.
  vec2 pos = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(pos * 2.0 - 1.0, 0.0, 1.0);
}`;

function paramDecl(p: PieceParam): string {
  switch (p.kind) {
    case 'slider':
    case 'toggle':
      return `uniform float u_${p.name};`;
    case 'color':
      return `uniform vec3 u_${p.name};`;
    case 'xy':
      return `uniform vec2 u_${p.name};`;
  }
}

export interface AssembledPass {
  source: string;
  /** 1-indexed line in `source` where `common` starts (0 when there is no common block). */
  commonStart: number;
  /** 1-indexed line in `source` where the pass's own code starts. */
  codeStart: number;
  /** 1-indexed line in `source` where the pass's own code ends (before the wrapper). */
  codeEnd: number;
}

const countLines = (s: string): number => s.split('\n').length;

/** Wrap a pass's mainImage code in the Shadertoy-style prelude the runtime provides. */
export function assemblePassSource(piece: LoomPiece, pass: LoomPass): AssembledPass {
  const prelude = [
    '#version 300 es',
    'precision highp float;',
    'precision highp int;',
    'uniform vec3 iResolution;',
    'uniform float iTime;',
    'uniform float iTimeDelta;',
    'uniform int iFrame;',
    'uniform vec4 iMouse;',
    'uniform sampler2D iChannel0;',
    'uniform sampler2D iChannel1;',
    'uniform sampler2D iChannel2;',
    'uniform sampler2D iChannel3;',
    ...piece.params.map(paramDecl),
    'out vec4 loom_fragColor;',
  ].join('\n');

  const common = piece.common ?? '';
  const preludeLines = countLines(prelude);
  const commonStart = common ? preludeLines + 1 : 0;
  const codeStart = preludeLines + (common ? countLines(common) : 0) + 1;
  const codeEnd = codeStart + countLines(pass.code) - 1;

  const source = [
    prelude,
    ...(common ? [common] : []),
    pass.code,
    'void main() { mainImage(loom_fragColor, gl_FragCoord.xy); }',
  ].join('\n');

  return { source, commonStart, codeStart, codeEnd };
}

export interface MappedError {
  /** 1-indexed line in the author's pass code (or common block), null when unmapped. */
  line: number | null;
  message: string;
}

// ANGLE/driver logs look like: `ERROR: 0:42: 'foo' : undeclared identifier`.
const ERROR_LINE_RE = /^(?:ERROR|WARNING):\s*\d+:(\d+):\s*(.*)$/;

/**
 * Map a raw GLSL info log to the author's coordinates. Errors inside the shared
 * `common` block are labelled as such; prelude/wrapper errors stay unmapped.
 */
export function mapErrorLog(log: string, assembled: AssembledPass): MappedError[] {
  const out: MappedError[] = [];
  for (const raw of log.split('\n')) {
    const trimmed = raw.trim();
    if (!trimmed || trimmed.startsWith('WARNING:')) continue;
    const m = ERROR_LINE_RE.exec(trimmed);
    if (!m) {
      if (trimmed.startsWith('ERROR:')) out.push({ line: null, message: trimmed.replace(/^ERROR:\s*/, '') });
      continue;
    }
    const srcLine = Number(m[1]);
    const message = m[2].trim();
    if (srcLine > assembled.codeEnd) {
      // The auto-appended `void main() { mainImage(...) }` wrapper — e.g. a
      // missing/mistyped mainImage. There is no author line to point at.
      out.push({ line: null, message });
    } else if (srcLine >= assembled.codeStart) {
      out.push({ line: srcLine - assembled.codeStart + 1, message });
    } else if (assembled.commonStart > 0 && srcLine >= assembled.commonStart) {
      out.push({ line: srcLine - assembled.commonStart + 1, message: `(in common) ${message}` });
    } else {
      out.push({ line: null, message });
    }
  }
  return out;
}
