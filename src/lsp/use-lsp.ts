/**
 * React hook for LSP integration with Monaco editor.
 * Manages server lifecycle, Monaco provider registration, and document sync.
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  isLspSupported, getLspServerLanguage, getLspLanguageIdFromPath, monacoToLspPos,
  convertCompletions, convertHover, convertDefinition, convertDiagnostics,
} from './lsp-conversions';

type MonacoInstance = any;
type EditorInstance = any;

// Module-level tracking: which language IDs have providers registered
const registeredLanguages = new Set<string>();

// Module-level URI → { projectId, language } routing registry
const uriRegistry = new Map<string, { projectId: string; language: string }>();

/** Build file URI from container path */
function toFileUri(containerPath: string): string {
  return `file://${containerPath}`;
}

/**
 * Register Monaco language providers for LSP-supported languages.
 * Called once per language ID — providers are global and route via uriRegistry.
 */
function ensureProvidersRegistered(monaco: MonacoInstance, languageId: string): void {
  if (registeredLanguages.has(languageId)) return;
  registeredLanguages.add(languageId);

  // Completion provider
  monaco.languages.registerCompletionItemProvider(languageId, {
    triggerCharacters: ['.', '/', '"', "'", '`', '<', '@'],
    provideCompletionItems: async (model: any, position: any, _context: any, token: any) => {
      const route = uriRegistry.get(model.uri.toString());
      if (!route || token.isCancellationRequested) return { suggestions: [] };

      try {
        const result = await window.sero.lsp.request(route.projectId, route.language, 'textDocument/completion', {
          textDocument: { uri: toFileUri(model.uri.path) },
          position: monacoToLspPos(position.lineNumber, position.column),
        });
        if (token.isCancellationRequested) return { suggestions: [] };

        const word = model.getWordUntilPosition(position);
        const range = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn,
        };
        return convertCompletions(result, range);
      } catch {
        return { suggestions: [] };
      }
    },
    resolveCompletionItem: async (item: any, token: any) => {
      if (!item._lspItem || token.isCancellationRequested) return item;
      const route = uriRegistry.values().next().value;
      if (!route) return item;

      try {
        const resolved = await window.sero.lsp.request(route.projectId, route.language, 'completionItem/resolve', item._lspItem);
        if (token.isCancellationRequested) return item;

        const r = resolved as any;
        if (r?.documentation) {
          item.documentation = typeof r.documentation === 'string'
            ? r.documentation
            : r.documentation.value ? { value: r.documentation.value } : r.documentation;
        }
        if (r?.detail) item.detail = r.detail;
        return item;
      } catch {
        return item;
      }
    },
  });

  // Hover provider
  monaco.languages.registerHoverProvider(languageId, {
    provideHover: async (model: any, position: any, token: any) => {
      const route = uriRegistry.get(model.uri.toString());
      if (!route || token.isCancellationRequested) return null;

      try {
        const result = await window.sero.lsp.request(route.projectId, route.language, 'textDocument/hover', {
          textDocument: { uri: toFileUri(model.uri.path) },
          position: monacoToLspPos(position.lineNumber, position.column),
        });
        if (token.isCancellationRequested) return null;
        return convertHover(result);
      } catch {
        return null;
      }
    },
  });

  // Definition provider
  monaco.languages.registerDefinitionProvider(languageId, {
    provideDefinition: async (model: any, position: any, token: any) => {
      const route = uriRegistry.get(model.uri.toString());
      if (!route || token.isCancellationRequested) return null;

      try {
        const result = await window.sero.lsp.request(route.projectId, route.language, 'textDocument/definition', {
          textDocument: { uri: toFileUri(model.uri.path) },
          position: monacoToLspPos(position.lineNumber, position.column),
        });
        if (token.isCancellationRequested) return null;

        const locations = convertDefinition(result);
        // Convert file:// URIs to Monaco URIs
        return locations.map((loc: any) => ({
          ...loc,
          uri: monaco.Uri.parse(loc.uri),
        }));
      } catch {
        return null;
      }
    },
  });
}

