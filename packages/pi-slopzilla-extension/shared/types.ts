/**
 * Shared state shape for SlopZilla.
 *
 * Both the Pi extension and the Sero web UI read/write a JSON file
 * matching this shape.
 */

export type Complexity = 'low' | 'medium' | 'high';

export type Phase =
  | 'config'
  | 'generating'
  | 'picking'
  | 'remix'
  | 'launching'
  | 'launched';

export interface AppIdea {
  id: number;
  name: string;
  tagline: string;
  description: string;
  techStack: string[];
  slopScore: number; // 1–10 how absurdly "sloppy" this idea is
}

/** An idea bookmarked for later without launching. */
export interface SavedIdea {
  idea: AppIdea;
  savedAt: string; // ISO datetime
}

export type BuildStatus = 'launched' | 'complete' | 'failed';

export interface HistoryEntry {
  idea: AppIdea;
  launchedAt: string; // ISO datetime
  workspaceId: string;
  sessionId: string | null;
  sessionPath: string | null;
  status: BuildStatus;
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
  savedIdeas: SavedIdea[];
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
  savedIdeas: [],
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
