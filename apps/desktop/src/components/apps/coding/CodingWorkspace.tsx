import { useEffect, useCallback, useState, useRef } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@sero/ui/components/ui/resizable';
import { ActivityBar, type CodingPanel } from './ActivityBar';
import { CodingSidebar } from './CodingSidebar';
import { EditorPanel } from './editor/EditorPanel';
import { DiffTab, type DiffTabState } from './editor/DiffTab';
import { TerminalTabs } from './TerminalTabs';
import { TerminalPanel } from './TerminalPanel';
import { useActiveWorkspace } from '@/stores/workspace';
import {
  useWorkspaceTerminals,
  useActiveTerminalId,
  useTerminalStore,
} from '@/stores/terminal';
import { useWorkspaceCodingUi, useCodingUiStore } from '@/stores/coding-ui';
import { useVcsStore } from '@/stores/vcs';
import { useEditorBridge } from '@/stores/editor-bridge';

/**
 * CodingWorkspace — the full coding app, mounted into the main area.
 *
 * ┌────┬──────┬───────────────────────────────────┐
 * │ A  │ Side │                                   │
 * │ c  │ bar  │       EditorPanel (Monaco)         │
 * │ t  │(tree)│                                   │
 * │ .  │      ├───────────────────────────────────┤
 * │    │      │       Terminal Panel (bottom)      │
 * └────┴──────┴───────────────────────────────────┘
 */
