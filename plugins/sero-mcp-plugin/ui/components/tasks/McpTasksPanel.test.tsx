// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpTaskSummary } from '../../../shared/tasks';
import { McpTasksPanel } from './McpTasksPanel';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = Date.parse('2026-09-25T12:00:00Z');

function task(taskId: string, overrides: Partial<McpTaskSummary>): McpTaskSummary {
  return {
    taskId,
    serverName: 'reports',
    toolName: 'build_report',
    status: 'working',
    statusMessage: null,
    createdAt: new Date(NOW - 2 * 60_000).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    resultText: null,
    isError: false,
    lastError: null,
    ...overrides,
  };
}

describe('McpTasksPanel', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
  });

  it('shows running, completed and blocked tasks with the actions each one allows', async () => {
    const onCancel = vi.fn();
    const onDismiss = vi.fn();
    const tasks = [
      task('running', {}),
      task('done', { status: 'completed', toolName: 'export_ledger', resultText: 'Ledger is ready.' }),
      task('blocked', { status: 'blocked-principal', toolName: 'sync_accounts', lastError: 'Sign in with the account that started the task.' }),
    ];

    await act(async () => root.render(<McpTasksPanel tasks={tasks} onCancel={onCancel} onDismiss={onDismiss} now={NOW} />));
    const rows = [...container.querySelectorAll('li')];

    expect(rows.map((row) => row.textContent)).toEqual([
      expect.stringContaining('Working · 2 min ago'),
      expect.stringContaining('Completed · 2 min ago'),
      expect.stringContaining('Cannot continue · 2 min agoSign in with the account that started the task.'),
    ]);
    expect([...rows[0]!.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Cancel']);
    expect([...rows[1]!.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Result', 'Dismiss']);
    expect([...rows[2]!.querySelectorAll('button')].map((button) => button.textContent)).toEqual(['Dismiss']);

    await act(async () => rows[1]!.querySelector('button')!.click());
    expect(rows[1]!.textContent).toContain('Ledger is ready.');
    await act(async () => rows[0]!.querySelector('button')!.click());
    expect(onCancel).toHaveBeenCalledWith('running');
  });
});
