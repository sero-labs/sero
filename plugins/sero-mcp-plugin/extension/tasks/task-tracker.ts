import type { TaskEnabledSession, TaskOutcome, TaskView } from '@modelcontextprotocol/ext-tasks/client';
import type { SessionRegistry } from '../runtime/app-messages';
import { TERMINAL_TASK_STATUSES, localTaskId, type McpTaskRecord, type McpTaskStatus, type McpTaskStore } from './task-store';
import { toCallToolResult, type TaskToolExecution } from './task-session';

/** Waits after a lost connection before Sero tries a task again. */
export const DEFAULT_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000, 60_000];

export interface TaskTarget {
  session: TaskEnabledSession;
  principalId: string;
}

export interface TaskTrackerOptions {
  store: McpTaskStore;
  sessions: SessionRegistry;
  /** The task session of a connected server. `reconnect` asks for a new connection after a loss. */
  getTarget(serverName: string, options: { reconnect: boolean }): Promise<TaskTarget | undefined>;
  /** The principal that a server would use now, without connecting. */
  currentPrincipal(serverName: string): Promise<string | undefined>;
  retryDelaysMs?: number[];
}

export interface AdoptTaskInput {
  serverName: string;
  principalId: string;
  toolName: string;
  originSessionId?: string;
  toolCallId?: string;
}

/**
 * Follows the tasks that Sero started. A tool call hands its task to the
 * tracker, which settles it in the background, keeps the record current,
 * and delivers the outcome to the chat that made the call.
 */
export class McpTaskTracker {
  private readonly following = new Map<string, AbortController>();
  private readonly retries = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly waiters = new Map<string, Set<() => void>>();
  private readonly retryDelaysMs: number[];

  constructor(private readonly options: TaskTrackerOptions) {
    this.retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  }

  /** Stores a new task from a tool call, releases the call, and follows the task. */
  async adopt(execution: TaskToolExecution, input: AdoptTaskInput): Promise<McpTaskRecord> {
    const now = new Date().toISOString();
    let record: McpTaskRecord | undefined;
    await execution.handoff(async (reference) => {
      // Two endpoints can return the same remote task id, so the record key is the local id.
      const id = localTaskId(reference);
      record = await this.options.store.update(id, () => ({
        taskId: id,
        reference,
        ...input,
        status: 'working',
        retentionMs: null,
        createdAt: now,
        updatedAt: now,
        delivered: false,
      }));
    });
    if (!record) throw new Error('The task reference was not stored.');
    this.follow(record);
    return record;
  }

  /** Resumes stored tasks when the runtime starts. Records past their retention are removed. */
  async start(): Promise<void> {
    await this.options.store.prune();
    for (const record of await this.options.store.list()) {
      if (TERMINAL_TASK_STATUSES.has(record.status)) continue;
      const principalId = await this.options.currentPrincipal(record.serverName);
      if (principalId !== record.principalId) {
        await this.setStatus(record.taskId, 'blocked-principal', {
          lastError: 'The server now uses another account. Sign in with the account that started the task.',
        });
        continue;
      }
      this.follow(record);
    }
  }

  /** Delivers outcomes that finished while their chat session was closed. */
  async deliverPending(sessionId: string): Promise<void> {
    for (const record of await this.options.store.list()) {
      if (record.originSessionId === sessionId && TERMINAL_TASK_STATUSES.has(record.status) && !record.delivered) {
        await this.deliver(record);
      }
    }
  }

  async cancel(taskId: string): Promise<McpTaskRecord | undefined> {
    const record = await this.options.store.get(taskId);
    if (!record || TERMINAL_TASK_STATUSES.has(record.status)) return record;
    // The same ownership check as resumption: the cancel goes only to the endpoint that made the task.
    const target = await this.ownedTarget(record, false);
    if (!target) return this.options.store.get(taskId);
    await target.session.cancelTask(record.reference.taskId);
    this.stop(taskId);
    return this.finish(taskId, { status: 'cancelled' });
  }

  /** Stops following a task and removes its record. The server keeps the task. */
  async dismiss(taskId: string): Promise<void> {
    this.stop(taskId);
    await this.options.store.remove(taskId);
    this.wake(taskId);
  }

  /** Resolves with the record when the task has ended, or when the signal stops the wait. */
  async wait(taskId: string, signal?: AbortSignal): Promise<McpTaskRecord | undefined> {
    for (;;) {
      const record = await this.options.store.get(taskId);
      if (!record || TERMINAL_TASK_STATUSES.has(record.status) || record.status === 'blocked-principal' || signal?.aborted) {
        return record;
      }
      await new Promise<void>((resolve) => {
        const waiters = this.waiters.get(taskId) ?? new Set();
        const done = () => {
          waiters.delete(done);
          signal?.removeEventListener('abort', done);
          resolve();
        };
        waiters.add(done);
        this.waiters.set(taskId, waiters);
        signal?.addEventListener('abort', done, { once: true });
      });
    }
  }

  stopAll(): void {
    for (const taskId of [...this.following.keys(), ...this.retries.keys()]) this.stop(taskId);
  }

  private follow(record: McpTaskRecord, attempt = 0): void {
    if (this.following.has(record.taskId)) return;
    const controller = new AbortController();
    this.following.set(record.taskId, controller);
    void this.settle(record, attempt, controller.signal).finally(() => {
      if (this.following.get(record.taskId) === controller) this.following.delete(record.taskId);
    });
  }

