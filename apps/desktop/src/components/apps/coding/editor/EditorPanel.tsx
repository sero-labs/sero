/**
 * EditorPanel — Monaco editor with multi-tab support, dirty tracking,
 * view state persistence, and LSP integration.
 *
 * Does NOT render its own FileTree — the FileTree lives in CodingSidebar.
 * Tab/file state is managed by the parent CodingWorkspace.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import type { editor as monacoEditor } from 'monaco-editor';
import { EditorTabBar, type EditorTab } from './EditorTabBar';
import { useLsp } from '@/lsp/use-lsp';
import { useContainerStore } from '@/stores/container';
import { useActiveWorkspace } from '@/stores/workspace';
import { useAppStore } from '@/stores/app';

interface Props {
  workspaceId: string;
  tabs: string[];
  activeTab: string | null;
  onOpenTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onReorderTabs: (paths: string[]) => void;
  onTabsChange: (tabs: string[], activeTab: string | null) => void;
}

/* ── Language map ────────────────────────────────────────────── */

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
  mts: 'typescript', cts: 'typescript', mjs: 'javascript', cjs: 'javascript',
  py: 'python', rs: 'rust', go: 'go', json: 'json', md: 'markdown',
  css: 'css', html: 'html', yml: 'yaml', yaml: 'yaml', sh: 'shell',
  bash: 'shell', toml: 'toml', sql: 'sql',
};

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop() ?? '';
  return LANG_MAP[ext] ?? 'plaintext';
}

export function EditorPanel({
  workspaceId, tabs, activeTab, onOpenTab, onCloseTab, onReorderTabs, onTabsChange,
}: Props) {
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('typescript');

  type Monaco = typeof import('monaco-editor');

  const contentMapRef = useRef(new Map<string, string>());
  const savedContentRef = useRef(new Map<string, string>());
  const viewStateMapRef = useRef(new Map<string, monacoEditor.ICodeEditorViewState | null>());
  const editorRef = useRef<monacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [monacoInstance, setMonacoInstance] = useState<Monaco | null>(null);
  const [editorInstance, setEditorInstance] = useState<monacoEditor.IStandaloneCodeEditor | null>(null);

  const appTheme = useAppStore((s) => s.theme);
  const containerStatus = useContainerStore((s) => s.containers[workspaceId]?.status ?? 'none');
  const activeWorkspace = useActiveWorkspace();
  const isContainerWorkspace = activeWorkspace?.container ?? true;
  // Non-container workspaces are always ready; container workspaces must be running.
  const isReady = isContainerWorkspace ? containerStatus === 'running' : true;

  // ── LSP integration ──
  const { sendDidSave } = useLsp({
    workspaceId, filePath: activeTab, languageId: language,
    monaco: monacoInstance, editor: editorInstance,
  });

  // ── Load file when activeTab changes ──
  useEffect(() => {
    if (!activeTab) { setContent(''); return; }
    if (contentMapRef.current.has(activeTab)) {
      setContent(contentMapRef.current.get(activeTab)!);
      setLanguage(getLanguage(activeTab));
      return;
    }
    if (!isReady) return;

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
      } catch (err) {
        if (cancelled) return;
        const errContent = `// Error loading file: ${err}`;
        contentMapRef.current.set(activeTab, errContent);
        setContent(errContent);
      }
    })();
    return () => { cancelled = true; };
  }, [workspaceId, activeTab, isReady]);

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

  // ── Keyboard shortcuts ──
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key === 's') { e.preventDefault(); handleSave(); }
    else if (e.key === 'w') { e.preventDefault(); if (activeTab) handleCloseTab(activeTab); }
  }, [handleSave, activeTab, handleCloseTab]);

  // ── Open tab handler (save view state of current before switch) ──
  const handleOpenTab = useCallback((path: string) => {
    if (activeTab && activeTab !== path && editorRef.current) {
      viewStateMapRef.current.set(activeTab, editorRef.current.saveViewState());
      const model = editorRef.current.getModel();
      if (model) contentMapRef.current.set(activeTab, model.getValue());
    }
    onOpenTab(path);
  }, [activeTab, onOpenTab]);

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
        onReorderTabs={onReorderTabs}
      />
      <div className="flex-1 overflow-hidden min-h-0">
        {activeTab ? (
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
