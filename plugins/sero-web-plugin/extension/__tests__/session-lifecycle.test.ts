import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import webExtension from '../index';
import { clearResults, getResult, storeResult } from '../storage';

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
    storeResult('chat-result', { id: 'chat-result', type: 'search', timestamp: Date.now(), queries: [] }, 'workspace-a');

    const subagent = sessionCopy();
    await subagent.get('session_start')!({}, ctx);
    await subagent.get('session_shutdown')!({}, ctx);

    expect(getResult('chat-result', 'workspace-a')?.id).toBe('chat-result');
    await chat.get('session_shutdown')!({}, ctx);
  });

  it('clears one workspace\'s results and keeps them out of other workspaces', () => {
    const now = Date.now();
    storeResult('result-a', { id: 'result-a', type: 'search', timestamp: now, queries: [] }, 'workspace-a');
    storeResult('result-b', { id: 'result-b', type: 'search', timestamp: now, queries: [] }, 'workspace-b');

    expect(getResult('result-a', 'workspace-b')).toBeNull();
    clearResults('workspace-a');

    expect(getResult('result-a', 'workspace-a')).toBeNull();
    expect(getResult('result-b', 'workspace-b')?.id).toBe('result-b');
  });
});
