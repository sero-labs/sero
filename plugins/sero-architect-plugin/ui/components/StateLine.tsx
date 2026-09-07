import type { ProjectRecord } from '../../shared/record';
import { OVERLAY_LABEL, PHASES, homeRelative, overlayTone, spendRatio, spendTone, usd } from '../lib/format';
import { isAwake } from '../lib/view-model';
import { Pill } from './Pill';

const CIRCUMFERENCE = 2 * Math.PI * 28;

export function SpendRing({ spentUsd, capUsd }: { spentUsd: number; capUsd: number | null }) {
  if (capUsd === null) {
    return (
      <div className="ar-ring" data-tone="none">
        <svg viewBox="0 0 64 64"><circle className="ar-ring-bg" cx="32" cy="32" r="28" /></svg>
        <div className="ar-ring-num"><b>{usd(spentUsd)}</b><span>no cap yet</span></div>
      </div>
    );
  }
  const ratio = spendRatio(spentUsd, capUsd);
  return (
    <div className="ar-ring" data-tone={spendTone(spentUsd, capUsd)} role="img" aria-label={`Spent ${usd(spentUsd)} of ${usd(capUsd)}`}>
      <svg viewBox="0 0 64 64">
        <circle className="ar-ring-bg" cx="32" cy="32" r="28" />
        <circle
          className="ar-ring-fg"
          cx="32"
          cy="32"
          r="28"
          strokeDasharray={CIRCUMFERENCE.toFixed(1)}
          strokeDashoffset={(CIRCUMFERENCE * (1 - ratio)).toFixed(1)}
        />
      </svg>
      <div className="ar-ring-num"><b>{usd(spentUsd)}</b><span>of {usd(capUsd)} cap</span></div>
    </div>
  );
}

export function StateLine({ record, home }: { record: ProjectRecord; home: string | null }) {
  const current = PHASES.indexOf(record.phase);
  const awake = isAwake(record);
  return (
    <section className="ar-stateline" data-overlay={record.overlay ?? ''} aria-label="Project state">
      <div>
        <p className="ar-sentence"><span className="ar-who">The Architect: </span>{record.stateLine}</p>
        <div className="ar-spine" aria-hidden="true">
          {PHASES.map((phase, index) => (
            <div key={phase} className="ar-phase" data-state={index < current ? 'done' : index === current ? 'current' : 'todo'}>
              <div className="ar-bar"><i /></div>
              <span className="ar-lbl">{phase}</span>
            </div>
          ))}
        </div>
        <div className="ar-meta">
          <Pill tone={record.overlay ? 'plain' : 'ok'}>{record.phase}</Pill>
          {record.overlay && <Pill tone={overlayTone(record.overlay)}>{OVERLAY_LABEL[record.overlay]}</Pill>}
          <span className="ar-sep" />
          <span>{awake ? 'Architect awake, waiting for events' : 'Architect not woken'}</span>
          <span className="ar-sep" />
          <span>autonomy: {record.autonomy}</span>
          <span className="ar-sep" />
          <span className="ar-mono">{homeRelative(record.folder, home)}</span>
        </div>
      </div>
      <SpendRing spentUsd={record.budget.spentUsd} capUsd={record.budget.capUsd} />
    </section>
  );
}
