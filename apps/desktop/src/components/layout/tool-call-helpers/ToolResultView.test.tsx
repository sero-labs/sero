// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { ChatToolResultViewProps } from '@sero-ai/common';
import type { AppEntry } from '@/stores/app/shared';
import type { ChatToolCallMessage, SeroAppManifest } from '@/types/ipc';

const mocks = vi.hoisted(() => ({
  apps: [] as AppEntry[],
  getFederatedComponent: vi.fn(),
}));

vi.mock('@sero-ai/app-runtime', () => ({
  AppProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@sero-ai/ui/plugin-style-scope', () => ({
  PluginStyleScope: ({ children }: { children: ReactNode }) => <>{children}</>,
}));
vi.mock('@/components/apps/useAppRuntimeMount', () => ({
  useAppRuntimeMount: () => ({ contextValue: {}, status: 'ready' }),
}));
vi.mock('@/lib/federation-registry', () => ({
  getFederatedComponent: mocks.getFederatedComponent,
}));
vi.mock('@/stores/agent-selectors', () => ({
  useFocusedSessionId: () => 'chat-1',
}));
vi.mock('@/stores/app', async () => {
  const shared = await vi.importActual<typeof import('@/stores/app/shared')>('@/stores/app/shared');
  return {
    getContributions: shared.getContributions,
    useAppStore: (selector: (state: { apps: AppEntry[] }) => unknown) => selector({ apps: mocks.apps }),
  };
});

import { ToolResultView } from './ToolResultView';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mcpApp(): AppEntry {
  const manifest = {
    id: 'mcp',
    name: 'MCP',
    uiEntry: 'sero-ext://mcp/mf-manifest.json',
    remoteEntryOverride: null,
    devPort: undefined,
    contributions: {
      components: [{ id: 'app-result', extensionPoint: 'ui.chat.tool-result', component: 'McpToolResultApp' }],
      controls: [],
    },
  } as unknown as SeroAppManifest;
  return { id: 'mcp', label: 'MCP', icon: 'plug', builtin: false, manifest };
}

function toolCall(details: Record<string, unknown>): ChatToolCallMessage {
  return {
    type: 'tool',
    id: 'tool-1',
    toolCallId: 'call-1',
    toolName: 'mcp',
    input: {},
    output: 'EMEA revenue: 4 rows',
    isError: false,
    state: 'completed',
    details,
  };
}

const marker = { seroToolResultView: { appId: 'mcp', contributionId: 'app-result' }, mcpApp: { serverName: 'sales' } };

describe('ToolResultView', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    mocks.apps = [mcpApp()];
    mocks.getFederatedComponent.mockReset();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  it('mounts the named contribution with the tool result props', async () => {
    const received: ChatToolResultViewProps[] = [];
    mocks.getFederatedComponent.mockReturnValue((props: ChatToolResultViewProps) => {
      received.push(props);
      return <p>app view</p>;
    });

    await act(async () => root.render(<ToolResultView tool={toolCall(marker)} />));

    expect(container.textContent).toBe('app view');
    expect(received[0]).toEqual({ sessionId: 'chat-1', toolCallId: 'call-1', details: marker, isError: false });
  });

  it('shows nothing when no contribution matches the marker', async () => {
    const details = { seroToolResultView: { appId: 'mcp', contributionId: 'other' } };

    await act(async () => root.render(<ToolResultView tool={toolCall(details)} />));

    expect(container.textContent).toBe('');
    expect(mocks.getFederatedComponent).not.toHaveBeenCalled();
  });

  it('shows nothing when the contribution fails', async () => {
    mocks.getFederatedComponent.mockReturnValue(() => {
      throw new Error('broken view');
    });

    await act(async () => root.render(<ToolResultView tool={toolCall(marker)} />));

    expect(container.textContent).toBe('');
  });
});
