import { useCallback, useRef } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@sero-ai/ui/components/ui/resizable';
import { ActivityBar, type ExplorerPanel } from './ActivityBar';
import { ExplorerSidebar } from './ExplorerSidebar';
import { TerminalTabs } from './TerminalTabs';
import { TerminalPanel } from './TerminalPanel';
import { EditorPanel } from './editor/EditorPanel';
import { DiffTab } from './editor/DiffTab';
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

const TERMINAL_MIN_HEIGHT = 100;

/**
 * ExplorerWorkspace — the full explorer app, mounted into the main area.
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
  const showSidebar = sidebarOpen && activePanel !== 'browser';
  const setExplorer = useExplorerStore((state) => state.set);
  const termTabs = useWorkspaceTerminals(workspaceId);
  const activeTerminalId = useActiveTerminalId(workspaceId);

  const { roots, handleRemoveRoot } = useExplorerRoots(workspaceId);
  const {
    editorTabs,
    activeTab,
    diffState,
    closeDiff,
    handleOpenTab,
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseAllTabs,
    handleReorderTabs,
    handleOpenDiff,
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

      if (panel === activePanel && sidebarOpen) {
        setExplorer(workspaceId, { sidebarOpen: false });
        return;
      }

      setExplorer(workspaceId, {
        activePanel: panel,
        sidebarOpen: panel !== 'browser',
      });
    },
    [workspaceId, activePanel, sidebarOpen, terminalOpen, termTabs.length, setExplorer],
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
    <div className="flex h-full w-full min-h-0 flex-col">
      {/* ── Top: activity bar + sidebar + editor ───────────── */}
      <div className="flex min-h-0 flex-1">
        <ActivityBar
          activePanel={activePanel}
          sidebarOpen={showSidebar}
          terminalOpen={terminalOpen}
          onPanelClick={handlePanelClick}
          workspaceId={workspaceId}
        />

        <ResizablePanelGroup
          id="explorer-vertical"
          orientation="vertical"
          className="min-w-0 flex-1"
        >
          <ResizablePanel id="explorer-main" minSize={20}>
            <ResizablePanelGroup
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
                    activePanel={activePanel}
                    workspaceId={workspaceId}
                    onOpenDiff={handleOpenDiff}
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
                  {activePanel === 'browser' ? (
                    <BrowserPanel workspaceId={workspaceId} />
                  ) : diffState ? (
                    <>
                      {/* Diff mode: show a minimal tab bar with close action */}
                      <div className="flex h-8 shrink-0 items-center border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-2">
                        <span className="text-[11px] text-[var(--text-muted)]">
                          Diff: {diffState.fromRev.slice(0, 8)} → {diffState.toRev.slice(0, 8)}
                          {diffState.initialPath &&
                            ` — ${diffState.initialPath.split('/').pop()}`}
                        </span>
                        <span className="flex-1" />
                        <button
                          onClick={closeDiff}
                          className="flex size-5 items-center justify-center rounded text-sm text-[var(--text-muted)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)]"
                          title="Close diff"
                        >
                          ×
                        </button>
                      </div>
                      <div className="min-h-0 flex-1">
                        <DiffTab state={diffState} />
                      </div>
                    </>
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
                        No terminals — click + to create one
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
