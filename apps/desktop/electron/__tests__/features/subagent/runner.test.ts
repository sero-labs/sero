import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createAgentSession: vi.fn(),
  reloadResources: vi.fn(async () => {}),
  createRuntimeTools: vi.fn(async () => []),
  getRuntime: vi.fn(),
  // Captures the last DefaultResourceLoader constructor options (e.g. skillsOverride).
  lastLoaderOptions: null as Record<string, unknown> | null,
}));

vi.mock('@earendil-works/pi-coding-agent', () => ({
  createAgentSession: mocks.createAgentSession,
  SessionManager: {
    inMemory: vi.fn((cwd: string) => ({ cwd })),
  },
  DefaultResourceLoader: class {
    constructor(options: Record<string, unknown>) {
      mocks.lastLoaderOptions = options;
    }
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

vi.mock('@electron/features/subagent/runtime/tool-catalog', () => ({
  recordRunToolCatalog: vi.fn(),
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
    subscribe: vi.fn((_listener?: (event: Record<string, unknown>) => void) => vi.fn()),
    prompt: vi.fn(async () => {}),
    getAllTools: vi.fn(() => []),
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
      modelRuntime: {},
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

function createStreamingSession(events: Array<Record<string, unknown>>) {
  const session = createSession();
  let listener: ((event: Record<string, unknown>) => void) | null = null;
  session.subscribe = vi.fn((cb?: (event: Record<string, unknown>) => void) => {
    listener = cb ?? null;
    return vi.fn();
  });
  session.prompt = vi.fn(async () => {
    for (const event of events) listener?.(event);
  });
  return session;
}

describe('runSubagent live output', () => {
  it('forwards both text and reasoning deltas into the live-output channel', async () => {
    const session = createStreamingSession([
      { type: 'message_update', assistantMessageEvent: { type: 'thinking_delta', delta: 'weighing options…' } },
      { type: 'message_update', assistantMessageEvent: { type: 'text_delta', delta: 'final answer' } },
    ]);
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session }));

    const deltas: string[] = [];
    const config = createConfig(new AbortController().signal);
    config.onTextDelta = (delta) => deltas.push(delta);

    await runSubagent(config, createDeps());

    expect(deltas).toEqual(['weighing options…', 'final answer']);
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

describe('runSubagent context overrides', () => {
  it('drops disabled tools from the session tool surface', async () => {
    mocks.createRuntimeTools.mockResolvedValueOnce([
      { name: 'bash', description: '', parameters: {}, execute: vi.fn() },
      { name: 'read', description: '', parameters: {}, execute: vi.fn() },
    ] as never);
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session: createSession() }));

    const config = createConfig(new AbortController().signal);
    config.platformTools = 'all';
    config.disabledTools = ['bash'];

    await runSubagent(config, createDeps());

    const options = mocks.createAgentSession.mock.calls[0][0] as { customTools: { name: string }[] };
    const names = options.customTools.map((t) => t.name);
    expect(names).toContain('read');
    expect(names).not.toContain('bash');
  });

  it('applies a per-step tool allowlist to the session', async () => {
    mocks.createRuntimeTools.mockResolvedValueOnce([
      { name: 'bash', description: '', parameters: {}, execute: vi.fn() },
      { name: 'read', description: '', parameters: {}, execute: vi.fn() },
      { name: 'web_search', description: '', parameters: {}, execute: vi.fn() },
    ] as never);
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session: createSession() }));

    const config = createConfig(new AbortController().signal);
    config.platformTools = 'all';
    config.tools = ['bash', 'web_search'];

    await runSubagent(config, createDeps());

    const options = mocks.createAgentSession.mock.calls[0][0] as { noTools?: string; tools?: string[] };
    expect(options.noTools).toBe('builtin');
    expect(options.tools).toEqual(['bash', 'web_search']);
  });

  it('replaces the base system prompt via the resource loader override', async () => {
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session: createSession() }));

    const config = createConfig(new AbortController().signal);
    config.systemPromptOverride = 'You are a terse reviewer.';

    await runSubagent(config, createDeps());

    const override = mocks.lastLoaderOptions?.systemPromptOverride as
      | ((base: string | undefined) => string | undefined)
      | undefined;
    expect(override?.('original base prompt')).toBe('You are a terse reviewer.');
  });

  it('delivers the agent prompt via the resource loader appendSystemPrompt slot', async () => {
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session: createSession() }));

    await runSubagent(createConfig(new AbortController().signal), createDeps());

    // The agent .md body / step contract must ride on appendSystemPrompt so it
    // survives a base systemPromptOverride. The dead systemPromptSuffix option
    // must no longer be passed to createAgentSession.
    expect(mocks.lastLoaderOptions?.appendSystemPrompt).toEqual(['You are a test agent.']);
    const sessionOptions = mocks.createAgentSession.mock.calls[0][0] as Record<string, unknown>;
    expect(sessionOptions.systemPromptSuffix).toBeUndefined();
  });

  it('appends a caller appendSystemPrompt after the agent body (so a step contract survives a named agent)', async () => {
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session: createSession() }));

    const config = createConfig(new AbortController().signal);
    config.appendSystemPrompt = ['STEP CONTRACT: emit the outcome envelope.'];

    await runSubagent(config, createDeps());

    expect(mocks.lastLoaderOptions?.appendSystemPrompt).toEqual([
      'You are a test agent.',
      'STEP CONTRACT: emit the outcome envelope.',
    ]);
  });

  it('does not set a prompt override when none is requested', async () => {
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session: createSession() }));

    await runSubagent(createConfig(new AbortController().signal), createDeps());

    expect(mocks.lastLoaderOptions?.systemPromptOverride).toBeUndefined();
  });

  it('hides disabled skills from the model via the resource loader override', async () => {
    mocks.createAgentSession.mockImplementationOnce(async () => ({ session: createSession() }));

    const config = createConfig(new AbortController().signal);
    config.disabledSkills = ['secret-skill'];

    await runSubagent(config, createDeps());

    const skillsOverride = mocks.lastLoaderOptions?.skillsOverride as (
      base: { skills: { name: string; disableModelInvocation?: boolean }[]; diagnostics: unknown[] },
    ) => { skills: { name: string; disableModelInvocation?: boolean }[] };
    const result = skillsOverride({
      skills: [{ name: 'secret-skill' }, { name: 'ok-skill' }],
      diagnostics: [],
    });
    const secret = result.skills.find((s) => s.name === 'secret-skill');
    const ok = result.skills.find((s) => s.name === 'ok-skill');
    expect(secret?.disableModelInvocation).toBe(true);
    expect(ok?.disableModelInvocation).toBeUndefined();
  });
});
