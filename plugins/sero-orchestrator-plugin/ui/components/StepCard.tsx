/**
 * One step on the plan spine (see specs/09-ui-redesign.md, C3 + C1). The card is
 * calm by default — title, type, status, instructions, outcome — and hides
 * per-step tuning (model + tools) behind a "Tune" expander so power controls
 * don't clutter every card (B2 inspector was dropped). Retry stays visible when a
 * step is recoverable, since it's a contextual recovery action.
 */

import { useState } from 'react';
import { Badge, Button, Card } from '@sero-ai/ui';
import { ChevronDown, RefreshCw, SlidersHorizontal } from 'lucide-react';
import type { AppModelGroup } from '@sero-ai/app-runtime';
import type { ContextAgentInfo, ContextToolInfo } from '@sero-ai/common';
import type { LoopStepDefinition, StepGuard, StepRuntimeState } from '../../shared/types';
import { STEP_STATUS_STYLE } from '../lib/status-style';
import { StepStatusPill } from './StatusBadge';
import { StepModelControl } from './StepModelControl';
import { StepToolsControl } from './StepToolsControl';
import { StepAgentControl } from './StepAgentControl';

const routeText = (value: unknown): string => (typeof value === 'string' ? value : JSON.stringify(value));

/** Human-readable guard, e.g. "only if route = simple / standard" or "route: default branch". */
export function guardLabel(when: StepGuard): string {
  if (when.default) return `${when.var}: default branch`;
  return `only if ${when.var} = ${(when.in ?? []).map(routeText).join(' / ')}`;
}

const PROBLEM_STATUSES = new Set(['failed', 'blocked', 'needs-revision']);

export interface StepCardProps {
  step: LoopStepDefinition;
  number: number;
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
}

export function StepCard({ step, number, showNumber = true, state, groups, toolCatalog, agentCatalog, onSetModel, onSetTools, onSetAgent, onRetry }: StepCardProps) {
  const [tuning, setTuning] = useState(false);
  const skipped = state?.status === 'skipped';
  const isProblem = !!state && PROBLEM_STATUSES.has(state.status);
  const tint = state ? STEP_STATUS_STYLE[state.status].tint : '';
  const canTune = step.execution.type !== 'active-session';

  return (
    <Card className={`flex flex-col gap-1.5 p-3 ${tint}${skipped ? ' opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          {showNumber && <span className="text-xs tabular-nums text-muted-foreground">{number}.</span>}
          <span className="truncate font-medium">{step.title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {state && <StepStatusPill status={state.status} />}
          <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">{step.execution.type}</Badge>
          {canTune && (
            <Button
              size="xs"
              variant="ghost"
              className="h-6 px-1.5 text-muted-foreground"
              onClick={() => setTuning((t) => !t)}
              aria-expanded={tuning}
              aria-label="Tune model & tools"
              title="Tune model & tools"
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <ChevronDown className={`ml-0.5 h-3 w-3 transition-transform ${tuning ? 'rotate-180' : ''}`} />
            </Button>
          )}
        </div>
      </div>

      {(step.produces?.length || step.when) && (
        <div className="flex flex-wrap items-center gap-1">
          {step.produces?.length ? <Badge variant="outline" className="text-[10px] font-normal">decides {step.produces.join(', ')}</Badge> : null}
          {step.when ? <Badge variant="outline" className="text-[10px] font-normal">{guardLabel(step.when)}</Badge> : null}
        </div>
      )}

      <p className="whitespace-pre-wrap text-xs text-muted-foreground">{step.instructions}</p>

      {(step.expectedOutcome || state?.outcome) && (
        <dl className="mt-1 flex flex-col gap-1.5 border-t border-border/60 pt-2.5 text-xs">
          {step.expectedOutcome && (
            <div className="flex gap-5">
              <dt className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-foreground">Expected</dt>
              <dd className="text-muted-foreground">{step.expectedOutcome}</dd>
            </div>
          )}
          {state?.outcome && (
            <div className="flex gap-5">
              <dt className="w-16 shrink-0 text-[10px] font-semibold uppercase tracking-wide text-foreground">Outcome</dt>
              <dd className={isProblem ? 'text-destructive' : 'text-muted-foreground'}>
                {state.outcome.summary}
                {state.attempts > 0 && <span> · {state.attempts} attempt(s)</span>}
              </dd>
            </div>
          )}
        </dl>
      )}

      {onRetry && (
        <Button size="xs" variant="outline" className="self-start" onClick={onRetry} title="Reset this step and run the loop on from here (keeps finished work)">
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
