import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { runRefresh } from '../refresh';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), 'usage-refresh-'));
  process.env.SERO_HOME = path.join(dir, 'sero-home');
  process.env.PI_CODING_AGENT_DIR = path.join(dir, 'agent');
  await mkdir(path.join(dir, 'agent', 'sessions'), { recursive: true });
});

afterEach(async () => {
  delete process.env.SERO_HOME;
  delete process.env.PI_CODING_AGENT_DIR;
  await rm(dir, { recursive: true, force: true });
});

async function writeSession(name: string, sessionId: string, cost: number): Promise<void> {
  const now = Date.now();
  await writeFile(
    path.join(dir, 'agent', 'sessions', name),
    [
      JSON.stringify({ type: 'session', id: sessionId, cwd: '/w', timestamp: new Date(now).toISOString() }),
      JSON.stringify({
        type: 'message',
        message: {
          role: 'assistant',
          provider: 'anthropic',
          model: 'claude-opus-4-5',
          timestamp: now,
          usage: { input: 100, output: 50, cacheRead: 0, cacheWrite: 20, cost: { total: cost } },
        },
      }),
    ].join('\n'),
  );
}

describe('runRefresh end-to-end', () => {
  it('scans sessions, writes state.json, and reuses the cache on the next run', async () => {
    await writeSession('a.jsonl', 'sess-a', 1.5);
    await writeSession('b.jsonl', 'sess-b', 0.5);

    const first = await runRefresh(true);
    expect(first.skipped).toBe(false);
    expect(first.files).toBe(2);
    expect(first.reused).toBe(0);
    expect(first.state.periods.allTime.totals.cost).toBe(2);
    expect(first.state.periods.today.totals.sessions).toBe(2);
    expect(first.state.hourly.length).toBeGreaterThan(0);

    const written = JSON.parse(
      await readFile(path.join(dir, 'sero-home', 'apps', 'usage', 'state.json'), 'utf8'),
    );
    expect(written.periods.allTime.totals.messages).toBe(2);
    expect(written.lastScan.files).toBe(2);

    const second = await runRefresh(true);
    expect(second.reused).toBe(2);
  });

  it('treats a non-forced refresh within the fresh window as already fresh', async () => {
    await writeSession('a.jsonl', 'sess-a', 1);
    await runRefresh(true);
    const skipped = await runRefresh(false);
    expect(skipped.skipped).toBe(true);
  });

  it('fails with a clear error when the Sero env vars are missing', async () => {
    delete process.env.PI_CODING_AGENT_DIR;
    await expect(runRefresh(true)).rejects.toThrow(/PI_CODING_AGENT_DIR/);
  });
});
