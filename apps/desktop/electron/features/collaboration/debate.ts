/**
 * DebateEngine — orchestrates the debate collaboration strategy.
 *
 * Four-phase flow:
 * 1. Decomposition — Coordinator analyses query and breaks it into sub-tasks
 * 2. Independent Analysis — All four agents process the problem concurrently
 * 3. Debate & Cross-Checking — Agents evaluate and challenge each other's outputs
 *    (limited by maxRounds and timeLimitSec)
 * 4. Synthesis & Consensus — Coordinator integrates, resolves discrepancies
 */

import type { SubagentManager } from '../subagent';
import { ROLE_AGENT_NAMES } from './agents';
import type {
  CollaborationRole,
  CollaborationResult,
  DebateConfig,
  DebatePhase,
} from '@/types/collaboration';

export interface DebateCallbacks {
  onDebatePhase?: (phase: DebatePhase) => void;
  onAgentStatus?: (agentName: string, status: 'pending' | 'running' | 'completed' | 'failed') => void;
  onRoundStart?: (round: number, totalRounds: number, challengerRole: CollaborationRole, defenderRole: CollaborationRole) => void;
  onRoundEnd?: (round: number, summary: string, durationMs: number, challengerRole: CollaborationRole, defenderRole: CollaborationRole) => void;
  onSpecialistStart?: (role: CollaborationRole, agentName: string) => void;
  onSpecialistEnd?: (role: CollaborationRole, agentName: string, response: string, durationMs: number, error?: string) => void;
  onUpdate?: (text: string) => void;
}

interface AgentOutput {
  role: CollaborationRole;
  agentName: string;
  response: string;
  error?: string;
  durationMs: number;
}

const ALL_ROLES: CollaborationRole[] = ['researcher', 'analyst', 'visionary', 'coordinator'];

/** Debate round pairings — each round has a challenger and defender. */
const DEBATE_PAIRINGS: Array<[CollaborationRole, CollaborationRole]> = [
  ['analyst', 'researcher'],
  ['visionary', 'analyst'],
  ['researcher', 'visionary'],
];

async function runAgent(
  role: CollaborationRole,
  task: string,
  parentSessionId: string,
  workspaceId: string,
  manager: SubagentManager,
  config: DebateConfig,
  callbacks?: DebateCallbacks,
): Promise<AgentOutput> {
  const agentName = ROLE_AGENT_NAMES[role];
  const start = Date.now();

  callbacks?.onAgentStatus?.(agentName, 'running');
  callbacks?.onSpecialistStart?.(role, agentName);

  try {
    const result = await manager.runSingleStructured({
      agent: agentName,
      task,
      parentSessionId,
      workspaceId,
      model: config.models?.[role],
      onUpdate: callbacks?.onUpdate,
    });

    const durationMs = Date.now() - start;
    callbacks?.onAgentStatus?.(agentName, result.error ? 'failed' : 'completed');
    callbacks?.onSpecialistEnd?.(role, agentName, result.response, durationMs, result.error);

    return { role, agentName, response: result.response, error: result.error, durationMs };
  } catch (err: unknown) {
    const durationMs = Date.now() - start;
    const errMsg = err instanceof Error ? err.message : 'Unknown error';
    callbacks?.onAgentStatus?.(agentName, 'failed');
    callbacks?.onSpecialistEnd?.(role, agentName, '', durationMs, errMsg);
    return { role, agentName, response: '', error: errMsg, durationMs };
  }
}

function buildDecompositionPrompt(query: string): string {
  return `Analyze the following query and break it into 2-4 focused sub-tasks that different specialist agents should investigate. For each sub-task, specify which angle to take (factual research, logical/analytical, creative/divergent, or coordination/synthesis).

Return your analysis as a structured breakdown.

## Query
${query}`;
}

