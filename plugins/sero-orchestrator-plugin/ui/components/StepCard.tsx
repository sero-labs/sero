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
import type { ContextToolInfo } from '@sero-ai/common';
import type { LoopStepDefinition, StepGuard, StepRuntimeState } from '../../shared/types';
import { STEP_STATUS_STYLE } from '../lib/status-style';
import { StepStatusPill } from './StatusBadge';
import { StepModelControl } from './StepModelControl';
import { StepToolsControl } from './StepToolsControl';

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
  state?: StepRuntimeState;
  groups: AppModelGroup[];
  toolCatalog: ContextToolInfo[];
  onSetModel: (stepId: string, model?: string, thinking?: string) => void;
  onSetTools: (stepId: string, tools?: string[]) => void;
  /** Provided only when this step is recoverable and runnable — renders Retry. */
  onRetry?: () => void;
}

export function StepCard({ step, number, state, groups, toolCatalog, onSetModel, onSetTools, onRetry }: StepCardProps) {
  const [tuning, setTuning] = useState(false);
  const skipped = state?.status === 'skipped';
  const isProblem = !!state && PROBLEM_STATUSES.has(state.status);
  const tint = state ? STEP_STATUS_STYLE[state.status].tint : '';
  const canTune = step.execution.type !== 'active-session';

  return (
    <Card className={`flex flex-col gap-1.5 p-3 ${tint}${skipped ? ' opacity-60' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="text-xs tabular-nums text-muted-foreground">{number}.</span>
          <span className="truncate font-medium">{step.title}</span>
          <Badge variant="outline" className="shrink-0 text-[10px] font-normal text-muted-foreground">{step.execution.type}</Badge>
        </div>
        {state && <StepStatusPill status={state.status} />}
      </div>

      {(step.produces?.length || step.when) && (
        <div className="flex flex-wrap items-center gap-1">
          {step.produces?.length ? <Badge variant="outline" className="text-[10px] font-normal">decides {step.produces.join(', ')}</Badge> : null}
          {step.when ? <Badge variant="outline" className="text-[10px] font-normal">{guardLabel(step.when)}</Badge> : null}
        </div>
      )}

      <p className="whitespace-pre-wrap text-xs text-muted-foreground">{step.instructions}</p>
      {step.expectedOutcome && (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">Expected: </span>{step.expectedOutcome}
        </p>
      )}

      {state?.outcome && (
        <p className={`text-xs ${isProblem ? 'text-destructive' : 'text-muted-foreground'}`}>
          <span className={`font-medium ${isProblem ? '' : 'text-foreground'}`}>{isProblem ? `${state.status}: ` : 'Outcome: '}</span>
          {state.outcome.summary}
          {state.attempts > 0 ? ` · ${state.attempts} attempt(s)` : ''}
        </p>
      )}

      <div className="flex items-center gap-2 pt-0.5">
        {onRetry && (
          <Button size="xs" variant="outline" onClick={onRetry} title="Reset this step and run the loop on from here (keeps finished work)">
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Retry step
          </Button>
        )}
        {canTune && (
          <Button size="xs" variant="ghost" className="text-muted-foreground" onClick={() => setTuning((t) => !t)} aria-expanded={tuning}>
            <SlidersHorizontal className="mr-1 h-3.5 w-3.5" /> Tune
            <ChevronDown className={`ml-1 h-3.5 w-3.5 transition-transform ${tuning ? 'rotate-180' : ''}`} />
          </Button>
        )}
      </div>

      {canTune && tuning && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-background/40 p-2">
          <StepModelControl step={step} groups={groups} onChange={(model, thinking) => onSetModel(step.id, model, thinking)} />
          {step.execution.type === 'background-agent' && (
            <StepToolsControl step={step} catalog={toolCatalog} onChange={(tools) => onSetTools(step.id, tools)} />
          )}
        </div>
      )}
    </Card>
  );
}
