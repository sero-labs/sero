import type { ProjectRecord } from "../../shared/record";
import {
  OVERLAY_LABEL,
  PHASES,
  homeRelative,
  overlayTone,
  spendRatio,
  spendTone,
  usd,
} from "../lib/format";
import { AUTONOMY_LABEL, projectActivity } from "../lib/view-model";
import { Pill } from "./Pill";

const CIRCUMFERENCE = 2 * Math.PI * 28;

export function SpendRing({
  spentUsd,
  capUsd,
}: {
  spentUsd: number;
  capUsd: number | null;
}) {
  if (capUsd === null) {
    return (
      <div className="ar-ring" data-tone="none">
        <svg viewBox="0 0 64 64">
          <circle className="ar-ring-bg" cx="32" cy="32" r="28" />
        </svg>
        <div className="ar-ring-num">
          <b>{usd(spentUsd)}</b>
          <span>no cap yet</span>
        </div>
      </div>
    );
  }
  const ratio = spendRatio(spentUsd, capUsd);
  return (
    <div
      className="ar-ring"
      data-tone={spendTone(spentUsd, capUsd)}
      role="img"
      aria-label={`Spent ${usd(spentUsd)} of ${usd(capUsd)}`}
    >
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
      <div className="ar-ring-num">
        <b>${spentUsd.toFixed(2)}</b>
        <span>spent of {usd(capUsd)} budget</span>
      </div>
    </div>
  );
}

export function StateLine({
  record,
  home,
}: {
  record: ProjectRecord;
  home: string | null;
}) {
  const current = PHASES.indexOf(record.phase);
  const unlinked = record.blockedReason?.startsWith(
    "dispatch state could not be confirmed after restart:",
  );
  const activity = projectActivity(record);
  return (
    <section
      className="ar-stateline"
      data-overlay={record.overlay ?? ""}
      aria-label="Project state"
    >
      <div>
        <p className="ar-sentence">
          {record.blockedReason ? "Work is on hold" : record.stateLine}
        </p>
        {record.blockedReason && (
          <div role="alert">
            <p className="ar-why">
              {unlinked
                ? "Architect lost the link to a workflow when Sero restarted. The work may have started, so Architect will not start another copy. The existing workflow must be reconnected before this project can continue."
                : record.blockedReason}
            </p>
            {unlinked && (
              <details>
                <summary>Technical details</summary>
                <p className="ar-why">{record.blockedReason}</p>
              </details>
            )}
          </div>
        )}
        <p className="ar-why">Owner model: {record.session.model ?? 'Admin MED (permission pending)'}{record.session.thinking ? ` · ${record.session.thinking} thinking` : ''}</p>
        <div className="ar-spine" aria-hidden="true">
          {PHASES.map((phase, index) => (
            <div
              key={phase}
              className="ar-phase"
              data-state={
                index < current
                  ? "done"
                  : index === current
                    ? "current"
                    : "todo"
              }
            >
              <div className="ar-bar">
                <i />
              </div>
              <span className="ar-lbl">{phase}</span>
            </div>
          ))}
        </div>
        <div className="ar-meta">
          {record.overlay && (
            <Pill tone={overlayTone(record.overlay)}>
              {OVERLAY_LABEL[record.overlay]}
            </Pill>
          )}
          {!record.blockedReason && (
            <span
              role="status"
              className={
                record.session.workingSince
                  ? "text-primary font-medium animate-pulse motion-reduce:animate-none"
                  : undefined
              }
            >
              {activity}
            </span>
          )}
          <span>{AUTONOMY_LABEL[record.autonomy]}</span>
        </div>
        <p className="ar-why ar-mono break-all mt-2">
          {homeRelative(record.folder, home)}
        </p>
      </div>
      <SpendRing
        spentUsd={record.budget.spentUsd}
        capUsd={record.budget.capUsd}
      />
    </section>
  );
}
