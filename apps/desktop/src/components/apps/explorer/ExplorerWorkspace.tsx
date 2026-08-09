import { useCallback, useMemo, useRef } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@sero-ai/ui/components/ui/resizable';
import { ActivityBar } from './ActivityBar';
import { ExplorerSidebar } from './ExplorerSidebar';
import { ExplorerViewMissing, ExplorerViewMount } from './ExplorerViewMount';
import { TerminalTabs } from './TerminalTabs';
import { TerminalPanel } from './TerminalPanel';
import { EditorPanel } from './editor/EditorPanel';
import { BrowserPanel } from './browser/BrowserPanel';
import { usePanelOpenSync } from './usePanelOpenSync';
import { useExplorerRoots } from './useExplorerRoots';
import { useExplorerEditorState } from './useExplorerEditorState';
import { useExplorerRuntimeEffects } from './useExplorerRuntimeEffects';
import { useActiveWorkspace } from '@/stores/workspace';
import {
  useWorkspaceTerminals,
  useActiveTerminalId,
  useTerminalStore,
} from '@/stores/terminal';
import { useWorkspaceExplorer, useExplorerStore } from '@/stores/explorer';
import { getContributions, useAppStore } from '@/stores/app';
import {
  explorerPanelAppId,
  panelOwnsMainArea,
  resolveExplorerPanelId,
  type ExplorerPanel,
} from '@/lib/explorer-panels';

const TERMINAL_MIN_HEIGHT = 100;

/**
 * ExplorerWorkspace, the full explorer app, mounted into the main area.
 *
 * ┌────┬──────┬───────────────────────────────────┐
 * │ A  │ Side │                                   │
 * │ c  │ bar  │       EditorPanel (Monaco)        │
 * │ t  │(tree)│                                   │
 * │ .  │      ├───────────────────────────────────┤
 * │    │      │       Terminal Panel (bottom)     │
 * └────┴──────┴───────────────────────────────────┘
 */
