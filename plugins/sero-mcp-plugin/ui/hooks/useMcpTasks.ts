import { useAppTools } from '@sero-ai/app-runtime';
import { useCallback, useEffect, useState } from 'react';
import type { McpTaskSummary } from '../../shared/tasks';

const REFRESH_MS = 3_000;

export interface McpTasksState {
  tasks: McpTaskSummary[];
  error: string | null;
  cancel: (taskId: string) => Promise<void>;
  dismiss: (taskId: string) => Promise<void>;
}

/** The runtime's task records. Task status changes on the server, so the list refreshes while the app is open. */
export function useMcpTasks(): McpTasksState {
  const { run } = useAppTools();
  const [tasks, setTasks] = useState<McpTaskSummary[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const result = await run('mcp_manager', { action: 'list_tasks' });
      setTasks(Array.isArray(result.details?.tasks) ? result.details.tasks as McpTaskSummary[] : []);
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [run]);

  // Polling is an external side effect: the records change in the runtime, not in React state.
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const act = useCallback(async (action: 'cancel_task' | 'dismiss_task', taskId: string) => {
    const result = await run('mcp_manager', { action, taskId });
    if (result.isError) setError(result.text);
    await refresh();
  }, [refresh, run]);

  return {
    tasks,
    error,
    cancel: (taskId) => act('cancel_task', taskId),
    dismiss: (taskId) => act('dismiss_task', taskId),
  };
}
