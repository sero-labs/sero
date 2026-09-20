/**
 * One step on the plan spine: its title, its state word, and what it produced.
 *
 * Everything that explains how the step was written opens from the chevron —
 * the instruction, the expected result, and the marks that place the step in
 * the plan. The card used to print a page of instructions above every Result,
 * so on a real Workflow the reader scrolled past the instruction three times
 * to find out what had happened.
 *
 * Model, agent and tools open from Tune. A value that is not the default shows
 * on the card, so a step whose model was pinned says so without opening.
 */

import { useState } from 'react';
import { Badge } from '@sero-ai/ui/components/ui/badge';
import { Button } from '@sero-ai/ui/components/ui/button';
import { Card } from '@sero-ai/ui/components/ui/card';
import { ChevronDown, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { AppModelGroup } from '@sero-ai/app-runtime';
import type { ContextAgentInfo, ContextToolInfo } from '@sero-ai/common';
import type { Loop, LoopStepDefinition, StepRuntimeState } from '../../shared/types';
import { STEP_STATUS_STYLE } from '../lib/status-style';
import { stepMarks, stepOverrides, stepStateLabel, type StepFact } from '../lib/step-detail';
import { StepStatusPill } from './StatusBadge';
import { fanOutSummaryLabel, type FanOutView } from '../lib/fan-out-summary';
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
}

/** A labelled fact, in the drawing's two-column key/value shape. */
function Facts({ facts }: { facts: StepFact[] }) {
  return (
    <dl className="flex flex-col gap-1.5 text-xs">
      {facts.map((fact) => (
        <div key={fact.label} className="flex gap-5">
          <dt className="w-24 shrink-0 text-sm font-semibold uppercase tracking-wide text-foreground">{fact.label}</dt>
          <dd className="min-w-0 whitespace-pre-wrap text-muted-foreground">{fact.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StepCard({ step, number, loop, numberOf, showNumber = true, state, groups, toolCatalog, agentCatalog, onSetModel, onSetTools, onSetAgent, onRetry, fanOut }: StepCardProps) {
  const [tuning, setTuning] = useState(false);
  const [open, setOpen] = useState(false);
  const stateLabel = stepStateLabel(loop, step, state?.status);
  const notTaken = stateLabel === 'Not taken';
  const isProblem = !!state && PROBLEM_STATUSES.has(state.status);
  const tint = state ? STEP_STATUS_STYLE[state.status].tint : '';
  const canTune = step.execution.type !== 'active-session';
  const overrides = stepOverrides(step);

  return (
    <Card className={`flex flex-col gap-1.5 p-3 ${tint || 'border-border/75'}${notTaken ? ' opacity-60' : ''}`}>
      <div className="flex items-center gap-2">
        {showNumber && <span className="text-xs tabular-nums text-muted-foreground">{number}.</span>}
        <span className="min-w-0 flex-1 truncate font-medium">{step.title}</span>
        {/* One word, from one rule. The tone comes from the shared status
            style; "Not taken" has no status of its own, so it stays plain. */}
        <Badge
          variant="outline"
          className={`shrink-0 ${state && !notTaken ? STEP_STATUS_STYLE[state.status].badge : 'border-border text-muted-foreground'}`}
        >
          {stateLabel}
        </Badge>
        {canTune && (
          <Button
            size="xs"
            variant="ghost"
            className="h-6 shrink-0 px-1.5 text-muted-foreground"
            onClick={() => setTuning((t) => !t)}
            aria-expanded={tuning}
            aria-label={`Model, agent and tools for ${step.title}`}
            title="Model, agent and tools"
          >
            <SlidersHorizontal className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          size="xs"
          variant="ghost"
          className="h-6 shrink-0 px-1.5 text-muted-foreground"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={`Show instruction and expected result for ${step.title}`}
          title="Instruction and expected result"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </Button>
      </div>

      {overrides.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          {overrides.map((fact) => (
            <Badge key={fact.label} variant="outline" className="text-sm font-normal text-muted-foreground">
              {fact.label}: {fact.value}
            </Badge>
          ))}
        </div>
      )}

      {fanOut && <FanOutActivations view={fanOut} />}

      {state?.outcome && (
        <dl className="mt-1 flex flex-col gap-1.5 border-t border-border/60 pt-2.5 text-xs">
          <div className="flex gap-5">
            <dt className="w-24 shrink-0 text-sm font-semibold uppercase tracking-wide text-foreground">Result</dt>
            <dd className={`min-w-0 ${isProblem ? 'text-destructive' : 'text-foreground'}`}>
              {state.outcome.summary}
              {state.attempts > 0 && <span className="text-muted-foreground"> · {state.attempts} attempt(s)</span>}
            </dd>
          </div>
        </dl>
      )}

      {open && (
        <div className="mt-1 border-t border-border/60 pt-2.5">
          <Facts facts={stepMarks(loop, step, numberOf)} />
        </div>
      )}

      {onRetry && (
        <Button size="xs" variant="outline" className="self-start" onClick={onRetry} title="Reset this step and run the Workflow from here (keeps finished work)">
          <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry step
        </Button>
      )}

      {canTune && tuning && (
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border border-border bg-background/40 p-2">
          <StepModelControl step={step} groups={groups} onChange={(model, thinking) => onSetModel(step.id, model, thinking)} />
          {step.execution.type === 'background-agent' && (
            <>
              <StepAgentControl step={step} catalog={agentCatalog} onChange={(agent) => onSetAgent(step.id, agent)} />
              <StepToolsControl step={step} catalog={toolCatalog} onChange={(tools) => onSetTools(step.id, tools)} />
            </>
          )}
        </div>
      )}
    </Card>
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
