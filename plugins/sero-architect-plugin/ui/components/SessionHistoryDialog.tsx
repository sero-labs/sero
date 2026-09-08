import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@sero-ai/ui';

import type { SessionHistoryEntry } from '../lib/actions';
import { shortTime } from '../lib/format';

export interface SessionHistoryDialogProps {
  open: boolean;
  projectName: string;
  entries: SessionHistoryEntry[];
  loading: boolean;
  error: string | null;
  onClose(): void;
}

/** A bounded, read-only view of the managed owner's latest session turns. */
export function SessionHistoryDialog({ open, projectName, entries, loading, error, onClose }: SessionHistoryDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="ar-history-dialog" data-sero-plugin="architect">
        <DialogHeader>
          <DialogTitle>{projectName} owner session</DialogTitle>
          <DialogDescription>Recent messages from the owner session. You can read them but not edit them.</DialogDescription>
        </DialogHeader>
        <div className="ar-session-history" aria-live="polite">
          {loading && <p className="ar-why">Opening session history…</p>}
          {error && <p className="ar-error" role="alert">{error}</p>}
          {!loading && !error && entries.length === 0 && <p className="ar-why">No turns have been recorded yet.</p>}
          {entries.map((entry) => (
            <article key={`${entry.turnIndex}:${entry.timestamp}`} data-role={entry.role}>
              <header><b>{entry.role}</b><span>{shortTime(entry.timestamp)}</span></header>
              <pre>{entry.text}</pre>
            </article>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
