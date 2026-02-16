import { useEffect, useCallback, useState, useRef } from 'react';
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
  const stateLoaded = useRef(false);

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
  useEffect(() => {
    if (stateLoaded.current) return;
    stateLoaded.current = true;
    (async () => {
      try {
        const state = await window.sero.editor.loadState(workspaceId);
        if (state && Array.isArray(state.openTabs) && state.openTabs.length > 0) {
          setEditorTabs(state.openTabs);
          setActiveTab(state.activeTab ?? state.openTabs[0]);
        }
      } catch { /* ignore */ }
    })();
  }, [workspaceId]);

  // ── Persist editor state when it changes ──
  useEffect(() => {
    if (!stateLoaded.current) return;
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

  useEffect(() => {
    if (containerStatus === 'running' && termTabs.length === 0) {
      useTerminalStore.getState().createTab(workspaceId).then(() => {
        setCodingUi(workspaceId, { terminalOpen: true });
      }).catch((err) => {
        console.warn('[coding] Failed to auto-create terminal:', err);
      });
    }
  }, [containerStatus, workspaceId]); // eslint-disable-line react-hooks/exhaustive-deps

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

  return (
    <div className="flex h-full w-full flex-col min-h-0">
      {/* ── Top: activity bar + sidebar + editor ───────────── */}
      <div className="flex min-h-0 flex-1">
        <ActivityBar
          activePanel={activePanel} sidebarOpen={sidebarOpen}
          terminalOpen={terminalOpen} onPanelClick={handlePanelClick}
        />

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

        {/* ── Editor fills all remaining space ─────────────── */}
        <div className="flex flex-1 min-h-0 min-w-0 bg-[var(--bg-base)]">
          <EditorPanel
            workspaceId={workspaceId}
            tabs={editorTabs} activeTab={activeTab}
            onOpenTab={handleOpenTab} onCloseTab={handleCloseTab}
            onReorderTabs={handleReorderTabs} onTabsChange={handleTabsChange}
          />
        </div>
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
