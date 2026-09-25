import { EventEmitter } from 'node:events';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TaskId } from '@modelcontextprotocol/ext-tasks/core';
import {
  getGlobalSingleton,
  getUserFeedbackAnswerEvent,
  USER_FEEDBACK_BUS_KEY,
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  type UserFeedbackPendingQuestion,
} from '@sero-ai/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { McpServerManager } from '../manager/server-manager';
import { SessionRegistry } from '../runtime/app-messages';
import { createFileTaskStore, type McpTaskRecord } from '../tasks/task-store';
import { McpTaskTracker } from '../tasks/task-tracker';
import { startTaskFixture } from './helpers/task-fixture';

const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).reverse().map((cleanup) => cleanup()));
});

async function setup(options: { principal?: string; liveSession?: boolean } = {}) {
  const fixture = await startTaskFixture();
  cleanups.push(fixture.stop);
  const definition = { transport: 'http' as const, url: fixture.url };
  const manager = new McpServerManager({ features: { apps: true, tasks: true, skills: false } });
  cleanups.push(() => manager.closeAll());
  const store = createFileTaskStore(path.join(await mkdtemp(path.join(tmpdir(), 'mcp-tracker-')), 'tasks.json'));
  const sessions = new SessionRegistry();
  const send = vi.fn();
  if (options.liveSession !== false) sessions.register('chat-1', send);
  const tracker = new McpTaskTracker({
    store,
    sessions,
    retryDelaysMs: [100],
    currentPrincipal: async () => options.principal ?? 'anon',
    getTarget: async (serverName, { reconnect }) => {
      const connection = reconnect ? await manager.reconnect(serverName, definition) : await manager.connect(serverName, definition);
      return connection.taskSession && connection.principalId
        ? { session: connection.taskSession, principalId: connection.principalId }
        : undefined;
    },
  });
  cleanups.push(() => tracker.stopAll());
  await manager.connect('reports', definition);

  const startTask = async (toolArguments: Record<string, unknown>) => {
    const start = await manager.startToolCall('reports', 'run_report', toolArguments);
    if (start.kind !== 'task') throw new Error('Expected a task.');
    return tracker.adopt(start.execution, { serverName: 'reports', principalId: 'anon', toolName: 'run_report', originSessionId: 'chat-1' });
  };
  return { fixture, store, sessions, send, tracker, startTask };
}

function answerQuestions(value: string) {
  const bus = getGlobalSingleton(USER_FEEDBACK_BUS_KEY, () => new EventEmitter());
  const answer = (question: UserFeedbackPendingQuestion) => {
    setImmediate(() => bus.emit(getUserFeedbackAnswerEvent(question.id), {
      id: question.id,
      cancelled: false,
      answers: [{ questionId: question.questions[0]!.id, value, label: value, wasCustom: false }],
    }));
  };
  bus.on(USER_FEEDBACK_QUESTION_REQUEST_EVENT, answer);
  cleanups.push(() => { bus.off(USER_FEEDBACK_QUESTION_REQUEST_EVENT, answer); });
}

function storedRecord(taskId: string, overrides: Partial<McpTaskRecord> = {}): McpTaskRecord {
  return {
    taskId,
    reference: { endpointId: 'endpoint', generation: 'v2', taskId: taskId as TaskId, originalOperation: 'tools/call' },
    serverName: 'reports',
    principalId: 'anon',
    toolName: 'run_report',
    status: 'working',
    retentionMs: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    delivered: false,
    ...overrides,
  };
}

describe('MCP task tracker', () => {
  it('follows a task to completion and delivers the outcome to its chat without a new turn', async () => {
    const { tracker, startTask, send } = await setup();

    const record = await startTask({ region: 'EMEA', delayMs: 200 });
    const done = await tracker.wait(record.taskId);

    expect(done).toMatchObject({ status: 'completed', resultText: 'report ready: EMEA', delivered: true });
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({ customType: 'mcp-task-result', content: expect.stringContaining('report ready: EMEA') }),
      { triggerTurn: false },
    );
  });

  it('records a failed task with its error', async () => {
    const { tracker, startTask } = await setup();

    const record = await startTask({ plan: 'fail', delayMs: 100 });

    expect(await tracker.wait(record.taskId)).toMatchObject({ status: 'failed', resultText: 'The report failed.', isError: true });
  });

  it('cancels a task on the server', async () => {
    const { tracker, startTask } = await setup();
    const record = await startTask({ plan: 'hold' });

    expect(await tracker.cancel(record.taskId)).toMatchObject({ status: 'cancelled' });
  });

  it('asks the user through the question channel and sends the answer with update()', async () => {
    const { tracker, startTask } = await setup();
    answerQuestions('true');

    const record = await startTask({ plan: 'input', region: 'EMEA', delayMs: 100 });

    expect(await tracker.wait(record.taskId)).toMatchObject({ status: 'completed', resultText: 'report ready: EMEA, drafts: true' });
  });

  it('keeps the outcome until the chat session opens again', async () => {
    const { tracker, startTask, sessions, store } = await setup({ liveSession: false });
    const record = await startTask({ delayMs: 100 });
    await tracker.wait(record.taskId);
    expect(await store.get(record.taskId)).toMatchObject({ delivered: false });

    const send = vi.fn();
    sessions.register('chat-1', send);
    await tracker.deliverPending('chat-1');

    expect(send).toHaveBeenCalledTimes(1);
    expect(await store.get(record.taskId)).toMatchObject({ delivered: true });
  });

  it('marks the task disconnected while the server is away and completes it after the server returns', async () => {
    const { tracker, startTask, store, fixture } = await setup();
    const record = await startTask({ delayMs: 100 });
    await fixture.setOffline(true);

    await expect.poll(async () => (await store.get(record.taskId))?.status, { timeout: 5_000 }).toBe('disconnected');
    await fixture.setOffline(false);

    expect(await tracker.wait(record.taskId)).toMatchObject({ status: 'completed' });
  });

  it('removes an expired record and blocks a record of another principal when it starts', async () => {
    const { tracker, store } = await setup({ principal: 'oauth:other' });
    await store.update('expired', () => storedRecord('expired', { retentionMs: 1, createdAt: new Date(0).toISOString() }));
    await store.update('other', () => storedRecord('other'));

    await tracker.start();

    expect(await store.get('expired')).toBeUndefined();
    expect(await store.get('other')).toMatchObject({ status: 'blocked-principal' });
  });
});
