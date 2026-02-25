/**
 * HistoryDashboard — The Crypt tab.
 *
 * Two sections:
 *   1. Ritual Log — launched content pieces with status + open
 *   2. Entombed — bookmarked pieces with launch / delete actions
 */

import type { HistoryEntry, BuildStatus, SavedPiece, ContentPiece } from '../shared/types';

// ── Open session via CustomEvent ────────────────────────────

function openSession(entry: HistoryEntry) {
  window.dispatchEvent(
    new CustomEvent('sero:open-session', {
      detail: {
        sessionId: entry.sessionId,
        sessionPath: entry.sessionPath,
        workspaceId: entry.workspaceId,
      },
    }),
  );
}

// ── Status helpers ─────────────────────────────────────────

const STATUS_CFG: Record<BuildStatus, { label: string; color: string; dot: string }> = {
  launched: { label: 'Launched', color: 'var(--cs-crimson)', dot: '~' },
  complete: { label: 'Complete', color: 'var(--cs-ghost)',   dot: '+' },
  failed:   { label: 'Failed',   color: 'var(--cs-crimson)', dot: 'x' },
};

function bloodColor(rating: number): string {
  if (rating <= 3) return 'var(--cs-ghost)';
  if (rating <= 6) return 'var(--cs-gold)';
  return 'var(--cs-crimson)';
}

// ── Compact history row ────────────────────────────────────

function HistoryRow({
  entry,
  onStatusChange,
}: {
  entry: HistoryEntry;
  onStatusChange: (id: string, s: BuildStatus) => void;
}) {
  const { piece, launchedAt, workspaceId } = entry;
  const status = entry.status ?? 'launched';
  const cfg = STATUS_CFG[status];
  const date = new Date(launchedAt).toLocaleDateString();

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded transition-all group"
      style={{ background: 'var(--cs-bg-surface)', border: '1px solid var(--cs-border)' }}
    >
      {/* Status dot */}
      <span
        className="shrink-0 text-[10px] font-bold"
        style={{ color: cfg.color }}
        title={cfg.label}
      >
        {cfg.dot}
      </span>

      {/* Name + tagline */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="cs-vampire-text text-xs truncate" style={{ color: 'var(--cs-crimson)' }}>
          {piece.name}
        </span>
        <span className="text-[10px] font-mono font-bold shrink-0" style={{ color: bloodColor(piece.slopRating) }}>
          {piece.slopRating}/10
        </span>
        <span className="text-[10px] italic truncate hidden sm:inline" style={{ color: 'var(--cs-text-dim)' }}>
          — {piece.tagline}
        </span>
      </div>

      {/* Date */}
      <span className="shrink-0 text-[10px] hidden sm:block italic" style={{ color: 'var(--cs-text-dim)' }}>
        {date}
      </span>

      {/* Status select */}
      <select
        className="shrink-0 text-[10px] rounded px-1.5 py-0.5 outline-none cursor-pointer italic"
        style={{ background: 'var(--cs-bg)', color: cfg.color, border: `1px solid ${cfg.color}40` }}
        value={status}
        onChange={(e) => onStatusChange(workspaceId, e.target.value as BuildStatus)}
        onClick={(e) => e.stopPropagation()}
      >
        <option value="launched">Launched</option>
        <option value="complete">Complete</option>
        <option value="failed">Failed</option>
      </select>

      {/* Open */}
      <button
        className="shrink-0 text-[10px] font-medium tracking-wider px-2 py-1 rounded transition-all opacity-50 group-hover:opacity-100 italic"
        style={{ color: 'var(--cs-crimson)', border: '1px solid var(--cs-border)' }}
        onClick={() => openSession(entry)}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--cs-crimson)';
          e.currentTarget.style.background = 'var(--cs-crimson-subtle)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--cs-border)';
          e.currentTarget.style.background = 'transparent';
        }}
      >
        Open
      </button>
    </div>
  );
}

// ── Compact saved piece row ─────────────────────────────────

