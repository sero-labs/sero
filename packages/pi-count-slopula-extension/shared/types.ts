/**
 * Shared state shape for Count Slopula.
 *
 * Both the Pi extension and the Sero web UI read/write a JSON file
 * matching this shape.
 */

export type Intensity = 'nibble' | 'bite' | 'drain';

export type Phase =
  | 'config'
  | 'generating'
  | 'picking'
  | 'remix'
  | 'launching'
  | 'launched';

export interface ContentPiece {
  id: number;
  name: string;
  tagline: string;
  body: string;
  genre: string;
  slopRating: number; // 1–10 how cliched this content is
}

/** A piece bookmarked for later without launching. */
export interface SavedPiece {
  piece: ContentPiece;
  savedAt: string; // ISO datetime
}

export type BuildStatus = 'launched' | 'complete' | 'failed';

export interface HistoryEntry {
  piece: ContentPiece;
  launchedAt: string; // ISO datetime
  workspaceId: string;
  sessionId: string | null;
  sessionPath: string | null;
  status: BuildStatus;
}

export interface CountSlopulaState {
  phase: Phase;
  intensity: Intensity | null;
  genres: string[];
  pieces: ContentPiece[] | null;
  chosenPiece: ContentPiece | null;
  launchedWorkspaceId: string | null;
  launchedSessionId: string | null;
  history: HistoryEntry[];
  savedPieces: SavedPiece[];
}

export const DEFAULT_STATE: CountSlopulaState = {
  phase: 'config',
  intensity: null,
  genres: [],
  pieces: null,
  chosenPiece: null,
  launchedWorkspaceId: null,
  launchedSessionId: null,
  history: [],
  savedPieces: [],
};

/** Content genres the user can pick from. */
export const GENRE_OPTIONS = [
  'Motivational Drivel',
  'Clickbait From The Crypt',
  'LinkedIn Nightmares',
  'Cursed Recipes',
  'Conspiracy Corner',
  'Horoscope Horror',
  'Startup Seance',
  'Dating Doom',
  'Movie Mashup Mausoleum',
  'Pirate Shanty Generator',
  'Corporate Buzzword Salad',
  'Passive-Aggressive Notes',
] as const;
