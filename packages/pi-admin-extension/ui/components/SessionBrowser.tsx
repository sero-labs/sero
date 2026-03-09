/**
 * SessionBrowser — session list + message viewer.
 *
 * Sessions can be very large (500KB+ JSONL files with hundreds of
 * messages). We use:
 *  1. Session list from the sessions API (lightweight metadata)
 *  2. On select: load via appState.readText and parse JSONL
 *  3. CSS content-visibility: auto — browser skips layout/paint
 *     for off-screen rows, keeping scroll smooth without true
 *     virtualisation.
 */

import { useCallback, memo } from 'react';
import { useSessionFiles } from '../hooks/useSeroFiles';
import { SessionList } from './SessionList';
import { SessionDetail } from './SessionDetail';

interface SessionBrowserProps {
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
}

export const SessionBrowser = memo(function SessionBrowser({
  selectedSessionId,
  onSelectSession,
}: SessionBrowserProps) {
  const { sessions, loading, reload } = useSessionFiles();

  const handleSelect = useCallback((id: string) => {
    onSelectSession(id);
  }, [onSelectSession]);

  return (
    <div className="flex min-h-0 flex-1">
      <SessionList
        sessions={sessions}
        loading={loading}
        selectedId={selectedSessionId}
        onSelect={handleSelect}
        onReload={reload}
      />
      <div className="min-h-0 flex-1 overflow-hidden">
        <div key={selectedSessionId ?? '__empty'} className="admin-fade-in h-full">
          {selectedSessionId ? (
            <SessionDetail
              sessionId={selectedSessionId}
              sessions={sessions}
            />
          ) : (
            <SessionEmptyState count={sessions.length} />
          )}
        </div>
      </div>
    </div>
  );
});

// ── Empty state ────────────────────────────────────────────

const SessionEmptyState = memo(function SessionEmptyState({ count }: { count: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10">
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-emerald-400/60"
        >
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <p className="mt-3 text-xs text-muted-foreground/50">
        {count > 0 ? 'Select a session to browse' : 'No sessions found'}
      </p>
    </div>
  );
});
