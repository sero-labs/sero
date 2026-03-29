// shared/types.ts — Single source of truth for state shape.
// Imported by both the Pi extension and the web UI.

// ── Search result summaries (stored in state.json) ─────────

export interface SourceInfo {
  title: string;
  url: string;
}

export interface QueryInfo {
  query: string;
  answer: string;
  resultCount: number;
  provider?: string;
  error?: string | null;
  sources: SourceInfo[];
}

export interface UrlInfo {
  url: string;
  title: string;
  charCount: number;
  error?: string | null;
}

export interface WebEntry {
  id: string;
  type: 'search' | 'fetch';
  timestamp: number;
  queries?: QueryInfo[];
  urls?: UrlInfo[];
}

// ── Bookmarks ──────────────────────────────────────────────

export interface Bookmark {
  id: string;
  url: string;
  title: string;
  description?: string;
  tags: string[];
  createdAt: number;
}

// ── Provider availability ──────────────────────────────────

export interface ProviderStatus {
  exa: boolean;
  perplexity: boolean;
  gemini: boolean;
}

// ── Root state ─────────────────────────────────────────────

export interface WebAccessState {
  entries: WebEntry[];
  bookmarks: Bookmark[];
  providers: ProviderStatus;
  activeProvider: string;
  workflow: string;
  lastSyncedAt: number;
}

export const MAX_STATE_ENTRIES = 50;

export const DEFAULT_STATE: WebAccessState = {
  entries: [],
  bookmarks: [],
  providers: { exa: false, perplexity: false, gemini: false },
  activeProvider: 'auto',
  workflow: 'summary-review',
  lastSyncedAt: 0,
};
