/** Which memory file to target. */
export type MemoryTarget = 'memory' | 'identity' | 'user' | 'daily';

/** How to write to a memory file. */
export type WriteMode = 'append' | 'overwrite';

/** Available memory tool actions. */
export type MemoryAction = 'read' | 'write' | 'search' | 'list';

/** A single search result. */
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

// ── Questionnaire types (matches Pi SDK `questionnaire` tool) ──

export interface QuestionOption {
  value: string;
  label: string;
  description?: string;
}

export interface QuestionDef {
  id: string;
  label?: string;
  prompt: string;
  options: QuestionOption[];
  allowOther?: boolean;
}

export interface QuestionnairePayload {
  questions: QuestionDef[];
}