function SavedRow({
  entry,
  onLaunch,
  onDelete,
}: {
  entry: SavedPiece;
  onLaunch: (piece: ContentPiece) => void;
  onDelete: (piece: ContentPiece) => void;
}) {
  const { piece, savedAt } = entry;
  const date = new Date(savedAt).toLocaleDateString();

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded transition-all group"
      style={{ background: 'var(--cs-bg-surface)', border: '1px solid var(--cs-border)' }}
    >
      <span className="shrink-0 text-[10px]" style={{ color: 'var(--cs-gold)' }}>~</span>

      {/* Name + tagline */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="cs-vampire-text text-xs truncate" style={{ color: 'var(--cs-crimson)' }}>
          {piece.name}
        </span>
        <span className="text-[10px] font-mono font-bold shrink-0" style={{ color: bloodColor(piece.slopRating) }}>
          {piece.slopRating}/10
        </span>
        <span className="text-[10px] italic truncate hidden sm:inline" style={{ color: 'var(--cs-text-dim)' }}>
          — {piece.tagline}
        </span>
      </div>

      <span className="shrink-0 text-[10px] hidden sm:block italic" style={{ color: 'var(--cs-text-dim)' }}>
        {date}
      </span>

      {/* Delete */}
      <button
        className="shrink-0 text-[10px] font-medium tracking-wider px-2 py-1 rounded transition-all opacity-50 group-hover:opacity-100 italic"
        style={{ color: 'var(--cs-text-dim)', border: '1px solid var(--cs-border)' }}
        onClick={() => onDelete(piece)}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--cs-crimson)';
          e.currentTarget.style.color = 'var(--cs-crimson)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--cs-border)';
          e.currentTarget.style.color = 'var(--cs-text-dim)';
        }}
      >
        Exhume
      </button>

      {/* Launch */}
      <button
        className="shrink-0 text-[10px] font-medium tracking-wider px-2 py-1 rounded transition-all opacity-50 group-hover:opacity-100"
        style={{
          color: 'var(--cs-crimson)',
          border: '1px solid var(--cs-crimson)',
          background: 'var(--cs-crimson-subtle)',
          fontFamily: "'Creepster', fantasy",
        }}
        onClick={() => onLaunch(piece)}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 8px var(--cs-crimson-glow)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
      >
        Build
      </button>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────

function EmptyCrypt() {
  return (
    <div className="flex flex-col items-center justify-center py-16 relative z-10">
      <pre
        className="text-xs leading-tight font-mono select-none text-center mb-4"
        style={{ color: 'var(--cs-text-dim)', opacity: 0.3 }}
        aria-hidden="true"
      >{`   _____
  /     \\
 |  R.I.P |
 | Here   |
 | lies   |
 | nothing|
 |  yet   |
 |________|
 |        |`}</pre>
      <p className="text-sm italic" style={{ color: 'var(--cs-text-dim)' }}>
        The crypt is empty.
      </p>
      <p className="text-xs mt-1 italic" style={{ color: 'var(--cs-text-dim)', opacity: 0.5 }}>
        Summon and launch some content to fill it with glorious slop.
      </p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────

interface HistoryDashboardProps {
  history: HistoryEntry[];
  savedPieces: SavedPiece[];
  onStatusChange: (workspaceId: string, status: BuildStatus) => void;
  onLaunchSaved: (piece: ContentPiece) => void;
  onDeleteSaved: (piece: ContentPiece) => void;
}

export function HistoryDashboard({
  history,
  savedPieces,
  onStatusChange,
  onLaunchSaved,
  onDeleteSaved,
}: HistoryDashboardProps) {
  const isEmpty = history.length === 0 && savedPieces.length === 0;

  if (isEmpty) return <EmptyCrypt />;

  const counts = {
    launched: history.filter((h) => (h.status ?? 'launched') === 'launched').length,
    complete: history.filter((h) => h.status === 'complete').length,
    failed: history.filter((h) => h.status === 'failed').length,
  };

  return (
    <div className="px-5 py-4 relative z-10 flex flex-col gap-5">
      {/* Ritual Log */}
      {history.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="cs-vampire-text text-xs" style={{ color: 'var(--cs-crimson-dim)' }}>
              Ritual Log ({history.length}/10)
            </h3>
            <div className="flex gap-2">
              {counts.launched > 0 && (
                <span className="text-[10px] italic" style={{ color: 'var(--cs-crimson)' }}>~ {counts.launched}</span>
              )}
              {counts.complete > 0 && (
                <span className="text-[10px] italic" style={{ color: 'var(--cs-ghost)' }}>+ {counts.complete}</span>
              )}
              {counts.failed > 0 && (
                <span className="text-[10px] italic" style={{ color: 'var(--cs-crimson)' }}>x {counts.failed}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            {[...history].reverse().map((entry) => (
              <HistoryRow
                key={`${entry.workspaceId}-${entry.launchedAt}`}
                entry={entry}
                onStatusChange={onStatusChange}
              />
            ))}
          </div>
        </div>
      )}

      {/* Entombed pieces */}
      {savedPieces.length > 0 && (
        <div>
          <h3 className="cs-vampire-text text-xs mb-2" style={{ color: 'var(--cs-gold)' }}>
            Entombed ({savedPieces.length})
          </h3>
          <div className="flex flex-col gap-1.5">
            {savedPieces.map((entry) => (
              <SavedRow
                key={`${entry.piece.name}-${entry.savedAt}`}
                entry={entry}
                onLaunch={onLaunchSaved}
                onDelete={onDeleteSaved}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
