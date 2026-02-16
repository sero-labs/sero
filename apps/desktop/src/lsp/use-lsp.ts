/**
 * React hook for LSP integration with Monaco editor.
 * Manages server lifecycle, Monaco provider registration, and document sync.
 *
 * Only active for containerized workspaces (LSP servers run inside containers).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useContainerStore } from '@/stores/container';
import {
  getLspServerLanguage, getLspLanguageIdFromPath, monacoToLspPos,
  convertCompletions, convertHover, convertDefinition, convertDiagnostics,
} from './lsp-conversions';

type MonacoInstance = any;
type EditorInstance = any;

// Module-level tracking: which language IDs have providers registered
const registeredLanguages = new Set<string>();

// Module-level URI → { workspaceId, language } routing registry
const uriRegistry = new Map<string, { workspaceId: string; language: string }>();

function toFileUri(containerPath: string): string {
  return `file://${containerPath}`;
}

/**
 * Register Monaco language providers (once per language ID).
 * Providers route requests via uriRegistry to the correct workspace/server.
 */
function ensureProvidersRegistered(monaco: MonacoInstance, languageId: string): void {
  if (registeredLanguages.has(languageId)) return;
  registeredLanguages.add(languageId);

  // Completion provider
  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['.', '/', '"', "'", '`', '<', '@'],
    provideCompletionItems: async (model: any, position: any, _ctx: any, token: any) => {
      const route = uriRegistry.get(model.uri.toString());
      if (!route || token.isCancellationRequested) return { suggestions: [] };
      try {
        const result = await window.sero.lsp.request(route.workspaceId, route.language, 'textDocument/completion', {
          textDocument: { uri: toFileUri(model.uri.path) },
          position: monacoToLspPos(position.lineNumber, position.column),
        });
        if (token.isCancellationRequested) return { suggestions: [] };
        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber, startColumn: word.startColumn,
          endLineNumber: position.lineNumber, endColumn: word.endColumn,
        };
        return convertCompletions(result, range);
      } catch { return { suggestions: [] }; }
    },
    resolveCompletionItem: async (item: any, token: any) => {
      if (!item._lspItem || token.isCancellationRequested) return item;
      const route = uriRegistry.values().next().value;
      if (!route) return item;
      try {
        const resolved = await window.sero.lsp.request(route.workspaceId, route.language, 'completionItem/resolve', item._lspItem) as any;
        if (token.isCancellationRequested) return item;
        if (resolved?.documentation) {
          item.documentation = typeof resolved.documentation === 'string'
            ? resolved.documentation
            : resolved.documentation.value ? { value: resolved.documentation.value } : resolved.documentation;
        }
        if (resolved?.detail) item.detail = resolved.detail;
        return item;
      } catch { return item; }
    },
  });

  // Hover provider
  monaco.languages.registerHoverProvider(languageId, {
    provideHover: async (model: any, position: any, token: any) => {
      const route = uriRegistry.get(model.uri.toString());
      if (!route || token.isCancellationRequested) return null;
      try {
        const result = await window.sero.lsp.request(route.workspaceId, route.language, 'textDocument/hover', {
          textDocument: { uri: toFileUri(model.uri.path) },
          position: monacoToLspPos(position.lineNumber, position.column),
        });
        if (token.isCancellationRequested) return null;
        return convertHover(result);
      } catch { return null; }
    },
  });

  // Definition provider
  monaco.languages.registerDefinitionProvider(languageId, {
    provideDefinition: async (model: any, position: any, token: any) => {
      const route = uriRegistry.get(model.uri.toString());
      if (!route || token.isCancellationRequested) return null;
      try {
        const result = await window.sero.lsp.request(route.workspaceId, route.language, 'textDocument/definition', {
          textDocument: { uri: toFileUri(model.uri.path) },
          position: monacoToLspPos(position.lineNumber, position.column),
        });
        if (token.isCancellationRequested) return null;
        return convertDefinition(result).map((loc: any) => ({
          ...loc, uri: monaco.Uri.parse(loc.uri),
        }));
      } catch { return null; }
    },
  });
}

export interface UseLspOptions {
  workspaceId: string;
  filePath: string | null;
  languageId: string;
  monaco: MonacoInstance | null;
  editor: EditorInstance | null;
}

