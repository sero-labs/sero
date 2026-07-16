// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/stores/editor-bridge', () => ({
  useEditorBridge: (selector: (state: { requestOpenFile: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ requestOpenFile: vi.fn() }),
}));

vi.mock('@/components/layout/ImageLightbox', () => ({
  useLightbox: (selector: (state: { show: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ show: vi.fn() }),
  ImageLightbox: () => null,
}));

import { groupMessages, isToolGroupFinalized, ToolCallGroup } from './ToolCallGroup';
import type { ChatAssistantMessage, ChatToolCallMessage } from '@/types/ipc';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function makeTool(overrides: Partial<ChatToolCallMessage>): ChatToolCallMessage {
  return {
    type: 'tool',
    id: 'tool-1',
    toolCallId: 'call-1',
    toolName: 'sero-cli',
    input: { command: 'sero app screenshot --app calc --save /tmp/calc-shot.png' },
    output: 'Screenshot of Calculator app\nSaved: /tmp/calc-shot.png (38KB)',
    isError: false,
    state: 'completed',
    details: null,
    isPartialOutput: false,
    ...overrides,
  };
}

function makeAssistant(overrides: Partial<ChatAssistantMessage>): ChatAssistantMessage {
  return {
    type: 'assistant',
    id: 'assistant-1',
    text: '',
    isStreaming: false,
    ...overrides,
  };
}

function clickButtonByText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) =>
    candidate.textContent?.includes(text),
  );
  expect(button).toBeDefined();
  button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('ToolCallGroup image previews', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    container.remove();
  });

  it('shows the latest tool image and file location while the group is collapsed', async () => {
    await act(async () => {
      root?.render(
        <ToolCallGroup
          tools={[
            makeTool({
              id: 'tool-a',
              toolCallId: 'call-a',
              output: 'Available apps: calc',
              images: undefined,
            }),
            makeTool({
              id: 'tool-b',
              toolCallId: 'call-b',
              images: [{
                data: 'abc123',
                mimeType: 'image/png',
                description: 'Calculator screenshot',
                filePath: '/tmp/calc-shot.png',
              }],
            }),
          ]}
          workspaceId="ws-1"
          isFinalized
        />,
      );
    });

    expect(container.textContent).toContain('/tmp/calc-shot.png');
    expect(container.querySelector('img')).not.toBeNull();
  });

  it('keeps full details open when a live group later finalizes', async () => {
    await act(async () => {
      root?.render(
        <ToolCallGroup
          tools={[
            makeTool({ id: 'tool-a', toolCallId: 'call-a', toolName: 'read' }),
            makeTool({
              id: 'tool-b',
              toolCallId: 'call-b',
              toolName: 'bash',
              state: 'running',
              output: 'running...',
              isPartialOutput: true,
            }),
          ]}
          workspaceId="ws-1"
          isFinalized={false}
        />,
      );
    });

    await act(async () => {
      clickButtonByText(container, 'Show full details');
    });
    expect(container.textContent).toContain('Collapse details');

    await act(async () => {
      root?.render(
        <ToolCallGroup
          tools={[
            makeTool({ id: 'tool-a', toolCallId: 'call-a', toolName: 'read' }),
            makeTool({ id: 'tool-b', toolCallId: 'call-b', toolName: 'bash' }),
          ]}
          workspaceId="ws-1"
          isFinalized
        />,
      );
    });

    expect(container.textContent).toContain('Collapse details');
  });

  it('renders only the last ten tool calls in summary and detail views', async () => {
    const tools = Array.from({ length: 12 }, (_, index) =>
      makeTool({
        id: `tool-${index}`,
        toolCallId: `call-${index}`,
        toolName: index < 2 ? `hidden-${index}` : `visible-${index}`,
        input: { command: `cmd-${index}` },
      }),
    );

    await act(async () => {
      root?.render(<ToolCallGroup tools={tools} workspaceId="ws-1" isFinalized />);
    });

    await act(async () => {
      clickButtonByText(container, '12 actions completed');
    });

    expect(container.textContent).not.toContain('Showing last 10 of 12 actions');
    expect(container.textContent).not.toContain('hidden-0');
    expect(container.textContent).not.toContain('hidden-1');
    expect(container.textContent).toContain('visible-2');
    expect(container.textContent).toContain('visible-11');

    await act(async () => {
      clickButtonByText(container, 'Show full details');
    });

    expect(container.textContent).toContain('Collapse details');
    expect(container.textContent).not.toContain('Showing last 10 of 12 actions');
    expect(container.textContent).not.toContain('hidden-0');
    expect(container.textContent).not.toContain('hidden-1');
    expect(container.textContent).toContain('visible-2');
    expect(container.textContent).toContain('visible-11');
  });

  it('uses a neutral completion indicator when one action failed', async () => {
    await act(async () => {
      root?.render(
        <ToolCallGroup
          tools={[
            makeTool({
              id: 'tool-a',
              toolCallId: 'call-a',
              state: 'error',
              isError: true,
              output: 'Command failed',
            }),
            makeTool({ id: 'tool-b', toolCallId: 'call-b' }),
          ]}
          workspaceId="ws-1"
          isFinalized
        />,
      );
    });

    const summaryButton = container.querySelector('button');
    const statusIcon = Array.from(summaryButton?.querySelectorAll('svg') ?? []).at(-1);
    expect(summaryButton?.querySelector('.text-status-error')).toBeNull();
    expect(statusIcon?.getAttribute('class')).toContain('text-[var(--text-muted)]');
  });
});

