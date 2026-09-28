/**
 * App-agent sessions start their extensions when created, and end them before
 * disposal — both when one app's sessions close and at app quit.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ built: [] as Array<{ lifecycle: string[] }> }));

function trackedSession() {
  const lifecycle: string[] = [];
  const session = {
    lifecycle,
    bindExtensions: async () => { lifecycle.push('session_start'); },
    extensionRunner: {
      emit: async (event: { type: string }) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        lifecycle.push(event.type);
      },
    },
    dispose: () => { lifecycle.push('dispose'); },
  };
  mocks.built.push(session);
  return session;
}

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }));
vi.mock('@earendil-works/pi-coding-agent', () => ({
  Theme: class {},
  createAgentSession: vi.fn(async () => ({ session: trackedSession() })),
  createReadTool: vi.fn(() => ({ name: 'read' })),
  DefaultResourceLoader: class { async reload() { return undefined; } },
  SessionManager: { inMemory: vi.fn(() => ({})) },
}));
vi.mock('@electron/features/apps/discovery', () => ({ discoverApps: vi.fn(async () => []) }));
vi.mock('@electron/platform/env', async (importOriginal) => ({
  ...await importOriginal<typeof import('@electron/platform/env')>(),
  SERO_AGENT_DIR: '/agent',
}));
vi.mock('@electron/features/rtk/host-capability', () => ({ registerRtkHostCapability: vi.fn() }));
vi.mock('@electron/features/workspace/manager', () => ({ workspaceManager: { getPath: () => null } }));
vi.mock('@electron/features/workspace/runtime/runtime-manager', () => ({ runtimeManager: {} }));
vi.mock('@electron/shared/infra/shared-infra', () => ({
  ensureInfra: vi.fn(async () => ({ settingsManager: {}, modelRuntime: {}, model: null })),
}));
vi.mock('@electron/ipc/agent/handlers/app-agent-tools', () => ({
  invokeAppSessionTool: vi.fn(async () => ({ text: '', content: [], details: null, isError: false })),
}));

import {
  disposeAllAppSessions,
  disposeAppSessionsForApp,
  invokeAppTool,
} from '@electron/ipc/agent/handlers/app-agent';

describe('app-agent session lifecycle', () => {
  beforeEach(() => {
    mocks.built.length = 0;
  });

  it('ends only the closed app\'s session extensions before disposing them', async () => {
    await invokeAppTool('notes', 'ws-1', 'ping');
    await invokeAppTool('todo', 'ws-1', 'ping');

    await disposeAppSessionsForApp('notes');

    expect(mocks.built[0]?.lifecycle).toEqual(['session_start', 'session_shutdown', 'dispose']);
    expect(mocks.built[1]?.lifecycle).toEqual(['session_start']);
    await disposeAllAppSessions();
  });

  it('ends every app session\'s extensions before disposing them at quit', async () => {
    await invokeAppTool('notes', 'ws-1', 'ping');
    await invokeAppTool('notes', 'ws-2', 'ping');

    await disposeAllAppSessions();

    for (const session of mocks.built) {
      expect(session.lifecycle).toEqual(['session_start', 'session_shutdown', 'dispose']);
    }
  });
});
