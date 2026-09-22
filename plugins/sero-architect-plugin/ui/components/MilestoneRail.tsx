import { useEffect, useRef } from 'react';
import { ExternalLink } from 'lucide-react';

import type { ProjectRecord } from '../../shared/record';
import { acceptedCount, railRows, type RailRow } from '../lib/view-model';
import { Evidence } from './Evidence';
import { Pill, SectionHead } from './Pill';

const LADDER = ['reported', 'verified', 'accepted', 'delivered'] as const;

export function Ladder({ level }: { level: number }) {
  return (
    <div className="ar-ladder" aria-label="Evidence state">
      {LADDER.map((name, index) => (
        <span key={name} data-on={index < level ? 2 : index === level ? 1 : 0}>{name}</span>
      )).flatMap((node, index) => (index ? [<i key={`sep-${index}`} />, node] : [node]))}
    </div>
  );
}

export interface MilestoneRailProps {
  record: ProjectRecord;
  /** Opens the Orchestrator record of a dispatched milestone. */
  onOpenDispatch(link: NonNullable<RailRow['link']>): void;
  /** A milestone whose evidence scrolls into view and opens on arrival. */
  focusMilestoneId?: string;
}

function ResearchRuns({ record }: { record: ProjectRecord }) {
  // What produces milestones is said once, in the section header above. This
  // used to repeat it as a card of its own.
  if (record.research.length === 0) return null;
  return (
    <div className="ar-card">
      <SectionHead title="Research runs" count={String(record.research.length)} />
      {record.research.map((run) => (
        <div key={run.id} className="ar-fact"><span>{run.question}</span><b data-tone="ok">done</b></div>
      ))}
    </div>
  );
}

export function MilestoneRail({ record, onOpenDispatch, focusMilestoneId }: MilestoneRailProps) {
  const rows = railRows(record);
  const focusRef = useRef<HTMLDivElement>(null);
  // Scrolling and opening the evidence are external DOM effects: the record is
  // unchanged, so neither is derived state. The evidence stays open once the
  // reader has it, which a controlled prop would not.
  useEffect(() => {
    const node = focusRef.current;
    if (!node || !focusMilestoneId) return;
    node.scrollIntoView?.({ block: 'start' });
    const evidence = node.querySelector<HTMLDetailsElement>('details.ar-evidence');
    if (evidence) evidence.open = true;
  }, [focusMilestoneId]);
  if (rows.length === 0) {
    // Not made yet, rather than empty: the charter names the milestones, and
    // the charter comes after research. One quiet line in the header says so.
    return (
      <section>
        <SectionHead title="Milestones" count="the charter names them, after research" />
        <ResearchRuns record={record} />
      </section>
    );
  }
  return (
    <section>
      <SectionHead title="Milestones" count={`${acceptedCount(record)} of ${rows.length} accepted`} />
      <div className="ar-card ar-rail">
        {rows.map(({ milestone, dot, label, tone, sub, ladder, link }) => (
          <div key={milestone.id} ref={milestone.id === focusMilestoneId ? focusRef : undefined} className="ar-ms" data-status={milestone.status} data-milestone={milestone.id}>
            <div className="ar-node"><span className="ar-dot" data-dot={dot} /></div>
            <div className="ar-ms-text">
              <b>{milestone.title}</b>
              {sub && <span>{sub}</span>}
              {ladder !== null && <Ladder level={ladder} />}
              {milestone.evidence && <Evidence evidence={milestone.evidence} projectId={record.id} />}
            </div>
            <div className="ar-ms-right">
              <span className="ar-kind">{link?.kind ?? (milestone.id === 'maintenance' ? 'workflow' : '')}</span>
              <Pill tone={tone}>{label}</Pill>
              {/* The recovery control lives in the project header, beside the
                  reason it answers. Repeating it here put the same button on
                  the page twice with no way to tell which one mattered. */}
              {link && (
                <button type="button" className="ar-btn-link" onClick={() => onOpenDispatch(link)} data-testid={`open-${milestone.id}`}>
                  Open in Orchestrator <ExternalLink className="ar-i" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
