import React, { useCallback, useEffect, useState } from 'react';
import Editor from '@monaco-editor/react';
import { FileTree } from './FileTree';
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
        const langMap: Record<string, string> = {
          ts: 'typescript', tsx: 'typescriptreact',
          js: 'javascript', jsx: 'javascriptreact',
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
    } catch (err) {
      console.error('Failed to save:', err);
    }
  }, [projectId, filePath, content, isDirty]);

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
            value={content}
            onChange={handleChange}
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
