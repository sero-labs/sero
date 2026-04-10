/**
 * Conversion utilities between LSP protocol types and Monaco editor types.
 *
 * Uses type imports from `monaco-editor` for compile-time safety without
 * pulling in Monaco's runtime. LSP protocol types use inline shapes since
 * `vscode-languageserver-types` is not a project dependency.
 */

import type { languages, MarkerSeverity as MarkerSeverityEnum, MarkerTag, editor, IRange } from 'monaco-editor';

// ── LSP protocol shapes (inline, no runtime dep) ──────────────

interface LspRange {
  start: { line: number; character: number };
  end: { line: number; character: number };
}

interface LspCompletionItem {
  label: string | { label: string };
  kind?: number;
  detail?: string;
  documentation?: string | { kind: string; value: string } | { value: string; language?: string };
  sortText?: string;
  filterText?: string;
  insertText?: string;
  insertTextFormat?: number;
  textEdit?: { range: LspRange; newText: string } | { newText: string };
  deprecated?: boolean;
  tags?: number[];
}

interface LspCompletionList {
  isIncomplete: boolean;
  items: LspCompletionItem[];
}

interface LspHoverContents {
  kind?: string;
  value?: string;
  language?: string;
}

interface LspHover {
  contents: string | LspHoverContents | (string | LspHoverContents)[];
  range?: LspRange;
}

interface LspLocation {
  uri: string;
  range: LspRange;
}

interface LspDiagnostic {
  range: LspRange;
  severity?: number;
  code?: string | number;
  source?: string;
  message: string;
  tags?: number[];
}

// ── LSP → Monaco kind mapping ─────────────────────────────────

/** LSP CompletionItemKind (1-based) → Monaco CompletionItemKind (0-based). */
const LSP_TO_MONACO_KIND: Record<number, languages.CompletionItemKind> = {
  1: 18 /* Text */, 2: 0 /* Method */, 3: 1 /* Function */,
  4: 2 /* Constructor */, 5: 3 /* Field */, 6: 4 /* Variable */,
  7: 5 /* Class */, 8: 7 /* Interface */, 9: 8 /* Module */,
  10: 9 /* Property */, 11: 12 /* Unit */, 12: 13 /* Value */,
  13: 15 /* Enum */, 14: 17 /* Keyword */, 15: 27 /* Snippet */,
  16: 19 /* Color */, 17: 20 /* File */, 18: 21 /* Reference */,
  19: 23 /* Folder */, 20: 16 /* EnumMember */, 21: 14 /* Constant */,
  22: 6 /* Struct */, 23: 10 /* Event */, 24: 11 /* Operator */,
  25: 24 /* TypeParameter */,
};

/** LSP DiagnosticSeverity (1-based) → Monaco MarkerSeverity. */
const LSP_TO_MONACO_SEVERITY: Record<number, MarkerSeverityEnum> = {
  1: 8 /* Error */, 2: 4 /* Warning */, 3: 2 /* Info */, 4: 1 /* Hint */,
};

// ── Converters ────────────────────────────────────────────────

/** Convert Monaco position (1-indexed) to LSP position (0-indexed). */
export function monacoToLspPos(lineNumber: number, column: number) {
  return { line: lineNumber - 1, character: column - 1 };
}