export function CodingWorkspace() {
  const activeWorkspace = useActiveWorkspace();
  const workspaceId = activeWorkspace?.id ?? 'global';
  const watchVcsWorkspace = useVcsStore((s) => s.watchWorkspace);
  const unwatchVcsWorkspace = useVcsStore((s) => s.unwatchWorkspace);
  const loadVcsWorkspace = useVcsStore((s) => s.loadWorkspace);

  // Per-workspace UI state
  const { sidebarOpen, activePanel, terminalOpen, codingSidebarSizePct, terminalSizePct } =
    useWorkspaceCodingUi(workspaceId);
  const setCodingUi = useCodingUiStore((s) => s.set);

  // Terminal state
  const termTabs = useWorkspaceTerminals(workspaceId);
  const activeTerminalId = useActiveTerminalId(workspaceId);

  // Editor tab state
  const [editorTabs, setEditorTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [rootId, setRootId] = useState<string>('/workspace');

  // Diff tab state — when set, renders DiffTab instead of EditorPanel
  const [diffState, setDiffState] = useState<DiffTabState | null>(null);

  // Tracks whether the editor state for the CURRENT workspaceId has loaded.
  // Reset to false on every workspaceId change so the persist effect doesn't
  // save stale/empty state to the new workspace's file.
  const editorReadyRef = useRef(false);

  // ── Resolve root path for the file tree ──
  useEffect(() => {
    (async () => {
      try {
        const root = await window.sero.editor.getRootPath(workspaceId);
        setRootId(root);
      } catch {
        setRootId('/workspace');
      }
    })();
  }, [workspaceId]);

  // ── Restore persisted editor state ──
  // Runs on every workspaceId change. Cancels stale loads so a fast
  // workspace transitions don't apply stale results to the new workspace.
  useEffect(() => {
    editorReadyRef.current = false;
    let cancelled = false;

    const mergePendingOpen = (tabs: string[], active: string | null) => {
      const pending = useEditorBridge.getState().pendingOpen;
      if (pending?.workspaceId !== workspaceId) {
        return { tabs, active };
      }

      useEditorBridge.getState().consumeOpenRequest();
      return {
        tabs: tabs.includes(pending.filePath) ? tabs : [...tabs, pending.filePath],
        active: pending.filePath,
      };
    };

    (async () => {
      let nextTabs: string[] = [];
      let nextActive: string | null = null;

      try {
        const state = await window.sero.editor.loadState(workspaceId);
        if (cancelled) return;
        if (state && Array.isArray(state.openTabs) && state.openTabs.length > 0) {
          nextTabs = state.openTabs;
          nextActive = state.activeTab ?? state.openTabs[0];
        }
      } catch {
        if (cancelled) return;
      }

      ({ tabs: nextTabs, active: nextActive } = mergePendingOpen(nextTabs, nextActive));
      setEditorTabs(nextTabs);
      setActiveTab(nextActive);
      if (!cancelled) editorReadyRef.current = true;
    })();
    return () => { cancelled = true; };
  }, [workspaceId]);

  // ── Persist editor state when it changes ──
  // The load effect (defined above) runs first in each render cycle and sets
  // editorReadyRef=false, so this effect safely skips during workspace transitions.
  useEffect(() => {
    if (!editorReadyRef.current) return;
    window.sero.editor.saveState(workspaceId, { openTabs: editorTabs, activeTab });
  }, [editorTabs, activeTab, workspaceId]);

  // ── Terminal setup ──
  useEffect(() => {
    const cleanup = useTerminalStore.getState().initExitListener();
    return cleanup;
  }, []);

  // ── JJ checkpoint event listener + watcher ──
  const initVcsEventListener = useVcsStore((s) => s.initEventListener);
  useEffect(() => {
    const unsubVcs = initVcsEventListener();
    return unsubVcs;
  }, [initVcsEventListener]);

  useEffect(() => {
    void watchVcsWorkspace(workspaceId);
    void loadVcsWorkspace(workspaceId);
    return () => {
      void unwatchVcsWorkspace(workspaceId);
    };
  }, [workspaceId, loadVcsWorkspace, unwatchVcsWorkspace, watchVcsWorkspace]);

  // Auto-create a default terminal whenever the panel is open but has no
  // tabs. The main process handles container vs host fallback, so we don't
  // gate on container status here.
  const autoCreatingRef = useRef(false);
  useEffect(() => {
    if (termTabs.length > 0 || autoCreatingRef.current || !terminalOpen) return;
    autoCreatingRef.current = true;
    useTerminalStore.getState().createTab(workspaceId).catch((err) => {
      console.warn('[coding] Failed to auto-create terminal:', err);
    }).finally(() => {
      autoCreatingRef.current = false;
    });
  }, [termTabs.length, terminalOpen, workspaceId]);

  // ── Activity bar handler ──
  const handlePanelClick = useCallback(
    (panel: CodingPanel) => {
      if (panel === 'terminal') {
        const nextOpen = !terminalOpen;
        setCodingUi(workspaceId, { terminalOpen: nextOpen });
        // Eagerly create a terminal when opening the panel with no tabs.
        // The effect above also handles this, but doing it here avoids a
        // visible flash of the empty "No terminals" state.
        if (nextOpen && termTabs.length === 0) {
          useTerminalStore.getState().createTab(workspaceId).catch((err) => {
            console.warn('[coding] Failed to create terminal on open:', err);
          });
        }
        return;
      }
      if (panel === activePanel && sidebarOpen) {
        setCodingUi(workspaceId, { sidebarOpen: false });
      } else {
        setCodingUi(workspaceId, { activePanel: panel, sidebarOpen: true });
      }
    },
    [workspaceId, activePanel, sidebarOpen, terminalOpen, termTabs.length, setCodingUi],
  );

  // ── Editor bridge: open files from ChatPanel ctrl+click ──
  useEffect(() => {
    const unsub = useEditorBridge.subscribe((state) => {
      if (!editorReadyRef.current) return;
      if (state.pendingOpen?.workspaceId === workspaceId) {
        const { filePath } = state.pendingOpen;
        useEditorBridge.getState().consumeOpenRequest();
        // Use the tab open logic below
        setEditorTabs((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]));
        setActiveTab(filePath);
      }
    });
    return unsub;
  }, [workspaceId]);

  // ── Editor tab handlers ──
  const handleOpenTab = useCallback((path: string) => {
    setEditorTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActiveTab(path);
  }, []);

  const handleCloseTab = useCallback((path: string) => {
    setEditorTabs((prev) => {
      const next = prev.filter((p) => p !== path);
      setActiveTab((cur) => {
        if (cur !== path) return cur;
        if (next.length === 0) return null;
        const idx = prev.indexOf(path);
        return next[Math.min(idx, next.length - 1)];
      });
      return next;
    });
  }, []);

  const handleCloseOtherTabs = useCallback((keepPath: string) => {
    setEditorTabs([keepPath]);
    setActiveTab(keepPath);
  }, []);

  const handleCloseAllTabs = useCallback(() => {
    setEditorTabs([]);
    setActiveTab(null);
  }, []);

  const handleReorderTabs = useCallback((newOrder: string[]) => {
    setEditorTabs(newOrder);
  }, []);

  // VcsPanel → open diff in editor area
  const handleOpenDiff = useCallback((from: string, to: string, path?: string) => {
    setDiffState({
      type: 'diff',
      workspaceId,
      fromRev: from,
      toRev: to,
      initialPath: path,
    });
  }, [workspaceId]);

  // ── FileTree → Editor path change/delete handlers ──
  const handlePathChanged = useCallback((oldPath: string, newPath: string) => {
    const remap = (p: string): string | null => {
      if (p === oldPath) return newPath;
      if (p.startsWith(oldPath + '/')) return newPath + p.slice(oldPath.length);
      return null;
    };
    setEditorTabs((prev) => {
      let changed = false;
      const next = prev.map((p) => { const m = remap(p); if (m) { changed = true; return m; } return p; });
      return changed ? next : prev;
    });
    setActiveTab((prev) => (prev ? remap(prev) ?? prev : prev));
  }, []);

  const handleDeleted = useCallback((deletedPath: string) => {
    const isAffected = (p: string) => p === deletedPath || p.startsWith(deletedPath + '/');
    setEditorTabs((prev) => {
      const next = prev.filter((p) => !isAffected(p));
      setActiveTab((cur) => {
        if (!cur || !isAffected(cur)) return cur;
        if (next.length === 0) return null;
        return next[0];
      });
      return next;
    });
  }, []);

  const sidebarPanelRef = useRef<PanelImperativeHandle | null>(null);
  const isSidebarProgrammaticRef = useRef(false);
  const terminalPanelRef = useRef<PanelImperativeHandle | null>(null);
  const isTerminalProgrammaticRef = useRef(true);
  const TERMINAL_MIN_HEIGHT = 100;
  const terminalLastExpandedPctRef = useRef(terminalSizePct || 30);
  const terminalDefaultRef = useRef(
    terminalOpen ? `${terminalSizePct || 30}%` : 0,
  );
  const codingSidebarLastExpandedPctRef = useRef(codingSidebarSizePct || 0);

  // Sync sidebar panel collapse/expand with sidebarOpen state
  useEffect(() => {
    let rafId: number | null = null;
    let rafId2: number | null = null;
    isSidebarProgrammaticRef.current = true;

    if (!sidebarOpen) {
      sidebarPanelRef.current?.collapse();
      rafId = window.requestAnimationFrame(() => {
        isSidebarProgrammaticRef.current = false;
      });
    } else {
      rafId = window.requestAnimationFrame(() => {
        sidebarPanelRef.current?.expand();
        const target = codingSidebarLastExpandedPctRef.current;
        if (target > 0) {
          sidebarPanelRef.current?.resize(`${target}%`);
        }
        rafId2 = window.requestAnimationFrame(() => {
          isSidebarProgrammaticRef.current = false;
        });
      });
    }

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (rafId2 !== null) window.cancelAnimationFrame(rafId2);
      isSidebarProgrammaticRef.current = false;
    };
  }, [sidebarOpen]);

  const handleSidebarResize = useCallback(
    ({ inPixels, asPercentage }: { inPixels: number; asPercentage: number }) => {
      if (isSidebarProgrammaticRef.current) return;
      if (inPixels <= 1) {
        setCodingUi(workspaceId, { sidebarOpen: false });
      } else if (!sidebarOpen && inPixels >= 120) {
        setCodingUi(workspaceId, { sidebarOpen: true });
      } else {
        codingSidebarLastExpandedPctRef.current = asPercentage;
        setCodingUi(workspaceId, { codingSidebarSizePct: Math.round(asPercentage * 10) / 10 });
      }
    },
    [workspaceId, sidebarOpen, setCodingUi],
  );

  // Sync terminal panel collapse/expand with terminalOpen state
  useEffect(() => {
    let rafId: number | null = null;
    let rafId2: number | null = null;
    isTerminalProgrammaticRef.current = true;

    if (!terminalOpen) {
      terminalPanelRef.current?.collapse();
      rafId = window.requestAnimationFrame(() => {
        isTerminalProgrammaticRef.current = false;
      });
    } else {
      rafId = window.requestAnimationFrame(() => {
        const targetPct = terminalLastExpandedPctRef.current || 30;
        terminalPanelRef.current?.expand();
        terminalPanelRef.current?.resize(`${targetPct}%`);
        rafId2 = window.requestAnimationFrame(() => {
          isTerminalProgrammaticRef.current = false;
        });
      });
    }

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      if (rafId2 !== null) window.cancelAnimationFrame(rafId2);
      isTerminalProgrammaticRef.current = false;
    };
  }, [terminalOpen]);

  const handleTerminalResize = useCallback(
    ({ inPixels, asPercentage }: { inPixels: number; asPercentage: number }) => {
      if (isTerminalProgrammaticRef.current) return;
      if (inPixels <= 1) {
        setCodingUi(workspaceId, { terminalOpen: false });
      } else {
        terminalLastExpandedPctRef.current = asPercentage;
        setCodingUi(workspaceId, { terminalSizePct: Math.round(asPercentage * 10) / 10 });
      }
    },
    [workspaceId, setCodingUi],
  );

  return (
    <div className="flex h-full w-full flex-col min-h-0">
      {/* ── Top: activity bar + sidebar + editor ───────────── */}
      <div className="flex min-h-0 flex-1">
        <ActivityBar
          activePanel={activePanel} sidebarOpen={sidebarOpen}
          terminalOpen={terminalOpen} onPanelClick={handlePanelClick}
          workspaceId={workspaceId}
        />

        <ResizablePanelGroup id="coding-vertical" orientation="vertical" className="min-w-0 flex-1">
          <ResizablePanel id="coding-main" minSize={20}>
            <ResizablePanelGroup id="coding-layout" orientation="horizontal" className="h-full">
          <ResizablePanel
            id="coding-sidebar"
            panelRef={sidebarPanelRef}
            defaultSize="220px"
            minSize={160}
            collapsible
            collapsedSize={0}
            onResize={handleSidebarResize}
            style={{ overflow: 'hidden' }}
          >
            {sidebarOpen && (
              <CodingSidebar
                activePanel={activePanel}
                workspaceId={workspaceId}
                onOpenDiff={handleOpenDiff}
                fileTreeProps={{
                  workspaceId, rootId, activePath: activeTab,
                  onFileSelect: handleOpenTab,
                  onPathChanged: handlePathChanged,
                  onDeleted: handleDeleted,
                }}
              />
            )}
          </ResizablePanel>

          <ResizableHandle
            disabled={!sidebarOpen}
            className={!sidebarOpen ? 'pointer-events-none opacity-0' : undefined}
          />

          {/* ── Editor fills all remaining space ─────────────── */}
          <ResizablePanel id="coding-editor" minSize={200} className="min-w-0">
            <div className="flex h-full min-h-0 min-w-0 flex-col bg-[var(--bg-base)]">
              {diffState ? (
                <>
                  {/* Diff mode: show a minimal tab bar with close action */}
                  <div className="flex h-8 shrink-0 items-center border-b border-[var(--border-subtle)] bg-[var(--bg-base)] px-2">
                    <span className="text-[11px] text-[var(--text-muted)]">
                      Diff: {diffState.fromRev.slice(0, 8)} → {diffState.toRev.slice(0, 8)}
                      {diffState.initialPath && ` — ${diffState.initialPath.split('/').pop()}`}
                    </span>
                    <span className="flex-1" />
                    <button
                      onClick={() => setDiffState(null)}
                      className="flex size-5 items-center justify-center rounded text-[var(--text-muted)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-secondary)] transition-colors text-sm"
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
                  tabs={editorTabs} activeTab={activeTab}
                  onOpenTab={handleOpenTab} onCloseTab={handleCloseTab}
                  onCloseOtherTabs={handleCloseOtherTabs} onCloseAllTabs={handleCloseAllTabs}
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
            id="coding-terminal"
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
                <div className="relative flex-1 min-h-0 bg-[var(--bg-base)]">
                  {termTabs.map((tab) => (
                    <TerminalPanel
                      key={tab.id} terminalId={tab.id}
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
