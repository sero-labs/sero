import { describe, expect, it } from 'vitest';

import { assemblePassSource, mapErrorLog } from '../glsl';
import {
  compileKey,
  DEFAULT_PIECE,
  normalizePiece,
  PIECE_LIMITS,
  type LoomPiece,
} from '../piece';
import { DEFAULT_LOOM_STATE, normalizeLoomState } from '../types';

const minimalPiece = (over: Partial<LoomPiece> = {}): LoomPiece =>
  normalizePiece({
    title: 'Test',
    idea: '',
    passes: [{ id: 'image', code: 'void mainImage(out vec4 c, in vec2 f) { c = vec4(1.0); }' }],
    params: [],
    paramValues: {},
    ...over,
  });

describe('normalizePiece', () => {
  it('falls back to the default piece when there are no usable passes', () => {
    expect(normalizePiece({ passes: [] })).toEqual(DEFAULT_PIECE);
    expect(normalizePiece(undefined)).toEqual(DEFAULT_PIECE);
  });

  it('moves the image pass last and dedupes pass ids', () => {
    const p = normalizePiece({
      passes: [
        { id: 'image', code: 'img' },
        { id: 'A', code: 'a1' },
        { id: 'A', code: 'a2' },
      ],
    });
    expect(p.passes.map((x) => x.id)).toEqual(['A', 'image']);
    expect(p.passes[0].code).toBe('a1');
  });

  it('synthesizes an image pass showing the last buffer when none is given', () => {
    const p = normalizePiece({ passes: [{ id: 'B', code: 'b' }] });
    const image = p.passes[p.passes.length - 1];
    expect(image.id).toBe('image');
    expect(image.inputs).toEqual([{ channel: 0, source: 'B' }]);
  });

  it('clamps params, drops invalid names, and normalizes values', () => {
    const p = normalizePiece({
      passes: [{ id: 'image', code: 'x' }],
      params: [
        { name: 'speed', label: 'Speed', kind: 'slider', min: 0, max: 2, default: 5 },
        { name: 'bad name', kind: 'slider', min: 0, max: 1, default: 0 },
        { name: 'tint', kind: 'color', default: [2, -1, 0.5] },
      ],
      paramValues: { speed: 99, tint: 'nope' },
    });
    expect(p.params.map((x) => x.name)).toEqual(['speed', 'tint']);
    expect(p.paramValues.speed).toBe(2); // clamped to max
    expect(p.paramValues.tint).toEqual([1, 0, 0.5]); // default, channel-clamped
  });

  it('enforces structural caps', () => {
    const passes = ['A', 'B', 'C', 'D', 'image', 'image'].map((id) => ({ id, code: 'x' }));
    const params = Array.from({ length: 12 }, (_, i) => ({
      name: `p${i}`,
      kind: 'slider',
      min: 0,
      max: 1,
      default: 0,
    }));
    const p = normalizePiece({ passes, params });
    expect(p.passes.length).toBeLessThanOrEqual(PIECE_LIMITS.maxPasses);
    expect(p.params.length).toBe(PIECE_LIMITS.maxParams);
  });

  it('dedupes channel bindings per channel', () => {
    const p = normalizePiece({
      passes: [
        { id: 'A', code: 'a', inputs: [{ channel: 0, source: 'self' }, { channel: 0, source: 'A' }] },
        { id: 'image', code: 'x' },
      ],
    });
    expect(p.passes[0].inputs).toEqual([{ channel: 0, source: 'self' }]);
  });

  it('drops channel bindings that reference an absent pass', () => {
    const p = normalizePiece({
      passes: [
        { id: 'A', code: 'a', inputs: [{ channel: 0, source: 'self' }, { channel: 1, source: 'C' }] },
        { id: 'image', code: 'x', inputs: [{ channel: 0, source: 'A' }, { channel: 1, source: 'B' }] },
      ],
    });
    // 'self' and the present 'A' survive; the dangling 'C'/'B' bindings are removed.
    expect(p.passes[0].inputs).toEqual([{ channel: 0, source: 'self' }]);
    expect(p.passes[1].inputs).toEqual([{ channel: 0, source: 'A' }]);
  });

  it('always emits a defined common block (even empty) so the UI merge cannot inject one', () => {
    const p = normalizePiece({ passes: [{ id: 'image', code: 'x' }] });
    expect(p.common).toBe('');
    expect(Object.prototype.hasOwnProperty.call(p, 'common')).toBe(true);
  });
});

describe('compileKey', () => {
  it('changes on code or param declarations, not on param values', () => {
    const a = minimalPiece();
    const b = { ...a, paramValues: { ...a.paramValues } };
    expect(compileKey(a)).toBe(compileKey(b));

    const recoded = normalizePiece({ ...a, passes: [{ id: 'image', code: 'different' }] });
    expect(compileKey(recoded)).not.toBe(compileKey(a));
  });
});

