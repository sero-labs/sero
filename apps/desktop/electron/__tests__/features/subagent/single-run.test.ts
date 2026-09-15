import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ObservationRecord } from '@sero-ai/common';

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
  it.each(['throw', 'empty final usage'])('retains live SDK-priced usage after interruption: %s', async (failure) => {
    const onUsage = vi.fn();
    mockRunSubagent.mockImplementation(async (config) => {
      config.onProgress?.({ ...USAGE, cacheReadTokens: 1000, totalTokens: 1150 });
      expect(onUsage).toHaveBeenCalledWith({
        inputTokens: 100, outputTokens: 50, totalTokens: 1150, costUsd: 0.01,
        cacheReadTokens: 1000, cacheWriteTokens: 0,
      });
      if (failure === 'throw') throw new Error('interrupted after a model turn');
      return { response: '', error: 'interrupted', usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, cost: 0 } };
    });
    const result = await executeSingleRun(options({ onUsage }));
    expect(result.error).toContain('interrupted');
    expect(result.usage).toEqual(onUsage.mock.calls[0][0]);
  });

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
    expect(result.usage).toEqual({
      inputTokens: 100, outputTokens: 50, totalTokens: 150, costUsd: 0.01,
      // Cache counters travel with the run, so the inspector shows a measured
      // split instead of reporting it unavailable.
      cacheReadTokens: 0, cacheWriteTokens: 0,
    });
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

  it('propagates incomplete usage from live and final runner results', async () => {
    const onUsage = vi.fn();
    mockRunSubagent.mockImplementation(async (config) => {
      config.onProgress?.({ ...USAGE, incomplete: true });
      return { response: '', error: 'stats unavailable', usage: { ...USAGE, cost: 0, incomplete: true } };
    });

    const result = await executeSingleRun(options({ onUsage }));

    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ incomplete: true }));
    expect(result.usage).toMatchObject({ totalTokens: 150, incomplete: true });
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

describe('executeSingleRun observations', () => {
  it('observes queue admission and startup before the model runs, and completion after', async () => {
    const records: ObservationRecord[] = [];
    mockRunSubagent.mockResolvedValue({ response: 'done', usage: USAGE });
    const result = await executeSingleRun(options({ onObservation: (record) => records.push(record) }));
    expect(result.response).toBe('done');

    const starts = records.filter((record) => record.kind === 'operation-start');
    // One record for admission, one for the started run, both before any work.
    expect(starts.length).toBeGreaterThanOrEqual(2);
    expect(starts[0]?.identities.operationId).toBeTruthy();
    // Startup records what was requested. The model that actually ran is only
    // known once the session reports it, so it is recorded on the request.
    expect(starts[1]?.model).toBeTruthy();
    expect(starts[1]?.identities.operationId).toBe(starts[0]?.identities.operationId);
  });

  it('never lets telemetry failure change the run', async () => {
    mockRunSubagent.mockResolvedValue({ response: 'done', usage: USAGE });
    const result = await executeSingleRun(options({
      onObservation: () => { throw new Error('journal is unavailable'); },
    }));
    expect(result.response).toBe('done');
    expect(result.error).toBeUndefined();
  });

  it('keeps the highest cumulative cache counters when a report repeats', async () => {
    const onUsage = vi.fn();
    mockRunSubagent.mockImplementation(async (config) => {
      config.onProgress?.({ ...USAGE, cacheReadTokens: 800 });
      config.onProgress?.({ ...USAGE, cacheReadTokens: 800 });
      config.onProgress?.({ ...USAGE, cacheReadTokens: 1200 });
      return { response: 'done', usage: { ...USAGE, cacheReadTokens: 1200 } };
    });

    const result = await executeSingleRun(options({ onUsage }));
    // Repeated cumulative reports must not be summed or double-counted.
    expect(result.usage?.cacheReadTokens).toBe(1200);
    expect(onUsage).toHaveBeenLastCalledWith(expect.objectContaining({ cacheReadTokens: 1200 }));
  });

  it('still reports usage and the model when the request fails', async () => {
    const records: ObservationRecord[] = [];
    mockRunSubagent.mockResolvedValue({
      response: '', error: 'the provider returned 529', usage: USAGE, modelId: 'claude-test-1', providerId: 'anthropic',
    });

    const result = await executeSingleRun(options({ onObservation: (record) => records.push(record) }));
    expect(result.error).toContain('529');
    expect(result.modelId).toBe('claude-test-1');
    expect(result.usage?.inputTokens).toBe(100);
    // The run was still observed as started.
    expect(records.some((record) => record.kind === 'operation-start')).toBe(true);
  });
});
