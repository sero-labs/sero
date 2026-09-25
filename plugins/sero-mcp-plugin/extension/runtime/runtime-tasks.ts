import { resolvePrincipalId } from '../auth/principal';
import type { McpConfigDocument } from '../config/types';
import type { McpServerManager } from '../manager/server-manager';
import { createFileTaskStore, TERMINAL_TASK_STATUSES, type McpTaskRecord, type McpTaskStore } from '../tasks/task-store';
import { McpTaskTracker } from '../tasks/task-tracker';
import { createToolResult, type ToolResult } from '../tools/types';
import type { SessionRegistry } from './app-messages';
import type { McpTaskSummary } from '../../shared/tasks';

export type TaskProxyAction = 'task_status' | 'task_wait' | 'task_cancel';

export interface RuntimeTasksInput {
  manager: McpServerManager;
  sessions: SessionRegistry;
  getConfig: () => Promise<McpConfigDocument>;
  store?: McpTaskStore;
  retryDelaysMs?: number[];
}

const STATUS_LABELS: Record<McpTaskRecord['status'], string> = {
  working: 'running',
  input_required: 'waiting for your answer',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  disconnected: 'waiting for the server connection',
  'blocked-principal': 'blocked: signed in with another account',
};

/**
 * The runtime's Tasks part: the tracker, and the actions for the `mcp` tool
 * (`sero mcp task status|wait|cancel <id>`) and for the MCP app.
 */
export function createRuntimeTasks(input: RuntimeTasksInput) {
  const store = input.store ?? createFileTaskStore();
  const definitionOf = async (serverName: string) => (await input.getConfig()).mcpServers[serverName];

  // Connects without the runtime queue, because queued actions such as cancel_task call it.
  const tracker = new McpTaskTracker({
    store,
    sessions: input.sessions,
    retryDelaysMs: input.retryDelaysMs,
    currentPrincipal: async (serverName) => {
      const definition = await definitionOf(serverName);
      return definition ? resolvePrincipalId(serverName, definition) : undefined;
    },
    getTarget: async (serverName, { reconnect }) => {
      const definition = await definitionOf(serverName);
      if (!definition || definition.enabled === false) return undefined;
      const connection = reconnect
        ? await input.manager.reconnect(serverName, definition)
        : await input.manager.connect(serverName, definition);
      return connection.taskSession && connection.principalId
        ? { session: connection.taskSession, principalId: connection.principalId }
        : undefined;
    },
  });

  async function withRecord(taskId: string | undefined, run: (record: McpTaskRecord) => Promise<ToolResult>): Promise<ToolResult> {
    const id = taskId?.trim();
    if (!id) return createToolResult('Error: Task ID is required.', { isError: true });
    const record = await store.get(id);
    if (!record) return createToolResult(`Error: No MCP task "${id}" is known.`, { isError: true });
    return run(record);
  }

  return {
    tracker,
    store,

    async proxyAction(action: TaskProxyAction, taskId: string | undefined, signal?: AbortSignal): Promise<ToolResult> {
      return withRecord(taskId, async (record) => {
        if (action === 'task_cancel') return describeTask(await tracker.cancel(record.taskId) ?? record);
        if (action === 'task_wait') return describeTask(await tracker.wait(record.taskId, signal) ?? record);
        return describeTask(record);
      });
    },

    managerHandlers(taskId: string | undefined): Record<'list_tasks' | 'cancel_task' | 'dismiss_task' | 'task_result', () => Promise<ToolResult>> {
      return {
        list_tasks: async () => {
          const tasks = await store.list();
          return createToolResult(`${tasks.length} MCP task(s).`, { tasks: tasks.map(toTaskSummary) });
        },
        cancel_task: () => withRecord(taskId, async (record) => describeTask(await tracker.cancel(record.taskId) ?? record)),
        dismiss_task: () => withRecord(taskId, async (record) => {
          await tracker.dismiss(record.taskId);
          return createToolResult(`Dismissed MCP task ${record.taskId}.`, { taskId: record.taskId, dismissed: true });
        }),
        task_result: () => withRecord(taskId, async (record) => describeTask(record)),
      };
    },
  };
}

export type RuntimeTasks = ReturnType<typeof createRuntimeTasks>;

export function toTaskSummary(record: McpTaskRecord): McpTaskSummary {
  return {
    taskId: record.taskId,
    serverName: record.serverName,
    toolName: record.toolName,
    status: record.status,
    statusMessage: record.statusMessage ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    resultText: record.resultText ?? null,
    isError: record.isError === true,
    lastError: record.lastError ?? null,
  };
}

function describeTask(record: McpTaskRecord): ToolResult {
  const lines = [`MCP task ${record.taskId} (${record.serverName} · ${record.toolName}): ${STATUS_LABELS[record.status]}.`];
  if (record.statusMessage && !TERMINAL_TASK_STATUSES.has(record.status)) lines.push(record.statusMessage);
  if (record.resultText) lines.push('', record.resultText);
  if (record.lastError && !TERMINAL_TASK_STATUSES.has(record.status)) lines.push(record.lastError);
  return createToolResult(lines.join('\n'), { task: toTaskSummary(record), isError: record.status === 'failed' });
}
