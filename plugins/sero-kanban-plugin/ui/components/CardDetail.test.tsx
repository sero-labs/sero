// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppProvider } from '@sero-ai/app-runtime';

import { createCard, type Card, type KanbanState } from '../../shared/types';
import { CardDetail } from './CardDetail';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type OnUpdate = (updater: (state: KanbanState) => KanbanState) => void;

function createBridge() {
  const invokeTool = vi.fn(async (
    _appId: string,
    _workspaceId: string,
    _toolName: string,
    params: Record<string, unknown>,
  ) => ({
    text: successMessageForAction(params.action as string),
    content: [{ type: 'text' as const, text: successMessageForAction(params.action as string) }],
    details: null,
    isError: false,
  }));

  Reflect.set(window, 'sero', {
    appState: {
      read: vi.fn(async () => null),
      write: vi.fn(async () => undefined),
      watch: vi.fn(async () => null),
      unwatch: vi.fn(async () => undefined),
      onChange: vi.fn(() => () => undefined),
    },
    appAgent: {
      prompt: vi.fn(async () => ''),
      invokeTool,
    },
  });

  return { invokeTool };
}

function successMessageForAction(action: string): string {
  switch (action) {
    case 'start':
      return 'Started #1 "Ship card detail" → Planning.';
    case 'approve':
      return 'Approved #1 "Ship card detail" → In Progress';
    case 'complete':
      return 'Completed #1 "Ship card detail" → Done';
    case 'retry':
      return 'Retrying #1 "Ship card detail" in Planning.';
    case 'request-revisions':
      return 'Revision requested for #1 "Ship card detail" — moved back to In Progress.';
    case 'cancel-pr':
      return 'Cancelled PR for #1 "Ship card detail" — moved back to Backlog.';
    default:
      return `Error: unexpected action ${action}`;
  }
}

function buildCard(overrides: Partial<Card>): Card {
  return {
    ...createCard('1', 'Ship card detail', { description: 'Render detail panel actions.' }),
    ...overrides,
  };
}

describe('CardDetail workflow action rebasing', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let invokeTool: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ({ invokeTool } = createBridge());
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container.remove();
    root = null;
    Reflect.deleteProperty(window, 'sero');
  });

  async function renderDetail(card: Card, onUpdate: OnUpdate = vi.fn()) {
    await act(async () => {
      root?.render(
        <AppProvider value={{ appId: 'kanban', workspaceId: 'workspace-1', workspacePath: '/tmp', stateFilePath: '/tmp/kanban-state.json' }}>
          <CardDetail
            card={card}
            onClose={() => undefined}
            onUpdate={onUpdate}
          />
        </AppProvider>,
      );
    });
  }

  function clickButton(label: string): void {
    const button = Array.from(container.querySelectorAll('button')).find(
      (candidate) => candidate.textContent?.includes(label),
    );
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error(`Button not found: ${label}`);
    }
    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  }

  function fillTextarea(placeholder: string, value: string): void {
    const textarea = Array.from(container.querySelectorAll('textarea')).find(
      (candidate) => candidate.getAttribute('placeholder') === placeholder,
    );
    if (!(textarea instanceof HTMLTextAreaElement)) {
      throw new Error(`Textarea not found: ${placeholder}`);
    }

    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    valueSetter?.call(textarea, value);
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    textarea.dispatchEvent(new Event('change', { bubbles: true }));
  }

  async function flushAsyncWork() {
    await Promise.resolve();
    await Promise.resolve();
  }

  it('routes start planning through the kanban tool instead of local reducers', async () => {
    const onUpdate = vi.fn<OnUpdate>();
    await renderDetail(buildCard({ column: 'backlog', status: 'idle' }), onUpdate);

    await act(async () => {
      clickButton('Start Planning');
      await flushAsyncWork();
    });

    expect(invokeTool).toHaveBeenCalledWith('kanban', 'workspace-1', 'kanban', {
      action: 'start',
      id: '1',
    });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('routes plan approval through the kanban tool instead of local reducers', async () => {
    const onUpdate = vi.fn<OnUpdate>();
    await renderDetail(buildCard({
      column: 'planning',
      status: 'waiting-input',
      plan: '1. Build it.',
      subtasks: [{
        id: 'sub-1',
        title: 'Build it',
        description: 'Implement the approved plan.',
        status: 'pending',
        dependsOn: [],
      }],
    }), onUpdate);

    await act(async () => {
      clickButton('Approve & Start');
      await flushAsyncWork();
    });

    expect(invokeTool).toHaveBeenCalledWith('kanban', 'workspace-1', 'kanban', {
      action: 'approve',
      id: '1',
    });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('routes review completion through the kanban tool instead of local reducers', async () => {
    const onUpdate = vi.fn<OnUpdate>();
    await renderDetail(buildCard({
      column: 'review',
      status: 'waiting-input',
      prUrl: 'https://github.com/sero/sero/pull/1',
      prNumber: 1,
    }), onUpdate);

    await act(async () => {
      clickButton('Confirm PR Merged');
      await flushAsyncWork();
    });

    expect(invokeTool).toHaveBeenCalledWith('kanban', 'workspace-1', 'kanban', {
      action: 'complete',
      id: '1',
    });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('routes retry through the kanban tool instead of local reducers', async () => {
    const onUpdate = vi.fn<OnUpdate>();
    await renderDetail(buildCard({ column: 'planning', status: 'failed' }), onUpdate);

    await act(async () => {
      clickButton('Retry');
      await flushAsyncWork();
    });

    expect(invokeTool).toHaveBeenCalledWith('kanban', 'workspace-1', 'kanban', {
      action: 'retry',
      id: '1',
    });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('routes request revisions through the kanban tool instead of local reducers', async () => {
    const onUpdate = vi.fn<OnUpdate>();
    await renderDetail(buildCard({
      column: 'review',
      status: 'waiting-input',
      prUrl: 'https://github.com/sero/sero/pull/1',
      prNumber: 1,
    }), onUpdate);

    await act(async () => {
      fillTextarea('Describe what needs to change...', 'Please tighten the tests.');
    });

    await act(async () => {
      clickButton('Send Back for Revisions');
      await flushAsyncWork();
    });

    expect(invokeTool).toHaveBeenCalledWith('kanban', 'workspace-1', 'kanban', {
      action: 'request-revisions',
      id: '1',
      revisionFeedback: 'Please tighten the tests.',
    });
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('routes cancel PR through the kanban tool instead of local reducers', async () => {
    const onUpdate = vi.fn<OnUpdate>();
    await renderDetail(buildCard({
      column: 'review',
      status: 'waiting-input',
      prUrl: 'https://github.com/sero/sero/pull/1',
      prNumber: 1,
    }), onUpdate);

    await act(async () => {
      clickButton('Cancel PR');
    });

    await act(async () => {
      clickButton('Confirm Cancel');
      await flushAsyncWork();
    });

    expect(invokeTool).toHaveBeenCalledWith('kanban', 'workspace-1', 'kanban', {
      action: 'cancel-pr',
      id: '1',
    });
    expect(onUpdate).not.toHaveBeenCalled();
  });
});
