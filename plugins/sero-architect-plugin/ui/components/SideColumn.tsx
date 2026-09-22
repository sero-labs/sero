import { ChevronRight } from 'lucide-react';

import type { ProjectRecord } from '../../shared/record';
import { shortTime } from '../lib/format';
import { directiveThread } from '../lib/view-model';

export interface DisclosureState {
  olderOpen: boolean;
  setOlderOpen(open: boolean): void;
}

/** The project page's right column. History is its own view; older directives keep this disclosure. */
export function SideColumn({ record, disclosures }: { record: ProjectRecord; disclosures: DisclosureState }) {
  const { older } = directiveThread(record);
  return (
    <aside className="ar-col">
      <details className="ar-disc" open={disclosures.olderOpen} onToggle={(event) => disclosures.setOlderOpen(event.currentTarget.open)} data-testid="older-directives">
        <summary><ChevronRight className="ar-i" />Older directives<span className="ar-n">{older.length}</span></summary>
        <div className="ar-inner">
          {older.length === 0 ? (
            <p className="ar-why">No older directives yet.</p>
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
