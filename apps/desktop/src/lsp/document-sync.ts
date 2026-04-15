import { useCallback, useEffect, useRef } from 'react';
import type { editor } from 'monaco-editor';
import { getLspLanguageIdFromPath } from './language-routing';
import {
  deleteLspRoute,
  setLspRoute,
  toFileUri,
  type Monaco,
} from './provider-registry';

export type LspEditor = Pick<
  editor.IStandaloneCodeEditor,
  'getModel' | 'onDidChangeModelContent'
>;

interface UseLspDocumentSyncOptions {
  workspaceId: string;
  filePath: string | null;
  languageId: string;
  monaco: Monaco | null;
  editor: LspEditor | null;
  isReady: boolean;
  serverLanguage: string | null;
}

interface UseLspDocumentSyncResult {
  sendDidSave: () => void;
}

export function useLspDocumentSync({
  workspaceId,
  filePath,
  languageId,
  monaco,
  editor,
  isReady,
  serverLanguage,
}: UseLspDocumentSyncOptions): UseLspDocumentSyncResult {
  const openUriRef = useRef<string | null>(null);
  const prevModelUriRef = useRef<string | null>(null);
  const versionRef = useRef(new Map<string, number>());

  useEffect(() => {
    if (!isReady || !filePath || !editor || !monaco || !serverLanguage) return;
    const model = editor.getModel();
    if (!model) return;

    const monacoUri = model.uri.toString();
    const fileUriStr = toFileUri(filePath);

    // Close previous document if different
    const prevFileUri = openUriRef.current;
    if (prevFileUri && prevFileUri !== fileUriStr) {
      if (prevModelUriRef.current) deleteLspRoute(prevModelUriRef.current);
      window.sero.lsp.notify(workspaceId, serverLanguage, 'textDocument/didClose', {
        textDocument: { uri: prevFileUri },
      });
    }

    setLspRoute(monacoUri, { workspaceId, language: serverLanguage });
    prevModelUriRef.current = monacoUri;

    const version = 1;
    versionRef.current.set(fileUriStr, version);
    openUriRef.current = fileUriStr;

    const lspLangId = getLspLanguageIdFromPath(filePath);
    window.sero.lsp.notify(workspaceId, serverLanguage, 'textDocument/didOpen', {
      textDocument: { uri: fileUriStr, languageId: lspLangId, version, text: model.getValue() },
    });

    return () => {
      const uri = openUriRef.current;
      if (uri) {
        if (prevModelUriRef.current) deleteLspRoute(prevModelUriRef.current);
        try {
          window.sero.lsp.notify(workspaceId, serverLanguage, 'textDocument/didClose', {
            textDocument: { uri },
          });
        } catch {
          /* unmounting */
        }
        openUriRef.current = null;
        prevModelUriRef.current = null;
      }
    };
  }, [isReady, filePath, editor, monaco, workspaceId, languageId, serverLanguage]);

  useEffect(() => {
    if (!isReady || !editor || !serverLanguage) return;
    const disposable = editor.onDidChangeModelContent(() => {
      const uri = openUriRef.current;
      if (!uri) return;
      const model = editor.getModel();
      if (!model) return;
      const currentVersion = (versionRef.current.get(uri) ?? 1) + 1;
      versionRef.current.set(uri, currentVersion);
      window.sero.lsp.notify(workspaceId, serverLanguage, 'textDocument/didChange', {
        textDocument: { uri, version: currentVersion },
        contentChanges: [{ text: model.getValue() }],
      });
    });
    return () => disposable.dispose();
  }, [isReady, editor, workspaceId, serverLanguage]);

  const sendDidSave = useCallback(() => {
    const uri = openUriRef.current;
    if (!uri || !isReady || !serverLanguage) return;
    window.sero.lsp.notify(workspaceId, serverLanguage, 'textDocument/didSave', {
      textDocument: { uri },
    });
  }, [isReady, workspaceId, serverLanguage]);

  return { sendDidSave };
}
