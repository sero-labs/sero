import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditorBridge } from '@/stores/editor-bridge';
import type { DiffTabState } from './editor/DiffTab';

function mergePendingOpen(
  workspaceId: string,
  tabs: string[],
  active: string | null,
): { tabs: string[]; active: string | null } {
  const pending = useEditorBridge.getState().pendingOpen;
  if (pending?.workspaceId !== workspaceId) {
    return { tabs, active };
  }

  useEditorBridge.getState().consumeOpenRequest();
  return {
    tabs: tabs.includes(pending.filePath) ? tabs : [...tabs, pending.filePath],
    active: pending.filePath,
  };
}

/**
 * Owns editor tabs, persisted editor state, diff mode, and file-open bridge sync
 * for the active explorer workspace.
 */
export function useExplorerEditorState(workspaceId: string) {
  // Tracks whether the editor state for the CURRENT workspaceId has loaded.
  // Reset to false on every workspaceId change so the persist effect doesn't
  // save stale/empty state to the new workspace's file.
  const editorReadyRef = useRef(false);

  const [editorTabs, setEditorTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  // Diff tab state — when set, renders DiffTab instead of EditorPanel.
  const [diffState, setDiffState] = useState<DiffTabState | null>(null);

  // Runs on every workspaceId change. Cancels stale loads so fast
  // workspace transitions don't apply stale results to the new workspace.
  useEffect(() => {
    editorReadyRef.current = false;
    let cancelled = false;

    (async () => {
      let nextTabs: string[] = [];
      let nextActive: string | null = null;

      try {
        const state = await window.sero.editor.loadState(workspaceId);
        if (cancelled) {
          return;
        }
        if (state && Array.isArray(state.openTabs) && state.openTabs.length > 0) {
          nextTabs = state.openTabs;
          nextActive = state.activeTab ?? state.openTabs[0] ?? null;
        }
      } catch {
        if (cancelled) {
          return;
        }
      }

      ({ tabs: nextTabs, active: nextActive } = mergePendingOpen(
        workspaceId,
        nextTabs,
        nextActive,
      ));
      setEditorTabs(nextTabs);
      setActiveTab(nextActive);
      if (!cancelled) {
        editorReadyRef.current = true;
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId]);

  // The load effect (defined above) runs first in each render cycle and sets
  // editorReadyRef=false, so this effect safely skips during workspace transitions.
  useEffect(() => {
    if (!editorReadyRef.current) {
      return;
    }
    void window.sero.editor.saveState(workspaceId, { openTabs: editorTabs, activeTab });
  }, [activeTab, editorTabs, workspaceId]);

  useEffect(() => {
    const unsubscribe = useEditorBridge.subscribe((state) => {
      if (!editorReadyRef.current) {
        return;
      }
      if (state.pendingOpen?.workspaceId === workspaceId) {
        const { filePath } = state.pendingOpen;
        useEditorBridge.getState().consumeOpenRequest();
        setEditorTabs((prev) => (prev.includes(filePath) ? prev : [...prev, filePath]));
        setActiveTab(filePath);
      }
    });
    return unsubscribe;
  }, [workspaceId]);

  const handleOpenTab = useCallback((path: string) => {
    setEditorTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
    setActiveTab(path);
  }, []);

  const handleCloseTab = useCallback((path: string) => {
    setEditorTabs((prev) => {
      const next = prev.filter((tabPath) => tabPath !== path);
      setActiveTab((currentActive) => {
        if (currentActive !== path) {
          return currentActive;
        }
        if (next.length === 0) {
          return null;
        }
        const closedTabIndex = prev.indexOf(path);
        return next[Math.min(closedTabIndex, next.length - 1)] ?? null;
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

  const handleOpenDiff = useCallback(
    (fromRev: string, toRev: string, path?: string) => {
      setDiffState({
        type: 'diff',
        workspaceId,
        fromRev,
        toRev,
        initialPath: path,
      });
    },
    [workspaceId],
  );

  const handlePathChanged = useCallback((oldPath: string, newPath: string) => {
    const remapPath = (path: string): string | null => {
      if (path === oldPath) {
        return newPath;
      }
      if (path.startsWith(oldPath + '/')) {
        return newPath + path.slice(oldPath.length);
      }
      return null;
    };

    setEditorTabs((prev) => {
      let changed = false;
      const next = prev.map((path) => {
        const remapped = remapPath(path);
        if (remapped) {
          changed = true;
          return remapped;
        }
        return path;
      });
      return changed ? next : prev;
    });
    setActiveTab((prev) => (prev ? remapPath(prev) ?? prev : prev));
  }, []);

  const handleDeleted = useCallback((deletedPath: string) => {
    const isAffected = (path: string) =>
      path === deletedPath || path.startsWith(deletedPath + '/');

    setEditorTabs((prev) => {
      const next = prev.filter((path) => !isAffected(path));
      setActiveTab((currentActive) => {
        if (!currentActive || !isAffected(currentActive)) {
          return currentActive;
        }
        return next[0] ?? null;
      });
      return next;
    });
  }, []);

  const closeDiff = useCallback(() => {
    setDiffState(null);
  }, []);

  return {
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
  };
}
