// Single source of truth for state shared across extension, runtime, and UI.
// JSON-serialisable only — no Date, Map, Set, or functions.

export interface Note {
  id: number;
  title: string;
  done: boolean;
  createdAt: string;
}

export interface NotesState {
  notes: Note[];
  nextId: number;
}

export const DEFAULT_STATE: NotesState = {
  notes: [],
  nextId: 1,
};
