import { useEffect } from 'react';
import type { RefObject } from 'react';
import type * as monacoApi from 'monaco-editor';
import type { editor as MonacoEditor } from 'monaco-editor';
import { applyGoto, type PendingGoto } from './editor-panel-shared';

interface UseMonacoNavigationOptions {
  activeTab: string | null;
  editorRef: RefObject<MonacoEditor.IStandaloneCodeEditor | null>;
  monacoInstance: typeof monacoApi | null;
  pendingGotoRef: RefObject<PendingGoto | null>;
  handleOpenTab: (path: string) => void;
}

export function useMonacoNavigation({
  activeTab,
  editorRef,
  monacoInstance,
  pendingGotoRef,
  handleOpenTab,
}: UseMonacoNavigationOptions) {
  useEffect(() => {
    if (!monacoInstance) return;
    const disposable = monacoInstance.editor.registerEditorOpener({
      openCodeEditor(_source, resource, selectionOrPosition) {
        const filePath = resource.path;
        if (filePath === activeTab && editorRef.current) {
          if (selectionOrPosition) {
            applyGoto(editorRef.current, selectionOrPosition);
          }
          return true;
        }
        if (selectionOrPosition) {
          pendingGotoRef.current = {
            path: filePath,
            selection: selectionOrPosition,
          };
        }
        handleOpenTab(filePath);
        return true;
      },
    });

    return () => {
      disposable.dispose();
    };
  }, [activeTab, editorRef, handleOpenTab, monacoInstance, pendingGotoRef]);
}
