import { describe, expect, it, vi } from 'vitest';
import type { SubagentManager } from '@electron/features/subagent';
import { runCollaboration } from '@electron/features/collaboration';
import { runDebateCollaboration } from '@electron/features/collaboration/debate';
import { DEFAULT_DEBATE_CONFIG } from '@/types/collaboration';

type RunSingleParams = Parameters<SubagentManager['runSingleStructured']>[0];
type RunSingleResult = Awaited<ReturnType<SubagentManager['runSingleStructured']>>;

function createManager(
  implementation: (args: RunSingleParams) => Promise<RunSingleResult>,
) {
  return {
    runSingleStructured: vi.fn(implementation),
  };
}

describe('collaboration degraded-mode handling', () => {
  it('returns explicit degraded output and skips later phases when researcher fails', async () => {
    const manager = createManager(async ({ agent }) => {
      if (agent === 'researcher') {
        return { response: '', error: 'research timed out' };
      }

      throw new Error(`unexpected agent call: ${agent}`);
    });

    const result = await runCollaboration(
      'Investigate a production incident',
      'session-1',
      'workspace-1',
      manager,
    );

    expect(result.hasErrors).toBe(true);
    expect(result.finalResponse).toContain('degraded mode');
    expect(result.finalResponse).toContain('researcher');
    expect(result.finalResponse).toContain('research timed out');
    expect(manager.runSingleStructured).toHaveBeenCalledTimes(1);
  });

  it('skips coordinator synthesis when a required phase-2 specialist fails', async () => {
    const manager = createManager(async ({ agent }) => {
      if (agent === 'researcher') {
        return { response: 'Research findings' };
      }

      if (agent === 'collab-analyst') {
        return { response: '', error: 'analysis unavailable' };
      }

      if (agent === 'visionary') {
        return { response: 'Creative alternatives' };
      }

      throw new Error(`unexpected agent call: ${agent}`);
    });

    const result = await runCollaboration(
      'Plan a resilient rollout',
      'session-1',
      'workspace-1',
      manager,
    );

    expect(result.hasErrors).toBe(true);
    expect(result.finalResponse).toContain('degraded mode');
    expect(result.finalResponse).toContain('analysis unavailable');
    expect(result.finalResponse).not.toContain('unexpected agent call: coordinator');

    const calledAgents = manager.runSingleStructured.mock.calls.map(([args]) => args.agent);
    expect(calledAgents).toEqual(['researcher', 'collab-analyst', 'visionary']);
  });

  it('skips debate rounds and final synthesis when independent analysis is missing', async () => {
    const manager = createManager(async ({ agent }) => {
      if (agent === 'coordinator') {
        return { response: 'Decomposition plan' };
      }

      if (agent === 'researcher') {
        return { response: 'Research baseline' };
      }

      if (agent === 'collab-analyst') {
        return { response: '', error: 'analysis crashed' };
      }

      if (agent === 'visionary') {
        return { response: 'Creative exploration' };
      }

      throw new Error(`unexpected agent call: ${agent}`);
    });

    const result = await runDebateCollaboration(
      'Debate possible architecture directions',
      'session-2',
      'workspace-2',
      manager,
      DEFAULT_DEBATE_CONFIG,
    );

    expect(result.hasErrors).toBe(true);
    expect(result.finalResponse).toContain('Debate collaboration ran in degraded mode');
    expect(result.finalResponse).toContain('analysis crashed');

    const calledAgents = manager.runSingleStructured.mock.calls.map(([args]) => args.agent);
    expect(calledAgents).toEqual(['coordinator', 'researcher', 'collab-analyst', 'visionary']);
  });
});
