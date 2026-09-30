/**
 * LiveBlock — what a running agent does now, then the last lines it wrote.
 *
 * One block is used on every surface that shows a running agent: a Workflow
 * step, a one-answer call, a chat tool call, a Room Watch tile and a Design
 * Library tile. It carries no model tag, no figures footer and no tool list.
 *
 * `SubagentLiveBlock` feeds the block from a subagent run. It opens the host
 * watch while it is mounted, so a hidden block costs nothing.
 */

import * as React from "react";

import { cn } from "../../lib/utils";
import {
  formatElapsed,
  getSubagentLiveBridge,
  openSubagentLiveWatch,
  type LiveAgentSnapshot,
} from "./live-watch";

export interface LiveBlockProps extends React.ComponentProps<"div"> {
  /** Agent name. Shown only where one place lists several agents. */
  agentName?: string;
  /** The tool running now. Omitted while the agent writes its answer. */
  activity?: { toolName: string; argsSummary: string } | null;
  /** A quiet line that replaces the tool line, e.g. `checking the result`. */
  quietLabel?: string;
  /** Text the agent wrote. The newest line stays in view. */
  text: string;
  /** Fixed-width face, for a raw reply. */
  monospace?: boolean;
  /** Show the live caret. Off for a dimmed waiting or finished tile. */
  live?: boolean;
  /** When the current line started. */
  startedAt?: number;
}

/** Keep the elapsed time moving while the block is mounted. */
function useElapsedLabel(startedAt: number): string {
  const [, tick] = React.useState(0);

  React.useEffect(() => {
    const timer = setInterval(() => tick((count) => count + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  return formatElapsed(Date.now() - startedAt);
}

/** The line naming what the agent does now. */
function nowLine(
  quietLabel: string | undefined,
  activity: LiveBlockProps["activity"],
): { text: string; quiet: boolean } {
  if (quietLabel) return { text: quietLabel, quiet: true };
  if (activity) {
    const args = activity.argsSummary.trim();
    return { text: args ? `${activity.toolName} ${args}` : activity.toolName, quiet: false };
  }
  return { text: "writing its answer", quiet: true };
}

/** What a running agent does now, then the last lines it wrote. */
export function LiveBlock({
  agentName,
  activity,
  quietLabel,
  text,
  monospace = false,
  live = true,
  startedAt,
  className,
  ...props
}: LiveBlockProps) {
  const fallbackStart = React.useRef(Date.now());
  const started = startedAt ?? fallbackStart.current;
  const elapsed = useElapsedLabel(started);
  const now = nowLine(quietLabel, activity);

  return (
    <div
      data-slot="live-block"
      className={cn(
        "overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface)]",
        className,
      )}
      {...props}
    >
      <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] px-2.5 py-1.5">
        {agentName ? (
          <span className="shrink-0 text-xs font-medium text-[var(--text-primary)]">
            {agentName}
          </span>
        ) : null}
        <span
          className={cn(
            "min-w-0 flex-1 truncate",
            !now.quiet && "font-mono",
            now.quiet ? "text-xs text-[var(--text-muted)]" : "text-xs text-[var(--text-secondary)]",
          )}
        >
          {now.text}
        </span>
        <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--text-muted)]">
          {elapsed}
        </span>
      </div>
      <div
        className={cn(
          "flex max-h-16 flex-col justify-end overflow-hidden px-2.5 py-2",
          monospace
            ? "font-mono text-xs break-all text-[var(--text-muted)]"
            : "text-xs leading-relaxed text-[var(--text-muted)]",
        )}
      >
        <span>
          {text}
          {live ? (
            <span
              aria-hidden="true"
              className="ml-px inline-block h-3 w-0.5 animate-pulse bg-[var(--brand-primary)] align-middle"
            />
          ) : null}
        </span>
      </div>
    </div>
  );
}

/** A live block for one subagent run, watched only while it is shown. */
export function SubagentLiveBlock({
  runId,
  ...props
}: Omit<LiveBlockProps, "text" | "activity" | "startedAt"> & { runId: string }) {
  const snapshot = useSubagentLive(runId);

  return (
    <LiveBlock
      {...props}
      text={snapshot.text}
      activity={snapshot.tool}
      startedAt={snapshot.startedAt}
    />
  );
}

/**
 * Follow one subagent run.
 *
 * The watch opens when the run id appears and closes when the block hides or
 * unmounts. Nothing arrives after that.
 */
export function useSubagentLive(runId: string | null): LiveAgentSnapshot {
  const [snapshot, setSnapshot] = React.useState<LiveAgentSnapshot>(() => ({
    text: "",
    tool: null,
    startedAt: Date.now(),
  }));

  React.useEffect(() => {
    if (!runId) return;
    const bridge = getSubagentLiveBridge();
    if (!bridge) return;
    return openSubagentLiveWatch(bridge, runId, setSnapshot);
  }, [runId]);

  return snapshot;
}
