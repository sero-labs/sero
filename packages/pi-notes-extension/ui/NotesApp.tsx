/**
 * NotesApp — Sero web UI for the notes extension.
 *
 * Two-panel layout: note list (left) + note editor (right).
 * Uses useAppState from @sero-ai/app-runtime to read/write the same
 * state.json file the Pi extension writes.
 */

import { useState, useCallback, useMemo } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import type { NotesState, Note } from '../shared/types';
import { DEFAULT_NOTES_STATE } from '../shared/types';
import { NOTES_STYLES } from './styles';
import { NoteList } from './NoteList';
import { NoteEditor } from './NoteEditor';

// ── NotesApp ─────────────────────────────────────────────────

export function NotesApp() {
  const [state, updateState] = useAppState<NotesState>(DEFAULT_NOTES_STATE);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const selectedNote = useMemo(
    () => state.notes.find((n) => n.id === selectedId) ?? null,
    [state.notes, selectedId],
  );

  const createNote = useCallback(() => {
    const now = new Date().toISOString();
    let newId = 0;
    updateState((prev) => {
      newId = prev.nextId;
      const note: Note = {
        id: prev.nextId,
        title: '',
        body: '',
        pinned: false,
        createdAt: now,
        updatedAt: now,
      };
      return {
        ...prev,
        notes: [...prev.notes, note],
        nextId: prev.nextId + 1,
      };
    });
    // Select the new note after a tick so state has propagated
    setTimeout(() => setSelectedId(newId), 0);
  }, [updateState]);

  const updateNote = useCallback(
    (id: number, updates: { title?: string; body?: string }) => {
      updateState((prev) => ({
        ...prev,
        notes: prev.notes.map((n) =>
          n.id === id
            ? {
                ...n,
                ...(updates.title !== undefined ? { title: updates.title } : {}),
                ...(updates.body !== undefined ? { body: updates.body } : {}),
                updatedAt: new Date().toISOString(),
              }
            : n,
        ),
      }));
    },
    [updateState],
  );

  const deleteNote = useCallback(
    (id: number) => {
      updateState((prev) => ({
        ...prev,
        notes: prev.notes.filter((n) => n.id !== id),
      }));
      if (selectedId === id) setSelectedId(null);
    },
    [updateState, selectedId],
  );

  const togglePin = useCallback(
    (id: number) => {
      updateState((prev) => ({
        ...prev,
        notes: prev.notes.map((n) =>
          n.id === id
            ? { ...n, pinned: !n.pinned, updatedAt: new Date().toISOString() }
            : n,
        ),
      }));
    },
    [updateState],
  );

  return (
    <>
      <style>{NOTES_STYLES}</style>
      <div className="nt-root flex h-full w-full overflow-hidden p-4">
        <div className="nt-card flex flex-1 overflow-hidden">
          {/* Left panel — note list */}
          <NoteList
            notes={state.notes}
            selectedId={selectedId}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            onSelectNote={setSelectedId}
            onCreateNote={createNote}
            onDeleteNote={deleteNote}
            onTogglePin={togglePin}
          />

          {/* Divider */}
          <div className="nt-divider" />

          {/* Right panel — editor or empty */}
          {selectedNote ? (
            <NoteEditor
              key={selectedNote.id}
              note={selectedNote}
              onUpdateNote={updateNote}
              onDeleteNote={deleteNote}
              onTogglePin={togglePin}
            />
          ) : (
            <EmptyEditor onCreateNote={createNote} />
          )}
        </div>
      </div>
    </>
  );
}

// ── Empty state ──────────────────────────────────────────────

function EmptyEditor({ onCreateNote }: { onCreateNote: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center nt-animate-in">
      <div className="nt-empty-orb mb-5" />
      <h2
        className="text-lg"
        style={{ color: 'var(--nt-text)', fontFamily: "'DM Sans', system-ui, sans-serif", fontWeight: 500 }}
      >
        No note selected
      </h2>
      <p
        className="mt-2 max-w-[240px] text-center text-sm leading-relaxed"
        style={{ color: 'var(--nt-muted)' }}
      >
        Select a note from the list or create a new one.
      </p>
      <button
        onClick={onCreateNote}
        className="nt-button mt-5"
      >
        New note
      </button>
    </div>
  );
}

export default NotesApp;
