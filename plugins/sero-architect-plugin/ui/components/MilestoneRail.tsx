import { ChevronRight, ExternalLink } from 'lucide-react';

import type { EvidenceRecord, ProjectRecord } from '../../shared/record';
import { acceptedCount, evidenceLines, railRows, type RailRow } from '../lib/view-model';
import { Pill, Quiet, SectionHead } from './Pill';

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

export function Evidence({ evidence }: { evidence: EvidenceRecord }) {
  const lines = evidenceLines(evidence);
  return (
    <details className="ar-evidence">
      <summary><ChevronRight className="ar-i" />Evidence at {evidence.commit.slice(0, 7)}{evidence.stale ? ' · stale' : ''}</summary>
      <div className="ar-ev">
        {lines.map((line) => (
          <div key={`${line.check}:${line.result}`}>
            <span data-state={line.state}>{line.state === 'ok' ? '✓' : line.state === 'err' ? '✕' : '·'}</span>
            <span>{line.check}</span>
            <span data-state={line.state === 'dim' ? 'dim' : undefined}>{line.result}</span>
          </div>
        ))}
      </div>
    </details>
  );
}

export interface MilestoneRailProps {
  record: ProjectRecord;
  /** Opens the Orchestrator record of a dispatched milestone. */
  onOpenDispatch(link: NonNullable<RailRow['link']>): void;
}

function ResearchRuns({ record }: { record: ProjectRecord }) {
  if (record.research.length === 0) return <Quiet>The charter will name the milestones.</Quiet>;
  return (
    <div className="ar-card">
      <SectionHead title="Research runs" count={String(record.research.length)} />
      {record.research.map((run) => (
        <div key={run.id} className="ar-fact"><span>{run.question}</span><b data-tone="ok">done</b></div>
      ))}
    </div>
  );
}

export function MilestoneRail({ record, onOpenDispatch }: MilestoneRailProps) {
  const rows = railRows(record);
  if (rows.length === 0) {
    return (
      <section>
        <SectionHead title="Milestones" count="none yet" />
        <ResearchRuns record={record} />
      </section>
    );
  }
  return (
    <section>
      <SectionHead title="Milestones" count={`${acceptedCount(record)} of ${rows.length} accepted`} />
      <div className="ar-card ar-rail">
        {rows.map(({ milestone, dot, label, tone, sub, ladder, link }) => (
          <div key={milestone.id} className="ar-ms" data-status={milestone.status}>
            <div className="ar-node"><span className="ar-dot" data-dot={dot} /></div>
            <div className="ar-ms-text">
              <b>{milestone.title}</b>
              {sub && <span>{sub}</span>}
              {ladder !== null && <Ladder level={ladder} />}
              {milestone.evidence && <Evidence evidence={milestone.evidence} />}
            </div>
            <div className="ar-ms-right">
              <span className="ar-kind">{link?.kind ?? (milestone.id === 'maintenance' ? 'workflow' : '')}</span>
              <Pill tone={tone}>{label}</Pill>
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
