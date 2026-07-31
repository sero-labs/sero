/**
 * The planning run: plain words in, a plan back (prototype state 3).
 *
 * The Design Library's generation pattern, unchanged: `platformTools: 'none'`,
 * a custom tool as the only output channel, and a repair loop that validates
 * before accepting. No bash, no read, no write, no workspace and no network —
 * the only thing this run can produce is a plan the runtime has already checked.
 *
 * Nothing is generated from the plan until the user has seen it. That is the
 * point of planning as a separate step: the frame counts, the play rates and the
 * canvas sizes are all changeable before a penny is spent.
 */

import type { AppRuntimeHost, AppRuntimeSubagentRunParams } from '@sero-ai/common';

import type { ModelSelection } from '../../../shared/settings';
import { modelSelectionIsEmpty } from '../../../shared/settings';
import type { AnimationPlan, CharacterRecord } from '../../shared/character';
import { createPlanTool } from './plan-tool';
import { buildPlanSystemPrompt, buildPlanTask } from './prompt';

const REPAIR_ATTEMPTS = 2;
const RUN_TIMEOUT_MS = 300_000;

export interface PlanRunContext {
  host: AppRuntimeHost;
  workspaceId: string;
  parentSessionId: string;
  model: ModelSelection;
  signal: AbortSignal;
  onProgress?(message: string): void;
}

export type PlanOutcome =
  | { status: 'ok'; animations: AnimationPlan[] }
  | { status: 'cancelled' }
  | { status: 'failed'; reason: string };

export async function runPlan(
  character: CharacterRecord,
  request: string,
  videoModel: string,
  context: PlanRunContext,
): Promise<PlanOutcome> {
  const planner = createPlanTool(() => context.onProgress?.('Working out the animations…'));

  const params: AppRuntimeSubagentRunParams = {
    task: buildPlanTask({ character, request, videoModel }),
    systemPrompt: buildPlanSystemPrompt(),
    parentSessionId: context.parentSessionId,
    workspaceId: context.workspaceId,
    platformTools: 'none',
    customTools: [planner.definition],
    timeoutMs: RUN_TIMEOUT_MS,
    signal: context.signal,
    repair: {
      maxAttempts: REPAIR_ATTEMPTS,
      validate: () => {
        const problem = planner.problem();
        if (problem !== null) return `${problem} Call \`sprite_studio_declare_plan\` again with the whole batch corrected.`;
        if (planner.plan() === null) {
          return 'You have not declared a plan. Call `sprite_studio_declare_plan` once with every animation the request asks for.';
        }
        return null;
      },
    },
    ...(modelSelectionIsEmpty(context.model) ? {} : { model: context.model.modelId }),
  };

  context.onProgress?.('Reading the request…');
  const result = await context.host.subagents.runStructured(params);

  if (context.signal.aborted || result.error?.startsWith('Aborted')) return { status: 'cancelled' };
  if (result.error) return { status: 'failed', reason: result.error };

  // The runtime decides whether a plan was produced, not the reply. A model that
  // describes a batch it never declared returns a perfectly plausible paragraph,
  // and accepting it would leave the user looking at an empty dialog with a
  // Start button on it.
  const animations = planner.plan();
  if (animations === null || animations.length === 0) {
    return {
      status: 'failed',
      reason:
        planner.problem() ??
        'The run finished without declaring a plan, so there is nothing to show you and nothing has been generated.',
    };
  }

  return { status: 'ok', animations };
}
