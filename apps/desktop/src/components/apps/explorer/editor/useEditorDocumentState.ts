import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { isDevServerTab } from './DevServerPreview';
import {
  shouldDefaultToPreview,
  isBinaryPreviewFile,
} from './file-preview-registry';
import {
  getLanguage,
  type EditorDocumentMonacoBridge,
} from './editor-panel-shared';
import { type ViewMode } from './ViewModeToggle';

interface UseEditorDocumentStateOptions {
  workspaceId: string;
  tabs: string[];
  activeTab: string | null;
  onOpenTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onCloseOtherTabs: (path: string) => void;
  onCloseAllTabs: () => void;
  sendDidSave: () => void;
  monacoBridge: EditorDocumentMonacoBridge;
}

export function useEditorDocumentState({
  workspaceId,
  tabs,
  activeTab,
  onOpenTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  sendDidSave,
  monacoBridge,
}: UseEditorDocumentStateOptions) {
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('typescript');
  const [viewMode, setViewMode] = useState<ViewMode>('code');
  const contentMapRef = useRef(new Map<string, string>());
  const savedContentRef = useRef(new Map<string, string>());

  useEffect(() => {
    if (!activeTab) {
      setContent('');
      return;
    }

    if (isBinaryPreviewFile(activeTab) || isDevServerTab(activeTab)) {
      setContent('');
      setLanguage('plaintext');
      return;
    }

    if (contentMapRef.current.has(activeTab)) {
      setContent(contentMapRef.current.get(activeTab) ?? '');
      setLanguage(getLanguage(activeTab));
      monacoBridge.schedulePendingGoto(activeTab);
      return;
    }

    setContent('');
    setLanguage(getLanguage(activeTab));
    let cancelled = false;

    void (async () => {
      try {
        const fileContent = await window.sero.editor.readFile(workspaceId, activeTab);
        if (cancelled) return;
        contentMapRef.current.set(activeTab, fileContent);
        savedContentRef.current.set(activeTab, fileContent);
        setContent(fileContent);
        monacoBridge.schedulePendingGoto(activeTab);
      } catch (error) {
        if (cancelled) return;
        const errorContent = `// Error loading file: ${error}`;
        contentMapRef.current.set(activeTab, errorContent);
        setContent(errorContent);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeTab, monacoBridge, workspaceId]);

  useEffect(() => {
    if (activeTab && shouldDefaultToPreview(activeTab)) {
      setViewMode('preview');
      return;
    }
    setViewMode('code');
  }, [activeTab]);

  const handleChange = useCallback(
    (value: string | undefined) => {
      if (value === undefined || !activeTab) return;
      setContent(value);
      contentMapRef.current.set(activeTab, value);
      const isDirty = value !== savedContentRef.current.get(activeTab);
      setDirtyPaths((previous) => {
        if (previous.has(activeTab) === isDirty) return previous;
        const next = new Set(previous);
        if (isDirty) {
          next.add(activeTab);
        } else {
          next.delete(activeTab);
        }
        return next;
      });
    },
    [activeTab],
  );

  const handleSave = useCallback(async () => {
    if (!activeTab || !dirtyPaths.has(activeTab)) return;
    try {
      const currentContent = contentMapRef.current.get(activeTab) ?? content;
      await window.sero.editor.writeFile(workspaceId, activeTab, currentContent);
      savedContentRef.current.set(activeTab, currentContent);
      setDirtyPaths((previous) => {
        const next = new Set(previous);
        next.delete(activeTab);
        return next;
      });
      sendDidSave();
    } catch (error) {
      console.error('Failed to save:', error);
    }
  }, [activeTab, content, dirtyPaths, sendDidSave, workspaceId]);

  const handleViewModeChange = useCallback(
    (nextMode: ViewMode) => {
      if (nextMode === viewMode) return;
      if (nextMode === 'preview') {
        monacoBridge.clearEditorForPreview(activeTab);
      }
      setViewMode(nextMode);
    },
    [activeTab, monacoBridge, viewMode],
  );

  const cleanupTabRefs = useCallback(
    (path: string) => {
      contentMapRef.current.delete(path);
      savedContentRef.current.delete(path);
      setDirtyPaths((previous) => {
        if (!previous.has(path)) return previous;
        const next = new Set(previous);
        next.delete(path);
        return next;
      });
      monacoBridge.disposeModel(path);
    },
    [monacoBridge],
  );

  const handleCloseTab = useCallback(
    (path: string) => {
      const index = tabs.indexOf(path);
      if (index < 0) return;

      if (activeTab && activeTab !== path) {
        monacoBridge.saveViewState(activeTab);
      }

      const nextTabs = tabs.filter((tabPath) => tabPath !== path);
      let nextActive = activeTab;
      if (activeTab === path) {
        nextActive =
          nextTabs.length === 0 ? null : nextTabs[Math.min(index, nextTabs.length - 1)];
      }

      cleanupTabRefs(path);
      onCloseTab(path);

      if (nextActive && nextActive !== activeTab) {
        setContent(contentMapRef.current.get(nextActive) ?? '');
        setLanguage(getLanguage(nextActive));
      } else if (!nextActive) {
        setContent('');
      }
    },
    [activeTab, cleanupTabRefs, monacoBridge, onCloseTab, tabs],
  );

  const handleCloseOtherTabs = useCallback(
    (keepPath: string) => {
      monacoBridge.saveViewState(activeTab);
      for (const path of tabs) {
        if (path !== keepPath) {
          cleanupTabRefs(path);
        }
      }
      onCloseOtherTabs(keepPath);
      setContent(contentMapRef.current.get(keepPath) ?? '');
      setLanguage(getLanguage(keepPath));
    },
    [activeTab, cleanupTabRefs, monacoBridge, onCloseOtherTabs, tabs],
  );

  const handleCloseAllTabs = useCallback(() => {
    for (const path of tabs) {
      cleanupTabRefs(path);
    }
    onCloseAllTabs();
    setContent('');
  }, [cleanupTabRefs, onCloseAllTabs, tabs]);

  const handleOpenTab = useCallback(
    (path: string) => {
      if (activeTab && activeTab !== path) {
        monacoBridge.saveViewState(activeTab);
        const currentModelContent = monacoBridge.getCurrentModelContent();
        if (currentModelContent !== null) {
          contentMapRef.current.set(activeTab, currentModelContent);
        }
      }
      onOpenTab(path);
    },
    [activeTab, monacoBridge, onOpenTab],
  );

  const handleKeyDown = useCallback(
    (
      event: KeyboardEvent,
      supportsCodeView: boolean,
    ) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key === 's') {
        event.preventDefault();
        void handleSave();
        return;
      }
      if (event.key === 'w') {
        event.preventDefault();
        if (activeTab) {
          handleCloseTab(activeTab);
        }
        return;
      }
      if (event.shiftKey && event.key.toLowerCase() === 'v' && supportsCodeView) {
        event.preventDefault();
        handleViewModeChange(viewMode === 'code' ? 'preview' : 'code');
      }
    },
    [activeTab, handleCloseTab, handleSave, handleViewModeChange, viewMode],
  );

  return {
    dirtyPaths,
    content,
    language,
    viewMode,
    contentMapRef,
    savedContentRef,
    setContent,
    setDirtyPaths,
    handleChange,
    handleSave,
    handleViewModeChange,
    handleOpenTab,
    handleCloseTab,
    handleCloseOtherTabs,
    handleCloseAllTabs,
    handleKeyDown,
  };
}
