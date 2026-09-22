import { Fragment, useState } from 'react';
import { Button } from '@sero-ai/ui';
import { ChevronRight, ExternalLink } from 'lucide-react';

import type { HistoryEntry, ProjectRecord } from '../../shared/record';
import {
  HISTORY_LINK_LABEL,
  HISTORY_PAGE,
  historyClock,
  historyDays,
  historyDot,
  historyHeadline,
  historyHeader,
  historyLink,
} from '../lib/history-view';
import type { HistoryFolds } from '../lib/page-helpers';
import { ChevronLeft } from 'lucide-react';

export interface HistoryViewProps {
  record: ProjectRecord;
  /** Returns to the project page. */
  onBack(): void;
  /** Opens a dispatched Workflow or Room in the Orchestrator. */
  onOpenDispatch(link: { kind: 'workflow' | 'room'; id: string; workspaceId: string }): void;
  /** Opens the project page focused on one milestone's evidence. */
  onOpenEvidence(milestoneId: string): void;
  folds: HistoryFolds;
}

const DOT_TONE: Record<NonNullable<ReturnType<typeof historyDot>>, string> = {
  block: 'err',
  question: 'warn',
  accepted: 'ok',
};

function HistoryRow({ entry, record, noteKey, folds, onOpenDispatch, onOpenEvidence }: {
  entry: HistoryEntry;
  record: ProjectRecord;
  noteKey: string;
  folds: HistoryFolds;
  onOpenDispatch(link: { kind: 'workflow' | 'room'; id: string; workspaceId: string }): void;
  onOpenEvidence(milestoneId: string): void;
}) {
  const { status, line } = historyHeadline(entry);
  const dot = historyDot(entry);
  const link = historyLink(entry);
  // A milestone the record holds no evidence for has nothing to open, so no
  // broken control is offered for it.
  const linkOpens = link !== null
    && (link.kind !== 'evidence' || record.milestones.some((item) => item.id === link.milestoneId && item.evidence !== null));
  const open = folds.opened.has(noteKey);
  return (
    <div className="ar-hist-row" data-dot={dot ?? 'none'}>
      <span className="ar-hist-time">{historyClock(entry.at)}</span>
      <span className="ar-hist-dot" data-dot={dot ?? 'none'} />
      <span className="ar-hist-text">
        {status && <span className="ar-hist-status" data-tone={DOT_TONE[dot ?? 'accepted']}>{status}</span>}
        {line}
      </span>
      <span className="ar-hist-link">
        {linkOpens && (link.kind === 'evidence' ? (
          <button type="button" className="ar-hist-open" onClick={() => onOpenEvidence(link.milestoneId)}>
            {HISTORY_LINK_LABEL[link.kind]} <ExternalLink className="ar-i" />
          </button>
        ) : (
          <button type="button" className="ar-hist-open" onClick={() => onOpenDispatch({ kind: link.kind, id: link.id, workspaceId: '' })}>
            {HISTORY_LINK_LABEL[link.kind]} <ExternalLink className="ar-i" />
          </button>
        ))}
      </span>
      <span className="ar-hist-fold">
        {entry.detail && (
          <button
            type="button"
            className="ar-hist-toggle"
            aria-label={open ? 'Hide the note' : 'Show the note'}
            aria-expanded={open}
            onClick={() => folds.toggle(noteKey)}
          >
            <ChevronRight className="ar-i" />
          </button>
        )}
      </span>
      {entry.detail && open && <p className="ar-hist-note">{entry.detail}</p>}
    </div>
  );
}

/**
 * A project's History as its own view: a centred timeline, one heading per day,
 * a dot for a block, a question or an accepted milestone, a link from an entry
 * to what it names, and the note folded under its entry.
 */
export function HistoryView({ record, onBack, onOpenDispatch, onOpenEvidence, folds }: HistoryViewProps) {
  const entries = record.history;
  const [limit, setLimit] = useState(HISTORY_PAGE);
  const header = historyHeader(entries);
  const days = historyDays(entries, limit);
  const hidden = Math.max(0, entries.length - limit);
  const workspaceId = record.workspaceId ?? '';

  return (
    <div className="ar-body ar-history">
      <div className="ar-models-head">
        <Button variant="outline" size="sm" className="ar-btn" onClick={onBack}><ChevronLeft className="ar-i" />Back to project</Button>
        <span className="ar-models-title">History · {record.name}</span>
      </div>
      <div className="ar-hist">
        <div className="ar-hist-head">
          <b>{header.count}</b>
          {header.range && <span>{header.range}</span>}
        </div>
        {days.length === 0 ? (
          <p className="ar-why">Nothing has happened yet.</p>
        ) : (
          days.map((day) => (
            <Fragment key={day.label}>
              <div className="ar-hist-day">{day.label}</div>
              {day.rows.map(({ entry, key }) => (
                <HistoryRow
                  key={key}
                  entry={entry}
                  record={record}
                  noteKey={key}
                  folds={folds}
                  onOpenDispatch={(link) => onOpenDispatch({ ...link, workspaceId })}
                  onOpenEvidence={onOpenEvidence}
                />
              ))}
            </Fragment>
          ))
        )}
        {hidden > 0 && (
          <button type="button" className="ar-btn ar-hist-more" onClick={() => setLimit(entries.length)}>
            Show {hidden} earlier
          </button>
        )}
      </div>
    </div>
  );
}
