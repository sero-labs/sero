import { useEffect, useRef } from 'react';
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react';

interface UseEditorRuntimeSyncOptions {
  workspaceId: string;
  tabs: string[];
  activeTab: string | null;
  dirtyPaths: Set<string>;
  contentMapRef: MutableRefObject<Map<string, string>>;
  savedContentRef: MutableRefObject<Map<string, string>>;
  setContent: Dispatch<SetStateAction<string>>;
  setDirtyPaths: Dispatch<SetStateAction<Set<string>>>;
}

export function useEditorRuntimeSync({
  workspaceId,
  tabs,
  activeTab,
  dirtyPaths,
  contentMapRef,
  savedContentRef,
  setContent,
  setDirtyPaths,
}: UseEditorRuntimeSyncOptions) {
  const tabsRef = useRef(tabs);
  const activeTabRef = useRef(activeTab);
  const dirtyPathsRef = useRef(dirtyPaths);
  tabsRef.current = tabs;
  activeTabRef.current = activeTab;
  dirtyPathsRef.current = dirtyPaths;

  useEffect(() => {
    const cleanup = window.sero.filetree.onChanged((data) => {
      if (data.workspaceId !== workspaceId) return;

      const changedDirectories = new Set(data.directories);
      for (const tabPath of tabsRef.current) {
        const parentPath = tabPath.substring(0, tabPath.lastIndexOf('/')) || '/';
        if (!changedDirectories.has(parentPath)) continue;
        if (dirtyPathsRef.current.has(tabPath)) continue;

        void window.sero.editor
          .readFile(workspaceId, tabPath)
          .then((fileContent) => {
            const previous = savedContentRef.current.get(tabPath);
            if (previous === fileContent) return;

            contentMapRef.current.set(tabPath, fileContent);
            savedContentRef.current.set(tabPath, fileContent);
            if (tabPath === activeTabRef.current) {
              setContent(fileContent);
            }
          })
          .catch(() => {
            // File may have been deleted — ignore read errors silently.
          });
      }
    });

    return cleanup;
  }, [contentMapRef, savedContentRef, setContent, workspaceId]);

  useEffect(() => {
    const unsubscribe = window.sero.vcs.onEvent((event) => {
      if (event.type !== 'restored' || event.workspaceId !== workspaceId) return;

      contentMapRef.current.clear();
      savedContentRef.current.clear();
      setDirtyPaths(new Set<string>());

      const currentActiveTab = activeTabRef.current;
      if (!currentActiveTab) {
        setContent('');
        return;
      }

      void window.sero.editor
        .readFile(workspaceId, currentActiveTab)
        .then((fileContent) => {
          contentMapRef.current.set(currentActiveTab, fileContent);
          savedContentRef.current.set(currentActiveTab, fileContent);
          setContent(fileContent);
        })
        .catch((error) => {
          console.warn('[editor] Failed to reload tab after restore:', error);
        });
    });

    return unsubscribe;
  }, [contentMapRef, savedContentRef, setContent, setDirtyPaths, workspaceId]);
}
