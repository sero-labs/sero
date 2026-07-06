import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { readState, updateLoomState, waitForState, writeSeeFrames } from '../state-io';

let dir = '';
let file = '';

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'loom-state-'));
  file = path.join(dir, 'state.json');
});
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe('updateLoomState — atomic read-modify-write', () => {
  it('does not lose concurrent updates (no stale-read clobber)', async () => {
    const N = 50;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        updateLoomState(file, (s) => {
          s.presets.push({ id: `p${i}`, name: `n${i}`, createdAt: i, piece: s.piece });
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
        s.revision += 1;
      }),
    ]);
    const final = await readState(file);
    expect(final.direction.guidance).toBe('dark teal');
    expect(final.revision).toBe(1);
  });
});

describe('waitForState — push-based handshake', () => {
  it('resolves immediately when the predicate already holds', async () => {
    await updateLoomState(file, (s) => {
      s.revision = 3;
      s.build = { revision: 3, status: 'ok', errors: [] };
    });
    const state = await waitForState(file, (s) => s.build?.revision === 3, 1_000);
    expect(state?.build?.status).toBe('ok');
  });

  it('resolves when a later write satisfies the predicate', async () => {
    const waiting = waitForState(file, (s) => s.build?.revision === 7, 5_000);
    setTimeout(() => {
      void updateLoomState(file, (s) => {
        s.revision = 7;
        s.build = { revision: 7, status: 'error', errors: [{ pass: 'image', line: 2, message: 'boom' }] };
      });
    }, 50);
    const state = await waiting;
    expect(state?.build?.errors[0].message).toBe('boom');
  });

  it('returns null on timeout', async () => {
    const state = await waitForState(file, (s) => s.revision === 99, 150);
    expect(state).toBeNull();
  });
});

describe('writeSeeFrames', () => {
  it('writes frames and prunes previous requests', async () => {
    process.env.SERO_HOME = dir;
    try {
      const first = await writeSeeFrames('/unused', 'req-1', [Buffer.from('a'), Buffer.from('b')]);
      expect(first.length).toBe(2);
      const second = await writeSeeFrames('/unused', 'req-2', [Buffer.from('c')]);
      expect(second.length).toBe(1);
      const files = await fs.readdir(path.join(dir, 'apps', 'loom', 'see'));
      expect(files).toEqual(['req-2-1.jpg']);
    } finally {
      delete process.env.SERO_HOME;
    }
  });
});
