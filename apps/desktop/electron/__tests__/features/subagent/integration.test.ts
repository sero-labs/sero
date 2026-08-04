/**
 * Integration tests for SubagentManager with mocked dependencies.
 *
 * Tests the full pipeline: discovery → manager → tracker → result formatting.
 * Mocks the runner and discovery modules to avoid real session creation.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { AgentConfig, RunResult } from '@electron/features/subagent/core/types';

// Mock the runner module to avoid real session creation
vi.mock('@electron/features/subagent/runtime/runner', () => ({
  runSubagent: vi.fn(),
}));

// Mock the discovery module to return controlled agent configs
vi.mock('@electron/features/subagent/runtime/discovery', () => ({
  discoverAgents: vi.fn(),
}));

import { SubagentManager } from '@electron/features/subagent';
import { runSubagent } from '@electron/features/subagent/runtime/runner';
import { discoverAgents } from '@electron/features/subagent/runtime/discovery';

const mockRunSubagent = vi.mocked(runSubagent);
const mockDiscoverAgents = vi.mocked(discoverAgents);

function makeAgent(name: string, desc = 'A test agent'): AgentConfig {
  return {
    name, description: desc, systemPrompt: `You are ${name}.`,
    source: 'global', filePath: `/agents/${name}.md`,
  };
}

function makeResult(response: string, cost = 0.01): RunResult {
  return {
    response,
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 150, cost },
  };
}

function makeMockDeps(): any {
  return {
    infra: {
      modelRuntime: {},
      modelRegistry: {},
      settingsManager: { get: () => null },
    },
    workspaceManager: {
      getPath: () => '/workspace',
      isContainerEnabled: async () => false,
    },
    containerManager: {},
  };
}

beforeEach(() => {
  mockDiscoverAgents.mockResolvedValue([
    makeAgent('scout', 'Fast recon'),
    makeAgent('analyst', 'Deep analysis'),
    makeAgent('reviewer', 'Code review'),
  ]);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('SubagentManager integration', () => {
  it('single agent run with valid agent name returns response', async () => {
    mockRunSubagent.mockResolvedValueOnce(makeResult('Found 10 files.'));

    const manager = new SubagentManager();
    manager.setDeps(makeMockDeps());

    const result = await manager.runSingle({
      agent: 'scout', task: 'Scan the codebase',
      parentSessionId: 'session-1', workspaceId: 'ws-1',
    });

    expect(result).toBe('Found 10 files.');
    expect(mockRunSubagent).toHaveBeenCalledTimes(1);
  });

  it('single agent run with unknown agent returns error', async () => {
    const manager = new SubagentManager();
    manager.setDeps(makeMockDeps());

    const updates: string[] = [];
    const result = await manager.runSingle({
      agent: 'nonexistent', task: 'Do something',
      parentSessionId: 'session-1', workspaceId: 'ws-1',
      onUpdate: (t) => updates.push(t),
    });

    expect(result).toContain('Error');
    expect(result).toContain('nonexistent');
  });

  it('ad-hoc inline mode with systemPrompt runs without discovery', async () => {
    mockRunSubagent.mockResolvedValueOnce(makeResult('Analysis complete.'));

    const manager = new SubagentManager();
    manager.setDeps(makeMockDeps());

    const result = await manager.runSingle({
      task: 'Analyse this data',
      systemPrompt: 'You are a data analyst.',
      parentSessionId: 'session-1', workspaceId: 'ws-1',
    });

    expect(result).toBe('Analysis complete.');
    const callArgs = mockRunSubagent.mock.calls[0][0];
    expect(callArgs.agent.name).toBe('ad-hoc');
    expect(callArgs.agent.systemPrompt).toBe('You are a data analyst.');
  });

  it('parallel fan-out with 3 tasks returns labelled markdown sections', async () => {
    mockRunSubagent
      .mockResolvedValueOnce(makeResult('Result A'))
      .mockResolvedValueOnce(makeResult('Result B'))
      .mockResolvedValueOnce(makeResult('Result C'));

    const manager = new SubagentManager();
    manager.setDeps(makeMockDeps());

    const result = await manager.runParallel({
      tasks: [
        { agent: 'scout', task: 'Scan module A' },
        { agent: 'scout', task: 'Scan module B' },
        { agent: 'scout', task: 'Scan module C' },
      ],
      parentSessionId: 'session-1', workspaceId: 'ws-1',
    });

    expect(result).toContain('## Result 1: scout');
    expect(result).toContain('Result A');
    expect(result).toContain('## Result 2: scout');
    expect(result).toContain('Result B');
    expect(result).toContain('## Result 3: scout');
    expect(result).toContain('Result C');
  });

  it('chain with 2 steps + {previous} substitution returns final output', async () => {
    mockRunSubagent
      .mockResolvedValueOnce(makeResult('Scouted: files A, B, C'))
      .mockResolvedValueOnce(makeResult('Analysis: 3 files found, all good.'));

    const manager = new SubagentManager();
    manager.setDeps(makeMockDeps());

    const result = await manager.runChain({
      chain: [
        { agent: 'scout', task: 'Scan the codebase' },
        { agent: 'analyst', task: 'Analyse these findings: {previous}' },
      ],
      parentSessionId: 'session-1', workspaceId: 'ws-1',
    });

    expect(result).toBe('Analysis: 3 files found, all good.');
    // Verify {previous} was substituted
    const secondCall = mockRunSubagent.mock.calls[1][0];
    expect(secondCall.task).toContain('Scouted: files A, B, C');
  });

  it('failed subagent returns error text (not throw)', async () => {
    mockRunSubagent.mockResolvedValueOnce({
      response: '', error: 'API key invalid',
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, cost: 0 },
    });

    const manager = new SubagentManager();
    manager.setDeps(makeMockDeps());

    const result = await manager.runSingle({
      agent: 'scout', task: 'Scan',
      parentSessionId: 's1', workspaceId: 'ws-1',
    });

    expect(result).toContain('Error');
    expect(result).toContain('API key invalid');
  });

  it('snapshot returns correct entries for workspace', async () => {
    mockRunSubagent.mockResolvedValueOnce(makeResult('Done.'));

    const manager = new SubagentManager();
    manager.setDeps(makeMockDeps());

    await manager.runSingle({
      agent: 'scout', task: 'Scan',
      parentSessionId: 's1', workspaceId: 'ws-1',
    });

    const entries = manager.snapshot('ws-1');
    expect(entries).toHaveLength(1);
    expect(entries[0].status).toBe('completed');
    expect(entries[0].agentName).toBe('scout');

    expect(manager.snapshot('ws-other')).toHaveLength(0);
  });

  it('listAgents delegates to discovery', async () => {
    const manager = new SubagentManager();
    const agents = await manager.listAgents();
    expect(agents).toHaveLength(3);
    expect(agents.map((a) => a.name)).toEqual(['scout', 'analyst', 'reviewer']);
  });

  it('tracker events fire for single run', async () => {
    mockRunSubagent.mockResolvedValueOnce(makeResult('Done.'));

    const manager = new SubagentManager();
    manager.setDeps(makeMockDeps());

    const events: string[] = [];
    manager.tracker.on('subagent_start', () => events.push('start'));
    manager.tracker.on('subagent_end', () => events.push('end'));

    await manager.runSingle({
      agent: 'scout', task: 'Scan',
      parentSessionId: 's1', workspaceId: 'ws-1',
    });

    expect(events).toEqual(['start', 'end']);
  });
});
