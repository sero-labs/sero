import { describe, expect, it } from 'vitest';

import { validateExprWith } from '../expr';
import { normalizeGraph, randomGraph, validateGraph } from '../graph';
import { normalizeLoomState } from '../types';

describe('context-specific expression validation', () => {
  it('flags p.x in raymarch colorDrive (p is not in that scope)', () => {
    const g = normalizeGraph({ layers: [{ type: 'raymarch', colorDrive: 'p.x + t' }] });
    const issues = validateGraph(g);
    expect(issues.some((i) => i.path.endsWith('colorDrive'))).toBe(true);
  });

  it('flags depth in a particle field (depth is raymarch-only)', () => {
    const g = normalizeGraph({ layers: [{ type: 'particles', field: 'vec3(depth, t, id)' }] });
    const issues = validateGraph(g);
    expect(issues.some((i) => i.path.endsWith('field'))).toBe(true);
  });

  it('accepts expressions that use only each field\'s real variables', () => {
    const g = normalizeGraph({
      layers: [
        {
          type: 'raymarch',
          colorDrive: '0.3*depth + ny + 0.02*t',
          sdf: { kind: 'shape', shape: 'sphere', size: { expr: '1 + 0.2*sin(t) + p.x*0' }, at: [0, 0, 0] },
        },
        { type: 'particles', field: 'vec3(sin(p.y+t), id, cos(p.z))', colorDrive: 'id + speed*0.1 + t' },
      ],
    });
    expect(validateGraph(g)).toEqual([]);
  });

  it('validateExprWith honors the allowed set (pi always allowed)', () => {
    expect(validateExprWith('bass*2', new Set(['t'])).ok).toBe(false);
    expect(validateExprWith('sin(t)*pi', new Set(['t'])).ok).toBe(true);
  });
});

describe('randomGraph', () => {
  it('produces graphs with no expression issues across seeds', () => {
    for (let i = 0; i < 25; i++) {
      expect(validateGraph(randomGraph(i))).toEqual([]);
    }
  });
});

describe('v1 → v2 migration', () => {
  it('migrates a legacy live config into a v2 graph', () => {
    const s = normalizeLoomState({
      version: 1,
      live: {
        paradigm: 'raymarch',
        motion: { speed: 1.2 },
        raymarch: { primitives: [{ shape: 'torus', position: [0, 0, 0], scale: 1 }] },
      },
      presets: [{ id: 'p1', name: 'old', config: { paradigm: 'particles', particles: { count: 1000 } } }],
    });
    expect(s.version).toBe(2);
    expect(s.graph.layers[0].type).toBe('raymarch');
    expect(s.graph.speed).toBeCloseTo(1.2);
    expect(s.presets[0].graph.layers[0].type).toBe('particles');
  });
});
