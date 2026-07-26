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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeNote(value: unknown): Note | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'number') return null;
  if (typeof value.title !== 'string') return null;
  if (typeof value.done !== 'boolean') return null;
  if (typeof value.createdAt !== 'string') return null;
  return {
    id: value.id,
    title: value.title,
    done: value.done,
    createdAt: value.createdAt,
  };
}

export function normalizeNotesState(value: unknown): NotesState {
  if (!isRecord(value)) return { ...DEFAULT_STATE };

  const notes = Array.isArray(value.notes)
    ? value.notes.map(normalizeNote).filter((note): note is Note => note !== null)
    : [];
  const highestId = notes.reduce((max, note) => Math.max(max, note.id), 0);
  const nextId =
    typeof value.nextId === 'number' && Number.isFinite(value.nextId)
      ? Math.max(value.nextId, highestId + 1)
      : highestId + 1;

  return { notes, nextId };
}
