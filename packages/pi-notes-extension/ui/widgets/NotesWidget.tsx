/**
 * NotesWidget — pinboard-style note previews for the dashboard.
 *
 * Shows pinned notes as sticky-note style cards with soft pastel
 * backgrounds. Falls back to most recently edited notes if none
 * are pinned.
 */

import { useMemo } from 'react';
import { useAppState } from '@sero-ai/app-runtime';
import type { NotesState, Note } from '../../shared/types';
import { DEFAULT_NOTES_STATE } from '../../shared/types';
import { Not } from '@sinclair/typebox';

// ── Pastel palette for sticky notes ──────────────────────────────

const NOTE_COLORS = [
  { bg: 'rgba(99, 102, 241, 0.08)', border: 'rgba(99, 102, 241, 0.18)', accent: '#818cf8' },
  { bg: 'rgba(139, 92, 246, 0.08)', border: 'rgba(139, 92, 246, 0.18)', accent: '#a78bfa' },
  { bg: 'rgba(236, 72, 153, 0.08)', border: 'rgba(236, 72, 153, 0.18)', accent: '#f472b6' },
  { bg: 'rgba(34, 197, 94, 0.08)', border: 'rgba(34, 197, 94, 0.18)', accent: '#4ade80' },
  { bg: 'rgba(245, 158, 11, 0.08)', border: 'rgba(245, 158, 11, 0.18)', accent: '#fbbf24' },
  { bg: 'rgba(6, 182, 212, 0.08)', border: 'rgba(6, 182, 212, 0.18)', accent: '#22d3ee' },
];

function getColor(index: number) {
  return NOTE_COLORS[index % NOTE_COLORS.length];
}

// ── Component ────────────────────────────────────────────────────

export function NotesWidget() {
  const [state] = useAppState<NotesState>(DEFAULT_NOTES_STATE);

  const displayNotes = useMemo(() => {
    const pinned = state.notes.filter((n) => n.pinned);
    if (pinned.length > 0) {
      return pinned.slice(0, 4);
    }
    // Fall back to most recently edited
    return [...state.notes]
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 4);
  }, [state.notes]);

  if (state.notes.length === 0) {
    return <EmptyNotes />;
  }

  return (
    <div className="flex h-full flex-col gap-2 p-3">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold tabular-nums text-[var(--text-primary)]">
            {state.notes.length}
          </span>
          <span className="text-xs text-[var(--text-muted)]">notes</span>
        </div>
        {state.notes.some((n) => n.pinned) && (
          <div className="flex items-center gap-1 rounded-full bg-amber-500/10 px-2 py-0.5">
            <PinIcon className="size-2.5 text-amber-400" />
            <span className="text-[10px] font-medium text-amber-400">
              {state.notes.filter((n) => n.pinned).length} pinned
            </span>
          </div>
        )}
      </div>

      {/* ── Note cards grid ── */}
      <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5 overflow-hidden">
        {displayNotes.map((note, i) => (
          <NoteCard key={note.id} note={note} color={getColor(i)} />
        ))}
      </div>
    </div>
  );
}

// ── Note card ────────────────────────────────────────────────────

function NoteCard({ note, color }: { note: Note; color: (typeof NOTE_COLORS)[number] }) {
  const bodyPreview = note.body.slice(0, 80).trim();

  return (
    <div
      className="flex flex-col gap-1 rounded-lg p-2 transition-all duration-200 hover:scale-[1.02]"
      style={{
        backgroundColor: color.bg,
        borderLeft: `2px solid ${color.border}`,
      }}
    >
      <div className="flex items-start gap-1">
        {note.pinned && <PinIcon className="mt-0.5 size-2.5 shrink-0" style={{ color: color.accent }} />}
        <span className="line-clamp-1 text-[11px] font-semibold text-[var(--text-primary)]">
          {note.title || 'Untitled'}
        </span>
      </div>
      {bodyPreview && (
        <span className="line-clamp-2 text-[10px] leading-tight text-[var(--text-muted)]">
          {bodyPreview}
        </span>
      )}
      <span className="mt-auto text-[8px] text-[var(--text-muted)]">
        {formatDate(note.updatedAt)}
      </span>
    </div>
  );
}

// ── Pin icon (inline SVG to avoid lucide dep) ────────────────────

function PinIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      style={style}
    >
      <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1-.707.707l-.707-.707-3.182 3.182a4 4 0 0 1-1.086.793l-.163.08-.253.126a.5.5 0 0 1-.24.06L8 10.06l-3.72 3.72a.5.5 0 1 1-.707-.708L7.28 9.354l-.001-.74a.5.5 0 0 1 .06-.24l.126-.253a4 4 0 0 1 .874-1.25l3.182-3.182-.707-.707a.5.5 0 0 1 .146-.854l.854-.354z" />
    </svg>
  );
}

// ── Date formatter ───────────────────────────────────────────────

function formatDate(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

// ── Empty state ──────────────────────────────────────────────────

function EmptyNotes() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-3">
      <div className="relative grid size-12 grid-cols-2 gap-1">
        {NOTE_COLORS.slice(0, 4).map((c, i) => (
          <div
            key={i}
            className="rounded-md"
            style={{
              backgroundColor: c.bg,
              borderLeft: `2px solid ${c.border}`,
              animation: `pulse 2s ease-in-out ${i * 0.3}s infinite`,
            }}
          />
        ))}
      </div>
      <span className="text-xs text-[var(--text-muted)]">No notes yet</span>
    </div>
  );
}


export default NotesWidget;