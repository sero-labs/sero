// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpAppState } from '../shared/types';
import { createDefaultMcpState } from '../shared/types';
import { McpApp } from './McpApp';

const useAppStateMock = vi.fn();
const useAppToolsMock = vi.fn();
const runMock = vi.fn();

vi.mock('@sero-ai/app-runtime', () => ({
  useAppState: (initialState: McpAppState) => useAppStateMock(initialState),
  useAppTools: () => useAppToolsMock(),
}));

vi.mock('./components/config/McpRawConfigPanel', () => ({
  McpRawConfigPanel: () => <div>raw-config-panel</div>,
}));

vi.mock('./components/diagnostics/McpDiagnosticsPanel', () => ({
  McpDiagnosticsPanel: () => <div>diagnostics-panel</div>,
}));

vi.mock('./components/search/McpSearchWorkbenchPanel', () => ({
  McpSearchWorkbenchPanel: () => <div>search-workbench</div>,
}));

vi.mock('./components/servers/McpServerCrudPanel', () => ({
  McpServerCrudPanel: () => <div>server-crud-panel</div>,
}));

vi.mock('./components/wizard/McpSetupWizard', () => ({
  McpSetupWizard: () => <div>setup-wizard</div>,
}));

describe('McpApp', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;

  beforeEach(() => {
    Reflect.set(globalThis, 'IS_REACT_ACT_ENVIRONMENT', true);
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    runMock.mockReset();
    runMock.mockResolvedValue({ text: '', content: [], details: null, isError: false });
    useAppToolsMock.mockReturnValue({ run: runMock });
  });

  afterEach(async () => {
    await act(async () => {
      root?.unmount();
    });
    container.remove();
    root = null;
    useAppStateMock.mockReset();
    useAppToolsMock.mockReset();
    runMock.mockReset();
    Reflect.deleteProperty(globalThis, 'IS_REACT_ACT_ENVIRONMENT');
  });

  it('bootstraps on mount and shows the first-run wizard when no servers are configured', async () => {
    useAppStateMock.mockReturnValue([createState({ firstRun: true, servers: [] }), vi.fn()]);

    await act(async () => {
      root?.render(<McpApp />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(runMock).toHaveBeenCalledWith('mcp_manager', { action: 'bootstrap' });
    expect(container.textContent).toContain('setup-wizard');
    expect(container.textContent).not.toContain('search-workbench');
  });

  it('hides the wizard and shows the search workbench once servers exist', async () => {
    useAppStateMock.mockReturnValue([
      createState({
        firstRun: false,
        servers: [
          {
            serverName: 'github',
            enabled: true,
            transport: 'http',
            lifecycle: 'eager',
            authMode: 'oauth',
            connectionStatus: 'connected',
            authStatus: 'authenticated',
            toolCount: 3,
            resourceCount: 2,
            uiToolCount: 1,
            resources: [],
            uiTools: [],
          },
        ],
      }),
      vi.fn(),
    ]);

    await act(async () => {
      root?.render(<McpApp />);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).not.toContain('setup-wizard');
    expect(container.textContent).toContain('search-workbench');
  });
});

function createState(partial: Partial<McpAppState>): McpAppState {
  return {
    ...createDefaultMcpState(),
    initialized: true,
    configPath: '/tmp/sero/apps/mcp/config.json',
    ...partial,
  };
}
