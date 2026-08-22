// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/stores/editor-bridge', () => ({
  useEditorBridge: (selector: (state: { requestOpenFile: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ requestOpenFile: vi.fn() }),
}));

import type { ChatToolCallMessage } from '@/types/ipc';
import { ClampedText } from './ClampedText';
import { ToolDetailBody } from './ToolDetailBody';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('tool detail content', () => {
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

  it('clamps long single-line text by character count', async () => {
    const text = 'x'.repeat(4_000);
    await act(async () => root.render(<ClampedText text={text} />));

    expect(container.querySelector('pre')?.textContent).toHaveLength(2_000);
    const expandButton = container.querySelector<HTMLButtonElement>('button');
    expect(expandButton?.textContent).toBe('Show all 4,000 characters');

    await act(async () => expandButton?.click());
    expect(container.querySelector('pre')?.textContent).toBe(text);
  });

  it('shows a fallback message when an errored tool has no output', async () => {
    const tool: ChatToolCallMessage = {
      type: 'tool',
      id: 'tool-error',
      toolCallId: 'call-error',
      toolName: 'bash',
      input: { command: 'exit 1' },
      output: null,
      isError: true,
      state: 'error',
      details: null,
      isPartialOutput: false,
    };

    await act(async () => root.render(<ToolDetailBody tool={tool} />));

    expect(container.textContent).toContain('error');
    expect(container.textContent).toContain('Tool execution failed');
  });
});
