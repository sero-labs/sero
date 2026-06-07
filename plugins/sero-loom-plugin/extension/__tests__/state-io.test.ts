import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readState, updateLoomState } from '../state-io';

describe('updateLoomState — atomic read-modify-write', () => {
  let dir = '';
  let file = '';

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), 'loom-state-'));
    file = path.join(dir, 'state.json');
  });
  afterEach(async () => {
    await fs.rm(dir, { recursive: true, force: true });
  });

  it('does not lose concurrent updates (no stale-read clobber)', async () => {
    const N = 50;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        updateLoomState(file, (s) => {
          s.presets.push({ id: `p${i}`, name: `n${i}`, createdAt: i, graph: s.graph });
        }),
      ),
    );
    const final = await readState(file);
    expect(final.presets.length).toBe(N);
    expect(new Set(final.presets.map((p) => p.id)).size).toBe(N);
  });

  it('serializes interleaved compose + direction transactions', async () => {
    await Promise.all([
      updateLoomState(file, (s) => {
        s.direction.guidance = 'dark teal';
      }),
      updateLoomState(file, (s) => {
        s.graph.speed = 2;
      }),
    ]);
    const final = await readState(file);
    expect(final.direction.guidance).toBe('dark teal');
    expect(final.graph.speed).toBe(2);
  });
});
