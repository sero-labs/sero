import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TaskId } from '@modelcontextprotocol/ext-tasks/core';
import { describe, expect, it } from 'vitest';
import { createFileTaskStore, localTaskId, type McpTaskRecord } from '../tasks/task-store';

function record(taskId: string, overrides: Partial<McpTaskRecord> = {}): McpTaskRecord {
  return {
    taskId,
    reference: { endpointId: 'endpoint', generation: 'v2', taskId: taskId as TaskId, originalOperation: 'tools/call' },
    serverName: 'reports',
    principalId: 'anon',
    toolName: 'run_report',
    originSessionId: 'chat-1',
    status: 'working',
    retentionMs: 60_000,
    createdAt: new Date(1_000_000).toISOString(),
    updatedAt: new Date(1_000_000).toISOString(),
    delivered: false,
    ...overrides,
  };
}

async function tempStore() {
  const filePath = path.join(await mkdtemp(path.join(tmpdir(), 'mcp-tasks-')), 'tasks.json');
  return { filePath, store: createFileTaskStore(filePath) };
}

describe('MCP task store', () => {
  it('keeps records in tasks.json and reads them back', async () => {
    const { filePath, store } = await tempStore();
    await store.update('task-1', () => record('task-1'));
    await store.update('task-1', (current) => current && { ...current, status: 'completed', resultText: 'done' });

    const reopened = createFileTaskStore(filePath);

    expect(await reopened.list()).toEqual([record('task-1', { status: 'completed', resultText: 'done' })]);
    expect(JSON.parse(await readFile(filePath, 'utf8'))).toMatchObject({ version: 1 });
  });

  it('keeps two endpoints apart when they return the same remote task id', async () => {
    const { store } = await tempStore();
    const first = { endpointId: 'server-a', generation: 'v2' as const, taskId: 'task-1' as TaskId, originalOperation: 'tools/call' as const };
    const second = { endpointId: 'server-b', generation: 'v2' as const, taskId: 'task-1' as TaskId, originalOperation: 'tools/call' as const };
    await store.update(localTaskId(first), () => record(localTaskId(first), { reference: first }));
    await store.update(localTaskId(second), () => record(localTaskId(second), { reference: second }));

    expect(localTaskId(first)).not.toBe(localTaskId(second));
    expect((await store.list()).map((entry) => entry.taskId)).toEqual([localTaskId(first), localTaskId(second)]);
  });

  it('removes records whose retention has ended and keeps the others', async () => {
    const { store } = await tempStore();
    await store.update('old', () => record('old'));
    await store.update('kept', () => record('kept', { retentionMs: null }));

    const pruned = await store.prune(1_000_000 + 60_001);

    expect(pruned.map((entry) => entry.taskId)).toEqual(['old']);
    expect((await store.list()).map((entry) => entry.taskId)).toEqual(['kept']);
  });

  it('ignores a stored entry that is not a valid record', async () => {
    const { filePath, store } = await tempStore();
    await store.update('task-1', () => record('task-1'));
    const { writeFile } = await import('node:fs/promises');
    const content = JSON.parse(await readFile(filePath, 'utf8'));
    content.tasks.push({ taskId: 'broken' });
    await writeFile(filePath, JSON.stringify(content));

    expect((await store.list()).map((entry) => entry.taskId)).toEqual(['task-1']);
  });
});
