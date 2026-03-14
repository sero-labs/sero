/**
 * EditorPanel — Monaco editor with multi-tab support, dirty tracking,
 * view state persistence, and LSP integration.
 *
 * Does NOT render its own FileTree — the FileTree lives in CodingSidebar.
 * Tab/file state is managed by the parent CodingWorkspace.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { editor as monacoEditor, IRange, IPosition } from 'monaco-editor';
import { Code2, Eye } from 'lucide-react';
import { EditorTabBar, type EditorTab } from './EditorTabBar';
import { ImagePreview, isImageFile } from './ImagePreview';
import { HtmlPreview, isHtmlFile } from './HtmlPreview';
import { useLsp } from '@/lsp/use-lsp';
import { useAppStore } from '@/stores/app';
import { Streamdown } from 'streamdown';
import { code } from '@streamdown/code';
import { math } from '@streamdown/math';
import { mermaid } from '@streamdown/mermaid';
import { Tooltip, TooltipContent, TooltipTrigger } from '@sero/ui/components/ui/tooltip';
import { cn } from '@sero/ui/lib/utils';

interface Props {
  workspaceId: string;
  tabs: string[];
  activeTab: string | null;
  onOpenTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onCloseOtherTabs: (path: string) => void;
  onCloseAllTabs: () => void;
  onReorderTabs: (paths: string[]) => void;
  onTabsChange: (tabs: string[], activeTab: string | null) => void;
}

/* ── Language map ────────────────────────────────────────────── */

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  mts: 'typescript', cts: 'typescript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', rs: 'rust', go: 'go', json: 'json', md: 'markdown', mdx: 'markdown',
  css: 'css', html: 'html', yml: 'yaml', yaml: 'yaml', sh: 'shell',
  bash: 'shell', toml: 'toml', sql: 'sql',
};

/** Navigate editor to a position or selection range (used for go-to-definition). */
function applyGoto(
  ed: monacoEditor.IStandaloneCodeEditor,
  selection: IRange | IPosition | null | undefined,
): void {
  if (!selection) return;
  if ('startLineNumber' in selection) {
    ed.setSelection(selection as IRange);
    ed.revealRangeInCenter(selection as IRange);
  } else {
    ed.setPosition(selection as IPosition);
    ed.revealPositionInCenter(selection as IPosition);
  }
  ed.focus();
}

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return LANG_MAP[ext] ?? 'plaintext';
}

