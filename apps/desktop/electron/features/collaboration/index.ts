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

import type { SubagentManager } from '../subagent';
import {
  PARALLEL_SPECIALIST_ROLES,
  ROLE_AGENT_NAMES,
  buildCoordinatorSynthesisPrompt,
} from './agents';
import type { CollaborationRole, CollaborationResult } from '../../../src/types/collaboration';
export type { CollaborationResult } from '../../../src/types/collaboration';

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
  manager: SubagentManager,
  callbacks?: CollaborationCallbacks,
): Promise<CollaborationResult['specialistOutputs'][number]> {
  const agentName = ROLE_AGENT_NAMES[role];
  const specStart = Date.now();

  callbacks?.onSpecialistStart?.(role, agentName);

  const result = await manager.runSingleStructured({
    agent: agentName,
    task,
    parentSessionId,
    workspaceId,
    onUpdate: callbacks?.onUpdate,
  });

  const durationMs = Date.now() - specStart;
  callbacks?.onSpecialistEnd?.(role, agentName, result.response, durationMs, result.error);

  return {
    role,
    agentName,
    response: result.response,
    error: result.error,
    durationMs,
  };
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
  manager: SubagentManager,
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
      error: err instanceof Error ? err.message : 'Unknown error',
      durationMs: 0,
    };
  }
  specialistOutputs.push(researcherOutput);

  const researchText = researcherOutput.response || '(Researcher failed to produce output)';

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
        error: result.reason?.message ?? 'Unknown error',
        durationMs: 0,
      });
    }
  }

  // Extract outputs by role
  const analystOutput = specialistOutputs.find((s) => s.role === 'analyst');
  const visionaryOutput = specialistOutputs.find((s) => s.role === 'visionary');

  // ── Phase 3: Coordinator synthesis ───────────────────────────

  callbacks?.onPhaseStart?.('synthesis');
  callbacks?.onUpdate?.('All specialists complete — Coordinator synthesizing final response...');

  const coordinatorName = ROLE_AGENT_NAMES['coordinator'];
  const synthesisPrompt = buildCoordinatorSynthesisPrompt(
    query,
    researchText,
    analystOutput?.response || '(Analyst failed to produce output)',
    visionaryOutput?.response || '(Visionary failed to produce output)',
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
