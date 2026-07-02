/**
 * Builds persisted Loop records from create requests and PlanningResponses.
 *
 * Phase 1 stores a draft with an empty placeholder plan. Phase 2 wires the
 * planner so create produces a validated plan and materialized triggers.
 */

import {
  DEFAULT_LIMITS,
  DEFAULT_LOG_POLICY,
  DEFAULT_WORKSPACE_SETTINGS,
} from '../shared/defaults';
import { loopParentSessionId } from '../shared/ids';
import type {
  CreateLoopOptions,
  Loop,
  LoopLimits,
  LoopPlan,
  LoopTrigger,
  LoopTriggerSuggestion,
  LoopWorkspaceSettings,
} from '../shared/types';
import type { OrchestratorHost } from './host';
import { nextFireAfter } from './scheduler';

export function emptyPlan(): LoopPlan {
  return { schemaVersion: 1, revision: 0, objective: '', steps: [] };
}

export function mergeWorkspaceSettings(
  override?: Partial<LoopWorkspaceSettings>,
): LoopWorkspaceSettings {
  return { ...DEFAULT_WORKSPACE_SETTINGS, ...override };
}

export function mergeLimits(
  suggested?: Partial<LoopLimits>,
  user?: Partial<LoopLimits>,
): LoopLimits {
  // Defaults < suggested (LLM) < user-supplied.
  return { ...DEFAULT_LIMITS, ...suggested, ...user };
}

export function materializeTriggers(
  host: OrchestratorHost,
  loopId: string,
  suggestions: LoopTriggerSuggestion[],
): LoopTrigger[] {
  const nowMs = Date.parse(host.now());
  return suggestions.map((s) => {
    const cronLike = (s.type === 'cron' || s.type === 'hybrid') && s.schedule;
    const next = cronLike ? nextFireAfter(s.schedule!, nowMs) : null;
    return {
      id: host.newId('trigger'),
      loopId,
      workspaceId: host.workspaceId,
      type: s.type,
      schedule: s.schedule,
      eventSource: s.eventSource,
      eventFilter: s.eventFilter,
      eventCondition: s.eventCondition,
      debounceMs: s.debounceMs,
      maxFires: s.maxFires,
      fireCount: 0,
      nextFireAt: next !== null ? new Date(next).toISOString() : undefined,
    };
  });
}

export interface BuildDraftArgs {
  prompt: string;
  title?: string;
  options?: CreateLoopOptions;
  plan?: LoopPlan;
  summary?: string;
}

/** Builds a draft Loop. With no plan supplied, a placeholder empty plan is used. */
export function buildDraftLoop(host: OrchestratorHost, args: BuildDraftArgs): Loop {
  const id = host.newId('loop');
  const now = host.now();
  const triggerSuggestions = args.options?.triggers ?? [];
  return {
    id,
    workspaceId: host.workspaceId,
    title: args.title ?? 'Untitled loop',
    prompt: args.prompt,
    summary: args.summary ?? '',
    status: 'draft',
    workspace: mergeWorkspaceSettings(args.options?.workspace),
    // Absent unless the user chose one — the effective destination is then
    // derived from placement (effectiveDelivery), tracking placement changes.
    delivery: args.options?.delivery,
    plan: args.plan ?? emptyPlan(),
    runtime: {
      parentSessionId: loopParentSessionId(host.workspaceId, id),
      variables: {},
      stepStates: {},
      workspace: {},
    },
    triggers: materializeTriggers(host, id, triggerSuggestions),
    limits: mergeLimits(args.options?.limits, args.options?.limits),
    logPolicy: { ...DEFAULT_LOG_POLICY },
    warnings: [],
    runs: [],
    revisions: [],
    insights: [],
    suggestions: [],
    answeredInputs: [],
    createdAt: now,
    updatedAt: now,
  };
}