function buildIndependentAnalysisPrompt(query: string, decomposition: string, role: CollaborationRole): string {
  const angleMap: Record<CollaborationRole, string> = {
    researcher: 'Focus on gathering facts, evidence, and verifiable information. Be thorough and cite specifics.',
    analyst: 'Focus on logical reasoning, structural analysis, and identifying patterns. Be rigorous and precise.',
    visionary: 'Focus on creative angles, novel connections, and forward-looking implications. Be bold and innovative.',
    coordinator: 'Focus on identifying gaps, contradictions, and areas needing deeper exploration.',
  };

  return `You are analyzing a query from your specialized perspective. A task decomposition has been provided.

## Task Decomposition
${decomposition}

## Your Angle
${angleMap[role]}

## Original Query
${query}

Provide your independent analysis. Be thorough but concise.`;
}

function buildChallengePrompt(
  query: string,
  challengerRole: CollaborationRole,
  defenderRole: CollaborationRole,
  defenderOutput: string,
  allOutputs: Map<CollaborationRole, string>,
): string {
  const otherOutputsSummary = Array.from(allOutputs.entries())
    .filter(([r]) => r !== challengerRole && r !== defenderRole)
    .map(([r, o]) => `### ${r}\n${o.slice(0, 500)}`)
    .join('\n\n');

  return `You are cross-checking and challenging another agent's analysis. Your goal is to find weaknesses, verify claims, identify gaps, and suggest improvements.

## Original Query
${query}

## Analysis to Challenge (by ${defenderRole})
${defenderOutput}

${otherOutputsSummary ? `## Other Perspectives for Context\n${otherOutputsSummary}` : ''}

Critically evaluate the analysis above. Point out:
1. Factual errors or unverified claims
2. Logical gaps or weak reasoning
3. Missing perspectives or considerations
4. Areas of agreement that strengthen the overall answer

Be constructive but rigorous. End with a brief summary of your key critique points.`;
}

function buildDebateSynthesisPrompt(
  query: string,
  analyses: Map<CollaborationRole, string>,
  debateRounds: Array<{ challengerRole: CollaborationRole; defenderRole: CollaborationRole; summary: string }>,
): string {
  const analysisSection = Array.from(analyses.entries())
    .map(([role, output]) => `### ${role}\n${output}`)
    .join('\n\n');

  const debateSection = debateRounds
    .map((r, i) => `### Round ${i + 1}: ${r.challengerRole} challenges ${r.defenderRole}\n${r.summary}`)
    .join('\n\n');

  return `Four specialist agents have independently analyzed the following query, then debated and cross-checked each other's work. Synthesize everything into one cohesive, high-quality response that reflects the consensus and resolves any disagreements.

## Original Query
${query}

## Independent Analyses
${analysisSection}

## Debate & Cross-Checking
${debateSection}

Produce ONE cohesive response. Incorporate the strongest points from each agent. Where agents disagreed, explain the nuance. Do NOT mention the agents or internal process.`;
}

/**
 * Run the debate collaboration strategy.
 */
