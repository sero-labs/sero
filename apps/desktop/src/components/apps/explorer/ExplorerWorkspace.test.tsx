// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';

vi.mock('@sero-ai/ui/components/ui/resizable', () => ({
  ResizablePanelGroup: ({ children }: { children: ReactNode }) => <>{children}</>,
  ResizablePanel: ({ children }: { children: ReactNode }) => <>{children}</>,
  ResizableHandle: () => null,
}));
vi.mock('./ActivityBar', () => ({ ActivityBar: () => null }));
vi.mock('./ExplorerSidebar', () => ({ ExplorerSidebar: () => null }));
vi.mock('./ExplorerViewMount', () => ({
  ExplorerViewMount: () => <div>mounted view</div>,
  ExplorerViewMissing: ({ panelId }: { panelId: string }) => <div>missing:{panelId}</div>,
}));
vi.mock('./TerminalTabs', () => ({ TerminalTabs: () => null }));
vi.mock('./TerminalPanel', () => ({ TerminalPanel: () => null }));
vi.mock('./editor/EditorPanel', () => ({ EditorPanel: () => null }));
vi.mock('./browser/BrowserPanel', () => ({ BrowserPanel: () => null }));
vi.mock('./usePanelOpenSync', () => ({ usePanelOpenSync: () => undefined }));
vi.mock('./useExplorerRoots', () => ({
  useExplorerRoots: () => ({ roots: [], handleRemoveRoot: vi.fn() }),
}));
vi.mock('./useExplorerEditorState', () => ({
  useExplorerEditorState: () => ({
    editorTabs: [],
    activeTab: null,
    handleOpenTab: vi.fn(),
    handleCloseTab: vi.fn(),
    handleCloseOtherTabs: vi.fn(),
    handleCloseAllTabs: vi.fn(),
    handleReorderTabs: vi.fn(),
    handlePathChanged: vi.fn(),
    handleDeleted: vi.fn(),
  }),
}));
vi.mock('./useExplorerRuntimeEffects', () => ({ useExplorerRuntimeEffects: () => undefined }));
vi.mock('@/stores/workspace', () => ({
  useActiveWorkspace: () => ({ id: 'workspace-1' }),
}));
vi.mock('@/stores/terminal', () => ({
  useWorkspaceTerminals: () => [],
  useActiveTerminalId: () => null,
  useTerminalStore: { getState: () => ({ createTab: vi.fn(async () => undefined) }) },
}));
vi.mock('@/stores/explorer', () => ({
  useWorkspaceExplorer: () => ({
    sidebarOpen: true,
    activePanel: 'git',
    terminalOpen: false,
    explorerSidebarSizePct: 0,
    terminalSizePct: 30,
  }),
  useExplorerStore: (selector: (state: { set: ReturnType<typeof vi.fn> }) => unknown) => (
    selector({ set: vi.fn() })
  ),
}));
vi.mock('@/stores/app', () => ({
  getContributions: () => [],
  useAppStore: (selector: (state: { apps: never[] }) => unknown) => selector({ apps: [] }),
}));
vi.mock('@/lib/explorer-panels', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/explorer-panels')>();
  return {
    ...actual,
    resolveExplorerPanelId: () => 'git:explorer-view',
  };
});

import { ExplorerWorkspace } from './ExplorerWorkspace';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

describe('ExplorerWorkspace', () => {
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

  it('shows the app id when a contributed view is unavailable', async () => {
    await act(async () => {
      root.render(<ExplorerWorkspace />);
    });

    expect(container.textContent).toContain('git');
    expect(container.textContent).not.toContain('git:explorer-view');
  });
});
