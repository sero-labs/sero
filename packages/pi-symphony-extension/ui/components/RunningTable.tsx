/**
 * RunningTable — table of active agent sessions.
 */

import type { RunningEntry } from '../../shared/types';
import { IssueRow } from './IssueRow';

interface RunningTableProps {
  running: RunningEntry[];
}

export function RunningTable({ running }: RunningTableProps) {
  if (running.length === 0) return null;

  return (
    <div className="sy-card">
      <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--sy-border)' }}>
        <h2 className="text-sm font-medium" style={{ color: 'var(--sy-text)' }}>
          Running ({running.length})
        </h2>
      </div>
      <div className="divide-y" style={{ borderColor: 'var(--sy-border)' }}>
        {running.map((entry) => (
          <IssueRow key={entry.issueId} entry={entry} />
        ))}
      </div>
    </div>
  );
}
