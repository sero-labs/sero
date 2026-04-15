import type {
  editor as MonacoEditor,
  IPosition,
  IRange,
} from 'monaco-editor';
import { getMonacoLanguageIdFromPath } from '@/lsp/language-routing';

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
  return getMonacoLanguageIdFromPath(filePath);
}
