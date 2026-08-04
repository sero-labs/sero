import { useCallback, useRef, useState } from 'react';
import * as monacoApi from 'monaco-editor';
import type { editor as MonacoEditor } from 'monaco-editor';
import { applyGoto, type PendingGoto } from './editor-panel-shared';
import { registerCustomEditorThemes } from './monaco-themes';

export function useEditorMonacoState() {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof monacoApi | null>(null);
  const pendingGotoRef = useRef<PendingGoto | null>(null);
  const viewStateMapRef = useRef<Map<string, MonacoEditor.ICodeEditorViewState | null>>(
    new Map(),
  );
  const [monacoInstance, setMonacoInstance] = useState<typeof monacoApi | null>(null);
  const [editorInstance, setEditorInstance] = useState<MonacoEditor.IStandaloneCodeEditor | null>(null);

  const schedulePendingGoto = useCallback((path: string | null) => {
    if (!path) return;
    const pending = pendingGotoRef.current;
    if (!pending || pending.path !== path) return;
    pendingGotoRef.current = null;
    requestAnimationFrame(() => {
      const editor = editorRef.current;
      if (editor) {
        applyGoto(editor, pending.selection);
      }
    });
  }, []);

  const saveViewState = useCallback((path: string | null) => {
    if (!path || !editorRef.current) return;
    viewStateMapRef.current.set(path, editorRef.current.saveViewState());
  }, []);

  const getCurrentModelContent = useCallback((): string | null => {
    const model = editorRef.current?.getModel();
    return model?.getValue() ?? null;
  }, []);

  const disposeModel = useCallback((path: string) => {
    viewStateMapRef.current.delete(path);
    if (!monacoRef.current) return;
    const uri = monacoRef.current.Uri.parse(path);
    monacoRef.current.editor.getModel(uri)?.dispose();
  }, []);

  const clearEditorForPreview = useCallback((path: string | null) => {
    if (path && editorRef.current) {
      viewStateMapRef.current.set(path, editorRef.current.saveViewState());
    }
    editorRef.current = null;
    setEditorInstance(null);
  }, []);

  const handleBeforeMount = useCallback((monaco: typeof monacoApi) => {
    // Monaco moved the typescript contribution to the top level in 0.55;
    // monaco.languages.typescript is now an empty deprecation stub.
    monaco.typescript?.typescriptDefaults?.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });
    monaco.typescript?.javascriptDefaults?.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: true,
    });
    registerCustomEditorThemes(monaco);
  }, []);

  const handleEditorMount = useCallback(
    (
      editor: MonacoEditor.IStandaloneCodeEditor,
      monaco: typeof monacoApi,
    ) => {
      editorRef.current = editor;
      monacoRef.current = monaco;
      setMonacoInstance(monaco);
      setEditorInstance(editor);

      editor.onDidChangeModel(() => {
        const model = editor.getModel();
        if (!model) return;
        const viewState = viewStateMapRef.current.get(model.uri.path);
        // Defer until after Monaco finishes its model-change cycle and the
        // browser has had a chance to paint the new model content.
        if (viewState) {
          requestAnimationFrame(() => {
            editor.restoreViewState(viewState);
            editor.focus();
          });
        }
      });

      const currentModel = editor.getModel();
      if (!currentModel) return;
      const viewState = viewStateMapRef.current.get(currentModel.uri.path);
      if (viewState) {
        requestAnimationFrame(() => {
          editor.restoreViewState(viewState);
          editor.focus();
        });
      }
    },
    [],
  );

  return {
    editorRef,
    monacoInstance,
    editorInstance,
    pendingGotoRef,
    schedulePendingGoto,
    saveViewState,
    getCurrentModelContent,
    disposeModel,
    clearEditorForPreview,
    handleBeforeMount,
    handleEditorMount,
  };
}
