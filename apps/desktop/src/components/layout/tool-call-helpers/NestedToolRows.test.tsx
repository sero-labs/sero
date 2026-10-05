// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@/stores/editor-bridge', () => ({
  useEditorBridge: (selector: (state: { requestOpenFile: ReturnType<typeof vi.fn> }) => unknown) =>
    selector({ requestOpenFile: vi.fn() }),
}));

import type { ChatToolCallMessage } from '@/types/ipc';
import { NestedToolRows } from './NestedToolRows';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the rows of calls a tool made', () => {
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

  // A script can catch the failure and report success, so the row is the only place the reason shows.
  it('show the error text of a failed call', async () => {
    const failed: ChatToolCallMessage = {
      type: 'tool', id: 'p/1', toolCallId: 'p/1', toolName: 'read', input: { path: 'missing.json' },
      output: 'ENOENT: no such file', isError: true, state: 'error', parentToolCallId: 'p',
    };

    await act(async () => root.render(<NestedToolRows tools={[failed]} workspaceId={null} />));

    expect(container.textContent).toContain('ENOENT: no such file');
  });
});
