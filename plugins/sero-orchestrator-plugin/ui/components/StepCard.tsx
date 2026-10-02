/**
 * One step on the plan spine: its title, its state word, and what it produced.
 *
 * Everything that explains how the step was written opens from the chevron —
 * the instruction, the expected result, and the marks that place the step in
 * the plan. The card used to print a page of instructions above every Result,
 * so on a real Workflow the reader scrolled past the instruction three times
 * to find out what had happened.
 *
 * Model, agent and tools open from Tune and nowhere else. The card never
 * states them: the planner sets them on nearly every step, so every card
 * would carry the same line.
 */

import { Fragment, useState } from 'react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { SubagentLiveBlock } from '@sero-ai/ui';
import { ChevronDown, Eye, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { AppModelGroup } from '@sero-ai/app-runtime';
import type { ContextAgentInfo, ContextToolInfo } from '@sero-ai/common';
import type { Loop, LoopRun, LoopStepDefinition, StepRuntimeState } from '../../shared/types';
import { STEP_STATUS_STYLE } from '../lib/status-style';
import { splitFileRefs } from '../lib/file-refs';
import { stepMarks, stepStateLabel } from '../lib/step-detail';
import { StepStatusPill } from './StatusBadge';
import { fanOutSummaryLabel, type FanOutView } from '../lib/fan-out-summary';
import { stepLiveView } from '../lib/step-live';
import { WorkspaceFileLink } from './WorkspaceFileLink';
import { StepModelControl } from './StepModelControl';
import { StepToolsControl } from './StepToolsControl';
import { StepAgentControl } from './StepAgentControl';

const PROBLEM_STATUSES = new Set(['failed', 'blocked', 'needs-revision']);

export interface StepCardProps {
  step: LoopStepDefinition;
  number: number;
  /** The Workflow, for the route rule and the loop-back count. */
  loop: Loop;
  /** Every step's position on the plan, so a loop-back names a step number. */
  numberOf: Map<string, number>;
  /** Show the step number in the card. Off for single steps (the spine rail shows
   * it); on inside a parallel/branch group, whose rail marker is a glyph. */
  showNumber?: boolean;
  state?: StepRuntimeState;
  groups: AppModelGroup[];
  toolCatalog: ContextToolInfo[];
  agentCatalog: ContextAgentInfo[];
  onSetModel: (stepId: string, model?: string, thinking?: string) => void;
  onSetTools: (stepId: string, tools?: string[]) => void;
  onSetAgent: (stepId: string, agent?: string) => void;
  /** Provided only when this step is recoverable and runnable — renders Retry. */
  onRetry?: () => void;
  /** The latest run's fan-out activations of this step (fan-out steps only). */
  fanOut?: FanOutView;
  /**
   * The Workflow's run in flight, which the caller watches. The stripped
   * `loop.json` carries no run history, so the step cannot look it up itself.
   */
  activeRun?: LoopRun | null;
}

/**
 * Backticked spans in an outcome, set as code the way the agent wrote them.
 * An odd number of backticks leaves a span open, so the text prints as written.
 */
function WithCode({ text }: { text: string }) {
  const parts = text.split('`');
  if (parts.length % 2 === 0) return <>{text}</>;
  // Each part is keyed by where it starts in the text, which never changes.
  let start = 0;
  const spans = parts.map((part, index) => {
    const span = { part, start, code: index % 2 === 1 };
    start += part.length + 1;
    return span;
  });
  return <>{spans.map(({ part, start: at, code }) => (code ? <code key={at}>{part}</code> : <Fragment key={at}>{part}</Fragment>))}</>;
}

/**
 * A result: backticked spans as code, and any file it names as a control that
 * opens it. The drawing links a file a result mentions, because a result that
 * says it produced a screenshot is not useful if the reader cannot look at it.
 *
 * A reference the host cannot open stays plain text — a control that cannot
 * open it would be worse than the words.
 */
function WithFileRefs({ text, workspaceId }: { text: string; workspaceId: string }) {
  // Keyed by where each part starts in the text — the same identity `WithCode`
  // uses above, and one that does not move when the parts around it change.
  let at = 0;
  const parts = splitFileRefs(text).map((part) => {
    const start = at;
    at += part.text.length;
    return { part, at: start };
  });
  return (
    <>
      {parts.map(({ part, at: start }) => part.file
        ? (
          <WorkspaceFileLink
            key={start}
            workspaceId={workspaceId}
            path={part.file}
            className="font-medium underline decoration-room-text4 decoration-dotted underline-offset-2 hover:decoration-solid"
          >
            {part.text}
          </WorkspaceFileLink>
        )
        : <Fragment key={start}><WithCode text={part.text} /></Fragment>)}
    </>
  );
}

/** The two icon buttons in the step header, as the drawing sets them. */
const ICON_BUTTON = 'grid size-6 shrink-0 place-items-center rounded-[5px] text-room-text3 hover:bg-room-overlay hover:text-room-text';

export function StepCard({ step, number, loop, numberOf, showNumber = true, state, groups, toolCatalog, agentCatalog, onSetModel, onSetTools, onSetAgent, onRetry, fanOut, activeRun }: StepCardProps) {
  const [tuning, setTuning] = useState(false);
  const [open, setOpen] = useState(false);
  // Closed until the person asks for it: a running step shows its state word
  // and nothing else until they open the live view.
  const [watching, setWatching] = useState(false);
  const stateLabel = stepStateLabel(loop, step, state?.status);
  const notTaken = stateLabel === 'Not taken';
  const isProblem = !!state && PROBLEM_STATUSES.has(state.status);
  const tint = state ? STEP_STATUS_STYLE[state.status].tint : '';
  const canTune = step.execution.type !== 'active-session';
  // An active-session step runs in the chat, which already shows its work, so
  // it offers no control here.
  const live = canTune ? stepLiveView(loop, activeRun ?? null, step.id, state?.status) : undefined;
  const liveItems = canTune
    ? (fanOut?.items ?? []).filter((item) => item.status === 'running' && item.runId)
    : [];
  const canWatch = !!live || liveItems.length > 0;

  return (
    <div className={`orc-step flex flex-col${notTaken ? ' orc-step-dim' : ''}${tint ? ` ${tint}` : ''}`}>
      <StepHeader
        step={step}
        number={showNumber ? number : null}
        stateLabel={stateLabel}
        badgeTone={state && !notTaken ? STEP_STATUS_STYLE[state.status].badge : 'text-muted-foreground'}
        canTune={canTune}
        tuning={tuning}
        open={open}
        canWatch={canWatch}
        watching={watching}
        onTune={() => setTuning((t) => !t)}
        onOpen={() => setOpen((o) => !o)}
        onWatch={() => setWatching((w) => !w)}
        onRetry={onRetry}
      />

      {watching && liveItems.length > 0 && (
        <div className="mt-2 flex flex-col gap-2">
          {liveItems.map((item) => (
            <SubagentLiveBlock key={item.key} runId={item.runId!} agentName={item.key} />
          ))}
        </div>
      )}

      {watching && liveItems.length === 0 && live && (
        <SubagentLiveBlock className="mt-2" runId={live.runId} quietLabel={live.quietLabel} />
      )}

      {fanOut && <div className="mt-2"><FanOutActivations view={fanOut} /></div>}

      {state?.outcome && (isProblem ? (
        // A failed step states its reason as one line under the title. A label
        // column would put the reason behind a word the reader does not need.
        <p className="mt-1.5 text-xs leading-relaxed text-destructive">
          <WithFileRefs text={state.outcome.summary} workspaceId={loop.workspaceId} />
        </p>
      ) : (
        <dl className="orc-kv mt-2.5">
          <dt>Result</dt>
          <dd className="text-room-text"><WithFileRefs text={state.outcome.summary} workspaceId={loop.workspaceId} /></dd>
        </dl>
      ))}

      {open && (
        <div className="mt-2.5 border-t border-room-line pt-2.5">
          <dl className="orc-kv">
            {stepMarks(loop, step, numberOf).map((fact) => (
              <Fragment key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </Fragment>
            ))}
          </dl>
        </div>
      )}

      {canTune && tuning && (
        <StepTune step={step} groups={groups} toolCatalog={toolCatalog} agentCatalog={agentCatalog} onSetModel={onSetModel} onSetTools={onSetTools} onSetAgent={onSetAgent} />
      )}
    </div>
  );
}

/** The title row: number, title, state word, then Retry, Tune, the eye and the chevron. */
function StepHeader({ step, number, stateLabel, badgeTone, canTune, tuning, open, canWatch, watching, onTune, onOpen, onWatch, onRetry }: {
  step: LoopStepDefinition;
  /** Null when the spine rail shows the number instead. */
  number: number | null;
  stateLabel: string;
  badgeTone: string;
  canTune: boolean;
  tuning: boolean;
  open: boolean;
  canWatch: boolean;
  watching: boolean;
  onTune: () => void;
  onOpen: () => void;
  onWatch: () => void;
  onRetry?: () => void;
}) {
  return (
    <div className="flex items-center gap-[9px]">
      {number !== null && <span className="shrink-0 font-mono text-[11px] text-room-text3">{number}</span>}
      <span className="min-w-0 flex-1 text-[13px] font-semibold text-room-text">{step.title}</span>
      {/* One word, from one rule. The tone comes from the shared status
          style; "Not taken" has no status of its own, so it stays plain. */}
      <Badge
        variant="outline"
        className={`shrink-0 rounded-md bg-room-raised ${badgeTone} border-transparent`}
      >
        {stateLabel}
      </Badge>
      {/* Retry sits beside the state word, as the drawing sets it. */}
      {onRetry && (
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-room-line px-2 py-1 text-xs text-room-text hover:bg-room-overlay"
          onClick={onRetry}
          title="Reset this step and run the Workflow from here (keeps finished work)"
        >
          <RefreshCw className="size-3" /> Retry
        </button>
      )}
      {canWatch && (
        <button
          type="button"
          className={`${ICON_BUTTON}${watching ? ' bg-room-overlay text-room-text' : ''}`}
          onClick={onWatch}
          aria-expanded={watching}
          aria-label={`Watch the agent for ${step.title}`}
          title="Watch the agent"
        >
          <Eye className="size-3.5" />
        </button>
      )}
      {canTune && (
        <button
          type="button"
          className={`${ICON_BUTTON}${tuning ? ' bg-room-overlay text-room-text' : ''}`}
          onClick={onTune}
          aria-expanded={tuning}
          aria-label={`Model, agent and tools for ${step.title}`}
          title="Model, agent and tools"
        >
          <SlidersHorizontal className="size-3.5" />
        </button>
      )}
      <button
        type="button"
        className={ICON_BUTTON}
        onClick={onOpen}
        aria-expanded={open}
        aria-label={`Show instruction and expected result for ${step.title}`}
        title="Instruction and expected result"
      >
        <ChevronDown className={`size-3.5 ${open ? 'rotate-180' : ''}`} />
      </button>
    </div>
  );
}

/** Model, agent and tools for one step. Agent and tools apply to a background agent only. */
function StepTune({ step, groups, toolCatalog, agentCatalog, onSetModel, onSetTools, onSetAgent }: Pick<StepCardProps, 'step' | 'groups' | 'toolCatalog' | 'agentCatalog' | 'onSetModel' | 'onSetTools' | 'onSetAgent'>) {
  return (
    <div className="orc-tune flex flex-wrap items-center gap-x-[18px] gap-y-2">
      <StepModelControl step={step} groups={groups} onChange={(model, thinking) => onSetModel(step.id, model, thinking)} />
      {step.execution.type === 'background-agent' && (
        <>
          <StepAgentControl step={step} catalog={agentCatalog} onChange={(agent) => onSetAgent(step.id, agent)} />
          <StepToolsControl step={step} catalog={toolCatalog} onChange={(tools) => onSetTools(step.id, tools)} />
        </>
      )}
    </div>
  );
}

/**
 * The runtime activations of a fan-out step: a compact status headline, expandable
 * to one row per item. The plan keeps ONE durable step node; the activations are
 * runtime detail, so large fan-outs don't turn into permanent graph noise.
 */
function FanOutActivations({ view }: { view: FanOutView }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-border/60 bg-background/40">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-2 py-1.5 text-xs text-muted-foreground"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>⇉ {fanOutSummaryLabel(view)}</span>
        <ChevronDown className={`h-3 w-3 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="flex flex-col gap-1 border-t border-border/60 p-2">
          {view.items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 text-xs">
              <StepStatusPill status={item.status} />
              <span className="font-medium">{item.key}</span>
              {item.summary && <span className="truncate text-muted-foreground" title={item.summary}>{item.summary}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