export function EditorPanel({
  workspaceId, tabs, activeTab, onOpenTab, onCloseTab, onCloseOtherTabs, onCloseAllTabs, onReorderTabs, onTabsChange,
}: Props) {
  type ViewMode = 'code' | 'preview';

  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('typescript');
  const [viewMode, setViewMode] = useState<ViewMode>('code');

  type Monaco = typeof import('monaco-editor');

  const contentMapRef = useRef(new Map<string, string>());
  const savedContentRef = useRef(new Map<string, string>());
  const viewStateMapRef = useRef(new Map<string, monacoEditor.ICodeEditorViewState | null>());
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
  const [editorInstance, setEditorInstance] = useState<monacoEditor.IStandaloneCodeEditor | null>(null);
  const pendingGotoRef = useRef<{ path: string; selection: IRange | IPosition } | null>(null);

  const appTheme = useAppStore((s) => s.theme);
  const isMarkdownTab = !!activeTab && getLanguage(activeTab) === 'markdown';
  const isHtmlTab = !!activeTab && isHtmlFile(activeTab);
  const isPreviewableTab = isMarkdownTab || isHtmlTab;
  const isPreview = isPreviewableTab && viewMode === 'preview';
  const isImageTab = !!activeTab && isImageFile(activeTab);

  // ── LSP integration ──
  const { sendDidSave } = useLsp({
    workspaceId, filePath: activeTab, languageId: language,
    monaco: monacoInstance, editor: editorInstance,
  });

  // ── Load file when activeTab changes ──
  useEffect(() => {
    if (!activeTab) { setContent(''); return; }
    // Image files are handled by ImagePreview — skip text loading
    if (isImageFile(activeTab)) { setContent(''); setLanguage('plaintext'); return; }

    // Apply a stored go-to-definition position after content is ready.
    const schedulePendingGoto = () => {
      const pending = pendingGotoRef.current;
      if (!pending || pending.path !== activeTab) return;
      pendingGotoRef.current = null;
      setTimeout(() => {
        const ed = editorRef.current;
        if (ed) applyGoto(ed, pending.selection);
      }, 50);
    };

    if (contentMapRef.current.has(activeTab)) {
      setContent(contentMapRef.current.get(activeTab)!);
      setLanguage(getLanguage(activeTab));
      schedulePendingGoto();
      return;
    }

    setContent('');
    setLanguage(getLanguage(activeTab));
    let cancelled = false;
    (async () => {
      try {
        const fileContent = await window.sero.editor.readFile(workspaceId, activeTab);
        if (cancelled) return;
        contentMapRef.current.set(activeTab, fileContent);
        savedContentRef.current.set(activeTab, fileContent);
        setContent(fileContent);
        schedulePendingGoto();
      } catch (err) {
        if (cancelled) return;
        const errContent = `// Error loading file: ${err}`;
        contentMapRef.current.set(activeTab, errContent);
        setContent(errContent);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, activeTab]);

  // ── Default previewable files (markdown, HTML) to preview mode when opened ──
  useEffect(() => {
    if (activeTab && (getLanguage(activeTab) === 'markdown' || isHtmlFile(activeTab))) {
      setViewMode('preview');
    } else {
      setViewMode('code');
    }
  }, [activeTab]);

  // ── Editor change handler ──
  const handleChange = useCallback((value: string | undefined) => {
    if (value === undefined || !activeTab) return;
    setContent(value);
    contentMapRef.current.set(activeTab, value);
    const isDirty = value !== savedContentRef.current.get(activeTab);
    setDirtyPaths((prev) => {
      if (prev.has(activeTab) === isDirty) return prev;
      const next = new Set(prev);
      isDirty ? next.add(activeTab) : next.delete(activeTab);
      return next;
    });
  }, [activeTab]);

  // ── Save handler ──
  const handleSave = useCallback(async () => {
    if (!activeTab || !dirtyPaths.has(activeTab)) return;
    try {
      const currentContent = contentMapRef.current.get(activeTab) ?? content;
      await window.sero.editor.writeFile(workspaceId, activeTab, currentContent);
      savedContentRef.current.set(activeTab, currentContent);
      setDirtyPaths((prev) => { const next = new Set(prev); next.delete(activeTab); return next; });
      sendDidSave();
    } catch (err) {
      console.error('Failed to save:', err);
    }
  }, [workspaceId, activeTab, content, dirtyPaths, sendDidSave]);

  const handleViewModeChange = useCallback((nextMode: ViewMode) => {
    if (nextMode === viewMode) return;
    if (nextMode === 'preview' && activeTab && editorRef.current) {
      viewStateMapRef.current.set(activeTab, editorRef.current.saveViewState());
      editorRef.current = null;
      setEditorInstance(null);
    }
    setViewMode(nextMode);
  }, [viewMode, activeTab]);

  // ── Close tab handler (manages state cleanup) ──
  const handleCloseTab = useCallback((path: string) => {
    const idx = tabs.indexOf(path);
    if (idx < 0) return;

    if (activeTab && activeTab !== path && editorRef.current) {
      viewStateMapRef.current.set(activeTab, editorRef.current.saveViewState());
    }

    const nextTabs = tabs.filter((p) => p !== path);
    let nextActive = activeTab;
    if (activeTab === path) {
      nextActive = nextTabs.length === 0 ? null : nextTabs[Math.min(idx, nextTabs.length - 1)];
    }

    // Clean up refs
    contentMapRef.current.delete(path);
    savedContentRef.current.delete(path);
    viewStateMapRef.current.delete(path);
    setDirtyPaths((prev) => { if (!prev.has(path)) return prev; const next = new Set(prev); next.delete(path); return next; });

    if (monacoRef.current) {
      const uri = monacoRef.current.Uri.parse(path);
      monacoRef.current.editor.getModel(uri)?.dispose();
    }

    onCloseTab(path);
    if (nextActive !== activeTab && nextActive) {
      setContent(contentMapRef.current.get(nextActive) ?? '');
      setLanguage(getLanguage(nextActive));
    } else if (!nextActive) {
      setContent('');
    }
  }, [tabs, activeTab, onCloseTab]);

  // ── Close other / all tabs ──
  const cleanupTabRefs = useCallback((path: string) => {
    contentMapRef.current.delete(path);
    savedContentRef.current.delete(path);
    viewStateMapRef.current.delete(path);
    setDirtyPaths((prev) => { if (!prev.has(path)) return prev; const next = new Set(prev); next.delete(path); return next; });
    if (monacoRef.current) {
      const uri = monacoRef.current.Uri.parse(path);
      monacoRef.current.editor.getModel(uri)?.dispose();
    }
  }, []);

  const handleCloseOtherTabs = useCallback((keepPath: string) => {
    if (activeTab && editorRef.current) {
      viewStateMapRef.current.set(activeTab, editorRef.current.saveViewState());
    }
    for (const p of tabs) {
      if (p !== keepPath) cleanupTabRefs(p);
    }
    onCloseOtherTabs(keepPath);
    setContent(contentMapRef.current.get(keepPath) ?? '');
    setLanguage(getLanguage(keepPath));
  }, [tabs, activeTab, onCloseOtherTabs, cleanupTabRefs]);

  const handleCloseAllTabs = useCallback(() => {
    for (const p of tabs) cleanupTabRefs(p);
    onCloseAllTabs();
    setContent('');
  }, [tabs, onCloseAllTabs, cleanupTabRefs]);

  // ── Keyboard shortcuts ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === 's') { e.preventDefault(); handleSave(); }
    else if (e.key === 'w') { e.preventDefault(); if (activeTab) handleCloseTab(activeTab); }
    else if (e.shiftKey && e.key.toLowerCase() === 'v' && isPreviewableTab) {
      e.preventDefault();
      handleViewModeChange(viewMode === 'code' ? 'preview' : 'code');
    }
  }, [handleSave, activeTab, handleCloseTab, isPreviewableTab, viewMode, handleViewModeChange]);

  // ── Open tab handler (save view state of current before switch) ──
  const handleOpenTab = useCallback((path: string) => {
    if (activeTab && activeTab !== path && editorRef.current) {
      viewStateMapRef.current.set(activeTab, editorRef.current.saveViewState());
      const model = editorRef.current.getModel();
      if (model) contentMapRef.current.set(activeTab, model.getValue());
    }
    onOpenTab(path);
  }, [activeTab, onOpenTab]);

  // ── Go-to-definition: cross-file navigation ──
  const handleOpenTabRef = useRef(handleOpenTab);
  useEffect(() => { handleOpenTabRef.current = handleOpenTab; }, [handleOpenTab]);

  useEffect(() => {
    if (!monacoInstance) return;
    const disposable = monacoInstance.editor.registerEditorOpener({
      openCodeEditor(_source, resource, selectionOrPosition) {
        const filePath = resource.path;
        // Same-file: apply goto directly without switching tabs
        if (filePath === activeTabRef.current && editorRef.current) {
          if (selectionOrPosition) applyGoto(editorRef.current, selectionOrPosition);
          return true;
        }
        // Cross-file: store pending goto and open the target tab
        if (selectionOrPosition) {
          pendingGotoRef.current = { path: filePath, selection: selectionOrPosition };
        }
        handleOpenTabRef.current(filePath);
        return true;
      },
    });
    return () => disposable.dispose();
  }, [monacoInstance]);

  // ── Monaco lifecycle ──
  const handleBeforeMount = useCallback((monaco: Monaco) => {
    monaco.languages.typescript?.typescriptDefaults?.setDiagnosticsOptions({
      noSemanticValidation: true, noSyntaxValidation: true,
    });
    monaco.languages.typescript?.javascriptDefaults?.setDiagnosticsOptions({
      noSemanticValidation: true, noSyntaxValidation: true,
    });
  }, []);

  const handleEditorMount = useCallback((ed: monacoEditor.IStandaloneCodeEditor, mon: Monaco) => {
    editorRef.current = ed;
    monacoRef.current = mon;
    setMonacoInstance(mon);
    setEditorInstance(ed);
    ed.onDidChangeModel(() => {
      const model = ed.getModel();
      if (!model) return;
      const vs = viewStateMapRef.current.get(model.uri.path);
      if (vs) setTimeout(() => { ed.restoreViewState(vs); ed.focus(); }, 0);
    });

    const currentModel = ed.getModel();
    if (currentModel) {
      const vs = viewStateMapRef.current.get(currentModel.uri.path);
      if (vs) setTimeout(() => { ed.restoreViewState(vs); ed.focus(); }, 0);
    }
  }, []);

  // ── Handle file renames (from FileTree) ──
  // This is called by CodingWorkspace when FileTree reports a path change
  // For now, the parent handles re-mapping tabs

  const tabDescriptors: EditorTab[] = tabs.map((path) => ({ path, dirty: dirtyPaths.has(path) }));

  // Keep refs for tabs/activeTab so the file-watcher callback always sees
  // the latest values without re-subscribing on every tab change.
  const tabsRef = useRef(tabs);
  const activeTabRef = useRef(activeTab);
  const dirtyPathsRef = useRef(dirtyPaths);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);
  useEffect(() => { dirtyPathsRef.current = dirtyPaths; }, [dirtyPaths]);

  // ── Reload open files when their directory changes on disk ──
  //
  // The FileWatcherManager sends `filetree.changed` events with a list
  // of container-style directory paths (e.g. "/workspace/src"). For each
  // changed directory we check if any open, non-dirty tab lives in that
  // directory and re-read its content from disk.
  useEffect(() => {
    const cleanup = window.sero.filetree.onChanged((data) => {
      if (data.workspaceId !== workspaceId) return;

      const changedDirs = new Set(data.directories);
      const openTabs = tabsRef.current;
      const currentActive = activeTabRef.current;
      const currentDirty = dirtyPathsRef.current;

      for (const tabPath of openTabs) {
        // Only reload files whose parent directory was reported as changed.
        const parentPath = tabPath.substring(0, tabPath.lastIndexOf('/')) || '/';
        if (!changedDirs.has(parentPath)) continue;

        // Never overwrite unsaved user edits.
        if (currentDirty.has(tabPath)) continue;

        // Re-read the file. For the active tab we also update the visible
        // content state; for background tabs we only update the cache so
        // the fresh content is shown when the user switches to them.
        void window.sero.editor.readFile(workspaceId, tabPath).then((fileContent) => {
          const prev = savedContentRef.current.get(tabPath);
          if (prev === fileContent) return; // No actual change — skip render.

          contentMapRef.current.set(tabPath, fileContent);
          savedContentRef.current.set(tabPath, fileContent);

          if (tabPath === activeTabRef.current) {
            setContent(fileContent);
          }
        }).catch(() => {
          // File may have been deleted — ignore read errors silently.
        });
      }
    });

    return cleanup;
  }, [workspaceId]);

  // Reload editor buffers after a JJ restore so open tabs reflect disk state.
  useEffect(() => {
    const unsubscribe = window.sero.vcs.onEvent((event) => {
      if (event.type !== 'restored' || event.workspaceId !== workspaceId) return;

      contentMapRef.current.clear();
      savedContentRef.current.clear();
      setDirtyPaths(new Set());

      if (!activeTab) {
        setContent('');
        return;
      }

      void window.sero.editor.readFile(workspaceId, activeTab).then((fileContent) => {
        contentMapRef.current.set(activeTab, fileContent);
        savedContentRef.current.set(activeTab, fileContent);
        setContent(fileContent);
      }).catch((err) => {
        console.warn('[editor] Failed to reload tab after restore:', err);
      });
    });

    return unsubscribe;
  }, [workspaceId, activeTab]);

  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0" onKeyDown={handleKeyDown}>
      <EditorTabBar
        tabs={tabDescriptors} activeTab={activeTab}
        onSelectTab={handleOpenTab} onCloseTab={handleCloseTab}
        onCloseOtherTabs={handleCloseOtherTabs} onCloseAllTabs={handleCloseAllTabs}
        onReorderTabs={onReorderTabs}
        rightSlot={isPreviewableTab ? (
          <div className="flex h-full items-center overflow-hidden">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Show source code"
                  onClick={() => handleViewModeChange('code')}
                  className={cn(
                    'inline-flex size-7 items-center justify-center transition-colors duration-150',
                    viewMode === 'code'
                      ? 'bg-[var(--status-success-subtle)] text-[var(--status-success)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]/80 hover:text-[var(--text-secondary)]',
                  )}
                >
                  <Code2 className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Code</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label="Show rendered preview"
                  onClick={() => handleViewModeChange('preview')}
                  className={cn(
                    'inline-flex size-7 items-center justify-center transition-colors duration-150',
                    viewMode === 'preview'
                      ? 'bg-[var(--status-success-subtle)] text-[var(--status-success)]'
                      : 'text-[var(--text-muted)] hover:bg-[var(--bg-elevated)]/80 hover:text-[var(--text-secondary)]',
                  )}
                >
                  <Eye className="size-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom">Preview</TooltipContent>
            </Tooltip>
          </div>
        ) : undefined}
      />
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab ? (
          isImageTab ? (
            <ImagePreview workspaceId={workspaceId} filePath={activeTab} />
          ) : isHtmlTab && isPreview ? (
            <HtmlPreview content={content} filePath={activeTab} />
          ) : isMarkdownTab && isPreview ? (
            <div className="h-full overflow-auto">
              <div className="mx-auto w-full max-w-[920px] px-6 py-5">
                <Streamdown
                  mode="static"
                  plugins={{ code, math, mermaid }}
                >
                  {content}
                </Streamdown>
              </div>
            </div>
          ) : (
            <Editor
              height="100%" language={language} path={activeTab}
              value={content} onChange={handleChange}
              beforeMount={handleBeforeMount} onMount={handleEditorMount}
              theme={appTheme === 'dark' ? 'vs-dark' : 'vs'}
              options={{
                fontSize: 13,
                fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
                minimap: { enabled: false }, lineNumbers: 'on',
                scrollBeyondLastLine: false, wordWrap: 'on', tabSize: 2,
                padding: { top: 8 }, renderLineHighlight: 'gutter',
                smoothScrolling: true, cursorBlinking: 'smooth',
                cursorSmoothCaretAnimation: 'on',
                bracketPairColorization: { enabled: true },
              }}
            />
          )
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-muted)] gap-2">
            <p className="text-4xl opacity-40">📝</p>
            <p className="text-sm font-medium text-[var(--text-secondary)]">No file open</p>
            <p className="text-xs max-w-[260px] text-center leading-relaxed">
              Select a file from the explorer or let your agent create one
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
