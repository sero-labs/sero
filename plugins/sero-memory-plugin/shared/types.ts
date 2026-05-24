/** Which memory file to target. */
export type MemoryTarget = 'memory' | 'identity' | 'user' | 'daily';

/** How to write to a memory file. */
export type WriteMode = 'append' | 'overwrite';

/** Available memory tool actions. */
export type MemoryAction = 'read' | 'write' | 'replace' | 'remove' | 'search' | 'list' | 'consolidate';

/** A single grep search result. */
export interface MemorySearchResult {
  file: string;
  line: number;
  text: string;
}

/** Listing of memory files by category. */
export interface MemoryFileList {
  root: string[];
  daily: string[];
}

// ── QMD search ─────────────────────────────────────────────────

/** A single QMD search result (keyword, semantic, or deep). */
export interface QmdSearchResult {
  path?: string;
  file?: string;
  score?: number;
  content?: string;
  chunk?: string;
  snippet?: string;
  [key: string]: unknown;
}

export type MemorySearchScope = 'memory' | 'sessions' | 'all';

/** Extract the file path from a QMD result (normalises path/file fields). */
export function getResultPath(r: QmdSearchResult): string | undefined {
  return r.path ?? r.file;
}

/** Extract the text content from a QMD result (normalises content/chunk/snippet fields). */
export function getResultText(r: QmdSearchResult): string {
  return r.content ?? r.chunk ?? r.snippet ?? '';
}

// ── Questionnaire types (matches Pi SDK `questionnaire` tool) ──

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
  exclusive?: boolean;
}

export interface QuestionDef {
  id: string;
  label?: string;
  prompt: string;
  options: QuestionOption[];
  allowOther?: boolean;
  multiSelect?: boolean;
}

export interface QuestionnairePayload {
  questions: QuestionDef[];
}
