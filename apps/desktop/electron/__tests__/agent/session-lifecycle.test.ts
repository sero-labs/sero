/**
 * Session lifecycle events for extensions, on a real Pi AgentSession against
 * the local provider fixture: the `session_start` reason, one `session_start`
 * before the first turn, a working `ctx.ui`, an awaited `session_shutdown`
 * before disposal, and new extension copies after a resource reload.
 */

import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type ExtensionAPI,
} from '@earendil-works/pi-coding-agent';

const notify = vi.hoisted(() => vi.fn());
vi.mock('@electron/features/notifications/feed', () => ({ notify }));

import {
  sessionStartEventFor,
  shutdownAndDispose,
  startSessionExtensions,
} from '@electron/ipc/agent/core/agent-session-events';
import { seedFixtureAgentDir, startProviderFixture } from './fixtures/provider-fixture';
import { FIXTURE_MODEL_ID, FIXTURE_PROVIDER_ID, PROVIDER_SCENARIOS } from './fixtures/provider-scenarios';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup().catch(() => undefined)));
  notify.mockClear();
});

async function tempRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'sero-session-lifecycle-'));
  cleanups.push(() => rm(root, { recursive: true, force: true }));
  return root;
}

/** Records every lifecycle event, tagged with the extension copy that saw it. */
function recordingExtension(log: string[]): (pi: ExtensionAPI) => void {
  let copies = 0;
  return (pi) => {
    copies += 1;
    const copy = copies;
    pi.on('session_start', (event, ctx) => {
      log.push(`${copy}:session_start:${event.reason}`);
      ctx.ui.notify(`started ${event.reason}`, 'info');
    });
    pi.on('before_agent_start', () => { log.push(`${copy}:before_agent_start`); });
    pi.on('session_shutdown', async (event) => {
      await new Promise((resolve) => setTimeout(resolve, 20));
      log.push(`${copy}:session_shutdown:${event.reason}`);
    });
  };
}

async function openSession(log: string[], sessionManager?: SessionManager): Promise<AgentSession> {
  const root = await tempRoot();
  const cwd = join(root, 'workspace');
  const agentDir = join(root, 'agent');
  await mkdir(cwd, { recursive: true });
  const fixture = await startProviderFixture(PROVIDER_SCENARIOS.plainText);
  cleanups.push(() => fixture.close());
  await seedFixtureAgentDir(agentDir, { baseUrl: fixture.url });
  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, 'auth.json'),
    modelsPath: join(agentDir, 'models.json'),
    refreshOnCreate: false,
  });
  const settingsManager = await SettingsManager.create(cwd, agentDir);
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir,
    settingsManager,
    extensionFactories: [recordingExtension(log)],
  });
  await loader.reload();
  const manager = sessionManager ?? SessionManager.inMemory(cwd);
  const { session } = await createAgentSession({
    cwd,
    agentDir,
    modelRuntime,
    model: modelRuntime.getModel(FIXTURE_PROVIDER_ID, FIXTURE_MODEL_ID),
    resourceLoader: loader,
    sessionManager: manager,
    settingsManager,
    noTools: 'all',
    sessionStartEvent: sessionStartEventFor(manager),
  });
  return session;
}

describe('session_start reason', () => {
  it('is startup for a new file, resume for a file with entries, and fork for a fork', async () => {
    const root = await tempRoot();
    const created = SessionManager.create(root, root);
    created.appendMessage({ role: 'user', content: 'hello', timestamp: Date.now() });
    created.appendMessage({
      role: 'assistant',
      content: [{ type: 'text', text: 'hi' }],
      api: 'openai-completions',
      provider: FIXTURE_PROVIDER_ID,
      model: FIXTURE_MODEL_ID,
      usage: {
        input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      },
      stopReason: 'stop',
      timestamp: Date.now(),
    });
    const existing = created.getSessionFile()!;

    expect(sessionStartEventFor(SessionManager.open(join(root, 'new.jsonl'), root)).reason).toBe('startup');
    expect(sessionStartEventFor(SessionManager.open(existing, root)).reason).toBe('resume');
    expect(sessionStartEventFor(SessionManager.open(existing, root), '/sessions/source.jsonl'))
      .toEqual({ type: 'session_start', reason: 'fork', previousSessionFile: '/sessions/source.jsonl' });
  });
});

describe('extension lifecycle on a real session', () => {
  it('delivers session_start once, before the first turn, with a working ctx.ui', async () => {
    const log: string[] = [];
    const session = await openSession(log);
    cleanups.push(async () => session.dispose());

    await startSessionExtensions(session);
    await session.prompt(PROVIDER_SCENARIOS.plainText.prompt);

    expect(log).toEqual(['1:session_start:startup', '1:before_agent_start']);
    expect(notify).toHaveBeenCalledWith({ message: 'started startup', type: 'info' });
  });

  it('finishes an async session_shutdown handler before the session is disposed', async () => {
    const log: string[] = [];
    const session = await openSession(log);
    await startSessionExtensions(session);
    const dispose = vi.spyOn(session, 'dispose').mockImplementation(() => {
      log.push('dispose');
    });

    await shutdownAndDispose(session, 'test');

    expect(log.slice(1)).toEqual(['1:session_shutdown:quit', 'dispose']);
    dispose.mockRestore();
    session.dispose();
  });

  it('gives the next turn extension copies that received session_start after a reload', async () => {
    const log: string[] = [];
    const session = await openSession(log);
    cleanups.push(async () => session.dispose());
    await startSessionExtensions(session);

    await session.reload();
    await session.prompt(PROVIDER_SCENARIOS.plainText.prompt);

    expect(log).toEqual([
      '1:session_start:startup',
      '1:session_shutdown:reload',
      '2:session_start:reload',
      '2:before_agent_start',
    ]);
  });
});
