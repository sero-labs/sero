import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { SerializedTaskReference } from '@modelcontextprotocol/ext-tasks/client';
import type { TaskId } from '@modelcontextprotocol/ext-tasks/core';
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

/** Keeps task records in `tasks.json`. Writes are queued and atomic. */
export function createFileTaskStore(filePath = getMcpTasksPath()): McpTaskStore {
  let queue: Promise<unknown> = Promise.resolve();
  const exclusive = <T>(operation: () => Promise<T>): Promise<T> => {
    const next = queue.then(operation, operation);
    queue = next.catch(() => undefined);
    return next;
  };

  async function read(): Promise<McpTaskRecord[]> {
    try {
      const parsed: unknown = JSON.parse(await fs.readFile(filePath, 'utf8'));
      const tasks = parsed && typeof parsed === 'object' ? Reflect.get(parsed, 'tasks') : undefined;
      return Array.isArray(tasks) ? tasks.flatMap((value) => {
        const record = readRecord(value);
        return record ? [record] : [];
      }) : [];
    } catch {
      return [];
    }
  }

  async function write(records: McpTaskRecord[]): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}`;
    await fs.writeFile(tmpPath, JSON.stringify({ version: 1, tasks: records }, null, 2), 'utf8');
    await fs.rename(tmpPath, filePath);
  }

  return {
    list: () => exclusive(read),
    get: (taskId) => exclusive(async () => (await read()).find((record) => record.taskId === taskId)),
    update: (taskId, change) => exclusive(async () => {
      const records = await read();
      const index = records.findIndex((record) => record.taskId === taskId);
      const next = change(index >= 0 ? records[index] : undefined);
      if (!next) return undefined;
      if (index >= 0) records[index] = next;
      else records.push(next);
      await write(records);
      return next;
    }),
    remove: (taskId) => exclusive(async () => {
      const records = await read();
      const remaining = records.filter((record) => record.taskId !== taskId);
      if (remaining.length !== records.length) await write(remaining);
    }),
    prune: (now = Date.now()) => exclusive(async () => {
      const records = await read();
      const expired = records.filter((record) => isTaskExpired(record, now));
      if (expired.length > 0) await write(records.filter((record) => !isTaskExpired(record, now)));
      return expired;
    }),
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
