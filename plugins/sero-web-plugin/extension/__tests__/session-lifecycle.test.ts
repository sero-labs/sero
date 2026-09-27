import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import webExtension from '../index';
import { getResult, storeResult } from '../storage';

type Handler = (event: unknown, ctx: unknown) => unknown;

/** One session's copy of the extension, as Sero loads it for each chat or subagent. */
function sessionCopy(): Map<string, Handler> {
  const handlers = new Map<string, Handler>();
  const pi = new Proxy({}, {
    get: (_target, key) => key === 'on'
      ? (name: string, handler: Handler) => { handlers.set(name, handler); }
      : () => undefined,
  });
  webExtension(pi as never);
  return handlers;
}

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe('session lifecycle', () => {
  it('keeps a live chat session\'s search results when a subagent session starts and ends', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'sero-web-lifecycle-'));
    tempDirs.push(cwd);
    const ctx = { cwd, sessionManager: { getBranch: () => [] } };
    const chat = sessionCopy();
    await chat.get('session_start')!({}, ctx);
    storeResult('chat-result', { id: 'chat-result', type: 'search', timestamp: Date.now(), queries: [] });

    const subagent = sessionCopy();
    await subagent.get('session_start')!({}, ctx);
    await subagent.get('session_shutdown')!({}, ctx);

    expect(getResult('chat-result')?.id).toBe('chat-result');
    await chat.get('session_shutdown')!({}, ctx);
  });
});
