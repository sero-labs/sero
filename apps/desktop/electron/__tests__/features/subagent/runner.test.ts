import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  reloadResources: vi.fn(async () => {}),
  createRuntimeTools: vi.fn(async () => []),
  getRuntime: vi.fn(),
}));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: mocks.createAgentSession,
  SessionManager: {
    inMemory: vi.fn((cwd: string) => ({ cwd })),
  },
  DefaultResourceLoader: class {
    async reload() {
      await mocks.reloadResources();
    }
  },
}));

vi.mock('@electron/features/container/tools', () => ({
  createRuntimeTools: mocks.createRuntimeTools,
}));

vi.mock('@electron/features/subagent/runtime/loader', () => ({
  createSubagentExtensionFactory: vi.fn(() => vi.fn()),
}));

vi.mock('@electron/features/workspace/runtime/runtime-manager', () => ({
  runtimeManager: {
    getRuntime: mocks.getRuntime,
  },
}));

vi.mock('@electron/platform/env', () => ({
  SERO_AGENT_DIR: '/agent',
}));

vi.mock('@electron/ipc/editor/debug', () => ({
  logRawEvent: vi.fn(),
  logTurnContext: vi.fn(),
}));

vi.mock('@electron/features/apps/extensions/skill-visibility', () => ({
  createSkillVisibilityOverride: vi.fn(() => (base: unknown) => base),
}));

vi.mock('@electron/features/plugins/resource-compatibility', () => ({
  filterCompatiblePluginAgentsFiles: (base: unknown) => base,
  filterCompatiblePluginExtensions: (base: unknown) => base,
  filterCompatiblePluginPrompts: (base: unknown) => base,
  filterCompatiblePluginSkills: (base: unknown) => base,
  filterCompatiblePluginThemes: (base: unknown) => base,
}));

vi.mock('@electron/shared/settings/resolve-tier-model', () => ({
  parseModelField: vi.fn(() => null),
  resolveTierModel: vi.fn(() => null),
}));

vi.mock('@electron/shared/settings/model-tiers', () => ({
  getModelTiers: vi.fn(() => ({})),
}));

import { resolveSubagentPaths, runSubagent } from '@electron/features/subagent/runtime/runner';
import type { RunnerConfig } from '@electron/features/subagent/core/types';
import type { RunnerDeps } from '@electron/features/subagent/runtime/runner';

function createSession() {
  return {
    model: { id: 'claude-test-1', provider: 'anthropic' },
    setThinkingLevel: vi.fn(),
    subscribe: vi.fn(() => vi.fn()),
    prompt: vi.fn(async () => {}),
    messages: [],
    getSessionStats: vi.fn(() => ({
      tokens: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
      cost: 0,
    })),
    abort: vi.fn(),
    dispose: vi.fn(),
  };
}

function createConfig(signal: AbortSignal): RunnerConfig {
  return {
    agent: {
      name: 'factory-test',
      description: 'test agent',
      systemPrompt: 'You are a test agent.',
      source: 'global',
      filePath: '',
    },
    task: 'do the thing',
    resolved: {
      model: 'claude-test-1',
      modelSelection: 'claude-test-1',
      thinking: 'off',
      thinkingSource: 'default',
      timeoutMs: 60_000,
      toolStallTimeoutMs: 0,
    },
    workspaceId: 'ws-1',
    parentSessionId: 'parent-1',
    mode: 'single',
    signal,
    platformTools: 'none',
  };
}

function createDeps(): RunnerDeps {
  return {
    infra: {
      authStorage: {},
      modelRegistry: {
        getAvailable: vi.fn(() => []),
        find: vi.fn(() => null),
      },
      settingsManager: {
        getGlobalSettings: vi.fn(() => ({})),
      },
    },
    workspaceManager: {
      getPath: vi.fn(() => '/workspace'),
    },
  } as unknown as RunnerDeps;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.reloadResources.mockResolvedValue(undefined);
  mocks.createRuntimeTools.mockResolvedValue([]);
  mocks.getRuntime.mockResolvedValue({
    backend: 'host',
    ensure: vi.fn(async () => {}),
  });
});

describe('resolveSubagentPaths', () => {
  it('keeps the container root at the workspace while targeting a worktree cwd', () => {
    const resolved = resolveSubagentPaths(
      '/Users/me/project',
      '/Users/me/project/.sero/worktrees/card-5',
    );

    expect(resolved.sessionPath).toBe('/Users/me/project/.sero/worktrees/card-5');
    expect(resolved.containerHostPath).toBe('/Users/me/project');
    expect(resolved.containerCwd).toBe('/workspace/.sero/worktrees/card-5');
  });

  it('uses the workspace root directly when there is no cwd override', () => {
    const resolved = resolveSubagentPaths('/Users/me/project');

    expect(resolved.sessionPath).toBe('/Users/me/project');
    expect(resolved.containerHostPath).toBe('/Users/me/project');
    expect(resolved.containerCwd).toBeUndefined();
  });

  it('falls back cleanly when the override is outside the workspace root', () => {
    const resolved = resolveSubagentPaths(
      '/Users/me/project',
      '/tmp/outside',
    );

    expect(resolved.sessionPath).toBe('/tmp/outside');
    expect(resolved.containerHostPath).toBe('/Users/me/project');
    expect(resolved.containerCwd).toBeUndefined();
  });
});

describe('runSubagent abort handling', () => {
  it('returns before creating a session when setup is aborted', async () => {
    const controller = new AbortController();
    mocks.reloadResources.mockImplementationOnce(async () => {
      controller.abort();
    });

    const result = await runSubagent(createConfig(controller.signal), createDeps());

    expect(result.error).toBe('Aborted before start');
    expect(mocks.createAgentSession).not.toHaveBeenCalled();
  });

  it('does not prompt when the signal aborts while the session is being created', async () => {
    const controller = new AbortController();
    const session = createSession();
    mocks.createAgentSession.mockImplementationOnce(async () => {
      controller.abort();
      return { session };
    });

    const result = await runSubagent(createConfig(controller.signal), createDeps());

    expect(result.error).toBe('Aborted');
    expect(result.modelId).toBe('claude-test-1');
    expect(result.providerId).toBe('anthropic');
    expect(session.abort).toHaveBeenCalledTimes(1);
    expect(session.prompt).not.toHaveBeenCalled();
    expect(session.dispose).toHaveBeenCalledTimes(1);
  });
});
