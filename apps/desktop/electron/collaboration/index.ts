/**
 * CollaborationEngine — orchestrates the 4-agent collaboration framework.
 *
 * Flow:
 * 1. Three specialists (Researcher, Analyst, Visionary) run in parallel
 * 2. Their outputs are collected
 * 3. The Coordinator synthesizes them into one unified response
 *
 * Leverages the existing SubagentManager for execution.
 */

import { randomUUID } from 'crypto';
import type { SubagentManager } from '../subagent';
import {
  SPECIALIST_AGENTS,
  buildCoordinatorSynthesisPrompt,
  type CollaborationRole,
} from './agents';

export interface CollaborationResult {
  /** The final synthesized response from the Coordinator. */
  finalResponse: string;
  /** Individual specialist outputs for transparency. */
  specialistOutputs: {
    role: CollaborationRole;
    agentName: string;
    response: string;
    error?: string;
    durationMs: number;
  }[];
  /** Total duration including synthesis. */
  totalDurationMs: number;
  /** Whether any specialist failed. */
  hasErrors: boolean;
}

export interface CollaborationCallbacks {
  /** Called when each phase starts. */
  onPhaseStart?: (phase: 'specialists' | 'synthesis') => void;
  /** Called when a specialist starts. */
  onSpecialistStart?: (role: CollaborationRole, agentName: string) => void;
  /** Called when a specialist completes. */
  onSpecialistEnd?: (role: CollaborationRole, agentName: string, response: string, error?: string) => void;
  /** Called with live text deltas from the synthesis phase. */
  onSynthesisDelta?: (delta: string) => void;
  /** General status updates. */
  onUpdate?: (text: string) => void;
}

/**
 * Run the 4-agent collaboration framework for a user query.
 *
 * Phase 1: Run Researcher, Analyst, and Visionary in parallel
 * Phase 2: Feed their outputs to the Coordinator for synthesis
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

  // ── Phase 1: Run specialists in parallel ─────────────────────

  callbacks?.onPhaseStart?.('specialists');
  callbacks?.onUpdate?.('Starting 4-agent collaboration — running specialists in parallel...');

  const specialistResults = await Promise.allSettled(
    SPECIALIST_AGENTS.map(async ({ role, agent }) => {
      const specStart = Date.now();
      callbacks?.onSpecialistStart?.(role, agent.name);

      const result = await manager.runSingleStructured({
        task: query,
        systemPrompt: agent.systemPrompt,
        parentSessionId,
        workspaceId,
        onUpdate: callbacks?.onUpdate,
      });

      const durationMs = Date.now() - specStart;
      const output = {
        role,
        agentName: agent.name,
        response: result.response,
        error: result.error,
        durationMs,
      };

      callbacks?.onSpecialistEnd?.(role, agent.name, result.response, result.error);
      return output;
    }),
  );

  // Collect results
  for (const result of specialistResults) {
    if (result.status === 'fulfilled') {
      specialistOutputs.push(result.value);
    } else {
      specialistOutputs.push({
        role: 'researcher', // fallback — shouldn't happen
        agentName: 'unknown',
        response: '',
        error: result.reason?.message ?? 'Unknown error',
        durationMs: 0,
      });
    }
  }

  // Extract outputs by role
  const researcherOutput = specialistOutputs.find((s) => s.role === 'researcher');
  const analystOutput = specialistOutputs.find((s) => s.role === 'analyst');
  const visionaryOutput = specialistOutputs.find((s) => s.role === 'visionary');

  // ── Phase 2: Coordinator synthesis ───────────────────────────

  callbacks?.onPhaseStart?.('synthesis');
  callbacks?.onUpdate?.('Specialists complete — Coordinator synthesizing final response...');

  const synthesisPrompt = buildCoordinatorSynthesisPrompt(
    query,
    researcherOutput?.response || '(Researcher failed to produce output)',
    analystOutput?.response || '(Analyst failed to produce output)',
    visionaryOutput?.response || '(Visionary failed to produce output)',
  );

  const synthesisResult = await manager.runSingleStructured({
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
