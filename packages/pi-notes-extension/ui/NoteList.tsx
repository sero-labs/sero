/**
 * NoteList — sidebar panel showing all notes with search and filtering.
 */

import { useMemo } from 'react';
import type { Note } from '../shared/types';

// ── Icons ────────────────────────────────────────────────────

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <path strokeLinecap="round" d="m21 21-4.35-4.35" />
    </svg>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffDays === 0) {
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  }
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function getPreview(body: string): string {
  const trimmed = body.trim();
  if (!trimmed) return 'No content';
  return trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed;
}

// ── Component ────────────────────────────────────────────────

interface NoteListProps {
  notes: Note[];
  selectedId: number | null;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onSelectNote: (id: number) => void;
  onCreateNote: () => void;
  onDeleteNote: (id: number) => void;
  onTogglePin: (id: number) => void;
}

export function NoteList({
  notes,
  selectedId,
  searchQuery,
  onSearchChange,
  onSelectNote,
  onCreateNote,
  onDeleteNote,
  onTogglePin,
}: NoteListProps) {
  const filteredNotes = useMemo(() => {
    let result = notes;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (n) => n.title.toLowerCase().includes(q) || n.body.toLowerCase().includes(q),
      );
    }
    // Pinned first, then by updatedAt desc
    return [...result].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
  }, [notes, searchQuery]);

  return (
    <div className="flex h-full flex-col" style={{ width: 280, minWidth: 280 }}>
      {/* Header */}
      <div className="shrink-0 px-4 pb-2 pt-5">
        <div className="flex items-center justify-between">
          <h1 className="text-lg tracking-tight" style={{ color: 'var(--nt-text)' }}>
            Notes
          </h1>
          <div className="flex items-center gap-1">
            <span className="text-xs tabular-nums" style={{ color: 'var(--nt-muted)' }}>
              {notes.length}
            </span>
            <button
              onClick={onCreateNote}
              className="nt-pin-btn"
              style={{ color: 'var(--nt-accent)' }}
              title="New note"
            >
              <PlusIcon />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative mt-3">
          <div className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2" style={{ color: 'var(--nt-dim)' }}>
            <SearchIcon />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search notes…"
            className="nt-search"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 transition-colors"
              style={{ color: 'var(--nt-dim)' }}
            >
              <CloseIcon />
            </button>
          )}
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {filteredNotes.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center nt-animate-in">
            <p className="text-xs" style={{ color: 'var(--nt-muted)' }}>
              {searchQuery ? 'No matching notes' : 'No notes yet'}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-0.5 nt-animate-in">
            {filteredNotes.map((note) => (
              <li
                key={note.id}
                onClick={() => onSelectNote(note.id)}
                className={`nt-note-card ${selectedId === note.id ? 'active' : ''}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {note.pinned && (
                        <span style={{ color: 'var(--nt-amber)', fontSize: 10 }}>📌</span>
                      )}
                      <span
                        className="truncate text-sm font-medium"
                        style={{ color: 'var(--nt-text)' }}
                      >
                        {note.title || 'Untitled'}
                      </span>
                    </div>
                    <p
                      className="mt-0.5 truncate text-xs"
                      style={{ color: 'var(--nt-dim)' }}
                    >
                      {getPreview(note.body)}
                    </p>
                    <span
                      className="mt-1 block text-[10px]"
                      style={{ color: 'var(--nt-dim)' }}
                    >
                      {formatDate(note.updatedAt)}
                    </span>
                  </div>

                  <div className="flex shrink-0 items-center gap-0.5 pt-0.5">
                    <button
                      onClick={(e) => { e.stopPropagation(); onTogglePin(note.id); }}
                      className={`nt-pin-btn ${note.pinned ? 'pinned' : ''}`}
                      title={note.pinned ? 'Unpin' : 'Pin'}
                    >
                      <PinIcon filled={note.pinned} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteNote(note.id); }}
                      className="nt-delete-btn"
                      style={{ opacity: selectedId === note.id ? 1 : undefined }}
                      title="Delete"
                    >
                      <CloseIcon />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