export interface UseLspResult {
  isReady: boolean;
  serverLanguage: string | null;
  sendDidSave: () => void;
}

export function useLsp({ workspaceId, filePath, languageId, monaco, editor }: UseLspOptions): UseLspResult {
  const [isReady, setIsReady] = useState(false);
  const serverLanguageRef = useRef<string | null>(null);
  const openUriRef = useRef<string | null>(null);
  const prevModelUriRef = useRef<string | null>(null);
  const versionRef = useRef(new Map<string, number>());
  const startingRef = useRef(false);

  const containerStatus = useContainerStore((s) => s.containers[workspaceId]?.status ?? 'none');
  const serverLanguage = getLspServerLanguage(languageId);

  // Effect 1: Start LSP server when container is running and language is supported
  useEffect(() => {
    if (!monaco || !serverLanguage || startingRef.current) return;
    if (containerStatus !== 'running') return;
    if (serverLanguageRef.current === serverLanguage) return;

    let cancelled = false;
    startingRef.current = true;

    (async () => {
      try {
        const { language } = await window.sero.lsp.start(workspaceId, languageId);
        if (cancelled) return;
        serverLanguageRef.current = language;
        setIsReady(true);
        for (const lid of ['typescript', 'typescriptreact', 'javascript', 'javascriptreact']) {
          ensureProvidersRegistered(monaco, lid);
        }
      } catch (err) {
        console.warn('[lsp] Failed to start server:', err);
        if (!cancelled) setIsReady(false);
      } finally {
        startingRef.current = false;
      }
    })();

    return () => { cancelled = true; };
  }, [workspaceId, languageId, monaco, serverLanguage, containerStatus]);

  // Effect 2: Handle document open/close when filePath changes
  useEffect(() => {
    if (!isReady || !filePath || !editor || !monaco || !serverLanguage) return;
    const model = editor.getModel();
    if (!model) return;

    const monacoUri = model.uri.toString();
    const fileUriStr = toFileUri(filePath);

    // Close previous document if different
    const prevFileUri = openUriRef.current;
    if (prevFileUri && prevFileUri !== fileUriStr) {
      if (prevModelUriRef.current) uriRegistry.delete(prevModelUriRef.current);
      window.sero.lsp.notify(workspaceId, serverLanguage, 'textDocument/didClose', {
        textDocument: { uri: prevFileUri },
      });
    }

    uriRegistry.set(monacoUri, { workspaceId, language: serverLanguage });
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
        if (prevModelUriRef.current) uriRegistry.delete(prevModelUriRef.current);
        try {
          window.sero.lsp.notify(workspaceId, serverLanguage, 'textDocument/didClose', {
            textDocument: { uri },
          });
        } catch { /* unmounting */ }
        openUriRef.current = null;
        prevModelUriRef.current = null;
      }
    };
  }, [isReady, filePath, editor, monaco, workspaceId, languageId, serverLanguage]);

  // Effect 3: Listen for content changes and send didChange
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

  // Effect 4: sendDidSave callback
  const sendDidSave = useCallback(() => {
    const uri = openUriRef.current;
    if (!uri || !isReady || !serverLanguage) return;
    window.sero.lsp.notify(workspaceId, serverLanguage, 'textDocument/didSave', {
      textDocument: { uri },
    });
  }, [isReady, workspaceId, serverLanguage]);

  // Effect 5: Listen for diagnostics from the LSP server
  useEffect(() => {
    if (!monaco) return;
    const unsub = window.sero.lsp.onNotification((data) => {
      if (data.workspaceId !== workspaceId) return;
      const notification = data.notification;
      if (notification.method === 'textDocument/publishDiagnostics') {
        const params = notification.params as any;
        const uri = params.uri as string;
        const containerPath = uri.replace('file://', '');
        const models = monaco.editor.getModels();
        const model = models.find((m: any) => m.uri.path === containerPath);
        if (model) {
          monaco.editor.setModelMarkers(model, 'lsp', convertDiagnostics(params.diagnostics ?? []));
        }
      }
    });
    return unsub;
  }, [monaco, workspaceId]);

  return { isReady, serverLanguage: serverLanguageRef.current, sendDidSave };
}
