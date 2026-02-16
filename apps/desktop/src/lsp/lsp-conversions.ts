/**
 * Conversion utilities between LSP protocol types and Monaco editor types.
 * Uses numeric constants for Monaco enums to avoid runtime import dependencies.
 */

// Monaco CompletionItemKind values
const MONACO_KIND = {
  Method: 0, Function: 1, Constructor: 2, Field: 3, Variable: 4,
  Class: 5, Struct: 6, Interface: 7, Module: 8, Property: 9,
  Event: 10, Operator: 11, Unit: 12, Value: 13, Constant: 14,
  Enum: 15, EnumMember: 16, Keyword: 17, Text: 18, Color: 19,
  File: 20, Reference: 21, Customcolor: 22, Folder: 23, TypeParameter: 24,
  User: 25, Issue: 26, Snippet: 27,
};

// LSP → Monaco kind mapping
const LSP_TO_MONACO_KIND: Record<number, number> = {
  1: MONACO_KIND.Text, 2: MONACO_KIND.Method, 3: MONACO_KIND.Function,
  4: MONACO_KIND.Constructor, 5: MONACO_KIND.Field, 6: MONACO_KIND.Variable,
  7: MONACO_KIND.Class, 8: MONACO_KIND.Interface, 9: MONACO_KIND.Module,
  10: MONACO_KIND.Property, 11: MONACO_KIND.Unit, 12: MONACO_KIND.Value,
  13: MONACO_KIND.Enum, 14: MONACO_KIND.Keyword, 15: MONACO_KIND.Snippet,
  16: MONACO_KIND.Color, 17: MONACO_KIND.File, 18: MONACO_KIND.Reference,
  19: MONACO_KIND.Folder, 20: MONACO_KIND.EnumMember, 21: MONACO_KIND.Constant,
  22: MONACO_KIND.Struct, 23: MONACO_KIND.Event, 24: MONACO_KIND.Operator,
  25: MONACO_KIND.TypeParameter,
};

const MARKER_SEVERITY = { Hint: 1, Info: 2, Warning: 4, Error: 8 };
const LSP_TO_MONACO_SEVERITY: Record<number, number> = {
  1: MARKER_SEVERITY.Error, 2: MARKER_SEVERITY.Warning,
  3: MARKER_SEVERITY.Info, 4: MARKER_SEVERITY.Hint,
};

const INSERT_TEXT_RULE = { InsertAsSnippet: 4 };

/** Convert Monaco position (1-indexed) to LSP position (0-indexed). */
export function monacoToLspPos(lineNumber: number, column: number) {
  return { line: lineNumber - 1, character: column - 1 };
}

/** Convert LSP range to Monaco range. */
export function lspRangeToMonaco(range: { start: any; end: any }) {
  return {
    startLineNumber: range.start.line + 1,
    startColumn: range.start.character + 1,
    endLineNumber: range.end.line + 1,
    endColumn: range.end.character + 1,
  };
}

/** Convert LSP completion result to Monaco completion list. */
export function convertCompletions(
  result: unknown,
  range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number },
): { suggestions: any[]; incomplete: boolean } {
  if (!result) return { suggestions: [], incomplete: false };
  const items: any[] = Array.isArray(result) ? result : (result as any).items ?? [];
  const incomplete = !Array.isArray(result) && (result as any).isIncomplete === true;

  const suggestions = items.map((item: any) => {
    const suggestion: any = {
      label: item.label ?? '',
      kind: LSP_TO_MONACO_KIND[item.kind] ?? MONACO_KIND.Text,
      detail: item.detail,
      documentation: convertDocumentation(item.documentation),
      sortText: item.sortText ?? item.label,
      filterText: item.filterText ?? item.label,
      insertText: item.insertText ?? (typeof item.label === 'string' ? item.label : item.label?.label),
      range,
      _lspItem: item,
    };
    if (item.insertTextFormat === 2) suggestion.insertTextRules = INSERT_TEXT_RULE.InsertAsSnippet;
    if (item.textEdit) {
      if (item.textEdit.range) suggestion.range = lspRangeToMonaco(item.textEdit.range);
      suggestion.insertText = item.textEdit.newText;
    }
    if (item.deprecated || item.tags?.includes(1)) suggestion.tags = [1];
    return suggestion;
  });

  return { suggestions, incomplete };
}

/** Convert LSP hover result to Monaco hover. */
export function convertHover(result: unknown): { contents: any[] } | null {
  if (!result) return null;
  const hover = result as any;
  if (!hover.contents) return null;

  const contents: any[] = [];
  if (typeof hover.contents === 'string') {
    contents.push({ value: hover.contents });
  } else if (Array.isArray(hover.contents)) {
    for (const c of hover.contents) {
      if (typeof c === 'string') contents.push({ value: c });
      else if (c.value) contents.push({ value: c.language ? `\`\`\`${c.language}\n${c.value}\n\`\`\`` : c.value });
    }
  } else if (hover.contents.kind === 'markdown' || hover.contents.kind === 'plaintext') {
    contents.push({ value: hover.contents.value });
  } else if (hover.contents.value) {
    const lang = hover.contents.language;
    contents.push({ value: lang ? `\`\`\`${lang}\n${hover.contents.value}\n\`\`\`` : hover.contents.value });
  }

  return contents.length > 0 ? { contents } : null;
}

/** Convert LSP definition result to Monaco locations. */
export function convertDefinition(result: unknown): any[] {
  if (!result) return [];
  const locations = Array.isArray(result) ? result : [result];
  return locations
    .filter((loc: any) => loc.uri && loc.range)
    .map((loc: any) => ({ uri: loc.uri, range: lspRangeToMonaco(loc.range) }));
}

/** Convert LSP diagnostics to Monaco markers. */
export function convertDiagnostics(diagnostics: any[]): any[] {
  return diagnostics.map((d: any) => ({
    severity: LSP_TO_MONACO_SEVERITY[d.severity] ?? MARKER_SEVERITY.Error,
    startLineNumber: d.range.start.line + 1,
    startColumn: d.range.start.character + 1,
    endLineNumber: d.range.end.line + 1,
    endColumn: d.range.end.character + 1,
    message: d.message,
    source: d.source ?? 'lsp',
    code: d.code != null ? String(d.code) : undefined,
    tags: d.tags?.map((t: number) => (t === 1 ? 1 : t === 2 ? 2 : undefined)).filter(Boolean),
  }));
}

function convertDocumentation(doc: unknown): any {
  if (!doc) return undefined;
  if (typeof doc === 'string') return doc;
  if ((doc as any).kind === 'markdown') return { value: (doc as any).value };
  if ((doc as any).value) return (doc as any).value;
  return undefined;
}

/** Monaco language IDs that map to the TypeScript LSP server. */
export const LSP_LANGUAGES = ['typescript', 'typescriptreact', 'javascript', 'javascriptreact'];

/** Check if a Monaco language ID is supported by an LSP server. */
export function isLspSupported(languageId: string): boolean {
  return languageId === 'typescript' || languageId === 'javascript' || LSP_LANGUAGES.includes(languageId);
}

/** Get the normalized LSP server language key. */
export function getLspServerLanguage(languageId: string): string | null {
  if (languageId === 'typescript' || languageId === 'javascript' || LSP_LANGUAGES.includes(languageId)) {
    return 'typescript';
  }
  return null;
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