/** Convert LSP range to Monaco IRange. */
function lspRangeToMonaco(range: LspRange): IRange {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

/** Route info attached to each completion suggestion for `resolveCompletionItem`. */
interface LspRoute { workspaceId: string; language: string }

/** Extended CompletionItem with internal LSP data for resolve round-trips. */
export type LspCompletionSuggestion = languages.CompletionItem & {
  _lspItem: LspCompletionItem;
  _lspRoute: LspRoute;
};

/** Convert LSP completion result to Monaco completion list. */
export function convertCompletions(
  result: unknown,
  range: IRange,
  route: LspRoute,
): languages.CompletionList {
  if (!result) return { suggestions: [], incomplete: false };

  const items: LspCompletionItem[] = Array.isArray(result)
    ? result
    : ((result as LspCompletionList).items ?? []);
  const incomplete = !Array.isArray(result) && (result as LspCompletionList).isIncomplete === true;

  const suggestions: LspCompletionSuggestion[] = items.map((item) => {
    const label = typeof item.label === 'string' ? item.label : item.label?.label ?? '';
    const suggestion: LspCompletionSuggestion = {
      label,
      kind: LSP_TO_MONACO_KIND[item.kind ?? 1] ?? (18 as languages.CompletionItemKind) /* Text */,
      detail: item.detail,
      documentation: convertDocumentation(item.documentation),
      sortText: item.sortText ?? label,
      filterText: item.filterText ?? label,
      insertText: item.insertText ?? label,
      range,
      _lspItem: item,
      _lspRoute: route,
    };

    if (item.insertTextFormat === 2) {
      suggestion.insertTextRules = 4 as languages.CompletionItemInsertTextRule; /* InsertAsSnippet */
    }
    if (item.textEdit && 'range' in item.textEdit) {
      suggestion.range = lspRangeToMonaco(item.textEdit.range);
      suggestion.insertText = item.textEdit.newText;
    } else if (item.textEdit) {
      suggestion.insertText = item.textEdit.newText;
    }
    if (item.deprecated || item.tags?.includes(1)) {
      suggestion.tags = [1 as languages.CompletionItemTag]; /* Deprecated */
    }
    return suggestion;
  });

  return { suggestions, incomplete };
}

/** Convert LSP hover result to Monaco Hover. */
export function convertHover(result: unknown): languages.Hover | null {
  if (!result) return null;
  const hover = result as LspHover;
  if (!hover.contents) return null;

  const contents: languages.Hover['contents'] = [];

  if (typeof hover.contents === 'string') {
    contents.push({ value: hover.contents });
  } else if (Array.isArray(hover.contents)) {
    for (const c of hover.contents) {
      if (typeof c === 'string') {
        contents.push({ value: c });
      } else if (c.value) {
        contents.push({ value: c.language ? `\`\`\`${c.language}\n${c.value}\n\`\`\`` : c.value });
      }
    }
  } else if (hover.contents.kind === 'markdown' || hover.contents.kind === 'plaintext') {
    contents.push({ value: hover.contents.value ?? '' });
  } else if (hover.contents.value) {
    const lang = hover.contents.language;
    contents.push({ value: lang ? `\`\`\`${lang}\n${hover.contents.value}\n\`\`\`` : hover.contents.value });
  }

  if (contents.length === 0) return null;
  return { contents, range: hover.range ? lspRangeToMonaco(hover.range) : undefined };
}

/** Convert LSP definition result to Monaco-compatible location data (uri + range). */
export function convertDefinition(result: unknown): Array<{ uri: string; range: IRange }> {
  if (!result) return [];
  const locations = (Array.isArray(result) ? result : [result]) as LspLocation[];
  return locations
    .filter((loc) => loc.uri && loc.range)
    .map((loc) => ({ uri: loc.uri, range: lspRangeToMonaco(loc.range) }));
}

/** Convert LSP diagnostics to Monaco marker data. */
export function convertDiagnostics(diagnostics: LspDiagnostic[]): editor.IMarkerData[] {
  return diagnostics.map((d) => ({
    severity: LSP_TO_MONACO_SEVERITY[d.severity ?? 1] ?? (8 as MarkerSeverityEnum) /* Error */,
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1,
    message: d.message,
    source: d.source ?? 'lsp',
    code: d.code != null ? String(d.code) : undefined,
    tags: d.tags
      ?.map((t) => (t === 1 ? 1 : t === 2 ? 2 : undefined))
      .filter((t): t is MarkerTag => t !== undefined),
  }));
}

function convertDocumentation(
  doc: LspCompletionItem['documentation'],
): string | languages.CompletionItem['documentation'] | undefined {
  if (!doc) return undefined;
  if (typeof doc === 'string') return doc;
  if ('kind' in doc && doc.kind === 'markdown') return { value: doc.value };
  if ('value' in doc) return doc.value;
  return undefined;
}

// ── Language helpers ───────────────────────────────────────────

/** Monaco language IDs that map to the TypeScript LSP server. */
export const LSP_LANGUAGES = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'];

/** Get the normalized LSP server language key (null if unsupported). */
export function getLspServerLanguage(languageId: string): string | null {
  return LSP_LANGUAGES.includes(languageId) ? 'typescript' : null;
}

/** Get the correct LSP language ID for a file path. */
const EXT_TO_LSP_LANGUAGE: Record<string, string> = {
  ts: 'typescript', tsx: 'typescriptreact',
  js: 'javascript', jsx: 'javascriptreact',
  mts: 'typescript', cts: 'typescript',
  mjs: 'javascript', cjs: 'javascript',
};

export function getLspLanguageIdFromPath(filePath: string): string {
  const ext = filePath.split('.').pop() ?? '';
  return EXT_TO_LSP_LANGUAGE[ext] ?? 'plaintext';
}