describe('groupMessages', () => {
  it('hides session title tool calls from the chat', () => {
    const items = groupMessages([
      makeTool({
        id: 'title-tool',
        toolCallId: 'title-call',
        input: { command: 'sero set-title --if-unnamed "Fix session titles"' },
      }),
      makeAssistant({ id: 'assistant-response', text: 'Done.' }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      kind: 'message',
      message: { id: 'assistant-response' },
    });
  });

  it('still shows sero-cli calls that batch title and other actions', () => {
    const items = groupMessages([
      makeTool({
        input: { command: 'sero set-title "Session title"\nsero workspace info' },
      }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('tool-group');
  });

  it('merges tool calls across finalized thinking-only assistant messages', () => {
    const items = groupMessages([
      makeTool({ id: 'tool-a', toolCallId: 'call-a', toolName: 'read' }),
      makeAssistant({ id: 'assistant-thinking-1', thinking: 'Planning next step' }),
      makeTool({ id: 'tool-b', toolCallId: 'call-b', toolName: 'bash' }),
      makeAssistant({ id: 'assistant-thinking-2', thinking: 'One more check' }),
      makeTool({ id: 'tool-c', toolCallId: 'call-c', toolName: 'edit' }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]?.kind).toBe('tool-group');
    if (items[0]?.kind === 'tool-group') {
      expect(items[0].tools.map((tool) => tool.toolName)).toEqual(['read', 'bash', 'edit']);
    }
  });

  it('keeps a trailing streaming thinking-only assistant message visible', () => {
    const items = groupMessages([
      makeTool({ id: 'tool-a', toolCallId: 'call-a', toolName: 'read' }),
      makeAssistant({
        id: 'assistant-thinking-live',
        thinking: 'Checking one more file',
        isStreaming: true,
      }),
    ]);

    expect(items).toHaveLength(2);
    expect(items[0]?.kind).toBe('tool-group');
    expect(items[1]?.kind).toBe('message');
    if (items[1]?.kind === 'message' && items[1].message.type === 'assistant') {
      expect(items[1].message.thinking).toBe('Checking one more file');
      expect(items[1].message.isStreaming).toBe(true);
    }
  });
});

describe('isToolGroupFinalized', () => {
  it('keeps a trailing tool group live while only streaming thinking follows it', () => {
    const items = groupMessages([
      makeTool({ id: 'tool-a', toolCallId: 'call-a', toolName: 'read' }),
      makeAssistant({
        id: 'assistant-thinking-live',
        thinking: 'Checking one more file',
        isStreaming: true,
      }),
    ]);

    expect(isToolGroupFinalized(items, 0)).toBe(false);
  });

  it('keeps the latest tool group live when no durable response follows it yet', () => {
    const items = groupMessages([
      makeTool({ id: 'tool-a', toolCallId: 'call-a', toolName: 'read' }),
      makeTool({ id: 'tool-b', toolCallId: 'call-b', toolName: 'bash' }),
    ]);

    expect(isToolGroupFinalized(items, 0)).toBe(false);
  });

  it('finalizes a tool group once a durable assistant response follows it', () => {
    const items = groupMessages([
      makeTool({ id: 'tool-a', toolCallId: 'call-a', toolName: 'read' }),
      makeAssistant({
        id: 'assistant-response',
        text: 'Done.',
        isStreaming: false,
      }),
    ]);

    expect(isToolGroupFinalized(items, 0)).toBe(true);
  });
});