export interface UseLspOptions {
  projectId: string;
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

export function useLsp({ projectId, filePath, languageId, monaco, editor }: UseLspOptions): UseLspResult {
  const [isReady, setIsReady] = useState(false);
  const serverLanguageRef = useRef<string | null>(null);
  const openUriRef = useRef<string | null>(null);
  const versionRef = useRef(new Map<string, number>());
  const startingRef = useRef(false);

  const serverLanguage = getLspServerLanguage(languageId);

  // Effect 1: Start the LSP server when we have a supported language
  useEffect(() => {
    if (!monaco || !serverLanguage || startingRef.current) return;
    if (serverLanguageRef.current === serverLanguage) return; // Already started for this language

    let cancelled = false;
    startingRef.current = true;

    (async () => {
      try {
        const { language } = await window.sero.lsp.start(projectId, languageId);
        if (cancelled) return;

        serverLanguageRef.current = language;
        setIsReady(true);

        // Register providers for all supported language IDs
        const langIds = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'];
        for (const lid of langIds) {
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
  }, [projectId, languageId, monaco, serverLanguage]);

  // Effect 2: Handle document open/close when filePath changes
  useEffect(() => {
    if (!isReady || !filePath || !editor || !monaco || !serverLanguage) return;

    const model = editor.getModel();
    if (!model) return;

    const monacoUri = model.uri.toString();
    const fileUriStr = toFileUri(filePath);

    // Close previous document if different
    const prevUri = openUriRef.current;
    if (prevUri && prevUri !== fileUriStr) {
      uriRegistry.delete(prevUri.replace('file://', '').replace(/^/, 'file://'));
      // Find the Monaco URI for the previous file to clean up registry
      for (const [mUri, route] of uriRegistry) {
        if (route.projectId === projectId) {
          uriRegistry.delete(mUri);
          break;
        }
      }
      window.sero.lsp.notify(projectId, serverLanguage, 'textDocument/didClose', {
        textDocument: { uri: prevUri },
      });
    }

    // Register in URI routing registry
    uriRegistry.set(monacoUri, { projectId, language: serverLanguage });

    // Send didOpen
    const version = 1;
    versionRef.current.set(fileUriStr, version);
    openUriRef.current = fileUriStr;

    // Use file-path-derived language ID for LSP (e.g. 'typescriptreact' for .tsx)
    // Monaco uses 'typescript' for both .ts/.tsx but LSP needs the specific ID
    const lspLangId = getLspLanguageIdFromPath(filePath);

    window.sero.lsp.notify(projectId, serverLanguage, 'textDocument/didOpen', {
      textDocument: {
        uri: fileUriStr,
        languageId: lspLangId,
        version,
        text: model.getValue(),
      },
    });

    return () => {
      // On cleanup, close the document
      const uri = openUriRef.current;
      if (uri) {
        uriRegistry.delete(monacoUri);
        try {
          window.sero.lsp.notify(projectId, serverLanguage, 'textDocument/didClose', {
            textDocument: { uri },
          });
        } catch { /* component unmounting */ }
        openUriRef.current = null;
      }
    };
  }, [isReady, filePath, editor, monaco, projectId, languageId, serverLanguage]);

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

      window.sero.lsp.notify(projectId, serverLanguage, 'textDocument/didChange', {
        textDocument: { uri, version: currentVersion },
        contentChanges: [{ text: model.getValue() }],
      });
    });

    return () => disposable.dispose();
  }, [isReady, editor, projectId, serverLanguage]);

  // Effect 4: Send didSave on save
  const sendDidSave = useCallback(() => {
    const uri = openUriRef.current;
    if (!uri || !isReady || !serverLanguage) return;

    window.sero.lsp.notify(projectId, serverLanguage, 'textDocument/didSave', {
      textDocument: { uri },
    });
  }, [isReady, projectId, serverLanguage]);

  // Effect 5: Listen for diagnostics from the LSP server
  useEffect(() => {
    if (!monaco) return;

    const unsub = window.sero.lsp.onNotification((data) => {
      if (data.projectId !== projectId) return;
      const notification = data.notification;

      if (notification.method === 'textDocument/publishDiagnostics') {
        const params = notification.params as any;
        const uri = params.uri as string;
        const diagnostics = params.diagnostics ?? [];

        // Find the Monaco model with this URI
        const containerPath = uri.replace('file://', '');
        const models = monaco.editor.getModels();
        const model = models.find((m: any) => m.uri.path === containerPath);

        if (model) {
          const markers = convertDiagnostics(diagnostics);
          monaco.editor.setModelMarkers(model, 'lsp', markers);
        }
      }
    });

    return unsub;
  }, [monaco, projectId]);

  return {
    isReady,
    serverLanguage: serverLanguageRef.current,
    sendDidSave,
  };
}
