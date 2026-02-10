import React, { useCallback, useEffect, useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import { FileTree } from './FileTree';
import { EditorTabBar, type EditorTab } from './EditorTabBar';
import { useProjectStore } from '../../stores/project-store';
import { useLsp } from '../../lsp/use-lsp';
import './EditorPanel.css';

interface Props {
  projectId: string;
  panelId: string;
}

const LANG_MAP: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript',
  js: 'javascript', jsx: 'javascript',
  mts: 'typescript', cts: 'typescript',
  mjs: 'javascript', cjs: 'javascript',
  py: 'python', rs: 'rust', go: 'go',
  json: 'json', md: 'markdown', css: 'css',
  html: 'html', yml: 'yaml', yaml: 'yaml',
  sh: 'shell', bash: 'shell',
  toml: 'toml', sql: 'sql',
};

function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop() ?? '';
  return LANG_MAP[ext] ?? 'plaintext';
}

export function EditorPanel({ projectId }: Props) {
  // ── Tab state ──
  const [tabs, setTabs] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [dirtyPaths, setDirtyPaths] = useState<Set<string>>(new Set());
  const [content, setContent] = useState('');
  const [language, setLanguage] = useState('typescript');
  const [stateLoaded, setStateLoaded] = useState(false);

  // ── Refs for content, view state, and editor instances ──
  const contentMapRef = useRef(new Map<string, string>());
  const savedContentRef = useRef(new Map<string, string>());
  const viewStateMapRef = useRef(new Map<string, any>());
  const editorRef = useRef<any>(null);
  const monacoRef = useRef<any>(null);
  const [monacoInstance, setMonacoInstance] = useState<any>(null);
  const [editorInstance, setEditorInstance] = useState<any>(null);

  const projectStatus = useProjectStore((s) => s.projects.get(projectId)?.status);

  // ── LSP integration ──
  const { sendDidSave } = useLsp({
    projectId,
    filePath: activeTab,
    languageId: language,
    monaco: monacoInstance,
    editor: editorInstance,
  });

  // ── Persistence: Restore open tabs on mount ──
  useEffect(() => {
    if (stateLoaded) return;
    setStateLoaded(true);
    (async () => {
      try {
        const state = await window.sero.persistence.loadEditorState(projectId);
        if (!state) return;
        // Handle new format { openTabs, activeTab } and legacy { openFile }
        if ('openTabs' in state && Array.isArray(state.openTabs) && state.openTabs.length > 0) {
          setTabs(state.openTabs);
          setActiveTab(state.activeTab ?? state.openTabs[0]);
        } else if ('openFile' in state && state.openFile) {
          setTabs([state.openFile]);
          setActiveTab(state.openFile);
        }
      } catch { /* ignore */ }
    })();
  }, [projectId, stateLoaded]);

  // ── Persistence: Save open tabs when they change ──
  useEffect(() => {
    if (!stateLoaded) return;
    window.sero.persistence.saveEditorState(projectId, { openTabs: tabs, activeTab });
  }, [tabs, activeTab, projectId, stateLoaded]);

  // ── Load file content when activeTab changes (waits for container) ──
  useEffect(() => {
    if (!activeTab) {
      setContent('');
      return;
    }

    // If we already have content for this tab, use it immediately
    if (contentMapRef.current.has(activeTab)) {
      setContent(contentMapRef.current.get(activeTab)!);
      setLanguage(getLanguage(activeTab));
      return;
    }

    // Don't try to read from a container that isn't running
    if (projectStatus !== 'running') return;

    // New tab — clear content, then load from container
    setContent('');
    setLanguage(getLanguage(activeTab));

    let cancelled = false;
    (async () => {
      try {
        const fileContent = await window.sero.container.readFile(projectId, activeTab);
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
  }, [projectId, activeTab, projectStatus]);

  // ── Open a file tab (adds if new, switches if existing) ──
  const openTab = useCallback(
    (path: string) => {
      // Save current editor state before switching
      if (activeTab && activeTab !== path && editorRef.current) {
        viewStateMapRef.current.set(activeTab, editorRef.current.saveViewState());
        const model = editorRef.current.getModel();
        if (model) contentMapRef.current.set(activeTab, model.getValue());
      }

      setTabs((prev) => (prev.includes(path) ? prev : [...prev, path]));
      setActiveTab(path);
    },
    [activeTab],
  );

  // ── Close a file tab ──
  const closeTab = useCallback(
    (path: string) => {
      const idx = tabs.indexOf(path);
      if (idx < 0) return;

      // Save current view state if closing a non-active tab from the bar
      if (activeTab && activeTab !== path && editorRef.current) {
        viewStateMapRef.current.set(activeTab, editorRef.current.saveViewState());
      }

      const nextTabs = tabs.filter((p) => p !== path);
      let nextActive = activeTab;

      if (activeTab === path) {
        if (nextTabs.length === 0) {
          nextActive = null;
        } else {
          nextActive = nextTabs[Math.min(idx, nextTabs.length - 1)];
        }
      }

      setTabs(nextTabs);
      if (nextActive !== activeTab) {
        setActiveTab(nextActive);
        if (nextActive) {
          setContent(contentMapRef.current.get(nextActive) ?? '');
          setLanguage(getLanguage(nextActive));
        } else {
          setContent('');
        }
      }

      // Clean up refs for closed tab
      contentMapRef.current.delete(path);
      savedContentRef.current.delete(path);
      viewStateMapRef.current.delete(path);
      setDirtyPaths((prev) => {
        if (!prev.has(path)) return prev;
        const next = new Set(prev);
        next.delete(path);
        return next;
      });

      // Dispose Monaco model to free memory
      if (monacoRef.current) {
        const uri = monacoRef.current.Uri.parse(path);
        const model = monacoRef.current.editor.getModel(uri);
        model?.dispose();
      }
    },
    [tabs, activeTab],
  );

  // ── Editor event handlers ──
  const handleChange = useCallback(
    (value: string | undefined) => {
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
    },
    [activeTab],
  );

  const handleSave = useCallback(async () => {
    if (!activeTab || !dirtyPaths.has(activeTab)) return;
    try {
      const currentContent = contentMapRef.current.get(activeTab) ?? content;
      await window.sero.container.writeFile(projectId, activeTab, currentContent);
      savedContentRef.current.set(activeTab, currentContent);
      setDirtyPaths((prev) => {
        const next = new Set(prev);
        next.delete(activeTab);
        return next;
      });
      sendDidSave();
    } catch (err) {
      console.error('Failed to save:', err);
    }
  }, [projectId, activeTab, content, dirtyPaths, sendDidSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (e.key === 's') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'w') {
        e.preventDefault();
        if (activeTab) closeTab(activeTab);
      }
    },
    [handleSave, activeTab, closeTab],
  );

  // Disable Monaco's built-in TS/JS diagnostics (LSP provides them)
  const handleBeforeMount = useCallback((monaco: any) => {
    monaco.languages.typescript?.typescriptDefaults?.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });
    monaco.languages.typescript?.javascriptDefaults?.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });
  }, []);

  // Capture editor/monaco instances + set up view state restoration
  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setMonacoInstance(monaco);
    setEditorInstance(editor);

    // Restore view state automatically when model changes (tab switch)
    editor.onDidChangeModel(() => {
      const model = editor.getModel();
      if (!model) return;
      const path = model.uri.path;
      const vs = viewStateMapRef.current.get(path);
      if (vs) {
        setTimeout(() => {
          editor.restoreViewState(vs);
          editor.focus();
        }, 0);
      }
    });
  }, []);

  // ── Reorder tabs via drag ──
  const handleReorderTabs = useCallback((newOrder: string[]) => {
    setTabs(newOrder);
  }, []);

  // ── Handle file/directory move or rename from the file tree ──
  const handlePathChanged = useCallback(
    (oldPath: string, newPath: string) => {
      // Build a mapping of old→new for every affected tab.
      // If oldPath is a directory, any tab under it gets its prefix replaced.
      const remap = (p: string): string | null => {
        if (p === oldPath) return newPath;
        if (p.startsWith(oldPath + '/')) return newPath + p.slice(oldPath.length);
        return null;
      };

      setTabs((prev) => {
        let changed = false;
        const next = prev.map((p) => {
          const mapped = remap(p);
          if (mapped) { changed = true; return mapped; }
          return p;
        });
        return changed ? next : prev;
      });

      setActiveTab((prev) => {
        if (!prev) return prev;
        return remap(prev) ?? prev;
      });

      // Migrate content, saved-content, and view-state refs
      for (const [key] of Array.from(contentMapRef.current.entries())) {
        const mapped = remap(key);
        if (mapped) {
          contentMapRef.current.set(mapped, contentMapRef.current.get(key)!);
          contentMapRef.current.delete(key);
        }
      }
      for (const [key] of Array.from(savedContentRef.current.entries())) {
        const mapped = remap(key);
        if (mapped) {
          savedContentRef.current.set(mapped, savedContentRef.current.get(key)!);
          savedContentRef.current.delete(key);
        }
      }
      for (const [key] of Array.from(viewStateMapRef.current.entries())) {
        const mapped = remap(key);
        if (mapped) {
          viewStateMapRef.current.set(mapped, viewStateMapRef.current.get(key)!);
          viewStateMapRef.current.delete(key);
        }
      }

      // Migrate dirty paths
      setDirtyPaths((prev) => {
        let changed = false;
        const next = new Set<string>();
        for (const p of prev) {
          const mapped = remap(p);
          if (mapped) { next.add(mapped); changed = true; }
          else next.add(p);
        }
        return changed ? next : prev;
      });

      // Rename Monaco models so the editor picks up the new URI/language
      if (monacoRef.current) {
        for (const model of monacoRef.current.editor.getModels()) {
          const modelPath = model.uri.path;
          const mapped = remap(modelPath);
          if (!mapped) continue;

          const value = model.getValue();
          const newUri = monacoRef.current.Uri.parse(mapped);
          // Only create if no model exists at the new URI yet
          if (!monacoRef.current.editor.getModel(newUri)) {
            monacoRef.current.editor.createModel(value, getLanguage(mapped), newUri);
          }
          model.dispose();
        }
      }
    },
    [],
  );

  // ── Handle file/directory deletion from the file tree ──
  const handleDeleted = useCallback(
    (deletedPath: string) => {
      // Close all tabs that match or are under the deleted path
      const isAffected = (p: string) => p === deletedPath || p.startsWith(deletedPath + '/');

      const affected = tabs.filter(isAffected);
      for (const path of affected) {
        closeTab(path);
      }
    },
    [tabs, closeTab],
  );

  // ── Build tab descriptors for the tab bar ──
  const tabDescriptors: EditorTab[] = tabs.map((path) => ({
    path,
    dirty: dirtyPaths.has(path),
  }));

  return (
    <div className="editor-panel" onKeyDown={handleKeyDown}>
      {/* File tree sidebar */}
      <div className="editor-sidebar">
        <div className="editor-sidebar-header">
          <span className="editor-sidebar-title">Files</span>
        </div>
        <FileTree projectId={projectId} activePath={activeTab} onFileSelect={openTab} onPathChanged={handlePathChanged} onDeleted={handleDeleted} />
      </div>

      {/* Main editor area */}
      <div className="editor-main">
        <EditorTabBar
          tabs={tabDescriptors}
          activeTab={activeTab}
          onSelectTab={openTab}
          onCloseTab={closeTab}
          onReorderTabs={handleReorderTabs}
        />

        <div className="editor-monaco">
          {activeTab ? (
            <Editor
              height="100%"
              language={language}
              path={activeTab}
              value={content}
              onChange={handleChange}
              beforeMount={handleBeforeMount}
              onMount={handleEditorMount}
              theme="vs-dark"
              options={{
                fontSize: 13,
                fontFamily: "'SF Mono', 'Fira Code', 'JetBrains Mono', monospace",
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
          ) : (
            <div className="editor-welcome">
              <p className="editor-welcome-icon">📝</p>
              <p className="editor-welcome-title">No file open</p>
              <p className="editor-welcome-hint">
                Select a file from the tree or let your agent create one
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
