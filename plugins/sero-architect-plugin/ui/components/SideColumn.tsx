import { ChevronRight } from 'lucide-react';

import type { ProjectRecord } from '../../shared/record';
import { shortTime } from '../lib/format';
import { directiveThread } from '../lib/view-model';

export interface DisclosureState {
  historyOpen: boolean;
  olderOpen: boolean;
  setHistoryOpen(open: boolean): void;
  setOlderOpen(open: boolean): void;
}

/** History and older directives, each behind a disclosure whose state the host layout service keeps. */
export function SideColumn({ record, disclosures }: { record: ProjectRecord; disclosures: DisclosureState }) {
  const { older } = directiveThread(record);
  const history = [...record.history].reverse();
  return (
    <aside className="ar-col">
      <details className="ar-disc" open={disclosures.historyOpen} onToggle={(event) => disclosures.setHistoryOpen(event.currentTarget.open)} data-testid="history">
        <summary><ChevronRight className="ar-i" />History<span className="ar-n">{history.length} changes</span></summary>
        <div className="ar-inner">
          <ul className="ar-tl">
            {history.map((entry) => (
              <li key={`${entry.at}:${entry.cause}`}>
                <span className="ar-t">{shortTime(entry.at)}</span>
                <span><b>{entry.overlay ?? entry.phase}</b> · {entry.cause}</span>
              </li>
            ))}
          </ul>
        </div>
      </details>
      <details className="ar-disc" open={disclosures.olderOpen} onToggle={(event) => disclosures.setOlderOpen(event.currentTarget.open)} data-testid="older-directives">
        <summary><ChevronRight className="ar-i" />Older directives<span className="ar-n">{older.length}</span></summary>
        <div className="ar-inner">
          {older.length === 0 ? (
            <p className="ar-why">Only the latest directive so far.</p>
          ) : (
            <ul className="ar-older">
              {older.map((directive) => (
                <li key={directive.id}>
                  <b>{shortTime(directive.sentAt)} · {directive.text}</b>
                  <span>{directive.reply ? directive.reply.text : 'No reply yet.'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </details>
    </aside>
  );
}
