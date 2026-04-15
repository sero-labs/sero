// @vitest-environment jsdom

import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRoot, type Root } from 'react-dom/client';
import type { editor } from 'monaco-editor';
import { useContainerStore } from '@/stores/container';
import { LSP_LANGUAGES } from './lsp-conversions';
import type { LspEditor } from './document-sync';
import { useLsp, type UseLspResult } from './use-lsp';
import type { Monaco } from './provider-registry';

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const initialContainerState = useContainerStore.getState();
const workspaceId = 'workspace-1';
const filePath = '/workspace/src/example.ts';

interface HarnessProps {
  monaco: Monaco;
  editor: LspEditor;
  onResult: (result: UseLspResult) => void;
}

interface LspNotificationEvent {
  workspaceId: string;
  language: string;
  notification: { method: string; params: unknown };
}

function Harness({ monaco, editor, onResult }: HarnessProps) {
  const result = useLsp({
    workspaceId,
    filePath,
    languageId: 'typescript',
    monaco,
    editor,
  });
  onResult(result);
  return null;
}

describe('useLsp', () => {
  let container: HTMLDivElement;
  let root: Root | null = null;
  let modelValue = 'const count = 1;';
  let contentChangeListener: (() => void) | null = null;
  let notificationListener: ((data: LspNotificationEvent) => void) | null = null;

  const start = vi.fn(async () => ({ capabilities: {}, language: 'typescript' }));
  const notify = vi.fn<(workspaceId: string, language: string, method: string, params?: unknown) => void>();
  const onNotification = vi.fn((callback: (data: LspNotificationEvent) => void) => {
    notificationListener = callback;
    return () => {
      if (notificationListener === callback) {
        notificationListener = null;
      }
    };
  });
  const onServerStopped = vi.fn(() => () => undefined);

  beforeEach(() => {
    start.mockClear();
    notify.mockClear();
    onNotification.mockClear();
    onServerStopped.mockClear();
    modelValue = 'const count = 1;';
    contentChangeListener = null;
    notificationListener = null;

    useContainerStore.setState(initialContainerState, true);
    useContainerStore.setState({
      containers: {
        [workspaceId]: { status: 'running' },
      },
    });

    const seroMock: Partial<typeof window.sero> = {
      lsp: {
        start,
        stop: vi.fn(async () => undefined),
        request: vi.fn(async () => null),
        notify,
        hasServer: vi.fn(async () => true),
        onNotification,
        onServerStopped,
      },
    };

    Object.defineProperty(window, 'sero', {
      configurable: true,
      writable: true,
      value: seroMock as typeof window.sero,
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    if (root) {
      await act(async () => {
        root?.unmount();
      });
    }
    root = null;
    container.remove();
    Reflect.deleteProperty(window, 'sero');
    useContainerStore.setState(initialContainerState, true);
  });

  it('starts the server once and wires open/change/save/diagnostic lifecycle through the split modules', async () => {
    const registerCompletionItemProvider = vi.fn();
    const registerHoverProvider = vi.fn();
    const registerDefinitionProvider = vi.fn();
    const setModelMarkers = vi.fn();

    const modelBase: Partial<editor.ITextModel> = {
      uri: {
        path: filePath,
        toString: () => 'inmemory://model/example.ts',
      } as editor.ITextModel['uri'],
      getValue: () => modelValue,
    };
    const model = modelBase as editor.ITextModel;

    const editorBase: Partial<LspEditor> = {
      getModel: () => model,
      onDidChangeModelContent: (listener) => {
        contentChangeListener = () => {
          listener({} as editor.IModelContentChangedEvent);
        };
        return { dispose: vi.fn() };
      },
    };
    const editor = editorBase as LspEditor;

    const monacoBase: Partial<Monaco> = {
      Uri: {
        parse: (value: string) => ({ path: value }),
      } as Monaco['Uri'],
      languages: {
        registerCompletionItemProvider,
        registerHoverProvider,
        registerDefinitionProvider,
      } as Monaco['languages'],
      editor: {
        getModels: () => [model],
        setModelMarkers,
      } as Monaco['editor'],
    };
    const monaco = monacoBase as Monaco;

    let latestResult: UseLspResult | null = null;

    await act(async () => {
      root?.render(
        <Harness
          monaco={monaco}
          editor={editor}
          onResult={(result) => {
            latestResult = result;
          }}
        />,
      );
    });

    await vi.waitFor(() => {
      expect(start).toHaveBeenCalledWith(workspaceId, 'typescript');
      expect(latestResult?.isReady).toBe(true);
      expect(latestResult?.serverLanguage).toBe('typescript');
    });

    expect(registerCompletionItemProvider).toHaveBeenCalledTimes(LSP_LANGUAGES.length);
    expect(registerHoverProvider).toHaveBeenCalledTimes(LSP_LANGUAGES.length);
    expect(registerDefinitionProvider).toHaveBeenCalledTimes(LSP_LANGUAGES.length);
    expect(notify).toHaveBeenCalledWith(workspaceId, 'typescript', 'textDocument/didOpen', {
      textDocument: {
        uri: 'file:///workspace/src/example.ts',
        languageId: 'typescript',
        version: 1,
        text: 'const count = 1;',
      },
    });

    modelValue = 'const count = 2;';
    await act(async () => {
      contentChangeListener?.();
    });

    expect(notify).toHaveBeenCalledWith(workspaceId, 'typescript', 'textDocument/didChange', {
      textDocument: {
        uri: 'file:///workspace/src/example.ts',
        version: 2,
      },
      contentChanges: [{ text: 'const count = 2;' }],
    });

    await act(async () => {
      latestResult?.sendDidSave();
    });

    expect(notify).toHaveBeenCalledWith(workspaceId, 'typescript', 'textDocument/didSave', {
      textDocument: {
        uri: 'file:///workspace/src/example.ts',
      },
    });

    await act(async () => {
      notificationListener?.({
        workspaceId,
        language: 'typescript',
        notification: {
          method: 'textDocument/publishDiagnostics',
          params: {
            uri: 'file:///workspace/src/example.ts',
            diagnostics: [
              {
                range: {
                  start: { line: 0, character: 0 },
                  end: { line: 0, character: 5 },
                },
                severity: 1,
                message: 'Broken',
              },
            ],
          },
        },
      });
    });

    expect(setModelMarkers).toHaveBeenCalledWith(model, 'lsp', [
      {
        severity: 8,
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 6,
        message: 'Broken',
        source: 'lsp',
        code: undefined,
        tags: undefined,
      },
    ]);

    await act(async () => {
      root?.unmount();
    });

    expect(notify).toHaveBeenLastCalledWith(workspaceId, 'typescript', 'textDocument/didClose', {
      textDocument: {
        uri: 'file:///workspace/src/example.ts',
      },
    });
  });
});
