/**
 * Shared state shape for the Canvas app.
 *
 * Both the Pi extension and the Sero web UI import this.
 * State is workspace-scoped (.sero/apps/canvas/state.json).
 */

// ── Document types ────────────────────────────────────────

export type DocumentType = 'text' | 'code';
export type CodeLanguage =
  | 'javascript'
  | 'typescript'
  | 'python'
  | 'html'
  | 'css'
  | 'json'
  | 'markdown'
  | 'plaintext';

export interface DocumentVersion {
  id: number;
  content: string;
  createdAt: string; // ISO string
  label?: string; // optional version label (e.g. "Draft 1", "After review")
}

export interface CanvasDocument {
  id: number;
  title: string;
  content: string;
  type: DocumentType;
  language: CodeLanguage;
  versions: DocumentVersion[];
  nextVersionId: number;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

// ── App state ─────────────────────────────────────────────

export interface CanvasState {
  documents: CanvasDocument[];
  nextId: number;
  activeDocumentId: number | null;
}

export const DEFAULT_STATE: CanvasState = {
  documents: [],
  nextId: 1,
  activeDocumentId: null,
};
