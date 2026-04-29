import type * as MonacoNamespace from 'monaco-editor';
import type { IRange, editor, languages } from 'monaco-editor';
import type { LspCompletionSuggestion } from './lsp-conversions';
import {
  convertCompletions,
  convertDefinition,
  convertHover,
  monacoToLspPos,
} from './lsp-conversions';

export interface Monaco {
  Uri: Pick<typeof MonacoNamespace.Uri, 'parse'>;
  languages: Pick<
    typeof MonacoNamespace.languages,
    'registerCompletionItemProvider' | 'registerHoverProvider' | 'registerDefinitionProvider'
  >;
  editor: Pick<typeof MonacoNamespace.editor, 'getModels' | 'setModelMarkers'>;
}

export interface LspRoute {
  workspaceId: string;
  language: string;
}

// Module-level tracking: which language IDs have providers registered.
// Providers are registered once (Monaco doesn't support un-register), so
// they read uriRegistry at call time to route to the correct server.
const registeredLanguages = new Set<string>();

// Module-level URI → { workspaceId, language } routing registry.
// Entries are added/removed by each useLsp instance in document-sync.
const uriRegistry = new Map<string, LspRoute>();

export function toFileUri(containerPath: string): string {
  return `file://${containerPath}`;
}

export function setLspRoute(uri: string, route: LspRoute): void {
  uriRegistry.set(uri, route);
}

export function getLspRoute(uri: string): LspRoute | undefined {
  return uriRegistry.get(uri);
}

export function deleteLspRoute(uri: string): void {
  uriRegistry.delete(uri);
}

export function clearWorkspaceRoutes(workspaceId: string): void {
  for (const [uri, route] of uriRegistry) {
    if (route.workspaceId === workspaceId) {
      uriRegistry.delete(uri);
    }
  }
}

/**
 * Register Monaco language providers (once per language ID).
 * Providers route requests via uriRegistry to the correct workspace/server.
 */
export function ensureProvidersRegistered(monaco: Monaco, languageId: string): void {
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
      const route = getLspRoute(model.uri.toString());
      if (!route || token.isCancellationRequested) return { suggestions: [] };
      try {
        const result = await window.sero.lsp.request(route.workspaceId, route.language, 'textDocument/completion', {
          textDocument: { uri: toFileUri(model.uri.path) },
          position: monacoToLspPos(position.lineNumber, position.column),
        });
        if (token.isCancellationRequested) return { suggestions: [] };
        const word = model.getWordUntilPosition(position);
        const range: IRange = {
          startLineNumber: position.lineNumber,
          startColumn: word.startColumn,
          endLineNumber: position.lineNumber,
          endColumn: word.endColumn,
        };
        return convertCompletions(result, range, route);
      } catch {
        return { suggestions: [] };
      }
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
          workspaceId,
          language,
          'completionItem/resolve',
          lspItem._lspItem,
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
      } catch {
        return item;
      }
    },
  });

  // Hover provider
  monaco.languages.registerHoverProvider(languageId, {
    provideHover: async (
      model: editor.ITextModel,
      position,
      token,
    ): Promise<languages.Hover | null | undefined> => {
      const route = getLspRoute(model.uri.toString());
      if (!route || token.isCancellationRequested) return null;
      try {
        const result = await window.sero.lsp.request(route.workspaceId, route.language, 'textDocument/hover', {
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
    provideDefinition: async (
      model: editor.ITextModel,
      position,
      token,
    ): Promise<languages.Definition | null> => {
      const route = getLspRoute(model.uri.toString());
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
      } catch {
        return null;
      }
    },
  });
}
