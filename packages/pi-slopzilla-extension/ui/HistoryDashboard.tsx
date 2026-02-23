/**
 * HistoryDashboard — the History tab content.
 *
 * Two sections:
 *   1. Destruction Log — compact rows of launched projects with status + open
 *   2. Saved Ideas — bookmarked ideas with launch / delete actions
 */

import type { HistoryEntry, BuildStatus, SavedIdea, AppIdea } from '../shared/types';

// ── Open session via CustomEvent ────────────────────────────
// The host shell listens for 'sero:open-session' and activates
// the session in the ChatPanel + expands it if collapsed.

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
  launched: { label: 'Launched', color: 'var(--sz-neon)', dot: '●' },
  complete: { label: 'Complete', color: 'var(--sz-neon-dim)', dot: '✓' },
  failed:   { label: 'Failed',   color: 'var(--sz-red)',     dot: '✕' },
};

function slopColor(score: number): string {
  if (score <= 3) return 'var(--sz-neon)';
  if (score <= 6) return 'var(--sz-orange)';
  return 'var(--sz-red)';
}

// ── Compact history row ────────────────────────────────────

function HistoryRow({
  entry,
  onStatusChange,
}: {
  entry: HistoryEntry;
  onStatusChange: (id: string, s: BuildStatus) => void;
}) {
  const { idea, launchedAt, workspaceId } = entry;
  const status = entry.status ?? 'launched';
  const cfg = STATUS_CFG[status];
  const date = new Date(launchedAt).toLocaleDateString();

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all group"
      style={{ background: 'var(--sz-bg-surface)', border: '1px solid var(--sz-border)' }}
    >
      {/* Status dot */}
      <span
        className="shrink-0 text-[10px]"
        style={{ color: cfg.color }}
        title={cfg.label}
      >
        {cfg.dot}
      </span>

      {/* Name + tagline */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="sz-kaiju-text text-xs truncate" style={{ color: 'var(--sz-neon)' }}>
          {idea.name}
        </span>
        <span className="text-[10px] font-mono font-bold shrink-0" style={{ color: slopColor(idea.slopScore) }}>
          {idea.slopScore}/10
        </span>
        <span className="text-[10px] italic truncate hidden sm:inline" style={{ color: 'var(--sz-text-dim)' }}>
          — {idea.tagline}
        </span>
      </div>

      {/* Date */}
      <span className="shrink-0 text-[10px] hidden sm:block" style={{ color: 'var(--sz-text-dim)' }}>
        {date}
      </span>

      {/* Status select */}
      <select
        className="shrink-0 text-[10px] rounded-full px-1.5 py-0.5 outline-none cursor-pointer"
        style={{ background: 'var(--sz-bg)', color: cfg.color, border: `1px solid ${cfg.color}40` }}
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
        className="shrink-0 text-[10px] font-medium tracking-wider uppercase px-2 py-1 rounded-full transition-all opacity-50 group-hover:opacity-100"
        style={{ color: 'var(--sz-neon)', border: '1px solid var(--sz-border)' }}
        onClick={() => openSession(entry)}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--sz-neon)';
          e.currentTarget.style.background = 'var(--sz-neon-subtle)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--sz-border)';
          e.currentTarget.style.background = 'transparent';
        }}
      >
        Open
      </button>
    </div>
  );
}

// ── Compact saved idea row ─────────────────────────────────

