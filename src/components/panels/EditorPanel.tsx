import React, { useCallback, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { FileTree } from './FileTree';
import { useLsp } from '../../lsp/use-lsp';
import './FileTree.css';
import './EditorPanel.css';

interface Props {
  projectId: string;
  panelId: string;
}

export function EditorPanel({ projectId }: Props) {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [content, setContent] = useState<string>('// Welcome to Sero\n// Select a file from the tree or let your agent create one\n');
  const [language, setLanguage] = useState<string>('typescript');
  const [isDirty, setIsDirty] = useState(false);
  const [editorStateLoaded, setEditorStateLoaded] = useState(false);
  const [monacoInstance, setMonacoInstance] = useState<any>(null);
  const [editorInstance, setEditorInstance] = useState<any>(null);

  // LSP integration
  const { isReady: lspReady, sendDidSave } = useLsp({
    projectId,
    filePath,
    languageId: language,
    monaco: monacoInstance,
    editor: editorInstance,
  });

  // Restore last open file on mount
  useEffect(() => {
    if (editorStateLoaded) return;
    setEditorStateLoaded(true);
    (async () => {
      try {
        const state = await window.sero.persistence.loadEditorState(projectId);
        if (state?.openFile) {
          setFilePath(state.openFile);
        }
      } catch { /* ignore */ }
    })();
  }, [projectId, editorStateLoaded]);

  // Persist open file when it changes
  useEffect(() => {
    if (editorStateLoaded && filePath !== null) {
      window.sero.persistence.saveEditorState(projectId, { openFile: filePath });
    }
  }, [filePath, projectId, editorStateLoaded]);

  // Load file content when filePath changes
  useEffect(() => {
    if (!filePath) return;

    async function loadFile() {
      try {
        const fileContent = await window.sero.container.readFile(projectId, filePath!);
        setContent(fileContent);
        setIsDirty(false);

        const ext = filePath!.split('.').pop() ?? '';
        // Monaco language IDs — note: tsx/jsx use typescript/javascript
        // (Monaco doesn't register 'typescriptreact'/'javascriptreact')
        const langMap: Record<string, string> = {
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
        setLanguage(langMap[ext] ?? 'plaintext');
      } catch (err) {
        setContent(`// Error loading file: ${err}`);
      }
    }
    loadFile();
  }, [projectId, filePath]);

  const handleChange = useCallback((value: string | undefined) => {
    if (value !== undefined) {
      setContent(value);
      setIsDirty(true);
    }
  }, []);

  const handleSave = useCallback(async () => {
    if (!filePath || !isDirty) return;
    try {
      await window.sero.container.writeFile(projectId, filePath, content);
      setIsDirty(false);
      sendDidSave();
    } catch (err) {
      console.error('Failed to save:', err);
    }
  }, [projectId, filePath, content, isDirty, sendDidSave]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    },
    [handleSave]
  );

  const handleFileSelect = useCallback((path: string) => {
    setFilePath(path);
  }, []);

  // Disable Monaco's built-in TS/JS diagnostics (LSP provides them instead)
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

  // Capture Monaco and editor instances for LSP hook
  const handleEditorMount = useCallback((editor: any, monaco: any) => {
    setMonacoInstance(monaco);
    setEditorInstance(editor);
  }, []);

  return (
    <div className="editor-panel" onKeyDown={handleKeyDown}>
      {/* File tree sidebar */}
      <div className="editor-sidebar">
        <div className="editor-sidebar-header">
          <span className="editor-sidebar-title">Files</span>
        </div>
        <FileTree
          projectId={projectId}
          activePath={filePath}
          onFileSelect={handleFileSelect}
        />
      </div>

      {/* Monaco editor */}
      <div className="editor-main">
        {filePath && (
          <div className="editor-tab-bar">
            <span className="editor-tab-active">
              {filePath.split('/').pop()}
              {isDirty && <span className="editor-tab-dirty"> ●</span>}
            </span>
          </div>
        )}
        <div className="editor-monaco">
          <Editor
            height="100%"
            language={language}
            path={filePath ?? undefined}
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
        </div>
      </div>
    </div>
  );
}
