import { useEffect, useCallback, useState, useRef } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from '@/components/ui/resizable';
import { ActivityBar, type CodingPanel } from './ActivityBar';
import { CodingSidebar } from './CodingSidebar';
import { EditorPanel } from './editor/EditorPanel';
import { TerminalTabs } from './TerminalTabs';
import { TerminalPanel } from './TerminalPanel';
import { useActiveWorkspace } from '@/stores/workspace';
import {
  useWorkspaceTerminals,
  useActiveTerminalId,
  useTerminalStore,
} from '@/stores/terminal';
import { useWorkspaceCodingUi, useCodingUiStore } from '@/stores/coding-ui';
import { useContainerStore } from '@/stores/container';

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
  const workspaceId = activeWorkspace?.id ?? 'scratchpad';

  // Per-workspace UI state
  const { sidebarOpen, activePanel, terminalOpen } = useWorkspaceCodingUi(workspaceId);
  const setCodingUi = useCodingUiStore((s) => s.set);

  // Terminal state
  const termTabs = useWorkspaceTerminals(workspaceId);
  const activeTerminalId = useActiveTerminalId(workspaceId);

  // Editor tab state
  const [editorTabs, setEditorTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [rootId, setRootId] = useState<string>('/workspace');

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
  // scratchpad→global transition doesn't apply scratchpad results to global.
  useEffect(() => {
    editorReadyRef.current = false;
    let cancelled = false;
    (async () => {
      try {
        const state = await window.sero.editor.loadState(workspaceId);
        if (cancelled) return;
        if (state && Array.isArray(state.openTabs) && state.openTabs.length > 0) {
          setEditorTabs(state.openTabs);
          setActiveTab(state.activeTab ?? state.openTabs[0]);
        } else {
          setEditorTabs([]);
          setActiveTab(null);
        }
      } catch {
        if (cancelled) return;
        setEditorTabs([]);
        setActiveTab(null);
      }
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

  const containerStatus = useContainerStore(
    (s) => s.containers[workspaceId]?.status ?? 'none',
  );
  const isContainerWorkspace = activeWorkspace?.container ?? true;

  // Auto-create first terminal when ready:
  // - Non-container workspaces: immediately on mount
  // - Container workspaces: once the container is running
  const autoTermCreated = useRef(false);
  useEffect(() => {
    const ready = isContainerWorkspace ? containerStatus === 'running' : true;
    if (ready && termTabs.length === 0 && !autoTermCreated.current) {
      autoTermCreated.current = true;
      useTerminalStore.getState().createTab(workspaceId).then(() => {
        setCodingUi(workspaceId, { terminalOpen: true });
      }).catch((err) => {
        autoTermCreated.current = false;
        console.warn('[coding] Failed to auto-create terminal:', err);
      });
    }
  }, [containerStatus, isContainerWorkspace, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (termTabs.length > 0 && !terminalOpen) {
      setCodingUi(workspaceId, { terminalOpen: true });
    }
  }, [termTabs.length, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Activity bar handler ──
  const handlePanelClick = useCallback(
    (panel: CodingPanel) => {
      if (panel === 'terminal') {
        setCodingUi(workspaceId, { terminalOpen: !terminalOpen });
        return;
      }
      if (panel === activePanel && sidebarOpen) {
        setCodingUi(workspaceId, { sidebarOpen: false });
      } else {
        setCodingUi(workspaceId, { activePanel: panel, sidebarOpen: true });
      }
    },
    [workspaceId, activePanel, sidebarOpen, terminalOpen, setCodingUi],
  );

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

  const handleReorderTabs = useCallback((newOrder: string[]) => {
    setEditorTabs(newOrder);
  }, []);

  const handleTabsChange = useCallback((tabs: string[], active: string | null) => {
    setEditorTabs(tabs);
    setActiveTab(active);
  }, []);

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

  // Sync sidebar panel collapse/expand with sidebarOpen state
  useEffect(() => {
    isSidebarProgrammaticRef.current = true;
    const rafId = window.requestAnimationFrame(() => {
      if (sidebarOpen) {
        sidebarPanelRef.current?.expand();
      } else {
        sidebarPanelRef.current?.collapse();
      }
      window.requestAnimationFrame(() => {
        isSidebarProgrammaticRef.current = false;
      });
    });
    return () => {
      window.cancelAnimationFrame(rafId);
      isSidebarProgrammaticRef.current = false;
    };
  }, [sidebarOpen]);

  const handleSidebarResize = useCallback(
    ({ inPixels }: { inPixels: number; asPercentage: number }) => {
      if (isSidebarProgrammaticRef.current) return;
      if (inPixels <= 1) {
        setCodingUi(workspaceId, { sidebarOpen: false });
      } else if (!sidebarOpen && inPixels >= 120) {
        setCodingUi(workspaceId, { sidebarOpen: true });
      }
    },
    [workspaceId, sidebarOpen, setCodingUi],
  );

  return (
    <div className="flex h-full w-full flex-col min-h-0">
      {/* ── Top: activity bar + sidebar + editor ───────────── */}
      <div className="flex min-h-0 flex-1">
        <ActivityBar
          activePanel={activePanel} sidebarOpen={sidebarOpen}
          terminalOpen={terminalOpen} onPanelClick={handlePanelClick}
        />

        <ResizablePanelGroup id="coding-layout" orientation="horizontal" className="min-w-0 flex-1">
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
            <div className="flex h-full min-h-0 min-w-0 bg-[var(--bg-base)]">
              <EditorPanel
                workspaceId={workspaceId}
                tabs={editorTabs} activeTab={activeTab}
                onOpenTab={handleOpenTab} onCloseTab={handleCloseTab}
                onReorderTabs={handleReorderTabs} onTabsChange={handleTabsChange}
              />
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </div>

      {/* ── Bottom: terminal spans full width ──────────────── */}
      {terminalOpen && (
        <div className="flex h-[250px] min-h-[100px] max-h-[60%] shrink-0 flex-col border-t border-border/50">
          <TerminalTabs workspaceId={workspaceId} />
          <div className="relative flex-1 min-h-0 bg-[#0a0a0b]">
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
    </div>
  );
}
