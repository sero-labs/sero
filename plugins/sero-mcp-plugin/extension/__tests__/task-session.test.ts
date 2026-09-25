import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import {
  getGlobalSingleton,
  getUserFeedbackAnswerEvent,
  USER_FEEDBACK_BUS_KEY,
  USER_FEEDBACK_QUESTION_REQUEST_EVENT,
  type UserFeedbackPendingQuestion,
} from '@sero-ai/common';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { McpServerManager } from '../manager/server-manager';
import { resultFromTaskOutcome } from '@modelcontextprotocol/ext-tasks/client';

const FIXTURE = path.resolve(import.meta.dirname, '../../../../apps/desktop/e2e/fixtures/test-mcp-server/server.mts');
const cleanups: Array<() => Promise<void> | void> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

/** Starts the fixture in HTTP mode, the mode that serves MCP Tasks. */
export async function startTaskFixture(): Promise<string> {
  const child = spawn(process.execPath, [FIXTURE, '--http'], { stdio: ['ignore', 'pipe', 'inherit'] });
  cleanups.push(() => { child.kill(); });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.stdout?.once('data', (chunk: Buffer) => resolve(chunk.toString().trim()));
  });
}

async function connect(url: string, tasks: boolean) {
  const manager = new McpServerManager({ features: { apps: true, tasks, skills: false } });
  cleanups.push(() => manager.closeAll());
  const connection = await manager.connect('reports', { transport: 'http', url });
  expect(connection.status).toBe('connected');
  return { manager, connection };
}

describe('MCP task session', () => {
  it('has no task session when the Tasks feature is off, and the call returns at once', async () => {
    const { manager, connection } = await connect(await startTaskFixture(), false);

    expect(connection.taskSession).toBeUndefined();
    const start = await manager.startToolCall('reports', 'run_report', { region: 'EMEA' });
    expect(start).toMatchObject({ kind: 'result', result: { content: [{ type: 'text', text: 'report ready: EMEA' }] } });
  });

  it('returns a task for a tool call that the server runs as a task', async () => {
    const { manager, connection } = await connect(await startTaskFixture(), true);
    expect(connection.taskSession).toBeDefined();

    const start = await manager.startToolCall('reports', 'run_report', { region: 'EMEA', delayMs: 200 });

    expect(start.kind).toBe('task');
    if (start.kind !== 'task') return;
    const { outcome } = await start.execution.settle();
    expect(resultFromTaskOutcome(outcome)).toMatchObject({ content: [{ type: 'text', text: 'report ready: EMEA' }] });
  });

  it('returns an ordinary result at once through the task session', async () => {
    const { manager } = await connect(await startTaskFixture(), true);

    const start = await manager.startToolCall('reports', 'echo', { message: 'hi' });

    expect(start).toMatchObject({ kind: 'result', result: { content: [{ type: 'text', text: 'echo: hi' }] } });
  });

  it('answers an ordinary input request through the task session', async () => {
    const { manager } = await connect(await startTaskFixture(), true);
    const bus = getGlobalSingleton(USER_FEEDBACK_BUS_KEY, () => new EventEmitter());
    const values = ['Acme', 'emea'];
    const answer = (question: UserFeedbackPendingQuestion) => {
      const item = question.questions[0]!;
      const value = values.shift()!;
      setImmediate(() => bus.emit(getUserFeedbackAnswerEvent(question.id), {
        id: question.id,
        cancelled: false,
        answers: [{ questionId: item.id, value, label: value, wasCustom: value === 'Acme' }],
      }));
    };
    bus.on(USER_FEEDBACK_QUESTION_REQUEST_EVENT, answer);
    cleanups.push(() => { bus.off(USER_FEEDBACK_QUESTION_REQUEST_EVENT, answer); });

    const start = await manager.startToolCall('reports', 'create_contact', {});

    expect(start).toMatchObject({ kind: 'result', result: { content: [{ type: 'text', text: 'created: Acme / emea' }] } });
  });
});
