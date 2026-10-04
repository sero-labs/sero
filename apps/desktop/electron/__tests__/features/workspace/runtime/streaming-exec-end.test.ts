/**
 * When a streamed command ends.
 *
 * A real shell runs each case, because the fault these guard against is in how
 * a process and the processes it starts hold their output pipes: a shell that
 * starts a server never lets its pipes close, and a wait on the pipes is a wait
 * for good.
 */

import { describe, expect, it } from 'vitest';
import { runStreamingExec } from '@electron/features/workspace/runtime/streaming-exec';

function collect() {
  const chunks: Buffer[] = [];
  return {
    sink: { write: (_stream: 'stdout' | 'stderr', chunk: Buffer) => { chunks.push(chunk); }, close: () => {} },
    text: () => Buffer.concat(chunks).toString('utf8'),
  };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

const sh = (script: string) => ({ program: '/bin/sh', args: ['-c', script] });

describe.skipIf(process.platform === 'win32')('a streamed command', () => {
  it('returns when the shell ends, although a process it left behind still holds the pipes', async () => {
    const out = collect();
    const began = Date.now();
    // The background process inherits stdout, the way a dev server does.
    const outcome = await runStreamingExec({ ...sh('sleep 20 & echo "pid $!"'), timeoutMs: 15_000, sink: out.sink });

    expect(outcome).toMatchObject({ exitCode: 0, timedOut: false });
    expect(Date.now() - began).toBeLessThan(5_000);
    const pid = Number(out.text().match(/pid (\d+)/)?.[1]);
    // The process the command left running is the caller's to keep: a server
    // started on purpose stays up for the next command.
    expect(alive(pid)).toBe(true);
    process.kill(pid, 'SIGKILL');
  });

  it('ends a server the shell started in the foreground when the time limit passes', async () => {
    const out = collect();
    const began = Date.now();
    // `cd` first, so the shell forks the server instead of becoming it.
    const outcome = await runStreamingExec({ ...sh('cd / && echo "pid $$" && sleep 20'), timeoutMs: 400, sink: out.sink });

    expect(outcome).toMatchObject({ exitCode: 124, timedOut: true });
    expect(Date.now() - began).toBeLessThan(5_000);
  });

  it('ends the command and what it started when the caller stops it', async () => {
    const out = collect();
    const controller = new AbortController();
    const began = Date.now();
    const running = runStreamingExec({ ...sh('sleep 20 & echo "pid $!"; wait'), timeoutMs: 15_000, sink: out.sink, signal: controller.signal });
    await expect.poll(() => out.text(), { timeout: 5_000 }).toMatch(/pid \d+/);
    controller.abort();
    const outcome = await running;

    expect(outcome).toMatchObject({ aborted: true, timedOut: false });
    expect(Date.now() - began).toBeLessThan(5_000);
    const pid = Number(out.text().match(/pid (\d+)/)?.[1]);
    await expect.poll(() => alive(pid), { timeout: 3_000 }).toBe(false);
  });

  it('starts nothing when the caller has already stopped', async () => {
    const controller = new AbortController();
    controller.abort();
    const out = collect();
    const outcome = await runStreamingExec({ ...sh('echo ran'), timeoutMs: 5_000, sink: out.sink, signal: controller.signal });

    expect(outcome.aborted).toBe(true);
    expect(out.text()).toBe('');
  });
});
