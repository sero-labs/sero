/**
 * Shared state shape for the Notes app.
 *
 * Single source of truth — both the Pi extension and the Sero web UI
 * read/write a JSON file matching this shape.
 */

export interface Note {
  id: number;
  title: string;
  body: string;
  pinned: boolean;
  createdAt: string; // ISO string
  updatedAt: string; // ISO string
}

export interface NotesState {
  notes: Note[];
  nextId: number;
}

export const DEFAULT_NOTES_STATE: NotesState = {
  notes: [],
  nextId: 1,
};
