// @vitest-environment jsdom

/**
 * A chat `subagent` tool call shows its agents while it runs.
 *
 * The call used to print the tracker's start lines as its body text. One live
 * block per agent replaces them, matched by the call's own id, so a parallel or
 * chained call shows exactly its own agents. Once the call ends, its input and
 * output come back.
 */

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const subagentBridge = {
  snapshot: vi.fn(async () => []),
  watch: vi.fn(async () => {}),
  unwatch: vi.fn(async () => {}),
  onEvent: vi.fn(() => () => {}),
};
Reflect.set(globalThis, 'sero', { subagent: subagentBridge });

import type { ChatToolCallMessage, SubagentEntry } from '@/types/ipc';
import { useSubagentStore } from '@/stores/subagent';
import { SingleToolCall } from './SingleToolCall';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function entry(overrides: Partial<SubagentEntry> & { id: string }): SubagentEntry {
  return {
    agentName: 'scout',
    taskPreview: 'Scan',
    status: 'running',
    startedAt: 1,
    completedAt: null,
    durationMs: null,
    parentSessionId: 'session-1',
    workspaceId: 'ws-1',
    mode: 'single',
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, cost: 0 },
    model: null,
    toolActivity: [],
    liveOutput: '',
    ...overrides,
  };
}

function call(overrides: Partial<ChatToolCallMessage> = {}): ChatToolCallMessage {
  return {
    type: 'tool',
    id: 'tool-1',
    toolCallId: 'call-1',
    toolName: 'subagent',
    input: { agent: 'scout', task: 'Scan the repo' },
    output: null,
    isError: false,
    state: 'running',
    details: null,
    isPartialOutput: false,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  useSubagentStore.setState({ entries: {}, outputs: {}, hydrated: true });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

/**
 * Seed the runs both ways: the store hydrates from the host snapshot on mount,
 * so a fixture that only sets the store is wiped as soon as the chat renders.
 */
function seed(entries: Record<string, SubagentEntry>) {
  subagentBridge.snapshot.mockResolvedValue(Object.values(entries) as never);
  useSubagentStore.setState({ entries, outputs: {}, hydrated: true });
}

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(tool: ChatToolCallMessage) {
  await act(async () => root.render(<SingleToolCall tool={tool} workspaceId="ws-1" />));
}

function blocks(): NodeListOf<Element> {
  return container.querySelectorAll('[data-slot="live-block"]');
}

describe('a running subagent call in chat', () => {
  it('shows one block for a single agent', async () => {
    seed({ 'run-1': entry({ id: 'run-1', agentName: 'scout', toolCallId: 'call-1' }) });

    await render(call());

    expect(blocks()).toHaveLength(1);
    expect(container.textContent).toContain('scout');
    expect(container.textContent).not.toContain('started —');
  });

  it('shows one block per agent for a parallel call, named by the agent', async () => {
    seed({
      'run-1': entry({ id: 'run-1', agentName: 'scout', mode: 'parallel', toolCallId: 'call-1' }),
      'run-2': entry({ id: 'run-2', agentName: 'researcher', mode: 'parallel', toolCallId: 'call-1' }),
    });

    await render(call());

    expect(blocks()).toHaveLength(2);
    expect(container.textContent).toContain('scout');
    expect(container.textContent).toContain('researcher');
  });

  it('shows one block per chained step and never another call’s agents', async () => {
    seed({
      'run-1': entry({ id: 'run-1', agentName: 'scout', mode: 'chain', chainStep: 0, toolCallId: 'call-1' }),
      'run-2': entry({ id: 'run-2', agentName: 'analyst', mode: 'chain', chainStep: 1, toolCallId: 'call-1' }),
      'run-3': entry({ id: 'run-3', agentName: 'unrelated', toolCallId: 'call-2' }),
    });

    await render(call());

    expect(blocks()).toHaveLength(2);
    expect(container.textContent).toContain('scout');
    expect(container.textContent).toContain('analyst');
    expect(container.textContent).not.toContain('unrelated');
  });

  it('shows the call’s input and output once it is done', async () => {
    seed({ 'run-1': entry({ id: 'run-1', agentName: 'scout', status: 'completed', toolCallId: 'call-1' }) });

    await render(call({ state: 'completed', output: 'Found 10 files.' }));
    expect(blocks()).toHaveLength(0);

    // A finished call reads like any other tool call: open it to see the result.
    const header = container.querySelector<HTMLButtonElement>('button');
    await act(async () => header?.click());

    expect(blocks()).toHaveLength(0);
    expect(container.textContent).toContain('Found 10 files.');
  });
});