export async function runDebateCollaboration(
  query: string,
  parentSessionId: string,
  workspaceId: string,
  manager: SubagentManager,
  config: DebateConfig,
  callbacks?: DebateCallbacks,
): Promise<CollaborationResult> {
  const startTime = Date.now();
  const specialistOutputs: CollaborationResult['specialistOutputs'] = [];
  const debateStartTime = Date.now();

  // ── Phase 1: Decomposition ─────────────────────────────────
  callbacks?.onDebatePhase?.('decomposition');
  callbacks?.onUpdate?.('Debate: Coordinator decomposing task...');

  const decomposition = await runAgent(
    'coordinator',
    buildDecompositionPrompt(query),
    parentSessionId,
    workspaceId,
    manager,
    config,
    callbacks,
  );
  specialistOutputs.push(decomposition);

  const decompositionText = decomposition.response || '(Decomposition failed)';

  // ── Phase 2: Independent Analysis ──────────────────────────
  callbacks?.onDebatePhase?.('independent_analysis');
  callbacks?.onUpdate?.('Debate: All agents analyzing independently...');

  const analysisRoles: CollaborationRole[] = ['researcher', 'analyst', 'visionary'];
  for (const role of analysisRoles) {
    callbacks?.onAgentStatus?.(ROLE_AGENT_NAMES[role], 'pending');
  }

  const analysisResults = await Promise.allSettled(
    analysisRoles.map((role) =>
      runAgent(
        role,
        buildIndependentAnalysisPrompt(query, decompositionText, role),
        parentSessionId,
        workspaceId,
        manager,
        config,
        callbacks,
      ),
    ),
  );

  const analyses = new Map<CollaborationRole, string>();
  for (let i = 0; i < analysisResults.length; i++) {
    const role = analysisRoles[i];
    const result = analysisResults[i];
    if (result.status === 'fulfilled') {
      specialistOutputs.push(result.value);
      analyses.set(role, result.value.response || '(No output)');
    } else {
      const agentName = ROLE_AGENT_NAMES[role];
      const errMsg = result.reason?.message ?? 'Unknown error';
      specialistOutputs.push({ role, agentName, response: '', error: errMsg, durationMs: 0 });
      analyses.set(role, '(Agent failed)');
    }
  }

  // ── Phase 3: Debate & Cross-Checking ───────────────────────
  callbacks?.onDebatePhase?.('debate');
  callbacks?.onUpdate?.('Debate: Agents cross-checking and challenging...');

  const debateRounds: Array<{
    challengerRole: CollaborationRole;
    defenderRole: CollaborationRole;
    summary: string;
  }> = [];

  const effectiveRounds = Math.min(config.maxRounds, DEBATE_PAIRINGS.length);

  for (let round = 0; round < effectiveRounds; round++) {
    // Check time limit
    const elapsed = (Date.now() - debateStartTime) / 1000;
    if (elapsed >= config.timeLimitSec) {
      callbacks?.onUpdate?.(`Debate: Time limit (${config.timeLimitSec}s) reached, moving to synthesis...`);
      break;
    }

    const [challengerRole, defenderRole] = DEBATE_PAIRINGS[round % DEBATE_PAIRINGS.length];
    const defenderOutput = analyses.get(defenderRole) ?? '(No output)';

    callbacks?.onRoundStart?.(round + 1, effectiveRounds, challengerRole, defenderRole);
    callbacks?.onUpdate?.(
      `Debate Round ${round + 1}/${effectiveRounds}: ${challengerRole} challenges ${defenderRole}...`,
    );

    const roundStart = Date.now();
    const challengeResult = await runAgent(
      challengerRole,
      buildChallengePrompt(query, challengerRole, defenderRole, defenderOutput, analyses),
      parentSessionId,
      workspaceId,
      manager,
      config,
      callbacks,
    );

    const roundDuration = Date.now() - roundStart;
    const roundSummary = challengeResult.response || '(No challenge produced)';

    debateRounds.push({ challengerRole, defenderRole, summary: roundSummary });
    callbacks?.onRoundEnd?.(round + 1, roundSummary, roundDuration, challengerRole, defenderRole);
  }

  // ── Phase 4: Synthesis & Consensus ─────────────────────────
  callbacks?.onDebatePhase?.('synthesis');
  callbacks?.onUpdate?.('Debate: Coordinator synthesizing consensus...');

  const synthesisResult = await runAgent(
    'coordinator',
    buildDebateSynthesisPrompt(query, analyses, debateRounds),
    parentSessionId,
    workspaceId,
    manager,
    config,
    callbacks,
  );

  const totalDurationMs = Date.now() - startTime;
  const hasErrors = specialistOutputs.some((s) => !!s.error) || !!synthesisResult.error;

  return {
    finalResponse: synthesisResult.response || '(Debate failed to produce a synthesis)',
    specialistOutputs,
    totalDurationMs,
    hasErrors,
  };
}
