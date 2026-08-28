/**
 * The plan map's step card (styleguide prototype
 * `prototypes/plan-view-layouts/serpentine.html`).
 *
 * Each line holds one kind of thing: what the step is (number, title, state),
 * what it produced (outcome and elapsed time), and how it runs (agent and
 * marks). The state sits at the end of the title line, and the left edge repeats
 * it as a colour, so a scan down a column reads the states first.
 */

import { Bot, Circle, GitBranch, MessageSquare, Repeat, ShieldCheck, Sparkles, Users } from 'lucide-react';
import type { Loop, LoopStepDefinition, StepStatus } from '../../shared/types';
import { guardLabel } from '../lib/guard-label';
import { mapRouteState, stepElapsedLabel } from '../lib/plan-map-state';
import { STEP_STATUS_STYLE } from '../lib/status-style';

const CARD_STATUS_CLASS: Record<StepStatus, string> = {
  pending: 'border-border/75 border-l-border bg-card',
  ready: 'border-emerald-500/40 border-l-emerald-500/60 bg-emerald-500/[0.04]',
  running: 'border-emerald-400/70 border-l-emerald-400 bg-emerald-500/[0.08]',
  succeeded: 'border-emerald-500/35 border-l-emerald-500/70 bg-emerald-500/[0.04]',
  failed: 'border-rose-500/55 border-l-rose-500 bg-rose-500/[0.07]',
  blocked: 'border-amber-500/55 border-l-amber-500 bg-amber-500/[0.07]',
  skipped: 'border-border/70 border-l-border bg-card',
  'needs-revision': 'border-amber-500/55 border-l-amber-500 bg-amber-500/[0.07]',
};

const EXECUTION_ICON = {
  'background-agent': Bot,
  'active-session': MessageSquare,
  model: Sparkles,
} as const;

interface PlanMapCardProps {
  loop: Loop;
  step: LoopStepDefinition;
  number: number;
  /** A step inside a parallel or branch stage: one line less tall. */
  grouped?: boolean;
  /** Title lines the card's fixed height reserves. */
  titleLines: 1 | 2;
  selected: boolean;
  onSelect: () => void;
  style?: React.CSSProperties;
}

export function PlanMapCard({ loop, step, number, grouped, titleLines, selected, onSelect, style }: PlanMapCardProps) {
  const status = loop.runtime.stepStates[step.id]?.status ?? 'pending';
  const dimmed = mapRouteState(loop, step) === 'not-taken';
  const shell = [
    grouped ? 'rounded-sm' : 'absolute rounded-md',
    'flex flex-col gap-1.5 overflow-hidden border border-l-[3px] px-2 py-1.5 text-left transition-colors hover:border-foreground/30',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    CARD_STATUS_CLASS[status],
    dimmed ? 'opacity-80' : '',
    selected ? 'ring-1 ring-inset ring-sky-400/80' : '',
  ].join(' ');

  const elapsed = stepElapsedLabel(loop, step.id);
  const detail = detailText(loop, step);

  return (
    <button type="button" className={shell} style={style} onClick={onSelect} aria-pressed={selected} title={step.title}>
      <span className="flex items-start gap-2">
        <StepNumber number={number} />
        <span className={`min-w-0 flex-1 text-base font-medium leading-tight ${grouped || titleLines === 1 ? 'truncate' : 'line-clamp-2'}`}>
          {step.title}
        </span>
        <StepState status={status} />
      </span>
      <span className="flex min-h-4 items-end gap-2">
        <span className="min-w-0 flex-1 line-clamp-2 text-xs leading-snug text-foreground/70" title={detail || undefined}>{detail}</span>
        {elapsed && <span className="shrink-0 text-xs tabular-nums text-foreground/70">{elapsed}</span>}
      </span>
      <span className="mt-auto flex items-center gap-1.5 overflow-hidden">
        <ExecutionChip step={step} />
        <StepMarks step={step} />
      </span>
    </button>
  );
}

