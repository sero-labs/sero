/**
 * React hook for LSP integration with Monaco editor.
 * Manages server lifecycle, Monaco provider registration, and document sync.
 *
 * Only active for containerized workspaces (LSP servers run inside containers).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useContainerStore } from '@/stores/container';
import type { editor, languages, IRange } from 'monaco-editor';
import type { LspCompletionSuggestion } from './lsp-conversions';
import {
  getLspServerLanguage, getLspLanguageIdFromPath, monacoToLspPos,
  convertCompletions, convertHover, convertDefinition, convertDiagnostics,
  LSP_LANGUAGES,
} from './lsp-conversions';

type Monaco = typeof import('monaco-editor');

// Module-level tracking: which language IDs have providers registered.
// Providers are registered once (Monaco doesn't support un-register), so
// they read uriRegistry at call time to route to the correct server.
const registeredLanguages = new Set<string>();

// Module-level URI → { workspaceId, language } routing registry.
// Entries are added/removed by each useLsp instance in Effect 2.
const uriRegistry = new Map<string, { workspaceId: string; language: string }>();

function toFileUri(containerPath: string): string {
  return `file://${containerPath}`;
}

/**
 * Register Monaco language providers (once per language ID).
 * Providers route requests via uriRegistry to the correct workspace/server.
 */
function ensureProvidersRegistered(monaco: Monaco, languageId: string): void {
  if (registeredLanguages.has(languageId)) return;
  registeredLanguages.add(languageId);

  // Completion provider
  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['.', '/', '"', "'", '`', '<', '@'],
    provideCompletionItems: async (
      model: editor.ITextModel,
      position,
      _ctx: languages.CompletionContext,
      token,
    ): Promise<languages.CompletionList> => {
      const route = uriRegistry.get(model.uri.toString());
      if (!route || token.isCancellationRequested) return { suggestions: [] };
      try {
        const result = await window.sero.lsp.request(route.workspaceId, route.language, 'textDocument/completion', {
          textDocument: { uri: toFileUri(model.uri.path) },
          position: monacoToLspPos(position.lineNumber, position.column),
        });
        if (token.isCancellationRequested) return { suggestions: [] };
        const word = model.getWordUntilPosition(position);
        const range: IRange = {
          startLineNumber: position.lineNumber, startColumn: word.startColumn,
          endLineNumber: position.lineNumber, endColumn: word.endColumn,
        };
        return convertCompletions(result, range, route);
      } catch { return { suggestions: [] }; }
    },
    resolveCompletionItem: async (
      item: languages.CompletionItem,
      token,
    ): Promise<languages.CompletionItem> => {
      const lspItem = item as LspCompletionSuggestion;
      if (!lspItem._lspItem || !lspItem._lspRoute || token.isCancellationRequested) return item;
      const { workspaceId, language } = lspItem._lspRoute;
      try {
        const resolved = await window.sero.lsp.request(
          workspaceId, language, 'completionItem/resolve', lspItem._lspItem,
        ) as Record<string, unknown> | null;
        if (token.isCancellationRequested || !resolved) return item;
        if (resolved.documentation) {
          item.documentation = typeof resolved.documentation === 'string'
            ? resolved.documentation
            : (resolved.documentation as { value?: string }).value
              ? { value: (resolved.documentation as { value: string }).value }
              : item.documentation;
        }
        if (resolved.detail) item.detail = resolved.detail as string;
        return item;
      } catch { return item; }
    },
  });

  // Hover provider
  monaco.languages.registerHoverProvider(languageId, {
    provideHover: async (
      model: editor.ITextModel,
      position,
      token,
    ): Promise<languages.Hover | null | undefined> => {
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
    provideDefinition: async (
      model: editor.ITextModel,
      position,
      token,
    ): Promise<languages.Definition | null> => {
      const route = uriRegistry.get(model.uri.toString());
      if (!route || token.isCancellationRequested) return null;
      try {
        const result = await window.sero.lsp.request(route.workspaceId, route.language, 'textDocument/definition', {
          textDocument: { uri: toFileUri(model.uri.path) },
          position: monacoToLspPos(position.lineNumber, position.column),
        });
        if (token.isCancellationRequested) return null;
        return convertDefinition(result).map((loc) => {
          // LSP returns file:// URIs; Monaco models use plain paths
          const path = loc.uri.replace(/^file:\/\//, '');
          return { uri: monaco.Uri.parse(path), range: loc.range };
        });
      } catch { return null; }
    },
  });
}

// ── Hook ──────────────────────────────────────────────────────

export interface UseLspOptions {
  workspaceId: string;
  filePath: string | null;
  languageId: string;
  monaco: Monaco | null;
  editor: editor.IStandaloneCodeEditor | null;
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
        for (const lid of LSP_LANGUAGES) {
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

  // sendDidSave callback
  const sendDidSave = useCallback(() => {
    const uri = openUriRef.current;
    if (!uri || !isReady || !serverLanguage) return;
    window.sero.lsp.notify(workspaceId, serverLanguage, 'textDocument/didSave', {
      textDocument: { uri },
    });
  }, [isReady, workspaceId, serverLanguage]);

  // Effect 4: Listen for diagnostics from the LSP server
  useEffect(() => {
    if (!monaco) return;
    const unsub = window.sero.lsp.onNotification((data) => {
      if (data.workspaceId !== workspaceId) return;
      const notification = data.notification;
      if (notification.method === 'textDocument/publishDiagnostics') {
        const params = notification.params as { uri: string; diagnostics: unknown[] };
        const uri = params.uri;
        const containerPath = uri.replace('file://', '');
        const models = monaco.editor.getModels();
        const model = models.find((m) => m.uri.path === containerPath);
        if (model) {
          monaco.editor.setModelMarkers(model, 'lsp', convertDiagnostics(params.diagnostics as never[]));
        }
      }
    });
    return unsub;
  }, [monaco, workspaceId]);

  // Effect 5: Clean up uriRegistry entries when server stops
  useEffect(() => {
    const unsub = window.sero.lsp.onServerStopped((data) => {
      if (data.workspaceId !== workspaceId) return;
      // Remove all uriRegistry entries that belong to this workspace
      for (const [uri, route] of uriRegistry) {
        if (route.workspaceId === workspaceId) uriRegistry.delete(uri);
      }
      serverLanguageRef.current = null;
      setIsReady(false);
    });
    return unsub;
  }, [workspaceId]);

  return { isReady, serverLanguage: serverLanguageRef.current, sendDidSave };
}
