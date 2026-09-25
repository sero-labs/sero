import type { SerializedTaskReference } from '@modelcontextprotocol/ext-tasks/client';
import type { TaskId } from '@modelcontextprotocol/ext-tasks/core';
import { createJsonFile } from '../state/json-file';
import { getMcpTasksPath } from '../state/paths';

export type McpTaskStatus =
  | 'working'
  | 'input_required'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'disconnected'
  | 'blocked-principal';

/** A task that Sero follows after the tool call returned. Sero owns this record, not the server. */
export interface McpTaskRecord {
  taskId: string;
  reference: SerializedTaskReference;
  serverName: string;
  principalId: string;
  toolName: string;
  /** The chat session that made the call, to deliver the outcome there. */
  originSessionId?: string;
  toolCallId?: string;
  status: McpTaskStatus;
  statusMessage?: string;
  /** From the server. Null keeps the record until the user dismisses it. */
  retentionMs: number | null;
  createdAt: string;
  updatedAt: string;
  /** The next connection attempt after a lost connection. */
  nextPollAt?: string;
  lastError?: string;
  resultText?: string;
  isError?: boolean;
  /** True after the outcome reached the chat session. */
  delivered: boolean;
}

export const TERMINAL_TASK_STATUSES: ReadonlySet<McpTaskStatus> = new Set(['completed', 'failed', 'cancelled']);

export interface McpTaskStore {
  list(): Promise<McpTaskRecord[]>;
  get(taskId: string): Promise<McpTaskRecord | undefined>;
  /** Changes one record, or adds it when `change` returns a record for a missing ID. */
  update(taskId: string, change: (record: McpTaskRecord | undefined) => McpTaskRecord | undefined): Promise<McpTaskRecord | undefined>;
  remove(taskId: string): Promise<void>;
  /** Removes records whose retention has ended, and returns them. */
  prune(now?: number): Promise<McpTaskRecord[]>;
}

export function isTaskExpired(record: McpTaskRecord, now = Date.now()): boolean {
  return record.retentionMs !== null && Date.parse(record.createdAt) + record.retentionMs < now;
}

interface TasksFile {
  version: 1;
  tasks: McpTaskRecord[];
}

/** Keeps task records in `tasks.json`. Writes are queued and atomic. */
export function createFileTaskStore(filePath = getMcpTasksPath()): McpTaskStore {
  const file = createJsonFile<TasksFile>(filePath, (value) => {
    const tasks = value && typeof value === 'object' ? Reflect.get(value, 'tasks') : undefined;
    return {
      version: 1,
      tasks: Array.isArray(tasks) ? tasks.flatMap((entry) => {
        const record = readRecord(entry);
        return record ? [record] : [];
      }) : [],
    };
  });
  const records = async () => (await file.read()).tasks;

  return {
    list: records,
    get: async (taskId) => (await records()).find((record) => record.taskId === taskId),
    update: (taskId, change) => file.update(({ tasks }) => {
      const index = tasks.findIndex((record) => record.taskId === taskId);
      const next = change(index >= 0 ? tasks[index] : undefined);
      if (!next) return undefined;
      const updated = [...tasks];
      if (index >= 0) updated[index] = next;
      else updated.push(next);
      return { value: { version: 1, tasks: updated }, result: next };
    }),
    remove: async (taskId) => {
      await file.update(({ tasks }) => {
        const remaining = tasks.filter((record) => record.taskId !== taskId);
        return remaining.length === tasks.length ? undefined : { value: { version: 1, tasks: remaining }, result: undefined };
      });
    },
    prune: async (now = Date.now()) => (await file.update(({ tasks }) => {
      const expired = tasks.filter((record) => isTaskExpired(record, now));
      if (expired.length === 0) return undefined;
      return { value: { version: 1, tasks: tasks.filter((record) => !isTaskExpired(record, now)) }, result: expired };
    })) ?? [],
  };
}

const STATUSES: ReadonlySet<string> = new Set([
  'working', 'input_required', 'completed', 'failed', 'cancelled', 'disconnected', 'blocked-principal',
]);

function readRecord(value: unknown): McpTaskRecord | null {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<McpTaskRecord>;
  const reference = readReference(record.reference);
  if (
    typeof record.taskId !== 'string' || !reference || typeof record.serverName !== 'string'
    || typeof record.principalId !== 'string' || typeof record.toolName !== 'string'
    || typeof record.status !== 'string' || !STATUSES.has(record.status)
    || typeof record.createdAt !== 'string' || typeof record.updatedAt !== 'string'
  ) {
    return null;
  }
  return {
    ...record,
    taskId: record.taskId,
    reference,
    serverName: record.serverName,
    principalId: record.principalId,
    toolName: record.toolName,
    status: record.status,
    retentionMs: typeof record.retentionMs === 'number' ? record.retentionMs : null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    delivered: record.delivered === true,
  };
}

function readReference(value: unknown): SerializedTaskReference | null {
  if (!value || typeof value !== 'object') return null;
  const { endpointId, generation, taskId, originalOperation } = value as Record<string, unknown>;
  if (typeof endpointId !== 'string' || typeof taskId !== 'string' || originalOperation !== 'tools/call') return null;
  // A task ID is a plain string on the wire; the brand only marks it for the ext-tasks API.
  const id = taskId as TaskId;
  if (generation === 'v2') return { endpointId, generation, taskId: id, originalOperation };
  if (generation === 'v1') return { endpointId, generation, taskId: id, originalOperation };
  return null;
}
