import type { ReactNode } from "react";
import type { ProjectRecord } from "../../shared/record";
import {
  PHASES,
  headerSentences,
  homeRelative,
  money,
  spendRatio,
  spendTone,
} from "../lib/format";
import { Button } from "@sero-ai/ui";
import { relativeTime, sessionStartedAt } from "@sero-ai/common";
import { milestoneCounts, projectActivity } from "../../shared/activity";
import { ActivityGlyphIcon } from "./ActivityWord";

const CIRCUMFERENCE = 2 * Math.PI * 28;

export function SpendRing({
  spentUsd,
  capUsd,
  incomplete = false,
}: {
  spentUsd: number;
  capUsd: number | null;
  incomplete?: boolean;
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
        <span>spent of {money(capUsd)} budget</span>
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
 * The top of a project: the state in plain words, the same activity line the
 * list shows, and the controls that fix it beside that sentence.
 *
 * The controls are here because the thing that stopped the work and the thing
 * that fixes it belong together: the cap strip used to be two cards further
 * down, under a heading that said nothing needed the user. Everything offered
 * here also exists where it did before, so nothing is only reachable from the
 * header.
 *
 * The Architect's own sentence is complete under "What Architect reported". It
 * used to be the heading, which is how a paragraph the owner wrote to itself
 * became the first thing the user read.
 */
export function StateLine({
  record,
  home,
  actions,
  form,
  runtimeRunning,
}: {
  record: ProjectRecord;
  home: string | null;
  /** What this state asks the user to do. Empty when it asks nothing. */
  actions?: readonly HeaderAction[];
  /** A control that needs a value before it can run, such as the new cap. */
  form?: ReactNode;
  /** Whether the Architect runtime is running in this session. */
  runtimeRunning: boolean;
}) {
  const current = PHASES.indexOf(record.phase);
  const unlinked = record.blockedReason?.startsWith(
    "dispatch state could not be confirmed after restart:",
  );
  const activity = projectActivity(record, { sessionStartedAt: sessionStartedAt(), runtimeRunning });
  const lines = headerSentences(activity);
  const counts = milestoneCounts(record);
  return (
    <section
      className="ar-stateline"
      data-overlay={record.overlay ?? ""}
      aria-label="Project state"
    >
      <div className="ar-stateline-main">
        <h3 className="ar-sentence">{activity.headline}</h3>
        {/* The drawing puts a third line between the heading and this one,
            naming the work again. The record holds that only inside the
            headline, so the chip rides the owner sentence instead of printing
            the same words twice. */}
        <p className="ar-stateline-who">
          <ActivityGlyphIcon state={activity.state} />
          <span>{lines.owner}</span>
        </p>
        {/* Why the work stopped, when the record saved a cause. It used to sit
            among the project's history entries, so the page said a Room was
            cancelled without ever saying why. */}
        {lines.reason && <p className="ar-stateline-why">{lines.reason}</p>}
        {(form || (actions && actions.length > 0)) && (
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
          </div>
        )}
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
              {index === current && record.overlay ? `${phase} · ${record.overlay}` : phase}
            </div>
          ))}
        </div>
        <div className="ar-meta">
          <span>
            {counts.total === 0
              ? "no milestones yet"
              : `${counts.accepted} of ${counts.total} milestones accepted`}
          </span>
          <code>{homeRelative(record.folder, home)}</code>
        </div>
        {record.stateLine && (
          <details className="ar-reported">
            <summary>What Architect reported, in its own words<span className="ar-when">{relativeTime(record.updatedAt)}</span></summary>
            <p>{record.stateLine}</p>
          </details>
        )}
      </div>
      <SpendRing
        spentUsd={record.budget.spentUsd}
        capUsd={record.budget.capUsd}
        incomplete={record.budget.incomplete !== false}
      />
    </section>
  );
}
