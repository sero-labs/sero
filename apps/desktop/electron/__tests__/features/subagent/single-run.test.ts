import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@electron/features/subagent/runtime/runner', () => ({
  runSubagent: vi.fn(),
}));

import { executeSingleRun, type SingleRunParams } from '@electron/features/subagent/core/single-run';
import { runSubagent, type RunnerDeps } from '@electron/features/subagent/runtime/runner';
import type { ConcurrencyPool } from '@electron/features/subagent/core/pool';
import type { SubagentTracker } from '@electron/features/subagent/core/tracker';
import type { AgentConfig, SubagentSettings } from '@electron/features/subagent/core/types';

const mockRunSubagent = vi.mocked(runSubagent);

const SETTINGS: SubagentSettings = {
  maxConcurrent: 4,
  maxTotal: 8,
  timeoutMs: 600_000,
  toolStallTimeoutMs: 120_000,
  model: null,
  thinking: null,
};

const AGENT: AgentConfig = {
  name: 'factory-test',
  description: 'test agent',
  systemPrompt: 'You are a test agent.',
  source: 'global',
  filePath: '',
};

const USAGE = {
  inputTokens: 100,
  outputTokens: 50,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  totalTokens: 150,
  cost: 0.01,
};

function options(params: Partial<SingleRunParams> = {}) {
  return {
    params: {
      task: 'do the thing',
      parentSessionId: 'parent-1',
      workspaceId: 'ws-1',
      systemPrompt: 'You are a test agent.',
      ...params,
    },
    settings: SETTINGS,
    pool: {
      acquireSlot: vi.fn(async () => {}),
      releaseSlot: vi.fn(),
    } as unknown as ConcurrencyPool,
    tracker: {
      start: vi.fn(),
      progress: vi.fn(),
      updateToolActivity: vi.fn(),
      appendLiveOutput: vi.fn(),
      complete: vi.fn(),
      fail: vi.fn(),
    } as unknown as SubagentTracker,
    deps: {} as RunnerDeps,
    resolveAgent: vi.fn(async () => AGENT),
  };
}

beforeEach(() => {
  mockRunSubagent.mockReset();
});

describe('executeSingleRun result metadata', () => {
  it('returns modelId, providerId, durationMs, and usage on success', async () => {
    mockRunSubagent.mockResolvedValue({
      response: 'done',
      usage: USAGE,
      modelId: 'claude-test-1',
      providerId: 'anthropic',
    });

    const result = await executeSingleRun(options());

    expect(result.response).toBe('done');
    expect(result.modelId).toBe('claude-test-1');
    expect(result.providerId).toBe('anthropic');
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 0.01 });
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('omits cost when the model is unpriced (cost 0)', async () => {
    mockRunSubagent.mockResolvedValue({ response: 'done', usage: { ...USAGE, cost: 0 } });

    const result = await executeSingleRun(options());

    expect(result.usage?.costUsd).toBeUndefined();
    expect(result.usage?.totalTokens).toBe(150);
  });

  it('returns metadata alongside the error on failure', async () => {
    mockRunSubagent.mockResolvedValue({
      response: '',
      usage: USAGE,
      modelId: 'claude-test-1',
      providerId: 'anthropic',
      error: 'boom',
    });

    const result = await executeSingleRun(options());

    expect(result.error).toBe('boom');
    expect(result.modelId).toBe('claude-test-1');
    expect(result.providerId).toBe('anthropic');
    expect(result.usage?.totalTokens).toBe(150);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('forwards platformTools to the runner config', async () => {
    mockRunSubagent.mockResolvedValue({ response: 'ok', usage: USAGE });

    await executeSingleRun(options({ platformTools: 'none' }));

    expect(mockRunSubagent).toHaveBeenCalledWith(
      expect.objectContaining({ platformTools: 'none' }),
      expect.anything(),
    );
  });

  it('aborts the run when the external signal is already aborted', async () => {
    mockRunSubagent.mockImplementation(async (config) => {
      expect(config.signal.aborted).toBe(true);
      return { response: '', usage: USAGE, error: 'Aborted before start' };
    });

    const controller = new AbortController();
    controller.abort();
    const result = await executeSingleRun(options({ signal: controller.signal }));

    expect(result.error).toBe('Aborted before start');
  });

  it('forwards a later external abort to the runner signal', async () => {
    const controller = new AbortController();
    mockRunSubagent.mockImplementation(async (config) => {
      controller.abort();
      expect(config.signal.aborted).toBe(true);
      return { response: '', usage: USAGE, error: 'Aborted' };
    });

    const result = await executeSingleRun(options({ signal: controller.signal }));

    expect(result.error).toBe('Aborted');
  });
});
