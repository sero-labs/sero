/**
 * CollaborationEngine — orchestrates the 4-agent collaboration framework.
 *
 * Two-phase fan-out flow:
 * 1. Researcher runs first to gather facts and evidence
 * 2. Analyst + Visionary run in parallel, each receiving the research as context
 * 3. Coordinator synthesizes all three outputs into one unified response
 *
 * This lets the analyst reason about real findings and the visionary
 * riff on concrete research, producing higher-quality collaboration
 * than fully parallel execution.
 *
 * Agents are discovered from .md files by the SubagentManager (same pattern
 * as the kanban planning-executor and review-executor).
 */

import {
  PARALLEL_SPECIALIST_ROLES,
  ROLE_AGENT_NAMES,
  buildCoordinatorSynthesisPrompt,
} from './agents';
import {
  buildDegradedFinalResponse,
  getMissingRequiredRoles,
  hasUsableSpecialistOutput,
} from './degraded-result';
import {
  CollaborationRunner,
  getSpecialistErrorMessage,
  runSingleSpecialist,
} from './specialist-runner';
import type { CollaborationRole, CollaborationResult } from '@/types/collaboration';
export type { CollaborationResult } from '@/types/collaboration';

export interface CollaborationCallbacks {
  /** Called when each phase starts. */
  onPhaseStart?: (phase: 'research' | 'specialists' | 'synthesis') => void;
  /** Called when a specialist starts. */
  onSpecialistStart?: (role: CollaborationRole, agentName: string) => void;
  /** Called when a specialist completes. */
  onSpecialistEnd?: (role: CollaborationRole, agentName: string, response: string, durationMs: number, error?: string) => void;
  /** General status updates. */
  onUpdate?: (text: string) => void;
}

/**
 * Run a single specialist agent and return its output.
 */
async function runSpecialist(
  role: CollaborationRole,
  task: string,
  parentSessionId: string,
  workspaceId: string,
  manager: CollaborationRunner,
  callbacks?: CollaborationCallbacks,
): Promise<CollaborationResult['specialistOutputs'][number]> {
  return runSingleSpecialist({
    role,
    task,
    parentSessionId,
    workspaceId,
    manager,
    onUpdate: callbacks?.onUpdate,
    onStart: (activeRole, agentName) => {
      callbacks?.onSpecialistStart?.(activeRole, agentName);
    },
    onSuccess: (output) => {
      callbacks?.onSpecialistEnd?.(
        output.role,
        output.agentName,
        output.response,
        output.durationMs,
        output.error,
      );
    },
  });
}

/**
 * Build the task prompt for a phase-2 specialist, including
 * the researcher's findings as context.
 */
function buildResearchAwareTask(query: string, researchOutput: string): string {
  return `## Research Findings
The following research has been gathered by a dedicated researcher agent. Use these findings to inform your analysis.

${researchOutput}

---

## Original Query
${query}`;
}

/**
 * Run the 4-agent collaboration framework for a user query.
 *
 * Phase 1: Researcher gathers facts and evidence
 * Phase 2: Analyst + Visionary run in parallel with research as context
 * Phase 3: Coordinator synthesizes all outputs
 */
