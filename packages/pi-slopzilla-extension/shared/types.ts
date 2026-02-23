/**
 * Shared state shape for SlopZilla.
 *
 * Both the Pi extension and the Sero web UI read/write a JSON file
 * matching this shape.
 */

export type Complexity = 'low' | 'medium' | 'high';

export type Phase = 'config' | 'generating' | 'picking' | 'launching' | 'launched';

export interface AppIdea {
  id: number;
  name: string;
  tagline: string;
  description: string;
  techStack: string[];
  slopScore: number; // 1–10 how absurdly "sloppy" this idea is
}

export interface HistoryEntry {
  idea: AppIdea;
  launchedAt: string; // ISO datetime
  workspaceId: string;
}

export interface SlopZillaState {
  phase: Phase;
  complexity: Complexity | null;
  technologies: string[];
  ideas: AppIdea[] | null;
  chosenIdea: AppIdea | null;
  launchedWorkspaceId: string | null;
  launchedSessionId: string | null;
  history: HistoryEntry[];
}

export const DEFAULT_STATE: SlopZillaState = {
  phase: 'config',
  complexity: null,
  technologies: [],
  ideas: null,
  chosenIdea: null,
  launchedWorkspaceId: null,
  launchedSessionId: null,
  history: [],
};

/** Technologies the user can pick from. */
export const TECH_OPTIONS = [
  'React',
  'Vue',
  'Svelte',
  'Three.js',
  'Canvas API',
  'WebSockets',
  'SQLite',
  'Node.js',
  'Python',
  'Rust',
  'Go',
  'WebAssembly',
  'TailwindCSS',
  'GraphQL',
  'WebGL',
  'Web Audio API',
] as const;
