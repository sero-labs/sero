import type {
  editor as MonacoEditor,
  IPosition,
  IRange,
} from 'monaco-editor';

export interface EditorPanelProps {
  workspaceId: string;
  tabs: string[];
  activeTab: string | null;
  onOpenTab: (path: string) => void;
  onCloseTab: (path: string) => void;
  onCloseOtherTabs: (path: string) => void;
  onCloseAllTabs: () => void;
  onReorderTabs: (paths: string[]) => void;
}

export interface EditorDocumentMonacoBridge {
  schedulePendingGoto(path: string | null): void;
  saveViewState(path: string | null): void;
  getCurrentModelContent(): string | null;
  disposeModel(path: string): void;
  clearEditorForPreview(path: string | null): void;
}

export type PendingGoto = {
  path: string;
  selection: IRange | IPosition;
};

const LANG_MAP: Record<string, string> = {
  ts: 'typescript',
  tsx: 'typescript',
  js: 'javascript',
  jsx: 'javascript',
  mts: 'typescript',
  cts: 'typescript',
  mjs: 'javascript',
  cjs: 'javascript',
  py: 'python',
  rs: 'rust',
  go: 'go',
  json: 'json',
  md: 'markdown',
  mdx: 'markdown',
  css: 'css',
  html: 'html',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'shell',
  bash: 'shell',
  toml: 'toml',
  sql: 'sql',
};

/** Navigate editor to a position or selection range (used for go-to-definition). */
export function applyGoto(
  editor: MonacoEditor.IStandaloneCodeEditor,
  selection: IRange | IPosition | null | undefined,
): void {
  if (!selection) return;
  if ('startLineNumber' in selection) {
    editor.setSelection(selection);
    editor.revealRangeInCenter(selection);
  } else {
    editor.setPosition(selection);
    editor.revealPositionInCenter(selection);
  }
  editor.focus();
}

export function getLanguage(filePath: string): string {
  const ext = filePath.split('.').pop()?.toLowerCase() ?? '';
  return LANG_MAP[ext] ?? 'plaintext';
}
