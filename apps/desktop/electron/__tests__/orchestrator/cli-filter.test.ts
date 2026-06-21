import { afterEach, describe, expect, it } from 'vitest';

import { createOrchestratorTool } from '@plugins/sero-orchestrator-plugin/extension/tools';
import {
  getOrchestratorRegistry,
  type OrchestratorCoordinator,
} from '@plugins/sero-orchestrator-plugin/shared/registry';
import type { OrchestratorAction } from '@plugins/sero-orchestrator-plugin/shared/types';

// Defense-in-depth (D-16): the orchestrator CLI hides its whole surface from
// worker sessions — broader than, and one layer earlier than, the coordinator's
// control-action rejection in requestAction. These tests drive `cli.execute`
// against a fake coordinator registered in the process-wide registry.

const WORKSPACE = 'ws-cli-filter';

interface RecordingCoordinator extends OrchestratorCoordinator {
  calls: OrchestratorAction[];
}

function registerFake(workerSessionIds: string[]): RecordingCoordinator {
  const workers = new Set(workerSessionIds);
  const calls: OrchestratorAction[] = [];
  const coordinator: RecordingCoordinator = {
    calls,
    async requestAction(action) {
      calls.push(action);
      return { ok: true, message: 'ok' };
    },
    isWorkerSession(sessionId) {
      return Boolean(sessionId) && workers.has(sessionId!);
    },
  };
  getOrchestratorRegistry().register(WORKSPACE, `/tmp/${WORKSPACE}`, coordinator);
  return coordinator;
}

afterEach(() => {
  getOrchestratorRegistry().unregister(WORKSPACE);
});

describe('orchestrator CLI — worker-session filter', () => {
  it('refuses the whole surface to a worker session without dispatching', async () => {
    const coordinator = registerFake(['subagent-orchestrator:loop-1-99']);
    const tool = createOrchestratorTool();

    const result = await tool.cli.execute(['list'], {
      workspaceId: WORKSPACE,
      invocation: { sessionId: 'subagent-orchestrator:loop-1-99' },
    });

    expect(result.exitCode).toBe(1);
    expect(result.output).toContain('not available to orchestrator worker sessions');
    expect(coordinator.calls).toHaveLength(0); // never reached requestAction
  });

  it('hides even read-only actions (list/show) from a worker', async () => {
    const coordinator = registerFake(['worker-7']);
    const tool = createOrchestratorTool();

    const show = await tool.cli.execute(['show', 'loop-1'], {
      workspaceId: WORKSPACE,
      invocation: { sessionId: 'worker-7' },
    });

    expect(show.exitCode).toBe(1);
    expect(coordinator.calls).toHaveLength(0);
  });

  it('lets a normal (non-worker) session through to the coordinator', async () => {
    const coordinator = registerFake(['worker-7']);
    const tool = createOrchestratorTool();

    const result = await tool.cli.execute(['list'], {
      workspaceId: WORKSPACE,
      invocation: { sessionId: 'user-session-1' },
    });

    expect(result.exitCode).toBe(0);
    expect(coordinator.calls).toEqual([{ kind: 'list' }]);
  });

  it('treats an absent session id as non-worker (trusted caller)', async () => {
    const coordinator = registerFake(['worker-7']);
    const tool = createOrchestratorTool();

    const result = await tool.cli.execute(['list'], { workspaceId: WORKSPACE });

    expect(result.exitCode).toBe(0);
    expect(coordinator.calls).toEqual([{ kind: 'list' }]);
  });
});