function SavedRow({
  entry,
  onLaunch,
  onDelete,
}: {
  entry: SavedIdea;
  onLaunch: (idea: AppIdea) => void;
  onDelete: (idea: AppIdea) => void;
}) {
  const { idea, savedAt } = entry;
  const date = new Date(savedAt).toLocaleDateString();

  return (
    <div
      className="flex items-center gap-3 px-3 py-2 rounded-lg transition-all group"
      style={{ background: 'var(--sz-bg-surface)', border: '1px solid var(--sz-border)' }}
    >
      <span className="shrink-0 text-[10px]" style={{ color: 'var(--sz-orange)' }}>★</span>

      {/* Name + tagline */}
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <span className="sz-kaiju-text text-xs truncate" style={{ color: 'var(--sz-neon)' }}>
          {idea.name}
        </span>
        <span className="text-[10px] font-mono font-bold shrink-0" style={{ color: slopColor(idea.slopScore) }}>
          {idea.slopScore}/10
        </span>
        <span className="text-[10px] italic truncate hidden sm:inline" style={{ color: 'var(--sz-text-dim)' }}>
          — {idea.tagline}
        </span>
      </div>

      <span className="shrink-0 text-[10px] hidden sm:block" style={{ color: 'var(--sz-text-dim)' }}>
        {date}
      </span>

      {/* Delete */}
      <button
        className="shrink-0 text-[10px] font-medium tracking-wider uppercase px-2 py-1 rounded-full transition-all opacity-50 group-hover:opacity-100"
        style={{ color: 'var(--sz-text-dim)', border: '1px solid var(--sz-border)' }}
        onClick={() => onDelete(idea)}
        onMouseEnter={(e) => {
          e.currentTarget.style.borderColor = 'var(--sz-red)';
          e.currentTarget.style.color = 'var(--sz-red)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.borderColor = 'var(--sz-border)';
          e.currentTarget.style.color = 'var(--sz-text-dim)';
        }}
      >
        Remove
      </button>

      {/* Launch */}
      <button
        className="shrink-0 text-[10px] font-medium tracking-wider uppercase px-2 py-1 rounded-full transition-all opacity-50 group-hover:opacity-100"
        style={{ color: 'var(--sz-neon)', border: '1px solid var(--sz-neon)', background: 'var(--sz-neon-subtle)' }}
        onClick={() => onLaunch(idea)}
        onMouseEnter={(e) => { e.currentTarget.style.boxShadow = '0 0 8px var(--sz-neon-glow)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.boxShadow = 'none'; }}
      >
        Build
      </button>
    </div>
  );
}

// ── Empty state ────────────────────────────────────────────

function EmptyHistory() {
  return (
    <div className="flex flex-col items-center justify-center py-16 relative z-10">
      <pre
        className="text-xs leading-tight font-mono select-none text-center mb-4"
        style={{ color: 'var(--sz-text-dim)', opacity: 0.4 }}
        aria-hidden="true"
      >{`   ___\n  /   \\\n | . . |\n |  ^  |\n  \\___/`}</pre>
      <p className="text-sm" style={{ color: 'var(--sz-text-dim)' }}>
        No destruction yet.
      </p>
      <p className="text-xs mt-1" style={{ color: 'var(--sz-text-dim)', opacity: 0.5 }}>
        Generate and launch some ideas to fill the log.
      </p>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────

interface HistoryDashboardProps {
  history: HistoryEntry[];
  savedIdeas: SavedIdea[];
  onStatusChange: (workspaceId: string, status: BuildStatus) => void;
  onLaunchSaved: (idea: AppIdea) => void;
  onDeleteSaved: (idea: AppIdea) => void;
}

export function HistoryDashboard({
  history,
  savedIdeas,
  onStatusChange,
  onLaunchSaved,
  onDeleteSaved,
}: HistoryDashboardProps) {
  const isEmpty = history.length === 0 && savedIdeas.length === 0;

  if (isEmpty) return <EmptyHistory />;

  const counts = {
    launched: history.filter((h) => (h.status ?? 'launched') === 'launched').length,
    complete: history.filter((h) => h.status === 'complete').length,
    failed: history.filter((h) => h.status === 'failed').length,
  };

  return (
    <div className="px-5 py-4 relative z-10 flex flex-col gap-5">
      {/* Destruction Log */}
      {history.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="sz-kaiju-text text-xs" style={{ color: 'var(--sz-neon-dim)' }}>
              Destruction Log ({history.length}/10)
            </h3>
            <div className="flex gap-2">
              {counts.launched > 0 && (
                <span className="text-[10px]" style={{ color: 'var(--sz-neon)' }}>● {counts.launched}</span>
              )}
              {counts.complete > 0 && (
                <span className="text-[10px]" style={{ color: 'var(--sz-neon-dim)' }}>✓ {counts.complete}</span>
              )}
              {counts.failed > 0 && (
                <span className="text-[10px]" style={{ color: 'var(--sz-red)' }}>✕ {counts.failed}</span>
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

      {/* Saved Ideas */}
      {savedIdeas.length > 0 && (
        <div>
          <h3 className="sz-kaiju-text text-xs mb-2" style={{ color: 'var(--sz-orange)' }}>
            Saved Ideas ({savedIdeas.length})
          </h3>
          <div className="flex flex-col gap-1.5">
            {savedIdeas.map((entry) => (
              <SavedRow
                key={`${entry.idea.name}-${entry.savedAt}`}
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