/** The dashed frame around a parallel or branch stage. */
export function PlanMapStageFrame({
  kind, branchVar, loop, steps, wide, children, style,
}: {
  kind: 'parallel' | 'branch' | 'mixed';
  branchVar?: string;
  loop: Loop;
  /** How many steps the stage holds, for the parallel label. */
  steps: number;
  /** Full-width rows: the frame drops its side padding so the columns align. */
  wide: boolean;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const chosen = branchVar ? loop.runtime.variables[branchVar] : undefined;
  let label = `Run together · ${steps} steps`;
  if (kind === 'branch') {
    label = `Branch · ${branchVar}${chosen === undefined ? ' (not decided yet)' : ` = ${routeText(chosen)}`}`;
  } else if (kind === 'mixed') {
    label = `Same stage · ${steps} steps`;
  }

  return (
    <div
      className={`absolute flex flex-col gap-1.5 overflow-hidden rounded-md border border-dashed border-border bg-background/40 ${wide ? 'py-1.5' : 'p-1.5'}`}
      style={style}
    >
      <span className={`flex items-center gap-1.5 text-xs text-foreground/70 ${wide ? 'px-3' : 'px-1'}`}>
        {kind === 'parallel' ? <Users className="h-3.5 w-3.5" /> : <GitBranch className="h-3.5 w-3.5" />}
        {label}
      </span>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

function StepNumber({ number }: { number: number }) {
  return <span className="pt-0.5 text-xs tabular-nums text-foreground/70">{number}</span>;
}

function StepState({ status }: { status: StepStatus }) {
  const style = STEP_STATUS_STYLE[status];
  return (
    <span className={`flex shrink-0 items-center gap-1.5 text-xs ${statusTextClass(status)}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${style.dot} ${status === 'running' ? 'animate-pulse' : ''}`} />
      {style.label}
    </span>
  );
}

function ExecutionChip({ step }: { step: LoopStepDefinition }) {
  const Icon = EXECUTION_ICON[step.execution.type];
  const role = step.execution.type === 'background-agent' ? step.execution.agent : undefined;
  return (
    <span className="flex min-w-0 shrink items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-xs text-foreground/70">
      <Icon className="h-3 w-3 shrink-0" />
      <span className="truncate">{role ? `agent · ${role}` : step.execution.type}</span>
    </span>
  );
}

function StepMarks({ step }: { step: LoopStepDefinition }) {
  const marks: React.ReactNode[] = [];
  if (step.fanOut) {
    marks.push(
      <Mark key="fan-out" label={`One run for each item, up to ${step.fanOut.maxItems}`}>
        <Users className="h-3 w-3" />×{step.fanOut.maxItems}
      </Mark>,
    );
  }
  if (step.gate) {
    marks.push(<Mark key="gate" label="Approval gate" className="text-sky-400"><ShieldCheck className="h-3 w-3" /></Mark>);
  }
  if (step.produces?.length) {
    marks.push(
      <Mark key="produces" label={`Records ${step.produces.join(', ')}`}>
        <GitBranch className="h-3 w-3" />{step.produces[0]}
      </Mark>,
    );
  }
  if (step.when) {
    marks.push(
      <Mark key="when" label={guardLabel(step.when)}>
        <Circle className="h-3 w-3" />{step.when.var}
      </Mark>,
    );
  }
  if (step.feedback) {
    marks.push(<Mark key="feedback" label="Loops back" className="text-violet-400"><Repeat className="h-3 w-3" /></Mark>);
  }
  return <>{marks}</>;
}

function Mark({ children, label, className = '' }: { children: React.ReactNode; label: string; className?: string }) {
  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-sm border border-border px-1.5 py-0.5 text-xs text-foreground/70 ${className}`}
      title={label}
      aria-label={label}
    >
      {children}
    </span>
  );
}

const routeText = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

function statusTextClass(status: StepStatus): string {
  if (status === 'failed') return 'text-rose-400';
  if (status === 'blocked' || status === 'needs-revision') return 'text-amber-400';
  if (status === 'running' || status === 'succeeded' || status === 'ready') return 'text-emerald-400';
  return 'text-foreground/70';
}

/** What the step produced, or what it is expected to produce before it runs. */
function detailText(loop: Loop, step: LoopStepDefinition): string {
  const outcome = loop.runtime.stepStates[step.id]?.outcome?.summary;
  if (outcome) return outcome;
  return step.expectedOutcome ? `Expects · ${step.expectedOutcome}` : '';
}
