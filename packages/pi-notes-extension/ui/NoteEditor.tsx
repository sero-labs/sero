/**
 * NoteEditor — right panel for editing a note's title and body.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import type { Note } from '../shared/types';

// ── Icons ────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
    </svg>
  );
}

function PinIcon({ filled }: { filled: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 2l3 9h9l-7 5 3 9-8-6-8 6 3-9-7-5h9z" />
    </svg>
  );
}

// ── Helpers ──────────────────────────────────────────────────

function formatFullDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ── Component ────────────────────────────────────────────────

interface NoteEditorProps {
  note: Note;
  onUpdateNote: (id: number, updates: { title?: string; body?: string }) => void;
  onDeleteNote: (id: number) => void;
  onTogglePin: (id: number) => void;
}

export function NoteEditor({ note, onUpdateNote, onDeleteNote, onTogglePin }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noteIdRef = useRef(note.id);

  // Sync local state when note changes (selected different note)
  useEffect(() => {
    if (noteIdRef.current !== note.id) {
      noteIdRef.current = note.id;
      setTitle(note.title);
      setBody(note.body);
    }
  }, [note.id, note.title, note.body]);

  // Also sync if note updated externally (e.g. agent edited it)
  useEffect(() => {
    if (noteIdRef.current === note.id) {
      setTitle(note.title);
      setBody(note.body);
    }
  }, [note.id, note.title, note.body]);

  const debouncedSave = useCallback(
    (updates: { title?: string; body?: string }) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        onUpdateNote(note.id, updates);
      }, 400);
    },
    [note.id, onUpdateNote],
  );

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  const handleTitleChange = (value: string) => {
    setTitle(value);
    debouncedSave({ title: value, body });
  };

  const handleBodyChange = (value: string) => {
    setBody(value);
    debouncedSave({ title, body: value });
  };

  const wordCount = body.trim() ? body.trim().split(/\s+/).length : 0;

  return (
    <div className="flex h-full flex-1 flex-col nt-animate-in">
      {/* Toolbar */}
      <div
        className="flex shrink-0 items-center justify-between px-6 py-3"
        style={{ borderBottom: '1px solid var(--nt-border)' }}
      >
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--nt-dim)' }}>
            {formatFullDate(note.updatedAt)}
          </span>
          {wordCount > 0 && (
            <span className="text-xs" style={{ color: 'var(--nt-dim)' }}>
              · {wordCount} {wordCount === 1 ? 'word' : 'words'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onTogglePin(note.id)}
            className={`nt-pin-btn ${note.pinned ? 'pinned' : ''}`}
            title={note.pinned ? 'Unpin' : 'Pin'}
          >
            <PinIcon filled={note.pinned} />
          </button>
          <button
            onClick={() => onDeleteNote(note.id)}
            className="nt-delete-btn"
            style={{ opacity: 1 }}
            title="Delete note"
          >
            <TrashIcon />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex flex-1 flex-col overflow-y-auto px-6 py-5">
        <input
          type="text"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Note title…"
          className="mb-4 w-full border-none bg-transparent text-xl font-medium outline-none"
          style={{
            color: 'var(--nt-text)',
            fontFamily: "'DM Sans', system-ui, sans-serif",
            padding: 0,
          }}
        />
        <textarea
          value={body}
          onChange={(e) => handleBodyChange(e.target.value)}
          placeholder="Start writing…"
          className="nt-textarea flex-1"
          style={{
            border: 'none',
            background: 'transparent',
            resize: 'none',
            minHeight: 'unset',
            padding: 0,
          }}
        />
      </div>
    </div>
  );
}
