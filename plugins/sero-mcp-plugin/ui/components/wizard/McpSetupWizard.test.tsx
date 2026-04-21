// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppToolResult } from '@sero-ai/common';
import { McpSetupWizard } from './McpSetupWizard';

const useAppToolsMock = vi.fn();
const runMock = vi.fn<(
  toolName: string,
  params?: Record<string, unknown>,
) => Promise<AppToolResult>>();

vi.mock('@sero-ai/app-runtime', () => ({
  useAppTools: () => useAppToolsMock(),
}));

describe('McpSetupWizard', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    runMock.mockReset();
    runMock.mockResolvedValue({ text: 'saved', content: [{ type: 'text', text: 'saved' }], details: null, isError: false });
    useAppToolsMock.mockReturnValue({ run: runMock });
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container.remove();
    root = null;
    runMock.mockReset();
    useAppToolsMock.mockReset();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('saves the guided draft through mcp_manager and reports the created server name', async () => {
    const onCreated = vi.fn();

    await act(async () => {
      root?.render(
        <McpSetupWizard
          configPath="/tmp/sero/apps/mcp/config.json"
          settings={{ idleTimeout: 10, toolPrefix: 'server' }}
          onCreated={onCreated}
        />,
      );
    });

    await act(async () => {
      clickButton(container, 'Filesystem example');
    });

    await act(async () => {
      clickButton(container, 'Save first server');
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runMock).toHaveBeenCalledWith('mcp_manager', expect.objectContaining({
      action: 'upsert_server',
      serverName: 'filesystem',
      command: 'npx',
      transport: 'stdio',
    }));
    expect(onCreated).toHaveBeenCalledWith('filesystem');
  });
});

function clickButton(container: HTMLElement, label: string) {
  const button = Array.from(container.querySelectorAll('button')).find((candidate) => candidate.textContent?.includes(label));
  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

