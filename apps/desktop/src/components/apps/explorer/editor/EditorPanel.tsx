/**
 * EditorPanel, Monaco editor with multi-tab support, dirty tracking,
 * view state persistence, and LSP integration.
 *
 * Does NOT render its own FileTree, the FileTree lives in ExplorerSidebar.
 * Tab/file state is managed by the parent ExplorerWorkspace.
 */

import { useMemo, useRef, type KeyboardEvent } from 'react';
import { FileCode2 } from 'lucide-react';
import Editor from '@monaco-editor/react';
import { EditorTabBar, type EditorTab } from './EditorTabBar';
import { DevServerPreview, isDevServerTab } from './DevServerPreview';
import { FilePreviewPane } from './FilePreviewPane';
import { getFilePreviewSpec } from './file-preview-registry';
import { ViewModeToggle } from './ViewModeToggle';
import { EditorThemePicker } from './EditorThemePicker';
import { resolveMonacoThemeName } from './monaco-themes';
import {
  type EditorPanelProps,
} from './editor-panel-shared';
import { useEditorDocumentState } from './useEditorDocumentState';
import { useEditorMonacoState } from './useEditorMonacoState';
import { useEditorRuntimeSync } from './useEditorRuntimeSync';
import { useMonacoNavigation } from './useMonacoNavigation';
import { useLsp } from '@/lsp/use-lsp';
import { useAppStore } from '@/stores/app';
import { useThemeStore } from '@/stores/theme';

function EmptyEditorState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--text-muted)]">
      <FileCode2 className="size-10 opacity-40" />
      <p className="text-base font-medium text-[var(--text-secondary)]">No file open</p>
      <p className="max-w-[260px] text-center text-xs leading-relaxed">
        Select a file from the explorer or let your agent create one
      </p>
    </div>
  );
}

export function EditorPanel({
  workspaceId,
  tabs,
  activeTab,
  onOpenTab,
  onCloseTab,
  onCloseOtherTabs,
  onCloseAllTabs,
  onReorderTabs,
}: EditorPanelProps) {
  const monacoState = useEditorMonacoState();
  const sendDidSaveRef = useRef<() => void>(() => {});
  const monacoBridge = useMemo(
    () => ({
      schedulePendingGoto: monacoState.schedulePendingGoto,
      saveViewState: monacoState.saveViewState,
      getCurrentModelContent: monacoState.getCurrentModelContent,
      disposeModel: monacoState.disposeModel,
      clearEditorForPreview: monacoState.clearEditorForPreview,
    }),
    [
      monacoState.schedulePendingGoto,
      monacoState.saveViewState,
      monacoState.getCurrentModelContent,
      monacoState.disposeModel,
      monacoState.clearEditorForPreview,
    ],
  );
  const documentState = useEditorDocumentState({
    workspaceId,
    tabs,
    activeTab,
    onOpenTab,
    onCloseTab,
    onCloseOtherTabs,
    onCloseAllTabs,
    sendDidSave: () => {
      sendDidSaveRef.current();
    },
    monacoBridge,
  });

  const { sendDidSave, statusNotice } = useLsp({
    workspaceId,
    filePath: activeTab,
    languageId: documentState.language,
    monaco: monacoState.monacoInstance,
    editor: monacoState.editorInstance,
  });
  sendDidSaveRef.current = sendDidSave;

  useMonacoNavigation({
    activeTab,
    editorRef: monacoState.editorRef,
    monacoInstance: monacoState.monacoInstance,
    pendingGotoRef: monacoState.pendingGotoRef,
    handleOpenTab: documentState.handleOpenTab,
  });

  useEditorRuntimeSync({
    workspaceId,
    tabs,
    activeTab,
    dirtyPaths: documentState.dirtyPaths,
    contentMapRef: documentState.contentMapRef,
    savedContentRef: documentState.savedContentRef,
    setContent: documentState.setContent,
    setDirtyPaths: documentState.setDirtyPaths,
  });

  const effectiveMode = useThemeStore((state) => state.effectiveMode);
  const editorThemeId = useAppStore((state) => state.editorThemeId);
  const monacoThemeName = resolveMonacoThemeName(editorThemeId, effectiveMode);
  const previewSpec = activeTab ? getFilePreviewSpec(activeTab) : null;
  const isDevServer = !!activeTab && isDevServerTab(activeTab);
  const supportsCodeView = !!previewSpec?.supportsCodeView;
  const isBinaryPreviewTab = previewSpec?.source === 'binary';
  const shouldRenderPreview =
    !!previewSpec && (isBinaryPreviewTab || documentState.viewMode === 'preview');
  const tabDescriptors: EditorTab[] = tabs.map((path) => ({
    path,
    dirty: documentState.dirtyPaths.has(path),
  }));

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    documentState.handleKeyDown(event, supportsCodeView);
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col" onKeyDown={handleKeyDown}>
      <EditorTabBar
        tabs={tabDescriptors}
        activeTab={activeTab}
        onSelectTab={documentState.handleOpenTab}
        onCloseTab={documentState.handleCloseTab}
        onCloseOtherTabs={documentState.handleCloseOtherTabs}
        onCloseAllTabs={documentState.handleCloseAllTabs}
        onReorderTabs={onReorderTabs}
        rightSlot={
          <div className="flex h-full items-center">
            {supportsCodeView ? (
              <ViewModeToggle
                viewMode={documentState.viewMode}
                onModeChange={documentState.handleViewModeChange}
              />
            ) : null}
            <EditorThemePicker />
          </div>
        }
      />
      {statusNotice ? (
        <div className="border-b border-status-warning-border bg-status-warning-faint px-3 py-2 text-sm text-[var(--status-warning-text)]">
          {statusNotice}
        </div>
      ) : null}
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab ? (
          isDevServer ? (
            <DevServerPreview key={activeTab} tabPath={activeTab} />
          ) : previewSpec && shouldRenderPreview ? (
            <FilePreviewPane
              workspaceId={workspaceId}
              filePath={activeTab}
              content={documentState.content}
              spec={previewSpec}
            />
          ) : (
            <Editor
              height="100%"
              language={documentState.language}
              path={activeTab}
              value={documentState.content}
              onChange={documentState.handleChange}
              beforeMount={monacoState.handleBeforeMount}
              onMount={monacoState.handleEditorMount}
              theme={monacoThemeName}
              options={{
                fontSize: 13,
                fontFamily: "var(--font-mono, 'JetBrains Mono', 'SF Mono', monospace)",
                minimap: { enabled: false },
                lineNumbers: 'on',
                scrollBeyondLastLine: false,
                wordWrap: 'on',
                tabSize: 2,
                padding: { top: 8 },
                renderLineHighlight: 'gutter',
                smoothScrolling: true,
                cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                bracketPairColorization: { enabled: true },
              }}
            />
          )
        ) : (
          <EmptyEditorState />
        )}
      </div>
    </div>
  );
}
