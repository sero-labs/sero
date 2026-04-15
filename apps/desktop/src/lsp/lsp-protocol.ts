/**
 * Renderer-safe subset of LSP protocol shapes used by the Monaco bridge.
 *
 * Keep this focused on protocol contracts so conversion/runtime modules can
 * import canonical types without maintaining local shadow interfaces.
 */

export interface LspPosition {
  line: number;
  character: number;
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface LspMarkupContent {
  kind: string;
  value: string;
}

export interface LspLanguageString {
  value: string;
  language?: string;
}

export type LspDocumentation = string | LspMarkupContent | LspLanguageString;

export interface LspCompletionItem {
  label: string | { label: string };
  kind?: number;
  detail?: string;
  documentation?: LspDocumentation;
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: number;
  textEdit?: { range: LspRange; newText: string } | { newText: string };
  deprecated?: boolean;
  tags?: number[];
}

export interface LspCompletionList {
  isIncomplete: boolean;
  items: LspCompletionItem[];
}

export interface LspHoverContents {
  kind?: string;
  value?: string;
  language?: string;
}

export interface LspHover {
  contents: string | LspHoverContents | Array<string | LspHoverContents>;
  range?: LspRange;
}

export interface LspLocation {
  uri: string;
  range: LspRange;
}

export interface LspDiagnostic {
  range: LspRange;
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
  tags?: number[];
}

export interface PublishDiagnosticsParams {
  uri: string;
  diagnostics: LspDiagnostic[];
}

export interface LspNotification {
  method: string;
  params?: unknown;
}

export interface PublishDiagnosticsNotification {
  method: 'textDocument/publishDiagnostics';
  params: PublishDiagnosticsParams;
}

export interface LspNotificationEvent {
  workspaceId: string;
  language: string;
  notification: LspNotification;
}
