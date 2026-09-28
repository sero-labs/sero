/**
 * The chat IPC routes that start or restart a session's extensions: opening a
 * fork passes its source file, so extensions receive `session_start` with
 * reason `fork`, and the resource reload rebuilds the live session's extensions.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SessionManager } from '@earendil-works/pi-coding-agent';
import { IpcChannels } from '@/types/ipc-channels';

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  openSessionInPool: vi.fn(),
  sessionDir: '',
}));

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) => {
      mocks.handlers.set(channel, handler);
    },
  },
}));
vi.mock('@electron/shared/infra/shared-infra', () => ({
  subagentManager: { abortAll: vi.fn() },
  SERO_CONFIG_PATH: '/tmp/sero-lifecycle-settings.json',
  get SERO_SESSION_DIR() { return mocks.sessionDir; },
}));
vi.mock('@electron/ipc/agent/core/agent-session-open', () => ({ openSessionInPool: mocks.openSessionInPool }));
vi.mock('@electron/ipc/agent/core/agent-helpers', () => ({
  buildModelState: vi.fn(),
  buildCommandList: vi.fn(() => []),
  readHiddenCommands: vi.fn(async () => new Set()),
  getBaseSystemPrompt: vi.fn(() => 'BASE'),
  setBaseSystemPrompt: vi.fn(),
  stripDisabledSkills: (prompt: string) => prompt,
  rewriteSessionManagerFile: vi.fn(),
}));
vi.mock('@electron/ipc/agent/core/agent-checkpoint', () => ({ registerAgentCheckpointHandlers: vi.fn() }));
vi.mock('@electron/ipc/agent/core/agent-model-context', () => ({ registerAgentModelContextHandlers: vi.fn() }));
vi.mock('@electron/cli/bridges', () => ({ installCliAgentBridge: vi.fn(), noteCliTurnEnd: vi.fn() }));
vi.mock('@electron/cli', () => ({ clearBridgedExtensionSessionStateForSession: vi.fn() }));
vi.mock('@electron/features/gateway/bridge/agent-bridge', () => ({ installGatewayAgentOps: vi.fn() }));
vi.mock('@electron/ipc/gateway/gateway-ops', () => ({ buildGatewayOps: vi.fn() }));
vi.mock('@electron/features/tool-capture/lifecycle', () => ({
  publishSessionFork: (publish: () => Promise<unknown>) => publish(),
}));
vi.mock('@electron/features/tool-capture/fork-references', () => ({
  collectCaptureIdsFromEntries: vi.fn(() => []),
  writeForkReferences: vi.fn(async () => undefined),
}));

import { registerAgentHandlers } from '@electron/ipc/agent/core/agent';

const EVENT = { sender: { id: 1, isDestroyed: () => false, once: vi.fn(), send: vi.fn() } };

function handler(channel: string): (...args: unknown[]) => Promise<unknown> {
  const found = mocks.handlers.get(channel);
  if (!found) throw new Error(`no handler for ${channel}`);
  return found as (...args: unknown[]) => Promise<unknown>;
}

/** Puts a session into the pool the way a real open does. */
function openInto(session: Record<string, unknown>, sessionPath: string, entry: Record<string, unknown> = {}) {
  mocks.openSessionInPool.mockImplementationOnce(async (args: {
    pool: Map<string, unknown>;
    sessionId: string;
    workspaceId: string;
  }) => {
    args.pool.set(args.sessionId, { session, sessionPath, workspaceId: args.workspaceId, unsubscribe: vi.fn(), ...entry });
    return { turns: [] };
  });
}

describe('chat session lifecycle IPC', () => {
  let root = '';

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'sero-lifecycle-ipc-'));
    mocks.sessionDir = root;
    mocks.handlers.clear();
    mocks.openSessionInPool.mockReset();
    registerAgentHandlers();
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('opens a fork with its source file, and a later open without it', async () => {
    const source = SessionManager.create(root, root);
    source.appendMessage({ role: 'user', content: 'hello', timestamp: Date.now() });
    const sourcePath = source.getSessionFile()!;
    openInto({ sessionManager: source, agent: { state: { isStreaming: false } } }, sourcePath);
    await handler(IpcChannels.agent.open)(EVENT, 'source', sourcePath, 'ws');

    const fork = await handler(IpcChannels.agent.forkSession)(EVENT, 'source') as { id: string; path: string };
    openInto({ dispose: vi.fn() }, fork.path);
    await handler(IpcChannels.agent.open)(EVENT, fork.id, fork.path, 'ws');
    await handler(IpcChannels.agent.close)(EVENT, fork.id);
    openInto({}, fork.path);
    await handler(IpcChannels.agent.open)(EVENT, fork.id, fork.path, 'ws');

    const forkedFrom = mocks.openSessionInPool.mock.calls.map(([args]) => (args as { forkedFrom?: string }).forkedFrom);
    expect(forkedFrom).toEqual([undefined, sourcePath, undefined]);
  });

  it('sends session_shutdown once when a chat is closed twice, and reopens it as a new session', async () => {
    let finishShutdown!: () => void;
    const emit = vi.fn(() => new Promise<void>((resolve) => { finishShutdown = resolve; }));
    const first = { extensionRunner: { emit }, dispose: vi.fn() };
    openInto(first, join(root, 'a.jsonl'));
    await handler(IpcChannels.agent.open)(EVENT, 'a', join(root, 'a.jsonl'), 'ws');

    const closeOne = handler(IpcChannels.agent.close)(EVENT, 'a');
    const closeTwo = handler(IpcChannels.agent.close)(EVENT, 'a');
    const second = { dispose: vi.fn() };
    openInto(second, join(root, 'a.jsonl'));
    const reopen = handler(IpcChannels.agent.open)(EVENT, 'a', join(root, 'a.jsonl'), 'ws');
    finishShutdown();
    await Promise.all([closeOne, closeTwo, reopen]);

    expect(emit).toHaveBeenCalledOnce();
    expect(first.dispose).toHaveBeenCalledOnce();
    expect(second.dispose).not.toHaveBeenCalled();
    expect(mocks.openSessionInPool).toHaveBeenCalledTimes(2);
  });

  it('reloads the live session, not only its resource loader, and keeps the tools the user turned off', async () => {
    const allTools = [{ name: 'read' }, { name: 'web' }];
    const state = { tools: [allTools[0]!], systemPrompt: 'BASE' };
    const session = {
      isIdle: true,
      agent: { state },
      // Pi's reload turns every extension tool on again.
      reload: vi.fn(async () => { state.tools = allTools; }),
      getActiveToolNames: () => state.tools.map((tool) => tool.name),
      setActiveToolsByName: (names: string[]) => { state.tools = allTools.filter((tool) => names.includes(tool.name)); },
    };
    openInto(session, join(root, 'a.jsonl'), {
      baseTools: allTools,
      baseSystemPrompt: 'BASE',
      contextOverrides: { disabledTools: ['web'] },
    });
    await handler(IpcChannels.agent.open)(EVENT, 'a', join(root, 'a.jsonl'), 'ws');

    await handler(IpcChannels.agent.reloadResources)(EVENT, 'a');

    expect(session.reload).toHaveBeenCalledOnce();
    expect(session.getActiveToolNames()).toEqual(['read']);
  });
});
