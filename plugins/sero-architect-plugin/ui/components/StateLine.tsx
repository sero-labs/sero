import type { ReactNode } from "react";
import type { ProjectRecord } from "../../shared/record";
import { money, spendRatio, spendTone } from "../lib/format";
import { Button } from "@sero-ai/ui";
import { sessionStartedAt, type FeedbackSummary } from "@sero-ai/common";
import { projectActivity } from "../../shared/activity";
import { hasAgreement } from "../../shared/agreement";
import { needsYouItems } from "../lib/view-model";
import { ActivityLines } from "./ActivityWord";

const CIRCUMFERENCE = 2 * Math.PI * 28;

export function SpendRing({
  spentUsd,
  capUsd,
  incomplete = false,
  capLabel = "budget",
}: {
  spentUsd: number;
  capUsd: number | null;
  incomplete?: boolean;
  /** What the cap is called: the start cap of an agreement, or a charter budget. */
  capLabel?: string;
}) {
  if (capUsd === null) {
    return (
      <div className="ar-ring" data-tone="none">
        <svg viewBox="0 0 64 64">
          <circle className="ar-ring-bg" cx="32" cy="32" r="28" />
        </svg>
        <div className="ar-ring-num">
          <b>{money(spentUsd)}</b>
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
      title={incomplete ? "Some usage is unavailable. The shown cost is a lower bound." : undefined}
      aria-label={`Spent ${money(spentUsd)} of ${money(capUsd)}${incomplete ? ". Cost incomplete." : ""}`}
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
        <b>{money(spentUsd)}</b>
        <span>spent of {money(capUsd)} {capLabel}</span>
      </div>
    </div>
  );
}

export interface HeaderAction {
  label: string;
  run(): void;
  /** The action the state is really asking for. At most one per state. */
  primary?: boolean;
}

/**
 * The top of a project: what the user asked for, what is happening now, the
 * controls that fix it, and the ways into the work behind it.
 *
 * It stays this short whatever the project holds. The plan, the reports, the
 * research and the checks are one click away in the Work view, so a long plan
 * never makes this page longer.
 */
export function StateLine({
  record,
  actions,
  form,
  runtimeRunning,
  feedback,
  links,
}: {
  record: ProjectRecord;
  /** What this state asks the user to do. Empty when it asks nothing. */
  actions?: readonly HeaderAction[];
  /** A control that needs a value before it can run, such as the new cap. */
  form?: ReactNode;
  /** Whether the Architect runtime is running in this session. */
  runtimeRunning: boolean;
  /** What the project's delegated work reports now. Absent on a list row. */
  feedback?: FeedbackSummary | null;
  /** The ways into the work behind this line: the preview, Watch work, Evidence. */
  links?: ReactNode;
}) {
  const unlinked = record.blockedReason?.startsWith(
    "dispatch state could not be confirmed after restart:",
  );
  const activity = projectActivity(record, { sessionStartedAt: sessionStartedAt(), runtimeRunning, feedback });
  const agreed = hasAgreement(record);
  // The question is on its card right under this line, so the line counts the
  // questions instead of printing one of them twice.
  const questions = needsYouItems(record).filter((item) => item.kind === 'decision').length;
  const shown = activity.state === 'waiting-for-you' && questions > 0
    ? { ...activity, headline: questions === 1 ? 'Needs you · One question' : `Needs you · ${questions} questions` }
    : activity;
  // The Architect's own short sentences. They are display only: the state above
  // them comes from the record and from what the work reports.
  const delivered = record.overview?.result?.text;
  const next = delivered ?? record.overview?.objective?.text;
  return (
    <section
      className="ar-stateline"
      data-overlay={record.overlay ?? ""}
      aria-label="Project state"
    >
      <div className="ar-stateline-main">
        <h2 className="ar-sentence ar-goal">{record.overview?.outcome?.text ?? record.idea}</h2>
        {!agreed && <p className="ar-limits">This project uses the charter flow. The charter flow is deprecated.</p>}
        <ActivityLines activity={shown} />
        {activity.reason && <p className="ar-stateline-why">{activity.reason}</p>}
        <div className="ar-act-row">
          {form}
          {actions?.map((item) => (
            <Button
              key={item.label}
              size="sm"
              className={`ar-btn ar-btn-sm ${item.primary ? 'ar-btn-solid' : ''} ar-act-btn`}
              onClick={item.run}
            >
              {item.label}
            </Button>
          ))}
          {links}
        </div>
        {next && <p className="ar-next">{next}</p>}
        {record.blockedReason && unlinked && (
          <div role="alert">
            <p className="ar-why">
              Architect lost the link to a workflow when Sero restarted. The work may have started, so
              Architect will not start another copy. The existing workflow must be reconnected before
              this project can continue.
            </p>
            <details>
              <summary>Technical details</summary>
              <p className="ar-why">{record.blockedReason}</p>
            </details>
          </div>
        )}
      </div>
      <SpendRing
        spentUsd={record.budget.spentUsd}
        capUsd={record.budget.capUsd}
        incomplete={record.budget.incomplete !== false}
        capLabel={agreed ? "start cap" : "budget"}
      />
    </section>
  );
}
