// Thin wrapper over the `orchestrator` tool. The UI owns no execution (D-01):
// every control issues a request through the bridged tool, the coordinator
// mutates state, and the file-backed `useAppState` watch re-renders us. We only
// track in-flight/error state for button feedback.

import { useCallback, useState } from 'react';
import { useAppTools } from '@sero-ai/app-runtime';

import type { ExecutionMode } from '../../shared/types';

export interface CreateGoalInput {
  title: string;
  goal: string;
  executionMode?: ExecutionMode;
}

export interface OrchestratorActions {
  busy: boolean;
  error: string | null;
  /** Plain-English outcome of the last successful action (first line). */
  notice: string | null;
  dismiss(): void;
  create(input: CreateGoalInput): Promise<boolean>;
  edit(loopId: string, input: { title?: string; goal?: string }): Promise<boolean>;
  replan(loopId: string): Promise<boolean>;
  /** Advisory health check across all in-flight goals (the redefined P-E). */
  health(): Promise<boolean>;
  pause(loopId: string): Promise<boolean>;
  resume(loopId: string): Promise<boolean>;
  stop(loopId: string): Promise<boolean>;
  runNext(loopId: string): Promise<boolean>;
}

function firstLine(text: string): string {
  return text.split('\n')[0] ?? text;
}

export function useOrchestratorActions(): OrchestratorActions {
  const { run } = useAppTools();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const invoke = useCallback(
    async (params: Record<string, unknown>): Promise<boolean> => {
      setBusy(true);
      setError(null);
      setNotice(null);
      try {
        const result = await run('orchestrator', params);
        if (result.isError) {
          setError(result.text || 'Action failed.');
          return false;
        }
        if (result.text) setNotice(firstLine(result.text));
        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Action failed.');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [run],
  );

  return {
    busy,
    error,
    notice,
    dismiss: useCallback(() => {
      setError(null);
      setNotice(null);
    }, []),
    create: useCallback(
      (input) =>
        invoke({
          action: 'create',
          title: input.title,
          goal: input.goal,
          executionMode: input.executionMode,
        }),
      [invoke],
    ),
    edit: useCallback(
      (loopId, input) => invoke({ action: 'edit', loopId, title: input.title, goal: input.goal }),
      [invoke],
    ),
    replan: useCallback((loopId) => invoke({ action: 'replan', loopId }), [invoke]),
    health: useCallback(() => invoke({ action: 'health' }), [invoke]),
    pause: useCallback((loopId) => invoke({ action: 'pause', loopId }), [invoke]),
    resume: useCallback((loopId) => invoke({ action: 'resume', loopId }), [invoke]),
    stop: useCallback((loopId) => invoke({ action: 'stop', loopId }), [invoke]),
    runNext: useCallback((loopId) => invoke({ action: 'run_next', loopId }), [invoke]),
  };
}