describe('assemblePassSource / mapErrorLog', () => {
  const piece = normalizePiece({
    common: 'float helper() { return 1.0; }\nfloat helper2() { return 2.0; }',
    passes: [{ id: 'image', code: 'void mainImage(out vec4 c, in vec2 f) {\n  c = vec4(helper());\n}' }],
    params: [{ name: 'drift', label: 'Drift', kind: 'slider', min: 0, max: 1, default: 0 }],
  });

  it('assembles a complete GLSL 300 es source with param uniforms', () => {
    const a = assemblePassSource(piece, piece.passes[0]);
    expect(a.source.startsWith('#version 300 es')).toBe(true);
    expect(a.source).toContain('uniform float u_drift;');
    expect(a.source).toContain('void main() { mainImage(loom_fragColor, gl_FragCoord.xy); }');
    // The author's code must sit exactly at codeStart.
    expect(a.source.split('\n')[a.codeStart - 1]).toBe('void mainImage(out vec4 c, in vec2 f) {');
    expect(a.source.split('\n')[a.commonStart - 1]).toBe('float helper() { return 1.0; }');
  });

  it('maps error lines back to the author code and common block', () => {
    const a = assemblePassSource(piece, piece.passes[0]);
    const log = [
      `ERROR: 0:${a.codeStart + 1}: 'vec4' : constructor error`,
      `ERROR: 0:${a.commonStart}: 'helper' : redefinition`,
      'ERROR: 0:2: prelude problem',
      'WARNING: 0:5: ignored',
    ].join('\n');
    const mapped = mapErrorLog(log, a);
    expect(mapped).toEqual([
      { line: 2, message: "'vec4' : constructor error" },
      { line: 1, message: "(in common) 'helper' : redefinition" },
      { line: null, message: 'prelude problem' },
    ]);
  });

  it('maps errors on the auto-appended mainImage wrapper to no author line', () => {
    const a = assemblePassSource(piece, piece.passes[0]);
    // The wrapper `void main() { mainImage(...) }` sits one line past codeEnd —
    // a wrong mainImage signature reports here and must not point past the code.
    const log = `ERROR: 0:${a.codeEnd + 1}: 'mainImage' : no matching overloaded function`;
    expect(mapErrorLog(log, a)).toEqual([
      { line: null, message: "'mainImage' : no matching overloaded function" },
    ]);
  });
});

describe('normalizeLoomState (migration)', () => {
  it('returns defaults for garbage', () => {
    expect(normalizeLoomState(null)).toEqual(DEFAULT_LOOM_STATE);
  });

  it('migrates v2 state: default live piece, presets keep legacy graph, speed carries', () => {
    const v2 = {
      version: 2,
      graph: { background: [0, 0, 0], speed: 1.7, layers: [{ type: 'raymarch' }] },
      direction: { guidance: 'slow and dark' },
      presets: [{ id: 'piece-1', name: 'Old', createdAt: 5, graph: { layers: [] } }],
      settings: { transitionMs: 800, paused: true, quality: 'high', rendererBackend: 'webgpu' },
    };
    const s = normalizeLoomState(v2);
    expect(s.version).toBe(3);
    expect(s.piece).toEqual(DEFAULT_PIECE);
    expect(s.direction.guidance).toBe('slow and dark');
    expect(s.settings.speed).toBeCloseTo(1.7);
    expect(s.settings.transitionMs).toBe(800);
    expect(s.settings.paused).toBe(true);
    expect(s.presets).toEqual([{ id: 'piece-1', name: 'Old', createdAt: 5, legacyGraph: { layers: [] } }]);
  });

  it('migrates v1 presets (config) to legacyGraph', () => {
    const s = normalizeLoomState({
      version: 1,
      live: { paradigm: 'particles' },
      presets: [{ id: 'p', name: 'V1', createdAt: 1, config: { paradigm: 'raymarch' } }],
    });
    expect(s.presets[0].legacyGraph).toEqual({ paradigm: 'raymarch' });
    expect(s.presets[0].piece).toBeUndefined();
  });

  it('round-trips v3 state including build report and see request', () => {
    const v3 = {
      ...DEFAULT_LOOM_STATE,
      revision: 7,
      build: { revision: 7, status: 'error', errors: [{ pass: 'image', line: 3, message: 'boom' }], fps: 58.6 },
      seeRequest: { id: 'see-1', frames: 2, spacingSeconds: 3, width: 768 },
      seeResult: { id: 'see-0', paths: ['/tmp/a.jpg'] },
    };
    const s = normalizeLoomState(JSON.parse(JSON.stringify(v3)));
    expect(s.revision).toBe(7);
    expect(s.build).toEqual({ revision: 7, status: 'error', errors: [{ pass: 'image', line: 3, message: 'boom' }], fps: 59 });
    expect(s.seeRequest).toEqual({ id: 'see-1', frames: 2, spacingSeconds: 3, width: 768 });
    expect(s.seeResult).toEqual({ id: 'see-0', paths: ['/tmp/a.jpg'] });
  });

  it('drops presets that carry neither a piece nor legacy data', () => {
    const s = normalizeLoomState({ ...DEFAULT_LOOM_STATE, presets: [{ id: 'x', name: 'empty' }] });
    expect(s.presets).toEqual([]);
  });
});
