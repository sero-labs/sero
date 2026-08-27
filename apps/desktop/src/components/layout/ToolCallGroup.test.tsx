// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

const layoutRef = vi.hoisted(() => ({ current: 'rows' as 'rows' | 'rail' }));
const setToolCallLayout = vi.hoisted(() => vi.fn());

vi.mock('@/stores/app', () => ({
  useAppStore: (selector: (state: {
    toolCallLayout: 'rows' | 'rail';
    setToolCallLayout: typeof setToolCallLayout;
  }) => unknown) => selector({
    toolCallLayout: layoutRef.current,
    setToolCallLayout,
  }),
}));

vi.mock('@/stores/editor-bridge', () => ({
  useEditorBridge: (selector: (state: { requestOpenFile: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ requestOpenFile: vi.fn() }),
}));

vi.mock('@/components/layout/ImageLightbox', () => ({
  useLightbox: (selector: (state: { show: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ show: vi.fn() }),
  ImageLightbox: () => null,
}));

import { groupMessages, ToolCallGroup } from './ToolCallGroup';
import type { ChatAssistantMessage, ChatToolCallMessage } from '@/types/ipc';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(window, 'scrollTo', { configurable: true, value: vi.fn() });

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
    layoutRef.current = 'rows';
    setToolCallLayout.mockClear();
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

  it('keeps an opened tool detail visible when a live group later finalizes', async () => {
    await act(async () => {
      root?.render(
        <ToolCallGroup
          tools={[
            makeTool({ id: 'tool-a', toolCallId: 'call-a', toolName: 'read', output: 'READ_OUTPUT' }),
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
      clickButtonByText(container, 'read');
    });
    expect(container.textContent).toContain('READ_OUTPUT');

    await act(async () => {
      root?.render(
        <ToolCallGroup
          tools={[
            makeTool({ id: 'tool-a', toolCallId: 'call-a', toolName: 'read', output: 'READ_OUTPUT' }),
            makeTool({ id: 'tool-b', toolCallId: 'call-b', toolName: 'bash' }),
          ]}
          workspaceId="ws-1"
          isFinalized
        />,
      );
    });

    const summaryButton = Array.from(container.querySelectorAll('button')).find((button) =>
      button.textContent?.includes('2 actions completed'),
    );
    expect(summaryButton?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('READ_OUTPUT');
  });

  it('collapses a completed row when the next tool becomes live', async () => {
    const runningTool = makeTool({
      id: 'tool-b',
      toolCallId: 'call-b',
      toolName: 'bash',
      state: 'running',
      output: 'PARTIAL_OUTPUT',
      isPartialOutput: true,
    });

    await act(async () => {
      root?.render(
        <ToolCallGroup
          tools={[
            makeTool({ id: 'tool-a', toolCallId: 'call-a', toolName: 'read' }),
            runningTool,
          ]}
          workspaceId="ws-1"
          isFinalized={false}
        />,
      );
    });
    expect(container.textContent).toContain('PARTIAL_OUTPUT');

    await act(async () => {
      root?.render(
        <ToolCallGroup
          tools={[
            makeTool({ id: 'tool-a', toolCallId: 'call-a', toolName: 'read' }),
            { ...runningTool, state: 'completed', output: 'FINAL_OUTPUT', isPartialOutput: false },
            makeTool({
              id: 'tool-c', toolCallId: 'call-c', toolName: 'write',
              state: 'running', output: 'CURRENT_OUTPUT', isPartialOutput: true,
            }),
          ]}
          workspaceId="ws-1"
          isFinalized={false}
        />,
      );
    });

    expect(container.textContent).not.toContain('FINAL_OUTPUT');
    expect(container.textContent).toContain('CURRENT_OUTPUT');
  });

  it('collapses one completed tool unless the reader opened it', async () => {
    const running = makeTool({
      toolName: 'bash', state: 'running', output: 'RUNNING_OUTPUT', isPartialOutput: true,
    });
    await act(async () => {
      root?.render(<ToolCallGroup tools={[running]} workspaceId="ws-1" isFinalized={false} />);
    });
    expect(container.textContent).toContain('RUNNING_OUTPUT');

    const completed = { ...running, state: 'completed' as const, output: 'FINAL_OUTPUT', isPartialOutput: false };
    await act(async () => {
      root?.render(<ToolCallGroup tools={[completed]} workspaceId="ws-1" isFinalized />);
    });
    expect(container.textContent).not.toContain('FINAL_OUTPUT');

    await act(async () => {
      clickButtonByText(container, 'bash');
    });
    expect(container.textContent).toContain('FINAL_OUTPUT');

    await act(async () => {
      root?.render(
        <ToolCallGroup
          tools={[{ ...completed, output: 'UPDATED_FINAL_OUTPUT' }]}
          workspaceId="ws-1"
          isFinalized
        />,
      );
    });
    expect(container.textContent).toContain('UPDATED_FINAL_OUTPUT');
  });

  it('lets the reader switch to the rail layout', async () => {
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

    await act(async () => {
      clickButtonByText(container, '2 actions completed');
    });
    const railButton = container.querySelector<HTMLButtonElement>('button[aria-label="Rail layout"]');
    expect(railButton).not.toBeNull();

    await act(async () => {
      railButton?.click();
    });
    expect(setToolCallLayout).toHaveBeenCalledWith('rail');
  });

  it('shows one detail at a time in the rail layout', async () => {
    layoutRef.current = 'rail';
    try {
      await act(async () => {
        root?.render(
          <ToolCallGroup
            tools={[
              makeTool({ id: 'tool-a', toolCallId: 'call-a', toolName: 'read', output: 'READ_OUTPUT' }),
              makeTool({
                id: 'tool-b',
                toolCallId: 'call-b',
                toolName: 'bash',
                state: 'running',
                output: 'BASH_OUTPUT',
                isPartialOutput: true,
              }),
            ]}
            workspaceId="ws-1"
            isFinalized={false}
          />,
        );
      });

      // The rail lists every tool, the pane follows the running one.
      expect(container.textContent).toContain('read');
      expect(container.textContent).toContain('BASH_OUTPUT');
      expect(container.textContent).not.toContain('READ_OUTPUT');

      await act(async () => {
        clickButtonByText(container, 'read');
      });

      expect(container.textContent).toContain('READ_OUTPUT');
      expect(container.textContent).not.toContain('BASH_OUTPUT');
    } finally {
      layoutRef.current = 'rows';
    }
  });

  it('streams write content into the open tool row', async () => {
    const write = makeTool({
      toolName: 'write',
      state: 'pending',
      input: { path: 'src/live.ts', content: 'STREAMED_FILE_CONTENT' },
      output: null,
      isStreamingInput: true,
    });

    await act(async () => {
      root?.render(<ToolCallGroup tools={[write]} workspaceId="ws-1" isFinalized={false} />);
    });

    // A live tool opens itself, so streamed content is visible as it arrives.
    expect(container.textContent).toContain('src/live.ts');
    expect(container.textContent).toContain('Live');
    expect(container.textContent).toContain('STREAMED_FILE_CONTENT');

    const updatedWrite = {
      ...write,
      input: { ...write.input, content: 'STREAMED_FILE_CONTENT\nNEXT_DELTA\n' },
    };
    await act(async () => {
      root?.render(
        <ToolCallGroup tools={[updatedWrite]} workspaceId="ws-1" isFinalized={false} />,
      );
    });

    expect(container.textContent).toContain('NEXT_DELTA');
    expect(container.textContent).toContain('2 lines');

    // The same live content follows the write into a multi-tool group.
    await act(async () => {
      root?.render(
        <ToolCallGroup
          tools={[
            updatedWrite,
            makeTool({ id: 'tool-b', toolCallId: 'call-b', toolName: 'read' }),
          ]}
          workspaceId="ws-1"
          isFinalized={false}
        />,
      );
    });

    expect(container.textContent).toContain('src/live.ts');
    expect(container.textContent).toContain('NEXT_DELTA');
  });

  it('renders only the last ten tool calls', async () => {
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
    expect(summaryButton?.textContent).toContain('2 actions');
    expect(summaryButton?.textContent).not.toContain('failed');
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

  it('still shows an explicit user-requested rename', () => {
    const items = groupMessages([
      makeTool({
        input: { command: 'sero set-title "Renamed by user"' },
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