export async function runCollaboration(
  query: string,
  parentSessionId: string,
  workspaceId: string,
  manager: CollaborationRunner,
  callbacks?: CollaborationCallbacks,
): Promise<CollaborationResult> {
  const startTime = Date.now();
  const specialistOutputs: CollaborationResult['specialistOutputs'] = [];

  // ── Phase 1: Researcher runs first ───────────────────────────

  callbacks?.onPhaseStart?.('research');
  callbacks?.onUpdate?.('Starting 4-agent collaboration — Researcher gathering facts...');

  let researcherOutput: CollaborationResult['specialistOutputs'][number];
  try {
    researcherOutput = await runSpecialist(
      'researcher', query, parentSessionId, workspaceId, manager, callbacks,
    );
  } catch (err: unknown) {
    researcherOutput = {
      role: 'researcher',
      agentName: ROLE_AGENT_NAMES['researcher'],
      response: '',
      error: getSpecialistErrorMessage(err),
      durationMs: 0,
    };
  }
  specialistOutputs.push(researcherOutput);

  const failedAfterResearch = getMissingRequiredRoles(specialistOutputs, ['researcher']);
  if (failedAfterResearch.length > 0) {
    callbacks?.onPhaseStart?.('synthesis');
    callbacks?.onUpdate?.(
      'Collaboration degraded — required specialist output missing; skipping coordinator synthesis.',
    );

    return {
      finalResponse: buildDegradedFinalResponse('Standard collaboration', failedAfterResearch, specialistOutputs),
      specialistOutputs,
      totalDurationMs: Date.now() - startTime,
      hasErrors: true,
    };
  }

  const researchText = hasUsableSpecialistOutput(researcherOutput) ? researcherOutput.response : '';

  // ── Phase 2: Analyst + Visionary in parallel (with research) ─

  callbacks?.onPhaseStart?.('specialists');
  callbacks?.onUpdate?.('Research complete — Analyst and Visionary analyzing in parallel...');

  const researchAwareTask = buildResearchAwareTask(query, researchText);

  const parallelResults = await Promise.allSettled(
    PARALLEL_SPECIALIST_ROLES.map((role) =>
      runSpecialist(role, researchAwareTask, parentSessionId, workspaceId, manager, callbacks),
    ),
  );

  for (let i = 0; i < parallelResults.length; i++) {
    const result = parallelResults[i];
    if (result.status === 'fulfilled') {
      specialistOutputs.push(result.value);
    } else {
      const role = PARALLEL_SPECIALIST_ROLES[i];
      specialistOutputs.push({
        role,
        agentName: ROLE_AGENT_NAMES[role],
        response: '',
        error: getSpecialistErrorMessage(result.reason),
        durationMs: 0,
      });
    }
  }

  // Extract outputs by role
  const analystOutput = specialistOutputs.find((s) => s.role === 'analyst');
  const visionaryOutput = specialistOutputs.find((s) => s.role === 'visionary');

  const failedBeforeSynthesis = getMissingRequiredRoles(
    specialistOutputs,
    ['researcher', 'analyst', 'visionary'],
  );
  if (failedBeforeSynthesis.length > 0) {
    callbacks?.onPhaseStart?.('synthesis');
    callbacks?.onUpdate?.(
      'Collaboration degraded — required specialist output missing; skipping coordinator synthesis.',
    );

    return {
      finalResponse: buildDegradedFinalResponse('Standard collaboration', failedBeforeSynthesis, specialistOutputs),
      specialistOutputs,
      totalDurationMs: Date.now() - startTime,
      hasErrors: true,
    };
  }

  // ── Phase 3: Coordinator synthesis ───────────────────────────

  callbacks?.onPhaseStart?.('synthesis');
  callbacks?.onUpdate?.('All specialists complete — Coordinator synthesizing final response...');

  const coordinatorName = ROLE_AGENT_NAMES['coordinator'];
  const synthesisPrompt = buildCoordinatorSynthesisPrompt(
    query,
    researchText,
    analystOutput?.response ?? '',
    visionaryOutput?.response ?? '',
  );

  const synthesisResult = await manager.runSingleStructured({
    agent: coordinatorName,
    task: synthesisPrompt,
    parentSessionId,
    workspaceId,
    onUpdate: callbacks?.onUpdate,
  });

  const totalDurationMs = Date.now() - startTime;
  const hasErrors = specialistOutputs.some((s) => !!s.error) || !!synthesisResult.error;

  return {
    finalResponse: synthesisResult.response || '(Collaboration failed to produce a synthesis)',
    specialistOutputs,
    totalDurationMs,
    hasErrors,
  };
}