  /**
   * The connected target that owns the record, or undefined after Sero blocks
   * the record because the server now uses another principal or endpoint. A
   * record must never reach an endpoint other than the one that created it.
   */
  private async ownedTarget(record: McpTaskRecord, reconnect: boolean): Promise<TaskTarget | undefined> {
    const target = await this.options.getTarget(record.serverName, { reconnect });
    if (!target) throw new Error(`Server "${record.serverName}" is not connected.`);
    const lastError = target.principalId !== record.principalId
      ? 'The server now uses another account. Sign in with the account that started the task.'
      : target.session.endpointId !== record.reference.endpointId
        ? 'The server connection changed since the task started. Start the task again.'
        : null;
    if (!lastError) return target;
    await this.setStatus(record.taskId, 'blocked-principal', { lastError });
    return undefined;
  }

  private async settle(record: McpTaskRecord, attempt: number, signal: AbortSignal): Promise<void> {
    try {
      const target = await this.ownedTarget(record, attempt > 0);
      if (!target) return;
      const execution = await target.session.resumeTask(record.reference, { signal });
      if (execution.kind !== 'task') throw new Error('The stored reference does not name a task.');
      const { outcome } = await execution.settle({
        signal,
        onEvent: async (event) => {
          if (event.type === 'task') await this.observe(record.taskId, event.task);
        },
      });
      if (!signal.aborted) await this.finishWithOutcome(record.taskId, outcome);
    } catch (error) {
      if (signal.aborted) return;
      const delay = this.retryDelaysMs[Math.min(attempt, this.retryDelaysMs.length - 1)] ?? 60_000;
      await this.setStatus(record.taskId, 'disconnected', {
        lastError: error instanceof Error ? error.message : String(error),
        nextPollAt: new Date(Date.now() + delay).toISOString(),
      });
      this.following.delete(record.taskId);
      this.retries.set(record.taskId, setTimeout(() => {
        this.retries.delete(record.taskId);
        void this.options.store.get(record.taskId).then((current) => {
          if (current && !TERMINAL_TASK_STATUSES.has(current.status)) this.follow(current, attempt + 1);
        });
      }, delay));
    }
  }

  private async observe(taskId: string, view: TaskView): Promise<void> {
    if (TERMINAL_TASK_STATUSES.has(view.status)) return;
    await this.options.store.update(taskId, (current) => current && {
      ...current,
      status: view.status,
      statusMessage: view.statusMessage,
      retentionMs: view.retentionMs,
      lastError: undefined,
      nextPollAt: undefined,
      updatedAt: new Date().toISOString(),
    });
    this.wake(taskId);
  }

  private async finishWithOutcome(taskId: string, outcome: TaskOutcome<unknown>): Promise<void> {
    if (outcome.status === 'completed') {
      const result = toCallToolResult(outcome.result);
      const resultText = result.content
        .map((block) => (block.type === 'text' ? block.text : `[${block.type}]`))
        .join('\n');
      await this.finish(taskId, { status: 'completed', resultText, isError: result.isError === true });
    } else if (outcome.status === 'failed') {
      await this.finish(taskId, { status: 'failed', resultText: outcome.error.message, isError: true });
    } else {
      await this.finish(taskId, { status: 'cancelled' });
    }
  }

  private async finish(taskId: string, change: Partial<McpTaskRecord> & { status: McpTaskStatus }): Promise<McpTaskRecord | undefined> {
    // Deliver before waiters wake, so a waiter sees the final record.
    const record = await this.setStatus(taskId, change.status, change, { wake: false });
    if (record) await this.deliver(record);
    this.wake(taskId);
    return this.options.store.get(taskId);
  }

  private async deliver(record: McpTaskRecord): Promise<void> {
    const send = this.options.sessions.get(record.originSessionId);
    if (!send || record.delivered) return;
    const outcome = record.status === 'completed'
      ? `finished:\n${record.resultText ?? ''}`
      : record.status === 'failed' ? `failed: ${record.resultText ?? ''}` : 'was cancelled.';
    // The approved default: a task result reaches its chat without a new agent turn.
    send({
      customType: 'mcp-task-result',
      content: `MCP task ${record.taskId} (${record.serverName} · ${record.toolName}) ${outcome}`,
      display: true,
      details: { taskId: record.taskId, serverName: record.serverName, status: record.status },
    }, { triggerTurn: false });
    await this.options.store.update(record.taskId, (current) => current && { ...current, delivered: true });
  }

  private async setStatus(
    taskId: string,
    status: McpTaskStatus,
    change: Partial<McpTaskRecord> = {},
    options: { wake?: boolean } = {},
  ): Promise<McpTaskRecord | undefined> {
    const record = await this.options.store.update(taskId, (current) => current && {
      ...current,
      ...change,
      status,
      updatedAt: new Date().toISOString(),
    });
    if (options.wake !== false) this.wake(taskId);
    return record;
  }

  private stop(taskId: string): void {
    this.following.get(taskId)?.abort();
    this.following.delete(taskId);
    clearTimeout(this.retries.get(taskId));
    this.retries.delete(taskId);
  }

  private wake(taskId: string): void {
    for (const waiter of [...(this.waiters.get(taskId) ?? [])]) waiter();
  }
}
