/**
 * EditorPanel — Monaco editor with multi-tab support, dirty tracking,
 * view state persistence, and LSP integration.
 *
 * Does NOT render its own FileTree — the FileTree lives in CodingSidebar.
 * Tab/file state is managed by the parent CodingWorkspace.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { EditorTabBar, type EditorTab } from './EditorTabBar';
import { useLsp } from '@/lsp/use-lsp';
import { useContainerStore } from '@/stores/container';

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

  const contentMapRef = useRef(new Map<string, string>());
  const savedContentRef = useRef(new Map<string, string>());
  const viewStateMapRef = useRef(new Map<string, any>());
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const [monacoInstance, setMonacoInstance] = useState<any>(null);
  const [editorInstance, setEditorInstance] = useState<any>(null);

  const containerStatus = useContainerStore((s) => s.containers[workspaceId]?.status ?? 'none');
  const isReady = containerStatus === 'running' || containerStatus === 'none'; // host mode always ready

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
  const handleBeforeMount = useCallback((monaco: any) => {
    monaco.languages.typescript?.typescriptDefaults?.setDiagnosticsOptions({
      noSemanticValidation: true, noSyntaxValidation: true,
    });
    monaco.languages.typescript?.javascriptDefaults?.setDiagnosticsOptions({
      noSemanticValidation: true, noSyntaxValidation: true,
    });
  }, []);

  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setMonacoInstance(monaco);
    setEditorInstance(editor);
    editor.onDidChangeModel(() => {
      const model = editor.getModel();
      if (!model) return;
      const vs = viewStateMapRef.current.get(model.uri.path);
      if (vs) setTimeout(() => { editor.restoreViewState(vs); editor.focus(); }, 0);
    });
  }, []);

  // ── Handle file renames (from FileTree) ──
  // This is called by CodingWorkspace when FileTree reports a path change
  // For now, the parent handles re-mapping tabs

  const tabDescriptors: EditorTab[] = tabs.map((path) => ({ path, dirty: dirtyPaths.has(path) }));

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
            theme="vs-dark"
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