export function ExplorerWorkspace() {
  const activeWorkspace = useActiveWorkspace();
  const workspaceId = activeWorkspace?.id ?? 'global';
  const { sidebarOpen, activePanel, terminalOpen, explorerSidebarSizePct, terminalSizePct } =
    useWorkspaceExplorer(workspaceId);
  const setExplorer = useExplorerStore((state) => state.set);
  const apps = useAppStore((state) => state.apps);
  const contributedViews = useMemo(
    () => getContributions(apps, 'ui.explorer.view'),
    [apps],
  );
  const resolvedActivePanel = resolveExplorerPanelId(activePanel, contributedViews);
  const showSidebar = sidebarOpen && !panelOwnsMainArea(resolvedActivePanel);
  // A contributed view fills the whole area; `undefined` while its plugin is
  // absent, which the placeholder below reports rather than silently
  // redirecting to the file tree.
  const contributedView = panelOwnsMainArea(resolvedActivePanel)
    ? contributedViews.find((resolved) => resolved.key === resolvedActivePanel)
    : undefined;
  const termTabs = useWorkspaceTerminals(workspaceId);
  const activeTerminalId = useActiveTerminalId(workspaceId);

  const { roots, handleRemoveRoot } = useExplorerRoots(workspaceId);
  const {
    editorTabs,
    activeTab,
    handleOpenTab,
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseAllTabs,
    handleReorderTabs,
    handlePathChanged,
    handleDeleted,
  } = useExplorerEditorState(workspaceId);

  useExplorerRuntimeEffects(workspaceId, terminalOpen, termTabs.length);

  const handlePanelClick = useCallback(
    (panel: ExplorerPanel) => {
      if (panel === 'terminal') {
        const nextOpen = !terminalOpen;
        setExplorer(workspaceId, { terminalOpen: nextOpen });
        // Eagerly create a terminal when opening the panel with no tabs.
        // The effect hook also handles this, but doing it here avoids a
        // visible flash of the empty "No terminals" state.
        if (nextOpen && termTabs.length === 0) {
          useTerminalStore
            .getState()
            .createTab(workspaceId)
            .catch((err) => {
              console.warn('[explorer] Failed to create terminal on open:', err);
            });
        }
        return;
      }

      if (panel === resolvedActivePanel && sidebarOpen) {
        setExplorer(workspaceId, { sidebarOpen: false });
        return;
      }

      setExplorer(workspaceId, {
        activePanel: panel,
        sidebarOpen: !panelOwnsMainArea(panel),
      });
    },
    [workspaceId, resolvedActivePanel, sidebarOpen, terminalOpen, termTabs.length, setExplorer],
  );

  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null);
  const isSidebarProgrammaticRef = useRef(false);
  const terminalPanelRef = useRef<PanelImperativeHandle | null>(null);
  const isTerminalProgrammaticRef = useRef(true);
  const terminalLastExpandedPctRef = useRef(terminalSizePct || 30);
  const terminalDefaultRef = useRef(terminalOpen ? `${terminalSizePct || 30}%` : 0);
  const sidebarDefaultRef = useRef(
    explorerSidebarSizePct > 0 ? `${explorerSidebarSizePct}%` : '220px',
  );
  const explorerSidebarLastExpandedPctRef = useRef(explorerSidebarSizePct || 0);
  const previousWorkspaceIdRef = useRef(workspaceId);

  if (previousWorkspaceIdRef.current !== workspaceId) {
    previousWorkspaceIdRef.current = workspaceId;
    terminalLastExpandedPctRef.current = terminalSizePct || 30;
    terminalDefaultRef.current = terminalOpen ? `${terminalSizePct || 30}%` : 0;
    sidebarDefaultRef.current = explorerSidebarSizePct > 0
      ? `${explorerSidebarSizePct}%`
      : '220px';
    explorerSidebarLastExpandedPctRef.current = explorerSidebarSizePct || 0;
  }

  // Sync sidebar panel collapse/expand with sidebarOpen state.
  usePanelOpenSync(
    sidebarPanelRef,
    isSidebarProgrammaticRef,
    showSidebar,
    explorerSidebarLastExpandedPctRef.current || undefined,
  );

  const handleSidebarResize = useCallback(
    ({ inPixels, asPercentage }: { inPixels: number; asPercentage: number }) => {
      if (isSidebarProgrammaticRef.current) {
        return;
      }
      if (inPixels <= 1) {
        setExplorer(workspaceId, { sidebarOpen: false });
      } else if (!sidebarOpen && inPixels >= 120) {
        setExplorer(workspaceId, { sidebarOpen: true });
      } else {
        explorerSidebarLastExpandedPctRef.current = asPercentage;
        setExplorer(workspaceId, {
          explorerSidebarSizePct: Math.round(asPercentage * 10) / 10,
        });
      }
    },
    [workspaceId, sidebarOpen, setExplorer],
  );

  // Sync terminal panel collapse/expand with terminalOpen state.
  usePanelOpenSync(
    terminalPanelRef,
    isTerminalProgrammaticRef,
    terminalOpen,
    terminalLastExpandedPctRef.current || 30,
  );

  const handleTerminalResize = useCallback(
    ({ inPixels, asPercentage }: { inPixels: number; asPercentage: number }) => {
      if (isTerminalProgrammaticRef.current) {
        return;
      }
      if (inPixels <= 1) {
        setExplorer(workspaceId, { terminalOpen: false });
      } else {
        terminalLastExpandedPctRef.current = asPercentage;
        setExplorer(workspaceId, { terminalSizePct: Math.round(asPercentage * 10) / 10 });
      }
    },
    [workspaceId, setExplorer],
  );

  return (
    <div className="flex size-full min-h-0 flex-col">
      {/* ── Top: activity bar + sidebar + editor ───────────── */}
      <div className="flex min-h-0 flex-1">
        <ActivityBar
          activePanel={resolvedActivePanel}
          sidebarOpen={showSidebar}
          terminalOpen={terminalOpen}
          onPanelClick={handlePanelClick}
          workspaceId={workspaceId}
        />

        <ResizablePanelGroup
          key={`explorer-vertical-${workspaceId}`}
          id="explorer-vertical"
          orientation="vertical"
          className="min-w-0 flex-1"
        >
          <ResizablePanel id="explorer-main" minSize={20}>
            <ResizablePanelGroup
              key={`explorer-layout-${workspaceId}`}
              id="explorer-layout"
              orientation="horizontal"
              className="h-full"
            >
              <ResizablePanel
                id="explorer-sidebar"
                panelRef={sidebarPanelRef}
                defaultSize={sidebarDefaultRef.current}
                minSize={160}
                collapsible
                collapsedSize={0}
                onResize={handleSidebarResize}
                style={{ overflow: 'hidden' }}
              >
                {showSidebar && (
                  <ExplorerSidebar
                    activePanel={resolvedActivePanel}
                    workspaceId={workspaceId}
                    fileTreeProps={{
                      workspaceId,
                      roots,
                      activePath: activeTab,
                      onFileSelect: handleOpenTab,
                      onPathChanged: handlePathChanged,
                      onDeleted: handleDeleted,
                      onRemoveRoot: handleRemoveRoot,
                    }}
                  />
                )}
              </ResizablePanel>

              <ResizableHandle
                disabled={!showSidebar}
                className={!showSidebar ? 'pointer-events-none opacity-0' : undefined}
              />

              {/* ── Editor fills all remaining space ─────────────── */}
              <ResizablePanel id="explorer-editor" minSize={200} className="min-w-0">
                <div className="flex h-full min-h-0 min-w-0 flex-col bg-[var(--bg-base)]">
                  {resolvedActivePanel === 'browser' ? (
                    <BrowserPanel workspaceId={workspaceId} />
                  ) : panelOwnsMainArea(resolvedActivePanel) ? (
                    contributedView
                      ? <ExplorerViewMount resolved={contributedView} />
                      : <ExplorerViewMissing panelId={explorerPanelAppId(resolvedActivePanel)} />
                  ) : (
                    <EditorPanel
                      workspaceId={workspaceId}
                      tabs={editorTabs}
                      activeTab={activeTab}
                      onOpenTab={handleOpenTab}
                      onCloseTab={handleCloseTab}
                      onCloseOtherTabs={handleCloseOtherTabs}
                      onCloseAllTabs={handleCloseAllTabs}
                      onReorderTabs={handleReorderTabs}
                    />
                  )}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </ResizablePanel>

          <ResizableHandle
            disabled={!terminalOpen}
            className={!terminalOpen ? 'pointer-events-none opacity-0' : undefined}
          />

          <ResizablePanel
            id="explorer-terminal"
            panelRef={terminalPanelRef}
            defaultSize={terminalDefaultRef.current}
            minSize={TERMINAL_MIN_HEIGHT}
            collapsible
            collapsedSize={0}
            onResize={handleTerminalResize}
            style={{ overflow: 'hidden' }}
          >
            {terminalOpen && (
              <div className="flex h-full flex-col border-t border-[var(--border-default)]">
                <TerminalTabs workspaceId={workspaceId} />
                <div className="relative min-h-0 flex-1 bg-[var(--bg-base)]">
                  {termTabs.map((tab) => (
                    <TerminalPanel
                      key={tab.id}
                      terminalId={tab.id}
                      isActive={activeTerminalId === tab.id}
                    />
                  ))}
                  {termTabs.length === 0 && (
                    <div className="flex h-full items-center justify-center">
                      <span className="text-xs text-[var(--text-muted)]">
                        No terminals, click + to create one
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>
    </div>
  );
}
