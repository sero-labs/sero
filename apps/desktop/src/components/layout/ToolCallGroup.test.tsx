// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/stores/editor-bridge', () => ({
  useEditorBridge: (selector: (state: { requestOpenFile: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ requestOpenFile: vi.fn() }),
}));

vi.mock('./ImageLightbox', () => ({
  useLightbox: (selector: (state: { show: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ show: vi.fn() }),
  ImageLightbox: () => null,
}));

import { ToolCallGroup } from './ToolCallGroup';
import type { ChatToolCallMessage } from '@/types/ipc';

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
});
